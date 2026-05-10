# Deterministic Workflows: Installation & Maintenance Scripts

## Implementation

- `install.sh` — Bootstrap installer for Atomic CLI; uses deterministic Bun package management via `bun install -g` with explicit version pinning. Ensures reproducible installation across environments through step-based progress tracking and environment variable checks (BUN_INSTALL, BUN_INSTALL_BIN, XDG_CACHE_HOME).

- `src/scripts/bump-version.ts` — Version management script using Bun's `$` API to shell out to deterministic `git` commands. Parses branch names deterministically (regex match on `release/v*` or `prerelease/v*` patterns) and validates semver format before applying.

- `src/scripts/bundle-configs.ts` — Release artifact bundler that shells out to `bunx skills` and `zip` with deterministic ordering of included files. Defines constant agent roots (claude, opencode, copilot) and ZIP_INCLUDES array for reproducible config archives across releases.

## Configuration

- `src/scripts/constants-base.ts` — Shared constants (SDK_PACKAGE_NAME, VERSION_FILES array) for build/release scripts; intentionally lightweight to run before `bun install` in CI.

- `src/scripts/constants.ts` — Extended constants mapping AgentType to config directories and defining CONFIG_DIRS/CONFIG_FILES for deterministic config bundling.

## Notable Clusters

- `src/scripts/` — 4 files; maintenance and release automation. All use Bun's `$` API (SQLite/shell template syntax) for deterministic subprocess execution. Constants are centralized to avoid script drift during releases.

- `install.sh` — 384 LOC; deterministic bootstrap with step-counter, progress bars, and environment-variable-aware PATH configuration. Sources cached shell completions (file-based, not `eval()`) to avoid cold-start overhead.

