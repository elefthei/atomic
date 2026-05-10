# Partition 12 of 16 — Findings

## Scope
`devcontainer-features/` (3 files, 555 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
## Implementation

- `devcontainer-features/src/claude/install.sh` — Installs Atomic CLI via bun from npm with pinned version/dist-tag (latest, prerelease, or explicit semver); resolves ATOMIC_VERSION to npm spec with validation; configures PATH and UTF-8 locale across shell types; installs shared tooling (@playwright/cli@latest, @llamaindex/liteparse@latest)
- `devcontainer-features/src/opencode/install.sh` — Identical install.sh duplicated across three features (claude, copilot, opencode) per design; pinned version resolution drives determinism
- `devcontainer-features/src/copilot/install.sh` — Identical install.sh duplicated across three features (claude, copilot, opencode) per design; pinned version resolution drives determinism

## Configuration

- `devcontainer-features/src/claude/devcontainer-feature.json` — Feature metadata with version option (latest/prerelease/explicit); declares dependsOn ghcr.io/devcontainers-extra/features/bun:1 (bun runtime pin), ghcr.io/anthropics/devcontainer-features/claude-code:1 (Claude agent pin)
- `devcontainer-features/src/opencode/devcontainer-feature.json` — Feature metadata with version option (latest/prerelease/explicit); declares dependsOn ghcr.io/devcontainers-extra/features/bun:1, ghcr.io/devcontainers-extra/features/opencode:1 (agent pin)
- `devcontainer-features/src/copilot/devcontainer-feature.json` — Feature metadata with version option (latest/prerelease/explicit); declares dependsOn ghcr.io/devcontainers-extra/features/bun:1, ghcr.io/devcontainers/features/copilot-cli:1 (agent pin)

## Notable Clusters

- `devcontainer-features/src/` — 6 files forming three agent-specific install bundles (claude, opencode, copilot); each bundle pins Atomic CLI version, runtime (bun), and tooling versions (playwright, liteparse) via install.sh scripts and feature metadata with dependsOn declarations

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
### Files Analysed

- `devcontainer-features/src/claude/install.sh`
- `devcontainer-features/src/claude/devcontainer-feature.json`
- `devcontainer-features/src/opencode/install.sh`
- `devcontainer-features/src/opencode/devcontainer-feature.json`
- `devcontainer-features/src/copilot/install.sh`
- `devcontainer-features/src/copilot/devcontainer-feature.json`

### Per-File Notes

#### `devcontainer-features/src/claude/install.sh`

- **Role:** Bash feature-install script that provisions a devcontainer with a pinned version of the Atomic CLI and shared tooling, establishing the deterministic environment baseline for workflows that run inside that container.
- **Key symbols:**
  - `ATOMIC_VERSION` (`install.sh:24`) — reads from `$VERSION` env var (injected by devcontainer CLI from the feature option), defaults to `"latest"`.
  - `ATOMIC_SPEC` (`install.sh:28–42`) — the resolved npm package specifier (`@bastani/atomic@latest`, `@bastani/atomic@next`, or `@bastani/atomic@<semver>`).
  - `REMOTE_USER` / `REMOTE_HOME` (`install.sh:51–56`) — resolved from `_REMOTE_USER` / `_REMOTE_USER_HOME` devcontainer env vars with a fallback to `vscode`.
- **Control flow:**
  1. Root check (`install.sh:14–17`), exits immediately if not root.
  2. Three-branch `case` on `ATOMIC_VERSION` (`install.sh:26–43`): `latest` → `@bastani/atomic@latest`; `prerelease` → `@bastani/atomic@next`; anything else → semver regex validation (`^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$` at `install.sh:35`) then strips leading `v` and forms exact spec.
  3. Resolves `REMOTE_USER` and validates home directory exists (`install.sh:51–56`).
  4. Verifies `bun` is on the remote user's PATH (`install.sh:62–65`), exits with error if not.
  5. Installs Atomic CLI globally as remote user: `bun add -g '${ATOMIC_SPEC}'` (`install.sh:66`).
  6. Writes PATH config to four shell entry points — `/etc/profile.d/atomic-path.sh` (`install.sh:78–86`), `/etc/bash.bashrc` append (`install.sh:89–100`), `/etc/zsh/zshrc` append (`install.sh:103–114`), `/etc/fish/conf.d/atomic-path.fish` (`install.sh:117–127`).
  7. Optionally runs `locale-gen en_US.UTF-8` (`install.sh:136`), then writes UTF-8 locale exports to the same four shell entry points (`install.sh:139–177`).
  8. Installs shared tooling as remote user: `bun install -g --trust @playwright/cli@latest @llamaindex/liteparse@latest` (`install.sh:183`); failure is non-fatal (`|| echo "⚠ ..."`).
- **Data flow:** `$VERSION` option (devcontainer feature schema) → `ATOMIC_VERSION` → `ATOMIC_SPEC` → `bun add -g` invocation; `_REMOTE_USER` / `_REMOTE_USER_HOME` → shell config files written system-wide.
- **Dependencies:** `bun` (provided by `ghcr.io/devcontainers-extra/features/bun:1` declared in feature JSON), `locale-gen` (optional, checked at runtime), devcontainer CLI env vars `_REMOTE_USER` / `_REMOTE_USER_HOME`.

#### `devcontainer-features/src/claude/devcontainer-feature.json`

- **Role:** OCI devcontainer feature metadata that declares which agent (Claude Code) and runtimes are pinned as hard dependencies, and exposes the `version` option that drives version resolution in `install.sh`.
- **Key symbols:**
  - `"version": "1.0.14"` (`devcontainer-feature.json:3`) — the feature's own published version; controls which image digest is pulled for reproducibility.
  - `"options".version` (`devcontainer-feature.json:8–13`) — user-facing option: `string` type, proposals `["latest", "prerelease"]`, default `"latest"`; value becomes `$VERSION` in `install.sh`.
  - `"dependsOn"` (`devcontainer-feature.json:15–19`) — hard pins three upstream features: `ghcr.io/devcontainers-extra/features/tmux-apt-get:1`, `ghcr.io/devcontainers-extra/features/bun:1`, `ghcr.io/anthropics/devcontainer-features/claude-code:1`.
  - `"installsAfter"` (`devcontainer-feature.json:20–23`) — soft ordering after `common-utils` and `github-cli:1`.
- **Control flow:** Declarative JSON; devcontainer CLI reads this before invoking `install.sh`, resolves feature order from `dependsOn` and `installsAfter`, then passes the chosen `version` option as `$VERSION`.
- **Data flow:** `options.version` → env var `VERSION` in `install.sh`; `dependsOn` image references → devcontainer feature resolution graph.
- **Dependencies:** Upstream OCI feature images at major-version pins (`:1`).

#### `devcontainer-features/src/opencode/install.sh`

- **Role:** Byte-for-byte identical copy of the claude `install.sh`. Per the header comment (`install.sh:7–9`), this is intentional — the three feature bundles share one install script kept in sync manually.
- **Key symbols:** Same as claude `install.sh`; `ATOMIC_SPEC`, `REMOTE_USER`, `bun add -g`, playwright/liteparse installation all appear at identical line numbers.
- **Control flow:** Identical to `devcontainer-features/src/claude/install.sh`.
- **Data flow:** Identical to `devcontainer-features/src/claude/install.sh`.
- **Dependencies:** `bun` provided by `ghcr.io/devcontainers-extra/features/bun:1`; OpenCode agent provided by `ghcr.io/devcontainers-extra/features/opencode:1` (declared in feature JSON).

#### `devcontainer-features/src/opencode/devcontainer-feature.json`

- **Role:** Feature metadata for the OpenCode agent bundle; structurally identical to the claude feature JSON but swaps the agent dependency.
- **Key symbols:**
  - `"id": "opencode"` (`devcontainer-feature.json:2`).
  - `"dependsOn"` (`devcontainer-feature.json:15–19`) — pins `ghcr.io/devcontainers-extra/features/bun:1` and `ghcr.io/devcontainers-extra/features/opencode:1` (instead of claude-code).
  - `"version": "1.0.14"` (`devcontainer-feature.json:3`) — same feature version as claude/copilot, meaning all three bundles are released in lockstep.
- **Control flow:** Declarative; same ordering semantics as claude feature.
- **Data flow:** Same `options.version` → `$VERSION` path.
- **Dependencies:** `ghcr.io/devcontainers-extra/features/opencode:1` at major-version pin.

#### `devcontainer-features/src/copilot/install.sh`

- **Role:** Third byte-for-byte copy of the shared install script for the Copilot agent bundle. Identical implementation.
- **Key symbols:** Same as claude `install.sh`.
- **Control flow:** Identical to `devcontainer-features/src/claude/install.sh`.
- **Data flow:** Identical.
- **Dependencies:** `bun` provided by `ghcr.io/devcontainers-extra/features/bun:1`; Copilot CLI provided by `ghcr.io/devcontainers/features/copilot-cli:1`.

#### `devcontainer-features/src/copilot/devcontainer-feature.json`

- **Role:** Feature metadata for the GitHub Copilot agent bundle; swaps agent dependency to `ghcr.io/devcontainers/features/copilot-cli:1`.
- **Key symbols:**
  - `"id": "copilot"` (`devcontainer-feature.json:2`).
  - `"dependsOn"` (`devcontainer-feature.json:15–19`) — pins `ghcr.io/devcontainers-extra/features/bun:1` and `ghcr.io/devcontainers/features/copilot-cli:1`.
  - `"version": "1.0.14"` — lockstep release with claude and opencode bundles.
- **Control flow / Data flow:** Identical structure to the other two feature JSONs.
- **Dependencies:** `ghcr.io/devcontainers/features/copilot-cli:1` at major-version pin.

### Cross-Cutting Synthesis

The `devcontainer-features/` partition contributes to Atomic's deterministic workflow execution at the environment provisioning layer, not the workflow DSL/runtime layer. Determinism is established here through two mechanisms acting together. First, the `install.sh` scripts resolve the Atomic CLI to a fixed npm specifier before installation: a three-branch `case` statement (`install.sh:26–43`) maps the user's option (`latest`, `prerelease`, or an explicit semver) to a concrete `bun add -g` invocation. The semver branch enforces a strict regex (`^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$`) and strips the `v` prefix, ensuring no ambiguous version string reaches npm. Second, the `devcontainer-feature.json` files pin every upstream dependency—bun runtime and the specific coding agent (Claude Code, OpenCode, or Copilot CLI)—at OCI major-version references (`:1`). All three bundles are versioned in lockstep at `1.0.14` and share a single script body kept in sync manually. Shared tooling (`@playwright/cli@latest`, `@llamaindex/liteparse@latest`) uses floating `@latest` tags, making those two packages the only non-deterministic inputs in this layer.

### Out-of-Partition References

- `src/sdk/` — The install scripts note that "agent config syncing, tooling and SDK installation are all handled on first `atomic chat` run via auto-init" (`install.sh:4–5`), pointing to the workflow DSL/runtime in `src/sdk/` as the layer where actual deterministic workflow execution is implemented.
- `.github/workflows/publish.yml` — Referenced implicitly at `install.sh:22`: the `@bastani/atomic@next` dist-tag is described as matching `npm publish --tag next` in `publish.yml`, meaning the prerelease version resolution depends on CI publish behavior defined there.

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Deterministic Workflows Patterns in Atomic

## Overview

Atomic's deterministic workflows rely on **pinned tool versions** defined in devcontainer features. These features install specific versions of CLI tools and runtime environments, ensuring reproducible sandboxed execution across different environments.

---

## Patterns Found

#### Pattern: Semantic Version Resolution with Environment Variables

**Where:** `devcontainer-features/src/claude/install.sh:19-43`

**What:** Resolves a version input string to a concrete npm package specification, supporting dist-tags (latest/prerelease) and explicit semantic versions with validation.

```bash
# ─── Resolve npm dist-tag / version ─────────────────────────────────────────
# Option -> npm package spec:
#   latest     → @bastani/atomic@latest  (stable releases)
#   prerelease → @bastani/atomic@next    (prereleases — matches `npm publish --tag next` in publish.yml)
#   <version>  → @bastani/atomic@<version>
ATOMIC_VERSION="${VERSION:-latest}"

case "${ATOMIC_VERSION}" in
    latest)
        ATOMIC_SPEC="@bastani/atomic@latest"
        ;;
    prerelease)
        ATOMIC_SPEC="@bastani/atomic@next"
        ;;
    *)
        # Validate semver (MAJOR.MINOR.PATCH with optional numeric prerelease suffix)
        if ! echo "${ATOMIC_VERSION}" | grep -qE '^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$'; then
            echo "Error: '${ATOMIC_VERSION}' is not a valid semver." >&2
            echo "Expected format: MAJOR.MINOR.PATCH (e.g., 1.0.0 or 1.0.0-1)" >&2
            exit 1
        fi
        # Strip leading v — npm specs don't use the v prefix
        ATOMIC_SPEC="@bastani/atomic@${ATOMIC_VERSION#v}"
        ;;
esac
```

**Variations / call-sites:**
- `devcontainer-features/src/copilot/install.sh:19-43` (identical pattern)
- `devcontainer-features/src/opencode/install.sh:19-43` (identical pattern)

---

#### Pattern: Feature Dependency Declaration for Deterministic Stacking

**Where:** `devcontainer-features/src/claude/devcontainer-feature.json:15-23`

**What:** Declares explicit feature dependencies with pinned versions to ensure deterministic tool installation order and compatibility.

```json
  "dependsOn": {
    "ghcr.io/devcontainers-extra/features/tmux-apt-get:1": {},
    "ghcr.io/devcontainers-extra/features/bun:1": {},
    "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
  },
  "installsAfter": [
    "ghcr.io/devcontainers/features/common-utils",
    "ghcr.io/devcontainers/features/github-cli:1"
  ]
```

**Variations / call-sites:**
- `devcontainer-features/src/copilot/devcontainer-feature.json:15-23` (replaces claude-code with copilot-cli)
- `devcontainer-features/src/opencode/devcontainer-feature.json:15-23` (replaces claude-code with opencode)

---

#### Pattern: Pinned Global CLI Tool Versions

**Where:** `devcontainer-features/src/claude/install.sh:179-186`

**What:** Installs global CLI tools via bun with explicit version pins using `@latest` tags, ensuring deterministic tool availability across sandboxed runs.

```bash
# ─── Install global CLI tools via bun ──────────────────────────────────────────
# Use bun (already installed) with --trust to allow postinstall lifecycle
# scripts (e.g. playwright browser downloads).
echo "Installing global CLI tools..."
su - "${REMOTE_USER}" -c "bun install -g --trust @playwright/cli@latest @llamaindex/liteparse@latest" 2>&1 \
    && echo "✓ Global CLI tools installed" \
    || echo "⚠ Some global CLI tools failed to install (non-fatal)"
```

**Variations / call-sites:**
- `devcontainer-features/src/copilot/install.sh:179-186` (identical)
- `devcontainer-features/src/opencode/install.sh:179-186` (identical)

---

#### Pattern: Locale Determinism for Reproducible Output

**Where:** `devcontainer-features/src/claude/install.sh:131-177`

**What:** Ensures UTF-8 locale is consistently set across all shell types (login/non-login, bash/zsh/fish) to guarantee deterministic output rendering of Unicode box-drawing and ASCII art characters.

```bash
# ─── Ensure UTF-8 locale for proper Unicode/ASCII art rendering ───────────
# Agent CLIs (e.g. Copilot) emit Unicode box-drawing / figlet characters.
# Without a UTF-8 locale the output is garbled when spawned as a Bun
# subprocess inside the devcontainer.
if command -v locale-gen >/dev/null 2>&1; then
    locale-gen en_US.UTF-8 >/dev/null 2>&1 || true
fi

cat > /etc/profile.d/atomic-locale.sh <<'LOCALE_EOF'
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
LOCALE_EOF
```

**Variations / call-sites:**
- `devcontainer-features/src/copilot/install.sh:131-177` (identical)
- `devcontainer-features/src/opencode/install.sh:131-177` (identical)
- Applies to all shell configurations: bash.bashrc, zsh/zshrc, fish/conf.d

---

#### Pattern: Runtime Detection with Graceful Fallback

**Where:** `devcontainer-features/src/claude/install.sh:47-66`

**What:** Detects devcontainer environment variables at install time and falls back to sensible defaults when running outside the devcontainer CLI, enabling flexible deterministic execution.

```bash
# ─── Resolve remote user ────────────────────────────────────────────────────
# Devcontainer CLI exposes _REMOTE_USER and _REMOTE_USER_HOME at feature-install
# time. Fall back gracefully if the feature is invoked outside the devcontainer
# CLI (e.g. local testing).
REMOTE_USER="${_REMOTE_USER:-${USERNAME:-vscode}}"
REMOTE_HOME="${_REMOTE_USER_HOME:-/home/${REMOTE_USER}}"
if [ ! -d "${REMOTE_HOME}" ]; then
    echo "Error: remote user home directory '${REMOTE_HOME}' does not exist" >&2
    exit 1
fi

# ─── Install atomic via bun (global) ────────────────────────────────────────
# bun is provided by the dependent ghcr.io/devcontainers-extra/features/bun:1
# feature. Install as the remote user via a login shell so bun's PATH setup is
# picked up and the package lands in their ~/.bun/bin (not root's home).
if ! su - "${REMOTE_USER}" -c 'command -v bun >/dev/null 2>&1'; then
    echo "Error: bun is not on ${REMOTE_USER}'s PATH. The bun devcontainer feature must install before this one." >&2
    exit 1
fi
su - "${REMOTE_USER}" -c "bun add -g '${ATOMIC_SPEC}'"
```

**Variations / call-sites:**
- `devcontainer-features/src/copilot/install.sh:47-66` (identical)
- `devcontainer-features/src/opencode/install.sh:47-66` (identical)

---

#### Pattern: Multi-Shell PATH Configuration for Deterministic Access

**Where:** `devcontainer-features/src/claude/install.sh:68-127`

**What:** Ensures `~/.bun/bin` is available on PATH for all shell variants (login/non-login bash, zsh, fish) so bun-installed globals are deterministically accessible regardless of shell invocation type.

```bash
# ─── Ensure ~/.bun/bin is on PATH for ALL shell types ──────────────────────
# The bun feature may configure PATH in the user's rc files, but devcontainer
# terminals often run as non-login shells that skip /etc/profile.d/. Cover
# every entry point so `atomic` (and other bun globals) are always found:
#   - Login shells:          /etc/profile.d/
#   - Non-login bash shells: /etc/bash.bashrc
#   - Non-login zsh shells:  /etc/zsh/zshrc
#   - Fish shells:           /etc/fish/conf.d/

# Login shells
cat > /etc/profile.d/atomic-path.sh <<'PROFILE_EOF'
if [ -d "$HOME/.bun/bin" ]; then
    case ":$PATH:" in
        *":$HOME/.bun/bin:"*) ;;
        *) export PATH="$HOME/.bun/bin:$PATH" ;;
    esac
fi
PROFILE_EOF
chmod 644 /etc/profile.d/atomic-path.sh

# Non-login bash shells
if [ -f /etc/bash.bashrc ] && ! grep -q '.bun/bin' /etc/bash.bashrc 2>/dev/null; then
    cat >> /etc/bash.bashrc <<'BASHRC_EOF'
# bun global bin (atomic CLI + tools)
if [ -d "$HOME/.bun/bin" ]; then
    case ":$PATH:" in
        *":$HOME/.bun/bin:"*) ;;
        *) export PATH="$HOME/.bun/bin:$PATH" ;;
    esac
fi
BASHRC_EOF
fi
```

**Variations / call-sites:**
- `devcontainer-features/src/copilot/install.sh:68-127` (identical)
- `devcontainer-features/src/opencode/install.sh:68-127` (identical)

---

#### Pattern: Feature Option Declaration for Version Control

**Where:** `devcontainer-features/src/claude/devcontainer-feature.json:7-14`

**What:** Declares configurable version options with proposals (latest, prerelease) and defaults, allowing users to pin specific Atomic CLI versions while defaulting to stable releases.

```json
  "options": {
    "version": {
      "type": "string",
      "proposals": ["latest", "prerelease"],
      "default": "latest",
      "description": "Select version of Atomic CLI, if not latest."
    }
  }
```

**Variations / call-sites:**
- `devcontainer-features/src/copilot/devcontainer-feature.json:7-14` (identical)
- `devcontainer-features/src/opencode/devcontainer-feature.json:7-14` (identical)

---

## Key Determinism Inputs

Based on the patterns, Atomic's deterministic workflows are controlled by:

1. **Feature Version Pins** (`devcontainer-feature.json` version fields)
   - Defines the specific version of each feature (currently `1.0.14` across all three features)

2. **Dependency Pins** (`dependsOn` blocks)
   - Specifies exact feature versions: `bun:1`, `tmux-apt-get:1`, etc.
   - Each agent-specific feature pins its corresponding agent version

3. **Package Version Options** (`options.version`)
   - Users can select `latest` (default), `prerelease`, or explicit semver
   - Passed as `VERSION` environment variable to install scripts

4. **Global Tool Pins** (`bun install -g`)
   - `@playwright/cli@latest` and `@llamaindex/liteparse@latest`
   - Installed via bun's package manager with explicit version specs

5. **Locale Pin** (`LANG=en_US.UTF-8`, `LC_ALL=en_US.UTF-8`)
   - Ensures reproducible character rendering across environments

---

## Documentation Notes

- All three features (claude, copilot, opencode) maintain **identical install.sh scripts** with a syncing requirement noted in the header comments
- Feature installation order is deterministic through `dependsOn` and `installsAfter` declarations
- Bun is the pinned runtime, providing lock file-based determinism for the Atomic CLI and global tools
- The devcontainer environment supports both explicit version pinning (via `VERSION` option) and default stable release tracking (via dist-tags)

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
