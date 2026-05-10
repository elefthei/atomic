### Files Analysed

- `install.sh`
- `src/scripts/bump-version.ts`
- `src/scripts/bundle-configs.ts`
- `src/scripts/constants-base.ts`
- `src/scripts/constants.ts`

---

### Per-File Notes

#### `install.sh`

- **Role:** Bootstrap installer that deterministically installs Bun (if absent) and the Atomic CLI package, then wires shell completions via cached source files.

- **Key symbols:**
  - `PACKAGE` (`install.sh:18`) — hardcoded as `@bastani/atomic@latest`; the single version-pinning string for the global install.
  - `STEP_TOTAL` / `STEP_INDEX` (`install.sh:50-51`) — integer counters that track total planned steps and completed steps, respectively, driving the progress bar rendering.
  - `run_step()` (`install.sh:124`) — executes any command (`"$@"`) in a background subprocess, captures stdout+stderr to a `mktemp` log, and advances `STEP_INDEX` by 1 only on zero exit code; on TTY it renders a braille-spinner loop (`install.sh:149-158`) polling with `kill -0 "$pid"`; on non-TTY it uses plain `[n/N] label` lines (`install.sh:130-143`).
  - `bun_global_bin_dir()` (`install.sh:184`) — resolves the Bun global binary directory by calling `bun pm bin -g` first, then falling back through `BUN_INSTALL_BIN`, `BUN_INSTALL`, `XDG_CACHE_HOME`, and finally `$HOME/.bun/bin`.
  - `ensure_bun_global_bin_on_path()` (`install.sh:234`) — calls `bun_global_bin_dir`, prepends the directory to `PATH` for the current shell, and appends a shell-specific idempotent snippet to `~/.bashrc`, `~/.zshrc`, `~/.config/fish/config.fish`, or `~/.profile`.
  - `install_bun()` (`install.sh:257`) — checks `command -v bun`; on macOS with Homebrew calls `brew install oven-sh/bun/bun` via `run_step`; falls back to `curl -fsSL https://bun.sh/install | bash`.
  - `install_atomic()` (`install.sh:284`) — calls `run_step "Installing @bastani/atomic" bun install -g "$PACKAGE"`.
  - `install_completions()` (`install.sh:315`) — generates completions with `atomic completions <shell>` and writes them to `$HOME/.atomic/completions/atomic.<shell>` (file-cached, not `eval`-based).
  - `install_rc_snippet()` (`install.sh:292`) — migrates any legacy `eval "$(atomic completions ...)"` line (using `sed -i.atomic.bak`) and appends a `source` snippet guarded by `[ -f ... ]`.
  - `main()` (`install.sh:344`) — sets `STEP_TOTAL` (2 or 3 depending on whether bun is present), then calls `install_bun`, `ensure_bun_global_bin_on_path`, `install_atomic`, and finally `install_completions` via `run_step`.

- **Control flow:**
  1. `main()` at `install.sh:344` counts expected steps and assigns `STEP_TOTAL`.
  2. `install_bun()` at `install.sh:353` runs `run_step` for bun installation (skipped if already present).
  3. `ensure_bun_global_bin_on_path()` at `install.sh:358` adds the Bun bin dir to `PATH` and shell RC files.
  4. `install_atomic()` at `install.sh:360` runs `bun install -g @bastani/atomic@latest`.
  5. Binary existence is verified via `command -v atomic` at `install.sh:365`.
  6. `install_completions()` at `install.sh:371` generates cached completion files; failure is non-fatal (warn-only).

- **Data flow:**
  - Input: `OSTYPE`, `SHELL`, `BUN_INSTALL`, `BUN_INSTALL_BIN`, `XDG_CACHE_HOME`, `NO_COLOR`, `COLORTERM` environment variables.
  - State: `STEP_INDEX` / `STEP_TOTAL` are global bash integers mutated by `run_step`.
  - Output: `atomic` binary on PATH; completions at `~/.atomic/completions/atomic.<shell>`; shell RC file amended.

- **Dependencies:** `bun`, `curl`, `brew` (optional), `sed`, `mktemp`, `zip` (via shell builtins); no external script imports.

---

#### `src/scripts/bump-version.ts`

- **Role:** Version-bump script that reads a version from CLI arg or the current git branch name and writes it deterministically to all tracked JSON files.

- **Key symbols:**
  - `VERSION_FILES` imported from `./constants-base.ts` (`bump-version.ts:22`) — the list of files whose `version` field is updated.
  - `ROOT` (`bump-version.ts:24`) — resolved to repo root via `resolve(import.meta.dir, "../..")`.
  - `parseVersionFromBranch(branch)` (`bump-version.ts:26`) — applies regex `/^(?:release|prerelease)\/v(.+)$/` to extract the version string; calls `process.exit(1)` on mismatch.
  - `validateVersion(version)` (`bump-version.ts:37`) — tests against `/^\d+\.\d+\.\d+(-[\w.]+)?$/`; exits with error on invalid semver.
  - `getVersion()` (`bump-version.ts:47`) — async; reads `process.argv[2]`; if `--from-branch` calls `` await $`git rev-parse --abbrev-ref HEAD`.text() `` (`bump-version.ts:58`) and delegates to `parseVersionFromBranch`.
  - `bumpFile(filePath, version)` (`bump-version.ts:66`) — reads JSON via `Bun.file(fullPath).json()`, compares `content.version`, skips if already equal, otherwise sets `content.version = version` and writes back with `Bun.write(..., JSON.stringify(content, null, 2) + "\n")`.
  - `main()` (`bump-version.ts:81`) — awaits `getVersion()`, calls `validateVersion`, then iterates `VERSION_FILES` calling `bumpFile` sequentially via `for...of`.

- **Control flow:**
  1. `main()` at `bump-version.ts:81` runs.
  2. `getVersion()` returns validated raw version string (strips leading `v` at `bump-version.ts:63`).
  3. `validateVersion()` asserts semver format or exits.
  4. Sequential `for...of` loop at `bump-version.ts:87` bumps each file; skips files already at target version.

- **Data flow:**
  - Input: `process.argv[2]` (version string or `--from-branch`); git branch name when `--from-branch` is used.
  - Transform: `branch → regex match → semver string`; `filePath → JSON parse → mutate version → serialize`.
  - Output: Modified JSON files on disk (currently only `package.json` per `constants-base.ts:12-14`).

- **Dependencies:** `bun` shell template `$` (`bun:20`), `node:path` `resolve` (`bump-version.ts:21`), `./constants-base.ts` (`bump-version.ts:22`).

---

#### `src/scripts/bundle-configs.ts`

- **Role:** Release-artifact bundler that installs global skills, copies bundled agent definitions to each agent's global config root, and packages them into a deterministic ZIP archive.

- **Key symbols:**
  - `SKILLS_REPO` (`bundle-configs.ts:26`) — `https://github.com/flora131/atomic.git`; the canonical source for global skill installation.
  - `AGENT_FLAGS` (`bundle-configs.ts:29`) — `["claude-code", "opencode", "github-copilot"]`; fixed ordered list of CLI flags passed to `bunx skills`.
  - `AGENT_ROOTS` (`bundle-configs.ts:35-39`) — const mapping `{ claude, opencode, copilot }` each to `{ local, global }` directory pairs; copilot maps `.github` (local) → `.copilot` (global).
  - `ZIP_INCLUDES` (`bundle-configs.ts:42-49`) — fixed array of six HOME-relative paths included in the archive; determines exactly what the release artifact contains.
  - `installGlobalSkills()` (`bundle-configs.ts:53`) — runs `` await $`bunx skills add ${SKILLS_REPO} --skill "*" -g ${agentArgs} -y` `` where `agentArgs` is built by `AGENT_FLAGS.flatMap((a) => ["-a", a])` (`bundle-configs.ts:56`).
  - `copyBundledAgents()` (`bundle-configs.ts:60`) — iterates `Object.entries(AGENT_ROOTS)` and calls `cpSync(src, dest, { recursive: true })` for each agent's `agents/` subdirectory; also copies `.github/lsp.json` → `~/.copilot/lsp-config.json` if present (`bundle-configs.ts:74-79`).
  - `packageZip(version, outputDir)` (`bundle-configs.ts:82`) — constructs zip name as `atomic-configs-v${version}.zip`; runs `` await $`cd ${HOME} && zip -r ${zipPath} ${ZIP_INCLUDES} -x '*.DS_Store'`.quiet() `` (`bundle-configs.ts:90`).
  - `main()` (`bundle-configs.ts:98`) — reads `process.argv[2]` for version (strips `v` prefix), resolves `outputDir` from `process.argv[3]`, `GITHUB_WORKSPACE`, or `"."` in that order; calls `installGlobalSkills`, `copyBundledAgents`, `packageZip` sequentially.

- **Control flow:**
  1. `main()` validates version argument; exits with usage error if absent.
  2. `installGlobalSkills()` installs skills for all three agents in one `bunx skills` invocation.
  3. `copyBundledAgents()` iterates all three `AGENT_ROOTS` entries, creating destination dirs with `mkdirSync(..., { recursive: true })` before each copy.
  4. `packageZip()` shells to `zip` from `$HOME`, including exactly the paths in `ZIP_INCLUDES`.

- **Data flow:**
  - Input: `process.argv[2]` (version), `process.argv[3]` / `GITHUB_WORKSPACE` (output dir), repo files under `.claude/agents`, `.opencode/agents`, `.github/agents`, `.github/lsp.json`.
  - Transform: agent dirs copied to `~/.<agent>/agents/`; skills installed globally; all zipped from `$HOME`.
  - Output: `atomic-configs-v<version>.zip` at `outputDir`.

- **Dependencies:** `bun` shell `$` (`bundle-configs.ts:17`), `node:fs` `cpSync/existsSync/mkdirSync` (`bundle-configs.ts:18`), `node:os` `homedir` (`bundle-configs.ts:19`), `node:path` `join/resolve` (`bundle-configs.ts:20`).

---

#### `src/scripts/constants-base.ts`

- **Role:** Minimal shared constants module usable before `bun install` completes in CI; exports only `SDK_PACKAGE_NAME` and `VERSION_FILES`.

- **Key symbols:**
  - `SDK_PACKAGE_NAME` (`constants-base.ts:9`) — `"@bastani/atomic"`.
  - `VERSION_FILES` (`constants-base.ts:12-14`) — `["package.json"]`; single-element array enumerating files bumped by `bump-version.ts`.

- **Control flow:** No logic; pure constant exports.

- **Data flow:** Imported by `bump-version.ts:22` and re-exported by `constants.ts:15`.

- **Dependencies:** None (no imports).

---

#### `src/scripts/constants.ts`

- **Role:** Extended constants module for scripts that can assume a full `bun install`; maps each `AgentType` to its config directory and exposes `CONFIG_DIRS`/`CONFIG_FILES` arrays for config-archiving scripts.

- **Key symbols:**
  - `AGENTS` (`constants.ts:10`) — `["copilot", "opencode", "claude"]`; fixed ordered array of `AgentType`.
  - `AGENT_CONFIG_ROOT` (`constants.ts:23-27`) — `Record<AgentType, string>` mapping claude→`.claude`, opencode→`.opencode`, copilot→`.github`.
  - `CONFIG_DIRS` (`constants.ts:30-32`) — derived by `AGENTS.map((agent) => \`${AGENT_CONFIG_ROOT[agent]}/agents\`)` producing `[".github/agents", ".opencode/agents", ".claude/agents"]`.
  - `CONFIG_FILES` (`constants.ts:35`) — `[".github/lsp.json"]`; single extra file for config archives.
  - Re-exports `SDK_PACKAGE_NAME` and `VERSION_FILES` from `./constants-base.ts` (`constants.ts:15`).

- **Control flow:** No runtime logic; array derivation at module load time.

- **Data flow:** `AgentType` enum values → `AGENT_CONFIG_ROOT` lookup → `CONFIG_DIRS` array; consumed by config-bundling scripts.

- **Dependencies:** `../sdk/workflows/index.ts` for `AgentType` type import (`constants.ts:8`).

---

### Cross-Cutting Synthesis

The installation and maintenance scripts form a deterministic release pipeline through three layers. First, `install.sh` bootstraps the runtime environment by pinning to `@bastani/atomic@latest`, resolving the Bun global bin directory through a deterministic fallback chain (`bun pm bin -g` → env vars → `$HOME/.bun/bin`), and caching shell completions as static files to avoid cold-start nondeterminism. Second, `bump-version.ts` ensures version consistency across release artifacts by extracting a semver string from a branch name via a fixed regex pattern (`/^(?:release|prerelease)\/v(.+)$/`) and writing it to every file in `VERSION_FILES` using `Bun.file().json()` / `Bun.write()` — making the bump operation idempotent (skips files already at target version). Third, `bundle-configs.ts` produces the release config archive deterministically: it installs skills from a canonical Git URL for all three agents using a fixed `AGENT_FLAGS` list, copies agent definitions from repo-local directories to `~/.<agent>/agents/` using the constant `AGENT_ROOTS` map, then zips exactly the paths in `ZIP_INCLUDES` from `$HOME`. Constants are split across `constants-base.ts` (no-dependency, CI-safe) and `constants.ts` (full runtime, derives `CONFIG_DIRS` from `AgentType`) to prevent circular dependency issues in CI bootstrapping. Together, these scripts make each release step repeatable: the same branch name, the same `VERSION_FILES`, the same `AGENT_ROOTS`, and the same `ZIP_INCLUDES` produce the same artifacts across environments.

---

### Out-of-Partition References

- `src/sdk/workflows/index.ts` — exports the `AgentType` type imported by `src/scripts/constants.ts:8`; central to how agent-type constants map to config directories used throughout scripts.
- `src/services/system/auto-sync.ts` — referenced in `install.sh:7` as the module that silently syncs tooling deps and bundled skills on first launch; not part of the install script itself but is the runtime continuation of what `install.sh` bootstraps.
