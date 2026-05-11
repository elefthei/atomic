"""Harbor installed agent wrapping ``atomic workflow -n ralph -a <agent_type>``.

Selects the underlying coding-agent CLI via the ``agent_type`` kwarg
(``claude``, ``opencode``, or ``copilot``) and installs it using the same
routine Harbor uses for its native installed agents.

Harbor contract: subclass BaseInstalledAgent; decorate run() with @with_prompt_template;
implement static name(), async install(), async run(), sync populate_context_post_run().
"""

from __future__ import annotations

import json
import os
import shlex
import textwrap
from pathlib import Path
from typing import Any, Literal

from harbor.agents.installed.base import (
    BaseInstalledAgent,
    CliFlag,
    with_prompt_template,
)
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

AgentType = Literal["claude", "opencode", "copilot"]

_AGENT_NAME = "atomic-ralph"
_ATOMIC_INSTALL_URL = "https://raw.githubusercontent.com/flora131/atomic/main/install.sh"
_DEFAULT_MAX_LOOPS = 10
_DEFAULT_AGENT_TYPE: AgentType = "claude"
_VALID_AGENT_TYPES: tuple[AgentType, ...] = ("claude", "opencode", "copilot")
_AGENT_CLI_BIN: dict[AgentType, str] = {
    "claude": "claude",
    "opencode": "opencode",
    "copilot": "copilot",
}
# nvm-installed Node binaries (used by opencode) live outside `~/.local/bin`,
# so we source nvm.sh in `_agent_runtime_prelude` to extend PATH at runtime.
_NVM_SOURCE = 'export NVM_DIR="$HOME/.nvm" && \\. "$NVM_DIR/nvm.sh" || true'
_LOCAL_BIN = "$HOME/.local/bin"
_PATH_PREFIX = f"{_LOCAL_BIN}:$PATH"
_RUN_PATH = f"{_LOCAL_BIN}:/usr/local/bin:/usr/bin:/bin"
_LOG_FILE = "/logs/agent/atomic-ralph.txt"
_VERSIONS_FILE = "/logs/agent/versions.json"

# Provider → env vars to forward, mirroring
# `harbor/agents/installed/opencode.py:413-452`. The provider segment is
# parsed from the leading slash-prefix of `model_name` (e.g. "openai/gpt-5").
_OPENCODE_PROVIDER_KEYS: dict[str, tuple[str, ...]] = {
    "amazon-bedrock": ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "azure": ("AZURE_RESOURCE_NAME", "AZURE_API_KEY"),
    "deepseek": ("DEEPSEEK_API_KEY",),
    "github-copilot": ("GITHUB_TOKEN",),
    "google": (
        "GEMINI_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_CLOUD_LOCATION",
        "GOOGLE_GENAI_USE_VERTEXAI",
        "GOOGLE_API_KEY",
    ),
    "groq": ("GROQ_API_KEY",),
    "huggingface": ("HF_TOKEN",),
    "llama": ("LLAMA_API_KEY",),
    "mistral": ("MISTRAL_API_KEY",),
    "openai": ("OPENAI_API_KEY", "OPENAI_BASE_URL"),
    "opencode": ("OPENCODE_API_KEY",),
    "xai": ("XAI_API_KEY",),
    "openrouter": ("OPENROUTER_API_KEY",),
}

# Standard AWS credential chain forwarded when Claude runs against Bedrock.
# Matches `harbor/agents/installed/claude_code.py:1046-1051`.
_BEDROCK_AWS_VARS = (
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_PROFILE",
)

# Per-agent `chatFlags` (including `--model`) live in the project-local
# `benchmarks/terminal-bench-2/.atomic/settings.json` checked into the repo.
# Atomic reads it from `<cwd>/.atomic/settings.json` when invoked from this
# directory; see `packages/atomic-sdk/src/services/config/definitions.ts:145`.


class AtomicRalph(BaseInstalledAgent):
    """Harbor installed agent that runs Atomic's Ralph workflow via Claude Code."""

    CLI_FLAGS = [
        CliFlag(
            kwarg="max_loops",
            cli="--max_loops",
            type="int",
            default=_DEFAULT_MAX_LOOPS,
        ),
    ]

    @staticmethod
    def name() -> str:
        return _AGENT_NAME

    def __init__(
        self,
        logs_dir: Path,
        *,
        atomic_version: str | None = None,
        agent_type: AgentType = _DEFAULT_AGENT_TYPE,
        agent_version: str | None = None,
        install_agent_cli: bool = True,
        extra_atomic_args: list[str] | None = None,
        working_dir: str | None = None,
        command_timeout: int | None = None,
        **kwargs: Any,
    ) -> None:
        if agent_type not in _VALID_AGENT_TYPES:
            raise ValueError(
                f"agent_type must be one of {_VALID_AGENT_TYPES}, got {agent_type!r}"
            )
        self._atomic_version = atomic_version
        self._agent_type: AgentType = agent_type
        self._agent_version = agent_version
        self._install_agent_cli = install_agent_cli
        self._extra_atomic_args: list[str] = list(extra_atomic_args or [])
        self._working_dir = working_dir
        self._command_timeout = command_timeout
        super().__init__(logs_dir, **kwargs)

    def get_version_command(self) -> str | None:
        return f'export PATH="{_PATH_PREFIX}" && atomic --version'

    def parse_version(self, stdout: str) -> str:
        return stdout.strip().splitlines()[0].strip()

    async def install(self, environment: BaseEnvironment) -> None:
        await self.exec_as_root(
            environment,
            command=(
                "if command -v apt-get &>/dev/null; then"
                "  DEBIAN_FRONTEND=noninteractive apt-get update -qq &&"
                "  apt-get install -y --no-install-recommends"
                "    curl bash git tmux ca-certificates;"
                " elif command -v apk &>/dev/null; then"
                "  apk add --no-cache curl bash git tmux ca-certificates;"
                " elif command -v dnf &>/dev/null; then"
                "  dnf install -y curl bash git tmux ca-certificates;"
                " elif command -v yum &>/dev/null; then"
                "  yum install -y curl bash git tmux ca-certificates;"
                " else"
                '  echo "Warning: no known package manager; assuming deps present" >&2;'
                " fi"
            ),
        )

        version_arg = (
            f" -s -- {shlex.quote(self._atomic_version)}"
            if self._atomic_version
            else ""
        )
        await self.exec_as_agent(
            environment,
            command=(
                f'export PATH="{_PATH_PREFIX}" && '
                f"curl -fsSL {_ATOMIC_INSTALL_URL} | bash{version_arg} && "
                "atomic --version"
            ),
        )

        if not self._install_agent_cli:
            return

        installers = {
            "claude": self._install_claude_cli,
            "opencode": self._install_opencode_cli,
            "copilot": self._install_copilot_cli,
        }
        await installers[self._agent_type](environment)

    async def _install_claude_cli(self, environment: BaseEnvironment) -> None:
        """Install Claude Code, mirroring Harbor's claude_code agent."""
        # Alpine relies on npm; Debian/RHEL use the official install.sh and
        # already have curl from the shared root step.
        await self.exec_as_root(
            environment,
            command=(
                "if command -v apk &>/dev/null; then"
                "  apk add --no-cache nodejs npm;"
                " fi"
            ),
        )
        npm_spec = f"@{self._agent_version}" if self._agent_version else ""
        sh_version = f" {shlex.quote(self._agent_version)}" if self._agent_version else ""
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail && "
                f'export PATH="{_PATH_PREFIX}" && '
                "if command -v apk &>/dev/null; then"
                f"  npm install -g @anthropic-ai/claude-code{npm_spec};"
                " else"
                f"  curl -fsSL https://claude.ai/install.sh | bash -s --{sh_version};"
                " fi && "
                f'export PATH="{_PATH_PREFIX}" && '
                "claude --version"
            ),
        )

    async def _install_opencode_cli(self, environment: BaseEnvironment) -> None:
        """Install OpenCode via nvm + npm, mirroring Harbor's opencode agent."""
        version_spec = f"@{self._agent_version}" if self._agent_version else "@latest"
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail && "
                "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash && "
                f"{_NVM_SOURCE} && "
                "command -v nvm &>/dev/null || { echo 'Error: NVM failed to load' >&2; exit 1; } && "
                "nvm install 22 && "
                f"npm i -g opencode-ai{version_spec} && "
                "opencode --version"
            ),
        )

    async def _install_copilot_cli(self, environment: BaseEnvironment) -> None:
        """Install GitHub Copilot CLI, mirroring Harbor's copilot_cli agent."""
        version_flag = (
            f" VERSION={shlex.quote(self._agent_version)}"
            if self._agent_version
            else ""
        )
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail && "
                f'export PATH="{_PATH_PREFIX}" && '
                f"curl -fsSL https://gh.io/copilot-install |{version_flag} bash && "
                f'export PATH="{_PATH_PREFIX}" && '
                "copilot --version"
            ),
        )

    @with_prompt_template
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        cmd_parts = self._atomic_command_parts(instruction)
        versions_json = json.dumps(
            self._versions_metadata(cmd_parts, await self._capture_versions(environment)),
            indent=2,
            default=str,
        )
        await self.exec_as_agent(
            environment,
            command=(
                "mkdir -p /logs/agent && "
                f"cat > {shlex.quote(_VERSIONS_FILE)} << 'VERSIONS_EOF'\n"
                f"{versions_json}\n"
                "VERSIONS_EOF"
            ),
        )

        atomic_cmd = " ".join(cmd_parts)
        script = self._build_run_script(atomic_cmd)
        full_cmd = f"bash -lc {shlex.quote(script)}"

        await self.exec_as_agent(
            environment,
            command=full_cmd,
            env=self._run_env(),
            timeout_sec=self._command_timeout,
        )

    def populate_context_post_run(self, context: AgentContext) -> None:
        """Read versions.json and append to context.metadata."""
        versions_file = self.logs_dir / "versions.json"
        if not versions_file.exists():
            return

        try:
            data = json.loads(versions_file.read_text())
        except (json.JSONDecodeError, OSError):
            return

        if context.metadata is None:
            context.metadata = {}
        context.metadata.setdefault("atomic_ralph", data)

    def _atomic_command_parts(self, instruction: str) -> list[str]:
        # `-d/--detach` is mandatory inside the harbor sandbox: atomic's
        # foreground mode tries to `tmux attach` after spawning the session,
        # which fails with "open terminal failed: not a terminal" when stdin
        # isn't a TTY. Detach mode spawns the orchestrator on the atomic
        # tmux socket and returns immediately; we then poll
        # `atomic workflow status` from the runner script to block until the
        # workflow reaches a terminal state.
        return [
            "atomic",
            "workflow",
            "-n",
            "ralph",
            "-a",
            self._agent_type,
            "-d",
            "--prompt",
            shlex.quote(instruction),
            "--max_loops",
            str(self._resolved_flags.get("max_loops", _DEFAULT_MAX_LOOPS)),
            *[shlex.quote(arg) for arg in self._extra_atomic_args],
        ]

    def _build_run_script(self, atomic_cmd: str) -> str:
        """Build the bash script that runs atomic detached and polls until
        the orchestrator reaches a terminal state.

        Atomic's foreground mode attaches to its newly-spawned tmux session,
        which fails inside Harbor's sandbox (no TTY). We pass `-d` so atomic
        returns immediately after spawning the session, then poll
        `atomic workflow status` until the workflow finishes — only then
        does `run()` return control to Harbor for verification.

        Polling runs until ralph reaches a terminal state. Harbor's
        `_agent_timeout_sec` (derived from the task's `timeout_sec` × the
        configured multiplier) is the sole wall-clock bound — when it
        fires, Harbor cancels the surrounding `exec_as_agent` call. We
        emit a heartbeat line every 30s so the run log shows liveness.
        """
        log = shlex.quote(_LOG_FILE)
        prelude = self._agent_runtime_prelude()
        prelude_line = f"{prelude}\n" if prelude else ""
        cd_line = (
            f"cd {shlex.quote(self._working_dir)}\n" if self._working_dir else ""
        )

        # NOTE: `\\` in Python source becomes `\` in the bash script —
        # required so `\s`/`\1` reach grep/sed verbatim. `{{` / `}}`
        # escape Python f-string braces.
        return textwrap.dedent(
            f"""\
            set -o pipefail
            export PATH="{_PATH_PREFIX}"
            {prelude_line}{cd_line}mkdir -p /logs/agent
            {{ {atomic_cmd}; }} 2>&1 | tee {log}

            SESSION=""
            for _ in $(seq 1 15); do
                SESSION=$(atomic workflow status --format json 2>/dev/null \\
                    | grep -oE '"id":[[:space:]]*"atomic-wf-[^"]+"' \\
                    | head -n1 \\
                    | sed -E 's/.*"(atomic-wf-[^"]+)".*/\\1/')
                [ -n "$SESSION" ] && break
                sleep 1
            done
            if [ -z "$SESSION" ]; then
                echo "[atomic-ralph] no workflow session detected after detach" >> {log}
                exit 1
            fi
            echo "[atomic-ralph] polling session: $SESSION" >> {log}

            ITER=0
            OVERALL=""
            while true; do
                ITER=$((ITER + 1))
                STATUS=$(atomic workflow status "$SESSION" --format json 2>/dev/null)
                OVERALL=$(printf '%s' "$STATUS" \\
                    | grep -oE '"overall":[[:space:]]*"[^"]+"' \\
                    | head -n1 \\
                    | sed -E 's/.*"([^"]+)".*/\\1/')
                case "$OVERALL" in
                    completed|error|needs_review) break ;;
                esac
                # Heartbeat every 6 polls (~30s at 5s sleep) so the log
                # shows the script is alive while ralph is still working.
                if [ $((ITER % 6)) -eq 0 ]; then
                    echo "[atomic-ralph] poll iter=$ITER status=${{OVERALL:-<empty>}}" >> {log}
                fi
                sleep 5
            done
            echo "[atomic-ralph] terminal status: $OVERALL after $ITER polls" >> {log}

            RUN_ID=$(printf '%s' "$SESSION" | grep -oE '[0-9a-f]+$')
            ORCH_LOG="$HOME/.atomic/sessions/$RUN_ID/orchestrator.log"
            if [ -f "$ORCH_LOG" ]; then
                echo "----- orchestrator.log -----" >> {log}
                cat "$ORCH_LOG" >> {log}
            fi

            atomic session kill "$SESSION" -y >/dev/null 2>&1 || true
            """
        )

    def _agent_runtime_prelude(self) -> str:
        """Shell snippet to source before invoking atomic at runtime.

        OpenCode is installed via nvm, so its `node`/`opencode` binaries
        live under `~/.nvm/versions/node/.../bin` rather than `~/.local/bin`.
        Sourcing nvm.sh extends PATH so atomic's child process can spawn
        opencode.
        """
        if self._agent_type == "opencode":
            return _NVM_SOURCE
        return ""

    def _run_env(self) -> dict[str, str]:
        """Compose the env passed to atomic at runtime.

        Forwards provider credentials from the host process into the sandbox
        using the same logic each Harbor installed agent applies in its
        own ``run()``. Atomic itself does not forward credentials, so the
        underlying CLI (claude / opencode / copilot) only sees the vars
        we set here.
        """
        env: dict[str, str] = {
            "PATH": _RUN_PATH,
            "CI": "1",
            "TERM": "xterm-256color",
        }
        agent_env_builder = {
            "claude": self._claude_run_env,
            "opencode": self._opencode_run_env,
            "copilot": self._copilot_run_env,
        }[self._agent_type]
        env.update(agent_env_builder())
        return env

    def _claude_run_env(self) -> dict[str, str]:
        """Mirror `harbor/agents/installed/claude_code.py:1015-1108`."""
        use_bedrock = self._is_bedrock_mode()

        env: dict[str, str] = {
            "ANTHROPIC_API_KEY": os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
            or "",
            "ANTHROPIC_BASE_URL": os.environ.get("ANTHROPIC_BASE_URL", ""),
            "CLAUDE_CODE_OAUTH_TOKEN": os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", ""),
            "CLAUDE_CODE_MAX_OUTPUT_TOKENS": os.environ.get(
                "CLAUDE_CODE_MAX_OUTPUT_TOKENS", ""
            ),
            "FORCE_AUTO_BACKGROUND_TASKS": "1",
            "ENABLE_BACKGROUND_TASKS": "1",
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
            # Allow bypassPermissions mode when running as root in the sandbox.
            "IS_SANDBOX": "1",
        }

        if use_bedrock:
            env["CLAUDE_CODE_USE_BEDROCK"] = "1"
            bedrock_token = os.environ.get("AWS_BEARER_TOKEN_BEDROCK", "")
            if bedrock_token:
                env["AWS_BEARER_TOKEN_BEDROCK"] = bedrock_token
            for aws_var in _BEDROCK_AWS_VARS:
                val = os.environ.get(aws_var, "")
                if val:
                    env[aws_var] = val
            env["AWS_REGION"] = os.environ.get("AWS_REGION", "us-east-1")
            small_model_region = os.environ.get(
                "ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION", ""
            )
            if small_model_region:
                env["ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION"] = small_model_region
            if os.environ.get("DISABLE_PROMPT_CACHING", "").strip() == "1":
                env["DISABLE_PROMPT_CACHING"] = "1"

        # Strip empty values so Claude CLI can pick the highest-priority
        # configured auth method itself.
        env = {k: v for k, v in env.items() if v}

        if self.model_name:
            if use_bedrock:
                # Bedrock model IDs / ARNs pass through; only strip a
                # leading "provider/" prefix if present.
                env["ANTHROPIC_MODEL"] = (
                    self.model_name.split("/", 1)[-1]
                    if "/" in self.model_name
                    else self.model_name
                )
            elif "ANTHROPIC_BASE_URL" in env:
                env["ANTHROPIC_MODEL"] = self.model_name
            else:
                env["ANTHROPIC_MODEL"] = self.model_name.split("/")[-1]
        elif "ANTHROPIC_MODEL" in os.environ:
            env["ANTHROPIC_MODEL"] = os.environ["ANTHROPIC_MODEL"]

        if "ANTHROPIC_BASE_URL" in env and "ANTHROPIC_MODEL" in env:
            model = env["ANTHROPIC_MODEL"]
            env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = model
            env["ANTHROPIC_DEFAULT_OPUS_MODEL"] = model
            env["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = model
            env["CLAUDE_CODE_SUBAGENT_MODEL"] = model

        if os.environ.get("CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING", "").strip() == "1":
            env["CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING"] = "1"

        return env

    def _opencode_run_env(self) -> dict[str, str]:
        """Forward provider credentials for OpenCode.

        Model selection is configured statically in `.atomic/settings.json`
        rather than via Harbor's `--model` flag, so we don't have a provider
        prefix to filter on. Forward every known credential key that's
        present in the environment — Harbor's `--agent-env` already gates
        which ones are populated, so this is just a relay.

        Provider key set mirrors `harbor/agents/installed/opencode.py:413-452`.
        """
        env: dict[str, str] = {"OPENCODE_FAKE_VCS": "git"}
        all_keys = {k for keys in _OPENCODE_PROVIDER_KEYS.values() for k in keys}
        for key in all_keys:
            val = os.environ.get(key)
            if val:
                env[key] = val
        return env

    def _copilot_run_env(self) -> dict[str, str]:
        """Mirror `harbor/agents/installed/copilot_cli.py:360-369`."""
        token = (
            os.environ.get("COPILOT_GITHUB_TOKEN")
            or os.environ.get("GH_TOKEN")
            or os.environ.get("GITHUB_TOKEN")
        )
        return {"GITHUB_TOKEN": token} if token else {}

    @staticmethod
    def _is_bedrock_mode() -> bool:
        """Mirror `harbor/agents/installed/claude_code.py:1006-1013`."""
        if os.environ.get("CLAUDE_CODE_USE_BEDROCK", "").strip() == "1":
            return True
        if os.environ.get("AWS_BEARER_TOKEN_BEDROCK", "").strip():
            return True
        return False

    async def _capture_versions(self, environment: BaseEnvironment) -> str:
        cli_bin = _AGENT_CLI_BIN[self._agent_type]
        prelude = self._agent_runtime_prelude()
        prelude_cmd = f"{prelude} && " if prelude else ""
        try:
            result = await self.exec_as_agent(
                environment,
                command=(
                    f'export PATH="{_PATH_PREFIX}" && '
                    f"{prelude_cmd}"
                    "atomic --version 2>/dev/null; "
                    f"{cli_bin} --version 2>/dev/null"
                ),
            )
            return result.stdout or ""
        except Exception:
            return ""

    def _versions_metadata(
        self,
        command_parts: list[str],
        versions_raw: str,
    ) -> dict[str, Any]:
        return {
            "agent": _AGENT_NAME,
            "agent_type": self._agent_type,
            "agent_version": self._agent_version,
            "model": self.model_name,
            "atomic_install_url": _ATOMIC_INSTALL_URL,
            "atomic_version": self._atomic_version,
            "max_loops": self._resolved_flags.get("max_loops", _DEFAULT_MAX_LOOPS),
            "install_agent_cli": self._install_agent_cli,
            "extra_atomic_args": self._extra_atomic_args,
            "working_dir": self._working_dir,
            "versions_raw": versions_raw,
            "command_argv": command_parts,
            "log_file": _LOG_FILE,
        }
