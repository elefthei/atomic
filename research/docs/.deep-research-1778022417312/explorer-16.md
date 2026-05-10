# Partition 16 of 16 — Findings

## Scope
`install.sh/` (1 files, 384 LOC), `src/scripts/` (4 files, 259 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
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

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
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

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Deterministic Workflows in Atomic: Patterns Found in Scripts & Install

## Overview
Atomic implements deterministic workflows through three primary mechanisms found in the scoped partition:
1. **Sequential step execution with state tracking** (bash installer)
2. **Bun process spawning with error handling** (TypeScript scripts)
3. **Version pinning and validation** (release/deployment scripts)

---

## Patterns Found

#### Pattern 1: Sequential Step Execution with State Tracking
**Where:** `install.sh:16, 50-51, 121-179`
**What:** Shell script uses explicit step counters (STEP_INDEX, STEP_TOTAL) to track progress, only advancing the counter on successful subprocess execution, ensuring deterministic ordering.

```bash
set -euo pipefail

STEP_TOTAL=0
STEP_INDEX=0

# Run a command with a spinner; capture output; surface only on failure.
# STEP_INDEX tracks *completed* steps — it only advances on success so
# the progress bar tells the truth about how far we've actually gotten.
run_step() {
    local label=$1; shift
    local completed=$STEP_INDEX
    local stepno=$((completed + 1))

    if [[ "$IS_TTY" != "1" ]]; then
        printf '  [%d/%d] %s ' "$stepno" "$STEP_TOTAL" "$label"
        local log; log=$(mktemp)
        if "$@" >"$log" 2>&1; then
            printf '%sok%s\n' "$C_GREEN" "$C_RESET"
            rm -f "$log"
            STEP_INDEX=$((STEP_INDEX + 1))
            return 0
        else
            printf '%sfailed%s\n' "$C_RED" "$C_RESET"
            sed 's/^/      /' "$log" >&2
            rm -f "$log"
            return 1
        fi
    fi

    local log; log=$(mktemp)
    "$@" >"$log" 2>&1 &
    local pid=$!

    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    printf '\033[?25l'  # hide cursor
    while kill -0 "$pid" 2>/dev/null; do
        local f="${frames[i % 10]}"
        printf '\r\033[2K'
        render_line "${C_BLUE}${f}${C_RESET}" "$completed" "progress" "$label"
        i=$((i + 1))
        sleep 0.08
    done
    local rc=0
    wait "$pid" || rc=$?
    printf '\r\033[2K'
    if [[ "$rc" == "0" ]]; then
        STEP_INDEX=$((STEP_INDEX + 1))
        render_line "${C_GREEN}✓${C_RESET}" "$STEP_INDEX" "success" "${C_DIM}${label}${C_RESET}"
        printf '\n\033[?25h'  # newline + show cursor
        rm -f "$log"
        return 0
    else
        render_line "${C_RED}✗${C_RESET}" "$completed" "error" "$label"
        printf '\n\033[?25h'
        if [[ -s "$log" ]]; then
            tail -n 15 "$log" | sed "s/^/    ${C_DIM}/" | sed "s/$/${C_RESET}/" >&2
        fi
        rm -f "$log"
        return $rc
    fi
}
```

**Variations / call-sites:** 
- `install.sh:265` - bun brew install step
- `install.sh:273` - bun curl install step
- `install.sh:285` - atomic package install step
- `install.sh:371` - shell completions install step

---

#### Pattern 2: Main Entry Point with Predeclared Step Total
**Where:** `install.sh:344-385`
**What:** Main function calculates STEP_TOTAL upfront (precounting), then executes steps deterministically. Early exit on failure prevents partial state.

```bash
main() {
    # Count upcoming steps so the progress bar is honest.
    STEP_TOTAL=2  # atomic install + completions
    if ! command -v bun >/dev/null 2>&1; then
        STEP_TOTAL=$((STEP_TOTAL + 1))  # bun install
    fi

    printf '\n'

    if ! install_bun; then
        error "bun installation failed — install manually from https://bun.sh"
        exit 1
    fi

    ensure_bun_global_bin_on_path

    if ! install_atomic; then
        error "atomic installation failed"
        exit 1
    fi

    if ! command -v atomic >/dev/null 2>&1; then
        error "atomic installed but is not on PATH — add $(bun_global_bin_dir) to PATH"
        exit 1
    fi

    # Best-effort: don't fail the install if completions can't be set up
    if ! run_step "Installing shell completions" install_completions; then
        warn "Could not detect shell — install completions manually: atomic completions --help"
    fi

    printf '\n  %s✓%s %sAtomic installed successfully%s\n\n' \
        "$C_GREEN" "$C_RESET" "$C_BOLD" "$C_RESET"
    printf '    Get started:  %satomic chat -a <agent>%s\n\n' "$C_CYAN" "$C_RESET"
    printf '    %sTooling deps and skills are synced silently on first launch.%s\n' \
        "$C_DIM" "$C_RESET"
    printf '    %sTo upgrade later: bun update -g @bastani/atomic%s\n\n' \
        "$C_DIM" "$C_RESET"
}

main
```

**Variations / call-sites:** Entry point pattern used in all scripts (`bump-version.ts:94`, `bundle-configs.ts:116`)

---

#### Pattern 3: Bun Shell ($) Spawning with Template Literal Interpolation
**Where:** `bump-version.ts:58`
**What:** Uses Bun's `$` template literal syntax to spawn deterministic subprocesses with interpolated arguments. Subprocess output is captured directly via `.text()` call.

```typescript
async function getVersion(): Promise<string> {
  const arg = process.argv[2];

  if (!arg) {
    console.error(
      "Usage: bun run src/scripts/bump-version.ts <version|--from-branch>"
    );
    process.exit(1);
  }

  if (arg === "--from-branch") {
    const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
    return parseVersionFromBranch(branch);
  }

  // Strip leading 'v' if provided
  return arg.replace(/^v/, "");
}
```

**Variations / call-sites:**
- `bundle-configs.ts:57` - spawning `bunx skills add` with flattened agent args
- `bundle-configs.ts:90` - spawning zip with `.quiet()` method chaining

---

#### Pattern 4: Async Serial Execution with Error Boundaries
**Where:** `bundle-configs.ts:98-116`
**What:** Three async functions execute sequentially in main(). Each step must complete before the next begins. Failure at any point exits with code 1.

```typescript
async function main(): Promise<void> {
  const version = process.argv[2]?.replace(/^v/, "");
  const outputDir = process.argv[3] ?? process.env.GITHUB_WORKSPACE ?? ".";

  if (!version) {
    console.error(
      "Usage: bun run src/scripts/bundle-configs.ts <version> [output-dir]",
    );
    process.exit(1);
  }

  await installGlobalSkills();
  await copyBundledAgents();
  await packageZip(version, outputDir);

  console.log("\nDone.");
}

main();
```

**Variations / call-sites:**
- `bump-version.ts:81-93` - similar pattern: getVersion → validateVersion → loop bumpFile calls
- Both call `main()` at module root (not wrapped in try/catch, relying on error propagation)

---

#### Pattern 5: Version Validation Before Execution
**Where:** `bump-version.ts:37-44, 82-83`
**What:** Validates version string (semver regex match) before any file mutations occur. Ensures deterministic input and prevents partial state on bad input.

```typescript
function validateVersion(version: string): void {
  // Accept semver with optional prerelease suffix: 0.4.46, 0.4.46-0, 1.0.0-1
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    console.error(
      `Error: "${version}" is not a valid semver version`
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const version = await getVersion();
  validateVersion(version);

  console.log(`Bumping version to ${version}\n`);

  for (const file of VERSION_FILES) {
    await bumpFile(file, version);
  }

  console.log("\nDone.");
}
```

**Variations / call-sites:** Pattern also appears in `bundle-configs.ts:102-107` (version existence check before proceeding)

---

#### Pattern 6: Cached Completions and File Sourcing
**Where:** `install.sh:288-313`
**What:** Replaces runtime-evaluated completions (`eval "$(atomic completions...)"`) with cached file-based sourcing to avoid subprocess overhead and ensure deterministic shell startup.

```bash
# Write the cached-source snippet to `rc`, migrating any legacy
# `eval "$(atomic completions <shell>)"` block to the faster file-based
# form. Sourcing a local file skips the bun runtime cold start that an
# `eval` incurs on every shell spawn.
install_rc_snippet() {
    local rc=$1 shell_name=$2
    local marker='# Atomic CLI completions (cached)'

    # Strip legacy eval-based snippet (both the comment and eval line).
    # Portable in-place sed across GNU and BSD: use a .bak suffix.
    if [[ -f "$rc" ]] && grep -qF 'eval "$(atomic completions' "$rc"; then
        sed -i.atomic.bak \
            -e '/^# Atomic CLI completions$/d' \
            -e '/^eval "\$(atomic completions [a-z]*)"$/d' \
            "$rc"
        rm -f "$rc.atomic.bak"
    fi

    if ! grep -qF "$marker" "$rc" 2>/dev/null; then
        {
            printf '\n%s\n' "$marker"
            printf '[ -f "$HOME/.atomic/completions/atomic.%s" ] && source "$HOME/.atomic/completions/atomic.%s"\n' \
                "$shell_name" "$shell_name"
        } >> "$rc"
    fi
}
```

**Variations / call-sites:** `install.sh:323-335` - populates cache files before installing snippets

---

## Summary

Atomic's deterministic workflows in the scripts partition follow these core strategies:

1. **State tracking via counters** — STEP_INDEX/STEP_TOTAL ensure forward-only progress and honest UI.
2. **Fail-fast semantics** — `set -euo pipefail` (bash) and early `process.exit(1)` (TypeScript) prevent partial execution.
3. **Bun $-spawning** — Template literal subprocess invocation with interpolated args, output captured deterministically.
4. **Serial async execution** — Steps await in sequence; no parallelism unless explicitly forked.
5. **Validation before mutation** — Version strings, branch names validated before any file writes.
6. **Caching for reproducibility** — Completions precompiled to file, sourced on shell startup (eliminates runtime variance).

These patterns ensure that running the same script twice with the same inputs produces identical results and identical state progression.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
