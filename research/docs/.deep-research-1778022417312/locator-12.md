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
