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

