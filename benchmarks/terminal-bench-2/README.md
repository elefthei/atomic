# Terminal-Bench 2 — Atomic Ralph Agent

Benchmarks Atomic Ralph against [Harbor Terminal-Bench 2.0](https://github.com/terminal-bench/harbor).

## Prerequisites

Harbor is declared as a project dependency in `pyproject.toml` and lives in this directory's `.venv`. Sync it once:

```sh
cd benchmarks/terminal-bench-2
uv sync
```

All commands below assume you've `cd`'d into `benchmarks/terminal-bench-2/` and use `uv run harbor …` to invoke the local install.

Agent file: `benchmarks/terminal-bench-2/atomic_ralph.py`

## Import path

Import path passed to Harbor:

```
atomic_ralph:AtomicRalph
```

`uv run` adds the project's working directory to the venv's import path, so running from `benchmarks/terminal-bench-2/` resolves `atomic_ralph` directly. To run from the repo root, prefix with `--directory`:

```sh
uv run --directory benchmarks/terminal-bench-2 harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  ...
```

## Smoke test (1 task, sequential)

Verifies wiring before a full run. Run from `benchmarks/terminal-bench-2/`. Pick the variant that matches your `agent_type`.

### Claude (default)

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --dataset terminal-bench@2.0 \
  --n-tasks 1 \
  --n-concurrent 1 \
  --jobs-dir jobs \
  --agent-env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --agent-kwarg agent_type=claude \
  --agent-kwarg max_loops=20
```

### OpenCode

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --dataset terminal-bench@2.0 \
  --n-tasks 1 \
  --n-concurrent 1 \
  --jobs-dir jobs \
  --agent-env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --agent-kwarg agent_type=opencode \
  --agent-kwarg max_loops=20
```

### Copilot

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --dataset terminal-bench@2.0 \
  --n-tasks 1 \
  --n-concurrent 1 \
  --jobs-dir jobs \
  --agent-env COPILOT_GITHUB_TOKEN=$COPILOT_GITHUB_TOKEN \
  --agent-kwarg agent_type=copilot \
  --agent-kwarg max_loops=20
```

## Full / subset run

### Claude (default)

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --dataset terminal-bench@2.0 \
  --jobs-dir jobs \
  --n-concurrent 4 \
  --agent-env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --agent-kwarg agent_type=claude \
  --agent-kwarg max_loops=20
```

### OpenCode

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --dataset terminal-bench@2.0 \
  --jobs-dir jobs \
  --n-concurrent 4 \
  --agent-env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --agent-kwarg agent_type=opencode \
  --agent-kwarg max_loops=20
```

### Copilot

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --dataset terminal-bench@2.0 \
  --jobs-dir jobs \
  --n-concurrent 4 \
  --agent-env COPILOT_GITHUB_TOKEN=$COPILOT_GITHUB_TOKEN \
  --agent-kwarg agent_type=copilot \
  --agent-kwarg max_loops=20
```

> **Changing the model** — Harbor's `--model` flag is **not** used. Edit [`.atomic/settings.json`](.atomic/settings.json) and update the `--model <id>` entry inside `providers.<agent_type>.chatFlags`. Atomic reads this file from the project root and appends the flags when spawning each CLI. Defaults must be re-included because `chatFlags` *replaces* atomic's defaults entirely (see `packages/atomic-sdk/src/services/config/definitions.ts:145`). Currently pinned to `claude-opus-4-7` (Claude / OpenCode) and `claude-opus-4.7` (Copilot — note the dot, that's how Copilot exposes the same model; see [models.dev](https://models.dev)).
>
> **Auth alternatives** — see the [Provider credentials by agent_type](#provider-credentials-by-agent_type) matrix below for OAuth, Bedrock, OpenAI, Google, etc. Replace the `--agent-env` flag(s) accordingly.

## Agent kwargs

| Kwarg | Example | Notes |
|---|---|---|
| `max_loops` | `--agent-kwarg max_loops=20` | Max agent iterations per trial |
| `agent_type` | `--agent-kwarg agent_type=opencode` | Coding-agent CLI atomic drives. One of `claude` (default), `opencode`, `copilot`. |
| `agent_version` | `--agent-kwarg agent_version=1.2.3` | Pin the underlying CLI version. Defaults to latest. |
| `atomic_version` | `--agent-kwarg atomic_version=0.7.13` | Pin the atomic CLI version. Defaults to latest. |
| `install_agent_cli` | `--agent-kwarg install_agent_cli=false` | Skip installing the underlying CLI (assumes it's pre-installed). |

Add additional kwargs by repeating `--agent-kwarg key=value`. Available kwargs are defined in `AtomicRalph.__init__`.

### Agent install routines

Each `agent_type` is installed using the same procedure Harbor's native installed agents use:

- `claude` — `https://claude.ai/install.sh` (npm-on-Alpine fallback)
- `opencode` — `nvm install 22 && npm i -g opencode-ai`
- `copilot` — `https://gh.io/copilot-install`

### Provider credentials by agent_type

`AtomicRalph._run_env` mirrors the env-forwarding logic of each Harbor builtin agent. Set vars on the host running Harbor; they're forwarded into the sandbox at trial time. Empty values are stripped so the underlying CLI picks the highest-priority configured auth method itself.

#### `agent_type=claude` (mirrors `harbor/agents/installed/claude_code.py`)

| Mode | Vars |
|---|---|
| Direct API | `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` as alias) |
| OAuth | `CLAUDE_CODE_OAUTH_TOKEN` |
| Custom endpoint | `ANTHROPIC_BASE_URL` (with API key or OAuth) |
| AWS Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` *or* `AWS_BEARER_TOKEN_BEDROCK` triggers Bedrock mode. Forwards `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`/`AWS_PROFILE` + `AWS_REGION` (default `us-east-1`). |

Optional knobs: `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION`, `DISABLE_PROMPT_CACHING=1`, `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1`. The model itself is set via `--model` inside `.atomic/settings.json`.

#### `agent_type=opencode`

Model selection comes from `.atomic/settings.json`, not from Harbor's `--model` flag, so credential forwarding can't be filtered by provider prefix. Instead, `_opencode_run_env` forwards **every known credential key that's present in the host env** — pass only the one(s) you need via `--agent-env`. Provider key set mirrors [`harbor/agents/installed/opencode.py:413-452`](https://github.com/harbor-framework/harbor/blob/main/src/harbor/agents/installed/opencode.py).

| Provider (models.dev ID) | Keys |
|---|---|
| `amazon-bedrock` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `azure` | `AZURE_RESOURCE_NAME`, `AZURE_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `github-copilot` | `GITHUB_TOKEN` |
| `google` | `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_API_KEY` |
| `groq` | `GROQ_API_KEY` |
| `huggingface` | `HF_TOKEN` |
| `llama` | `LLAMA_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `openai` | `OPENAI_API_KEY`, `OPENAI_BASE_URL` |
| `opencode` | `OPENCODE_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

`OPENCODE_FAKE_VCS=git` is set unconditionally. To switch providers, also update the `--model` value inside `.atomic/settings.json` (e.g. `openai/gpt-5`) and pass the matching key via `--agent-env`.

#### `agent_type=copilot` (mirrors `harbor/agents/installed/copilot_cli.py`)

Resolves a token from `COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` and forwards it as `GITHUB_TOKEN`. If no token is set, Copilot CLI falls back to a cached `gh auth login` in `~/.copilot`.

## Permissions warning ⚠️

Harbor runs agents inside sandboxed Docker containers. Ralph/Claude provider **skips host-level permission prompts** — no interactive approval dialog appears. Ensure you are comfortable with the agent having full access to the sandbox environment before running. Do **not** mount host directories with sensitive data.

## Logs and artifacts

After a run, Harbor writes results under `--jobs-dir` (default `jobs/` relative to CWD):

```
jobs/
  <job-name>/
    versions.json          # Harbor + agent version metadata
    <trial-id>/
      logs/
        agent/
          atomic-ralph.txt # Agent stdout/stderr per trial
```

Key files:

- `versions.json` — versions of Harbor, the dataset, and agent recorded at run time.
- `logs/agent/atomic-ralph.txt` — per-trial agent log; check here first when debugging.

> **Do not commit** the `jobs/` directory. Keep generated Harbor results out of source control.

## Run a single task (debugging)

### Claude (default)

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --task terminal-bench/<task-name> \
  --n-concurrent 1 \
  --jobs-dir jobs \
  --agent-env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --agent-kwarg agent_type=claude \
  --agent-kwarg max_loops=10 \
  --debug
```

### OpenCode

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --task terminal-bench/<task-name> \
  --n-concurrent 1 \
  --jobs-dir jobs \
  --agent-env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  --agent-kwarg agent_type=opencode \
  --agent-kwarg max_loops=10 \
  --debug
```

### Copilot

```sh
uv run harbor run \
  --agent-import-path atomic_ralph:AtomicRalph \
  --task terminal-bench/<task-name> \
  --n-concurrent 1 \
  --jobs-dir jobs \
  --agent-env COPILOT_GITHUB_TOKEN=$COPILOT_GITHUB_TOKEN \
  --agent-kwarg agent_type=copilot \
  --agent-kwarg max_loops=10 \
  --debug
```

## Inner Atomic command contract

For each Terminal-Bench trial, `AtomicRalph` runs:

```sh
atomic workflow -n ralph -a <agent_type> -d --prompt <instruction> --max_loops <N>
```

`<agent_type>` defaults to `claude`; override with `--agent-kwarg agent_type=opencode|copilot`.

`<instruction>` is the Terminal-Bench task string passed by Harbor. The wrapper
quotes it and forwards it via `--prompt`; no positional separator (`--`) is used.

`-d` (detach) is mandatory inside Harbor's sandbox: atomic's foreground mode
attempts a `tmux attach` after spawning the orchestrator session, which fails
with `open terminal failed: not a terminal` when stdin is not a TTY. Detach
mode spawns the orchestrator on the atomic tmux socket and returns
immediately; the wrapper then polls `atomic workflow status <session>
--format json` (5s intervals, max `max_loops × 60s`) until the workflow
reaches a terminal state (`completed`, `error`, `needs_review`), tails the
orchestrator log into `/logs/agent/atomic-ralph.txt`, and tears the session
down with `atomic session kill -y` before returning control to Harbor for
verification.

Additional flags from `--agent-kwarg` (e.g. `max_loops`) are inserted before
`--prompt`. Extra raw args supplied via `extra_atomic_args` are appended after
`max_loops`.

## Notes

- Benchmark scores are not guaranteed. Terminal-Bench 2.0 tasks are adversarial; pass rates vary by model and prompt template.
- Harbor caches environment images; first run per task may be slower.
- Use `uv run harbor view --jobs-dir jobs` to browse trajectories in a local web UI.
