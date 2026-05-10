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
