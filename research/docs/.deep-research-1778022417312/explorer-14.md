# Partition 14 of 16 — Findings

## Scope
`install.ps1/` (1 files, 436 LOC), `src/version.ts/` (1 files, 7 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
## File Locations for Deterministic Workflows — Partition 14

### Implementation
- `install.ps1` — Windows bootstrap installer that deterministically installs bun runtime and @bastani/atomic package. Uses Invoke-Step pattern with background PowerShell jobs and spinner UI to execute installation steps with progress tracking, ensuring reliable step-by-step workflow execution.
- `src/version.ts` — Single-line VERSION export from package.json used for compatibility checks and version-gating in workflows. Feeds version-based logic that enforces deterministic behavior based on release versions.

### Documentation
- `install.ps1` (lines 1-6) — Comments document that installer silently syncs tooling deps and bundled skills on first launch via `src/services/system/auto-sync.ts`, indicating structured deterministic initialization workflows.
- `install.ps1` (line 13) — Usage documentation shows deterministic installation flow via one-liner: `irm https://raw.githubusercontent.com/flora131/atomic/main/install.ps1 | iex`.

## Notes

The `install.ps1` file (436 LOC) implements deterministic workflow patterns through:
1. **Step-based execution** — Invoke-Step function (lines 114-190) runs each action as a background job with spinner animation, advancing step counter only on success.
2. **Progress tracking** — StepIndex and StepTotal variables maintain deterministic workflow state across step boundaries.
3. **Failure handling** — Non-TTY fallback (lines 125-141) and TTY-based spinning (lines 143-190) ensure deterministic output and error surfacing regardless of environment.
4. **Version-aware installation** — Hard-coded PACKAGE variable (@bastani/atomic@latest) at line 17 determines which version is installed, directly linking to `src/version.ts` semantics.

The `src/version.ts` file (7 LOC) serves as a single source of truth for version constants used in compatibility checks and version-gating within deterministic workflows. It imports from package.json at build time, ensuring version determinism across CLI invocations.

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
# Analyzer Partition 14: `install.ps1` and `src/version.ts`

## Research Question
How does atomic's deterministic workflows work?

---

## Files Analysed

1. `/Users/norinlavaee/atomic-product-hunt/install.ps1` (436 lines, PowerShell)
2. `/Users/norinlavaee/atomic-product-hunt/src/version.ts` (7 lines, TypeScript)

Supporting files read for cross-cutting context:
- `/Users/norinlavaee/atomic-product-hunt/src/services/system/auto-sync.ts`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/runtime/version-compat.ts`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/errors.ts`
- `/Users/norinlavaee/atomic-product-hunt/src/scripts/constants-base.ts`
- `/Users/norinlavaee/atomic-product-hunt/src/cli.ts` (entry point, lines 1–60)

---

## Per-File Notes

### `src/version.ts`

**Role:** Single-source-of-truth version constant for the entire CLI runtime.

**Symbols:**
- `VERSION` (`src/version.ts:6`) — re-exports `packageJson.version` by importing `../package.json` directly via Bun's native JSON import. No parsing, no string manipulation; the value is whatever the `version` field in `package.json` holds at bundle time.

**Consumers:**

| Consumer | File:line | How used |
|---|---|---|
| CLI program | `src/cli.ts:25,50` | Passed to Commander's `.version()` so `atomic --version` prints it |
| Auto-sync service | `src/services/system/auto-sync.ts:31,62,105,107` | Compared against the on-disk marker to decide whether to re-sync tooling deps |
| Version-compat checker | `src/sdk/runtime/version-compat.ts:3` (referenced in docstring) | Implied `current` argument for `satisfiesMinVersion()` calls |
| Bump-version script | `src/scripts/constants-base.ts:12` | Identifies `package.json` as the single file whose `version` field the bump script updates |

**Data flow:** `package.json` → (bundled import) → `VERSION` constant → propagated to three independent subsystems: CLI banner, first-run sync guard, and workflow compatibility gate.

---

### `src/sdk/runtime/version-compat.ts`

**Role:** Dependency-free semver comparator that gates workflow execution on CLI version.

**Symbols:**

- `ParsedVersion` interface (`version-compat.ts:16–21`) — `{ major, minor, patch, prerelease }` all typed as `number`/`string`.
- `parseVersion(v: string): ParsedVersion | null` (`version-compat.ts:23–32`) — regex `/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/` applied to the trimmed input; returns `null` for anything that does not match `MAJOR.MINOR.PATCH[-prerelease]`.
- `compareVersions(a, b): number` (`version-compat.ts:40–55`) — returns negative/zero/positive following standard comparator semantics. Unparseable inputs return `0` (treated as equal) so a malformed `minSDKVersion` never hard-blocks a workflow (`version-compat.ts:43`). Prerelease handling at lines 51–54 follows semver: `1.0.0 > 1.0.0-0`.
- `satisfiesMinVersion(current, minRequired): boolean` (`version-compat.ts:62–68`) — returns `true` when `minRequired` is falsy (null/undefined) or when `compareVersions(current, minRequired) >= 0`.

**Relationship to deterministic workflows:** Workflows carry a `minSDKVersion` field compiled in at definition time (`src/sdk/define-workflow.ts:216`). The `satisfiesMinVersion()` function is the predicate that decides whether the installed CLI is new enough to run a given workflow. A failed check throws `IncompatibleSDKError` (`src/sdk/errors.ts:47–58`), which carries both `requiredVersion` and `currentVersion` fields so the CLI can render a precise actionable message rather than a generic load failure.

**Design note:** The module is intentionally dependency-free (`version-compat.ts:14`: "Isolated from the `semver` npm package so the workflow loader stays dependency-free — this check runs for every discovered workflow on every CLI launch"). This means `satisfiesMinVersion` has zero startup overhead beyond the regex match.

---

### `src/services/system/auto-sync.ts`

**Role:** Lazy first-run and post-upgrade tooling synchronizer that uses `VERSION` as a version sentinel.

**Symbols:**

- `syncMarkerPath(): string` (`auto-sync.ts:42–45`) — returns `~/.atomic/.synced-version` (honoring `ATOMIC_SETTINGS_HOME` for test isolation).
- `isInstalledPackage(): boolean` (`auto-sync.ts:52–54`) — checks `import.meta.dir.includes("node_modules")`; returns false for dev checkouts so `bun run dev` never triggers a full global setup.
- `markSynced(): Promise<void>` (`auto-sync.ts:60–66`) — writes `VERSION` string to the marker file via `Bun.write()`; swallows errors.
- `silentStep(fn): Promise<boolean>` (`auto-sync.ts:71–78`) — wraps any async function and returns `true`/`false`; errors are swallowed.
- `autoSyncIfStale(): Promise<void>` (`auto-sync.ts:89–126`) — the main entry point:
  1. Always calls `seedGlobalAdditionalInstructions` regardless of installed-package check (`auto-sync.ts:95`).
  2. Returns early if `!isInstalledPackage()` (`auto-sync.ts:97`).
  3. Reads `~/.atomic/.synced-version`; if file is missing, `stored` is `""`.
  4. Returns early if `stored === VERSION && hasRequiredMuxBinary()` (`auto-sync.ts:105`).
  5. If `stored === VERSION` (mux binary missing only), runs just `ensureTmuxInstalled` (`auto-sync.ts:107–108`).
  6. Otherwise (version mismatch), runs four steps in parallel via `Promise.all` (`auto-sync.ts:109–114,119`):
     - `ensureTmuxInstalled({ quiet: true })`
     - `installGlobalAgents`
     - `upgradeGlobalToolPackages`
     - `installGlobalSkills`
  7. Writes marker only when `results.every(Boolean)` (`auto-sync.ts:121–124`). Partial failure keeps marker stale, causing retry on next launch. All steps are idempotent.

**Connection to `install.ps1`:** `auto-sync.ts` is referenced in `install.ps1:5–6` comment: the bootstrap installer does a visible, spinner-animated initial setup; `auto-sync.ts` silently repeats and extends that setup on subsequent launches when the CLI is upgraded.

---

### `install.ps1`

**Role:** Windows bootstrap installer that deterministically sequences bun installation and atomic package installation with a progress-bar UI.

**Globals and setup (`install.ps1:15–49`):**
- `$ErrorActionPreference = "Stop"` (`line 15`) — any unhandled PowerShell error immediately terminates execution.
- `$PACKAGE = "@bastani/atomic@latest"` (`line 17`) — the exact npm package target.
- `$script:StepTotal` and `$script:StepIndex` (`lines 26–27`) — script-scope counters shared across all functions; no closure capture. `StepIndex` only advances on success.
- ANSI escape codes (`lines 36–49`) — disabled entirely when `$env:NO_COLOR` is set; otherwise uses standard ANSI. True-color gradient detection via `$env:COLORTERM` (`line 66`).

**Progress bar rendering — `Get-Bar` (`lines 55–95`):**
- Computes `$filled = Completed * 30 / Total` (clamped to 30) and `$empty = 30 - $filled`.
- In true-color mode, produces a per-character RGB gradient between start and end colors using linear interpolation (`lines 73–84`). Three color states: `success` (green gradient), `error` (red gradient), `progress` (yellow/orange gradient).
- Falls back to plain ANSI color blocks when true-color is unavailable.

**Line formatter — `Format-Line` (`lines 97–108`):**
- Assembles: `glyph + bar + percentage-string + label` into a single string.
- Percentage (`line 105`) is `Fill * 100 / StepTotal`, so `StepIndex` drives the displayed number.

**Step runner — `Invoke-Step` (`lines 114–190`):**
- Non-TTY path (`lines 125–140`): writes `[N/Total] Label` to stdout, redirects command output to a temp file via `Out-File`, checks `$LASTEXITCODE`, prints `ok`/`failed`, increments `$script:StepIndex` only on success. Temp file cleaned in `finally`.
- TTY path (`lines 144–189`):
  1. Creates a background PowerShell job (`Start-Job`) that serializes the `ScriptBlock` to a string (because closures cannot cross job boundaries in PowerShell) and passes the temp log path as argument (`line 154`).
  2. Polls `$job.State -eq 'Running'` in an 80ms loop (`line 164`), rendering a 10-frame braille spinner (`$frames`, `line 156`) with `[Console]::Write("\r\e[2K$line")` to overwrite in-place.
  3. On completion, reads `$job.State`: `Completed` → increments `$script:StepIndex`, prints success line; any other state → prints failure line and surfaces last 15 lines of log.
  4. Cursor hidden with `\e[?25l` before loop (`line 158`) and shown again in `finally` (`line 186`).

**Environment helpers (`lines 192–323`):**
- `Refresh-Path` (`lines 192–195`) — merges User + Machine PATH from registry into `$env:Path`.
- `Publish-Env` (`lines 200–222`) — calls `SendMessageTimeout` with `WM_SETTINGCHANGE` so running shells/editors pick up the new PATH without restart.
- `Write-Env` / `Get-Env` (`lines 224–255`) — read/write User environment via `HKCU:\Environment` registry key, preserving `ExpandString` kind for entries containing `%`.
- `Get-BunGlobalBinDir` (`lines 257–270`) — resolves the bun global bin directory via `bun pm bin -g`, then `$env:BUN_INSTALL_BIN`, then `$env:BUN_INSTALL/bin`, then `~/.bun/bin`.
- `Ensure-BunGlobalBinOnPath` (`lines 299–323`) — checks both current-process `$env:Path` and persisted user PATH registry value; appends bin dir to both if absent.

**Bun installer — `Install-Bun` (`lines 327–359`):**
- Returns immediately if `bun` is already on PATH (`line 328–330`).
- Falls through three strategies in priority order: winget (`line 334–340`), scoop (`line 344–348`), official `bun.sh/install.ps1` (`lines 351–355`). Each attempt is wrapped in `Invoke-Step` so the progress bar reflects each attempt as a discrete unit.

**Completions installer — `Install-Completions` (`lines 361–394`):**
- Runs `atomic completions powershell` and writes the output to `~/.atomic/completions/atomic.ps1` (cached on disk to avoid spawning bun on every shell start, `line 375`).
- Strips any legacy `atomic completions powershell | Invoke-Expression` snippet from `$PROFILE` (`lines 380–387`).
- Appends a dot-source line to `$PROFILE` only if the marker comment is not already present (`lines 389–393`).

**Main body (`lines 396–436`):**
- `$script:StepTotal = 2` by default (`line 399`) — atomic install plus completions.
- Conditionally increments to 3 if bun is not yet present (`lines 400–402`).
- Calls `Install-Bun` → `Ensure-BunGlobalBinOnPath` → `Invoke-Step` for atomic install → `Invoke-Step` for completions.
- The `@bastani/atomic@latest` ScriptBlock is created via `[ScriptBlock]::Create()` (`line 411`) rather than a closure, because PowerShell jobs cannot capture outer variables.

**Connection to `auto-sync.ts`:** `install.ps1:5–6` explicitly documents that `auto-sync.ts` takes over the role of silently syncing tooling deps and skills on first launch and upgrades — the installer's job is only to get bun and atomic onto PATH.

---

### `src/sdk/errors.ts` (relevant excerpt)

**`IncompatibleSDKError` (`errors.ts:47–58`):**
- Three fields: `path` (workflow file path), `requiredVersion` (from `workflow.minSDKVersion`), `currentVersion` (from `VERSION`).
- Error message provides a self-contained "Update Atomic, or re-save the workflow" instruction.
- This is the only error class in the file that directly involves `VERSION`. It is defined but the throw site is in the compiled `@bastani/atomic-sdk` package distribution (`node_modules/@bastani/atomic-sdk/dist/index-0grtzgh3.js:42`), indicating the loader/validator is shipped in the SDK bundle rather than the CLI source.

---

## Cross-Cutting Synthesis

`src/version.ts` is the single authority for the running CLI's version string, derived from `package.json` at bundle time and propagated to three separate subsystems. In the **installer layer**, `install.ps1` gives bun and atomic a deterministic foothold on Windows: `$script:StepTotal` is computed before any step runs, making the progress bar an honest reflection of work to do rather than work done. The `Invoke-Step` function enforces a strict success-only advancement rule — `$script:StepIndex` never increments on failure — so the displayed percentage can never lie about installation state. In the **runtime layer**, `VERSION` feeds `auto-sync.ts`'s lazy sync guard: a simple string equality check between the marker file and the constant decides whether a full parallel re-sync is needed, with the marker written only when every step succeeds (all steps are idempotent, so partial failure just means next-launch retry). In the **workflow compatibility layer**, `version-compat.ts` uses `VERSION` as the `current` argument to `satisfiesMinVersion()`, which is the predicate that either allows or blocks a workflow from loading. The dependency-free semver comparison (plain regex, no npm packages) ensures this check adds zero startup cost across every workflow discovered on every CLI launch. Together these three subsystems — installer, sync guard, and compatibility gate — form a layered "version contract" that starts before the process begins (installer), runs at process start (auto-sync), and runs at workflow load time (version-compat), ensuring a coherent, version-consistent runtime for deterministic workflow execution.

---

## Out-of-Partition References

- `src/services/system/auto-sync.ts` — consumes `VERSION`; parallel sync of tmux, agents, packages, skills; referenced in `install.ps1:5–6`
- `src/sdk/runtime/version-compat.ts` — `compareVersions` / `satisfiesMinVersion` predicates; feeds `IncompatibleSDKError`
- `src/sdk/errors.ts:47–58` — `IncompatibleSDKError` class; carries `requiredVersion` + `currentVersion`
- `src/sdk/define-workflow.ts:216` — compiles `minSDKVersion` into sealed `WorkflowDefinition`
- `src/sdk/types.ts:425,448,604` — `minSDKVersion` field declarations on options and compiled definition interfaces
- `src/cli.ts:25,50` — `VERSION` registered with Commander for `atomic --version`
- `src/scripts/constants-base.ts:12` — `VERSION_FILES = ["package.json"]` — the single file the bump-version script updates
- `src/scripts/bump-version.ts:87` — iterates `VERSION_FILES` to rewrite the version string
- `node_modules/@bastani/atomic-sdk/dist/index-0grtzgh3.js:42` — compiled SDK loader that reads `workflow.minSDKVersion` (throw site for `IncompatibleSDKError` lives in the SDK bundle)
- `install.sh` (Unix counterpart to `install.ps1`) — referenced in `auto-sync.ts:87`
- `src/lib/spawn.ts` — `hasRequiredMuxBinary`, `ensureTmuxInstalled`, `upgradeGlobalToolPackages` — called by `auto-sync.ts`
- `src/services/system/agents.ts` — `installGlobalAgents` — called by `auto-sync.ts`
- `src/services/system/skills.ts` — `installGlobalSkills` — called by `auto-sync.ts`

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Pattern Finder Partition 14: Deterministic Workflows in Atomic

## Research Question
How does atomic's deterministic workflows work?

## Key Finding Summary

Atomic implements deterministic workflows through three core mechanisms:

1. **Version Compatibility Checking** — Workflows declare `minSDKVersion` requirements and the CLI verifies compatibility before execution
2. **Snapshot-Based State Persistence** — A structured JSON snapshot at `~/.atomic/sessions/<runId>/status.json` provides consistent state visibility across processes
3. **Graph Frontier Tracking** — Automatic parent-child edge inference from synchronous JavaScript execution order (sequential vs. parallel detection)

---

## Patterns Identified

#### Pattern: Version Compatibility Checking

**Where:** `src/version.ts:6` and `src/sdk/runtime/version-compat.ts:40-67`

**What:** The CLI exports a constant VERSION read from package.json, and workflows declare minSDKVersion to establish compatibility guarantees.

```typescript
// src/version.ts
import packageJson from "../package.json";

export const VERSION = packageJson.version;
```

```typescript
// src/sdk/runtime/version-compat.ts — semver comparison without external deps
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  // Prerelease handling: 1.0.0 > 1.0.0-0
  if (pa.prerelease === "" && pb.prerelease !== "") return 1;
  if (pa.prerelease !== "" && pb.prerelease === "") return -1;
  if (pa.prerelease === pb.prerelease) return 0;
  return pa.prerelease < pb.prerelease ? -1 : 1;
}

export function satisfiesMinVersion(
  current: string,
  minRequired: string | null | undefined,
): boolean {
  if (!minRequired) return true;
  return compareVersions(current, minRequired) >= 0;
}
```

**Variations / call-sites:** 
- Workflow definitions declare `minSDKVersion?: string` in options (`src/sdk/types.ts:425`)
- Registry validation at `src/sdk/registry.ts:83` (via `validateAtRegistration`)
- Error type `MinSDKVersionError` at `src/sdk/errors.ts:42`
- Compiled into `WorkflowDefinition.minSDKVersion` at `src/sdk/define-workflow.ts:216`

**Why it matters for determinism:** Workflows with declared version requirements are guaranteed to run only on CLI versions that support their SDK features, preventing silent feature incompatibilities.

---

#### Pattern: Snapshot-Based Workflow State Persistence

**Where:** `src/sdk/runtime/status-writer.ts:38-54` and `src/sdk/runtime/status-writer.ts:140-153`

**What:** A versioned JSON schema (schemaVersion: 1) persisted atomically to disk provides deterministic workflow status visibility.

```typescript
// src/sdk/runtime/status-writer.ts — immutable snapshot structure
export interface WorkflowStatusSnapshot {
  schemaVersion: 1;
  workflowRunId: string;
  tmuxSession: string;
  workflowName: string;
  agent: string;
  prompt: string;
  overall: WorkflowOverallStatus;
  completionReached: boolean;
  fatalError: string | null;
  updatedAt: string;  // ISO-8601
  sessions: WorkflowStatusSession[];
}

// Atomic write-then-rename prevents partial JSON visibility
export async function writeSnapshot(
  sessionDir: string,
  snapshot: WorkflowStatusSnapshot,
): Promise<void> {
  const finalPath = statusFilePath(sessionDir);
  const tmpPath = `${finalPath}.tmp-${process.pid}`;
  try {
    await Bun.write(tmpPath, JSON.stringify(snapshot, null, 2));
    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, finalPath);  // Atomic operation
  } catch {
    // Best-effort — never fail the workflow because of a status write.
  }
}
```

**Variations / call-sites:**
- Overall status derivation at `src/sdk/runtime/status-writer.ts:84-96` (precedence: error > needs_review > completed > in_progress)
- Snapshot reader with runtime guard at `src/sdk/runtime/status-writer.ts:160-172`
- Debounced persistence in executor at `src/sdk/runtime/executor.ts:1993-2012`
- Used by `atomic workflow status` command at `src/commands/cli/workflow-status.ts:93`

**Why it matters for determinism:** The immutable schema + atomic write pattern ensures that concurrent readers (status commands, monitoring tools) see consistent state snapshots without IPC into the orchestrator process.

---

#### Pattern: Graph Frontier Tracking for Stage Topology

**Where:** `src/sdk/runtime/graph-inference.ts:12-50`

**What:** Automatic parent-child edge inference from JavaScript execution order without explicit dependency declarations.

```typescript
// src/sdk/runtime/graph-inference.ts — deterministic DAG inference
export class GraphFrontierTracker {
  private frontier: string[] = [];
  private parallelAncestors: string[];

  constructor(parentName: string) {
    this.parallelAncestors = [parentName];
  }

  onSpawn(): string[] {
    if (this.frontier.length > 0) {
      // Sequential: previous stage(s) completed → new ancestors
      this.parallelAncestors = [...this.frontier];
      this.frontier = [];
    }
    return [...this.parallelAncestors];
  }

  onSettle(name: string): void {
    this.frontier.push(name);
  }
}
```

**Variations / call-sites:**
- Called from executor's stage spawning logic in `src/sdk/runtime/executor.ts`
- No external configuration needed — inferred purely from call order and `await`/`Promise.all` patterns
- Session parent tracking at `src/sdk/components/orchestrator-panel-types.ts`

**Why it matters for determinism:** The frontier pattern makes workflow DAG structure deterministic: sequential `await` stages get clear edges, parallel `Promise.all` stages are correctly identified as siblings. No hidden topological state.

---

#### Pattern: Version-Gated Workflow Definition

**Where:** `src/sdk/define-workflow.ts:210-219`

**What:** Workflows capture minSDKVersion during compilation for runtime validation.

```typescript
// src/sdk/define-workflow.ts — workflow builder compiles minSDKVersion
return {
  __brand: "WorkflowDefinition" as const,
  name: this.options.name,
  agent: this.agentValue as A,
  description: this.options.description ?? "",
  inputs,
  minSDKVersion: this.options.minSDKVersion ?? null,
  run: runFn,
};
```

**Variations / call-sites:**
- Input validation at `src/sdk/define-workflow.ts:48-102` (reserved names, enum values, integer defaults)
- Registry.register() validates at compile-time via provider validators (claude/opencode/copilot)
- Used by workflow-status to warn users of incompatibility

**Why it matters for determinism:** Workflows are sealed with their version contract at definition time, not discovered at runtime, making the compatibility check eager and explicit.

---

#### Pattern: Windows Installer Deterministic State Tracking

**Where:** `install.ps1:399-402` and `install.ps1:26-27`

**What:** Step counter variables enable deterministic progress bar state across non-TTY fallback paths.

```powershell
# install.ps1 — deterministic step tracking
$script:StepTotal = 0
$script:StepIndex = 0

# Count upcoming steps so the progress bar is honest.
$script:StepTotal = 2  # atomic install + completions
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    $script:StepTotal++
}
```

**Variations / call-sites:**
- Progress bar rendering at `install.ps1:55-108` (Get-Bar function uses $StepTotal)
- Step invocation at `install.ps1:114-190` (Invoke-Step advances $StepIndex deterministically)
- Non-TTY fallback at `install.ps1:125-140` uses plain line output with step counters

**Why it matters for determinism:** The installer's progress tracking doesn't depend on timing or async race conditions — step counts are computed ahead and used to render consistent state.

---

#### Pattern: Deterministic Deep-Research-Codebase Workflow Orchestration

**Where:** `src/sdk/workflows/builtin/deep-research-codebase/claude/index.ts:1-73`

**What:** Batched Task-tool fan-out with deterministic partition ordering and disk-based synchronization.

```typescript
// Commentary from deep-research-codebase/claude/index.ts:
// A deterministically-orchestrated, distributed codebase researcher built on
// the Claude Agent SDK with **batched** Task-tool fan-out. Specialist
// sub-agents (codebase-locator / codebase-pattern-finder / codebase-analyzer
// / codebase-online-researcher) run inside batch sessions: each batch is a
// single `ctx.stage()` whose orchestrator turn dispatches up to
// MAX_TASKS_PER_BATCH (≈10) specialists in parallel via the Task tool.
//
// Topology:
//           ┌─→ codebase-scout (visible)
//   parent ─┤
//           └─→ history-locator → history-analyzer (headless)
//                                       │
//                                       ▼
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │  Wave 1 (locator + pattern-finder, no inter-deps):                    │
//   │     wave1-batch-1  ∥  wave1-batch-2  ∥  ...  (Promise.allSettled)     │
//   │       └── each batch session: orchestrator dispatches ≤10 Task        │
//   │           sub-agents in one assistant message; each writes to disk    │
```

**Variations / call-sites:**
- Per-partition scratch files deterministically read/written via PATH
- `Promise.allSettled` around batches for failure isolation
- Synthesis step reads files in deterministic order from disk at `src/sdk/workflows/builtin/deep-research-codebase/helpers/scratch.ts`

**Why it matters for determinism:** Batching caps concurrency (≤60 SDK sessions for a 750K-LOC codebase), partition-order is stable, and file-system context ensures the orchestrator's state doesn't grow with sub-agent count.

---

## Summary: How Deterministic Workflows Work

1. **Initialization** → CLI version is read from `package.json` and exposed as `VERSION`
2. **Registration** → Workflows declare `minSDKVersion` and are compiled into sealed `WorkflowDefinition` objects
3. **Validation** → Before execution, `satisfiesMinVersion()` compares the running CLI against the workflow's requirement
4. **Execution** → The orchestrator creates a tmux session and re-executes the worker file with `ATOMIC_ORCHESTRATOR_MODE=1` 
5. **Topology Inference** → `GraphFrontierTracker` builds a deterministic DAG from synchronous execution order (no race conditions)
6. **State Persistence** → After every change, a `WorkflowStatusSnapshot` is atomically written to `~/.atomic/sessions/<runId>/status.json`
7. **Monitoring** → External commands read the snapshot file, seeing consistent state without IPC into the orchestrator

The system achieves determinism by:
- **Eliminating hidden state** via explicit version contracts and sealed workflow definitions
- **Avoiding file races** via atomic write-then-rename for snapshots
- **Making topology explicit** via frontier-based graph inference from call order
- **Isolating failure** via `Promise.allSettled` for batch stages
- **Capping concurrency** via batched Task-tool dispatch (deterministic bound)

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
