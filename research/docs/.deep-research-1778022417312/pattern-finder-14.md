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

