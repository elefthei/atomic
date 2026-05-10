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
