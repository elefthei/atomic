# Atomic Deterministic Workflows: Concrete Patterns (Partition 4/16)

## Overview
Atomic's deterministic workflow system ensures reproducible execution across process boundaries through environment-based re-entry, base64-encoded input serialization, and file-backed status snapshots. The architecture separates CLI invocation from orchestration execution, with the user's entrypoint file serving as both entry point and orchestrator launcher.

---

#### Pattern: Environment-Based Orchestrator Re-Entry Guard

**Where:** `src/sdk/runtime/executor.ts:1939-1960`, `src/sdk/workflow-cli.ts:337-340`, `src/sdk/commander.ts:133-151`

**What:** Detects when a process is a detached orchestrator re-execution versus a fresh CLI invocation, using environment variables to signal re-entry without requiring file imports or registry scans.

```typescript
// src/sdk/runtime/executor.ts:1939-1960
export async function handleOrchestratorReEntry(
  resolve: (name: string, agent: AgentType) => WorkflowDefinition | undefined,
): Promise<boolean> {
  if (process.env.ATOMIC_ORCHESTRATOR_MODE !== "1") {
    return false;
  }
  const key = process.env.ATOMIC_WF_KEY ?? "";
  const slashIdx = key.indexOf("/");
  if (slashIdx < 0) {
    throw new Error(
      `ATOMIC_ORCHESTRATOR_MODE=1 but ATOMIC_WF_KEY "${key}" is malformed — expected "<agent>/<name>"`,
    );
  }
  const agent = key.slice(0, slashIdx) as AgentType;
  const name = key.slice(slashIdx + 1);
  const def = resolve(name, agent);
  if (!def) {
    throw new Error(`ATOMIC_WF_KEY "${key}" not found in registry`);
  }
  await runOrchestrator(def);
  return true;
}
```

**Usage in WorkflowCli:** `src/sdk/workflow-cli.ts:337-340`
```typescript
async run(runOpts = {}): Promise<void> {
  if (await handleOrchestratorReEntry((n, a) => registry.resolve(n, a))) {
    return;
  }
  // ... continue with normal CLI parsing
}
```

**Variations / call-sites:**
- `src/sdk/commander.ts:137-151` — `runCli()` embeds the same pattern for parent CLIs
- Guard checks `ATOMIC_ORCHESTRATOR_MODE==="1"` before parsing `ATOMIC_WF_KEY` format
- `resolve` callback passed to allow embedded workers to use trivial lookup vs. full registry
- Throws on malformed keys so authoring mistakes surface loudly


#### Pattern: Launcher Script Generation with Base64-Encoded Inputs

**Where:** `src/sdk/runtime/executor.ts:503-548`

**What:** Generates platform-specific shell scripts (Bash for Unix, PowerShell for Windows) that re-execute the user's entrypoint with deterministic environment variables, serializing all workflow inputs as base64-encoded JSON to survive shell quoting without additional escaping.

```typescript
// src/sdk/runtime/executor.ts:518-541 (simplified excerpt)
const inputsB64 = Buffer.from(JSON.stringify(inputs)).toString("base64");

const launcherScript = isWin
  ? [
      `Set-Location "${escPwsh(projectRoot)}"`,
      `$env:ATOMIC_WF_ID = "${escPwsh(workflowRunId)}"`,
      `$env:ATOMIC_WF_TMUX = "${escPwsh(tmuxSessionName)}"`,
      `$env:ATOMIC_WF_AGENT = "${escPwsh(agent)}"`,
      `$env:ATOMIC_WF_INPUTS = "${escPwsh(inputsB64)}"`,
      `$env:ATOMIC_ORCHESTRATOR_MODE = "1"`,
      `$env:ATOMIC_WF_KEY = "${escPwsh(workflowKey)}"`,
      `$env:ATOMIC_WF_CWD = "${escPwsh(projectRoot)}"`,
      `bun run "${escPwsh(entrypointFile)}" 2>"${escPwsh(logPath)}"`,
    ].join("\n")
  : [
      "#!/bin/bash",
      `cd "${escBash(projectRoot)}"`,
      `export ATOMIC_WF_ID="${escBash(workflowRunId)}"`,
      `export ATOMIC_WF_TMUX="${escBash(tmuxSessionName)}"`,
      `export ATOMIC_WF_AGENT="${escBash(agent)}"`,
      `export ATOMIC_WF_INPUTS="${escBash(inputsB64)}"`,
      `export ATOMIC_ORCHESTRATOR_MODE="1"`,
      `export ATOMIC_WF_KEY="${escBash(workflowKey)}"`,
      `export ATOMIC_WF_CWD="${escBash(projectRoot)}"`,
      `bun run "${escBash(entrypointFile)}" 2>"${escBash(logPath)}"`,
    ].join("\n");

await writeFile(launcherPath, launcherScript, { mode: 0o755 });
const shellCmd = isWin
  ? `pwsh -NoProfile -File "${escPwsh(launcherPath)}"`
  : `bash "${escBash(launcherPath)}"`;
tmux.createSession(tmuxSessionName, shellCmd, "orchestrator");
```

**Determinism aspects:**
- Inputs serialized once at launcher creation time, not re-parsed from CLI
- Base64 encoding preserves multiline values and special characters
- All paths made absolute before encoding (`projectRoot`, `entrypointFile`)
- Launcher file written with execute permissions (`mode: 0o755`)
- Separate log file captures stderr, enabling headless diagnostics

**Variations / call-sites:**
- `src/sdk/runtime/executor.ts:516` — inputs converted to base64 before string interpolation
- `src/sdk/runtime/executor.ts:543` — file written with explicit permissions for execute
- Platform detection via `process.platform === "win32"` selects escaper and shebang


#### Pattern: Input Deserialization and Type Coercion

**Where:** `src/sdk/runtime/executor.ts:412-430`, `src/sdk/runtime/executor.ts:441-459`

**What:** Provides two-stage input deserialization — first decoding base64-encoded JSON from the environment variable, then coercing declared types (integers parsed to `number`, all others remain `string`).

```typescript
// src/sdk/runtime/executor.ts:412-430
export function parseInputsEnv(
  raw: string | undefined,
): Record<string, string> {
  if (!raw) return {};
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// src/sdk/runtime/executor.ts:441-459
export function coerceInputsBySchema(
  inputs: Record<string, string>,
  schema: readonly WorkflowInput[],
): Record<string, string | number> {
  const byName = new Map(schema.map((f) => [f.name, f]));
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(inputs)) {
    const field = byName.get(k);
    if (field?.type === "integer") {
      const parsed = Number.parseInt(v, 10);
      if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
        out[k] = parsed;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}
```

**Robustness patterns:**
- Returns empty object on any deserialization error (prevents crash on corrupt env var)
- Filters out non-string values during JSON parse (malformed payloads gracefully degrade)
- Type coercion respects schema — only "integer" fields coerce to `number`
- Invalid integers silently dropped rather than throwing (upstream validation already ran)
- Free-form workflows have empty schema, so all inputs pass through as strings

**Variations / call-sites:**
- `src/sdk/runtime/executor.ts:1971` — parsed inputs immediately used by `runOrchestrator()`
- `src/commands/cli/workflow-inputs.ts:239` — schema displayed to orchestrating agents


#### Pattern: Input Validation and Merging Pipeline

**Where:** `src/sdk/workflow-cli.ts:90-136`

**What:** Merges inputs from three sources (CLI, programmatic run opts, dispatcher defaults) with explicit precedence, validates against the workflow's declared schema, and throws early on schema violations.

```typescript
// src/sdk/workflow-cli.ts:90-136
export async function resolveAndStart(
  registry: Registry,
  name: string,
  agent: AgentType,
  opts: {
    cliInputs?: Record<string, string>;
    runInputs?: Record<string, string>;
    dispatcherInputs?: Record<string, string>;
    detach?: boolean;
    entry: string;
  },
): Promise<void> {
  const def = registry.resolve(name, agent);
  if (!def) {
    const available = registry
      .list()
      .filter((w) => w.name === name)
      .map((w) => w.agent);
    const availableMsg =
      available.length > 0
        ? `available agents for "${name}": ${available.join(", ")}`
        : `no workflow named "${name}" in registry`;
    throw new Error(
      `no workflow named "${name}" for agent "${agent}"; ${availableMsg}`,
    );
  }

  const merged: Record<string, string> = {
    ...opts.dispatcherInputs,
    ...opts.runInputs,
    ...opts.cliInputs,
  };

  const resolvedInputs =
    def.inputs.length > 0
      ? validateAndResolve(merged, def.inputs)
      : { ...merged };

  await executeWorkflow({
    definition: def,
    agent,
    inputs: resolvedInputs,
    entrypointFile: opts.entry,
    workflowKey: `${agent}/${name}`,
    detach: opts.detach ?? false,
  });
}
```

**Determinism aspects:**
- Input precedence explicit and documented (highest to lowest: cliInputs > runInputs > dispatcherInputs > defaults)
- Validation runs before executor receives inputs (fail-fast)
- Workflow lookup includes helpful error messages listing available agents for the name
- Defaults passed through `opts` — not read from globals or files

**Variations / call-sites:**
- CLI mode calls with `cliInputs` from Commander parsing
- Programmatic mode (`run({ argv: false })`) calls with `runInputs`
- Both paths converge on `executeWorkflow()` with validated inputs


#### Pattern: File-Based Status Snapshots for Out-of-Process Polling

**Where:** `src/sdk/runtime/executor.ts:1988-2012`, `src/commands/cli/workflow-status.ts:84-131`

**What:** Orchestrator writes JSON snapshots to disk whenever the panel state mutates, allowing external processes to poll workflow status without IPC. Mutations are debounced through a pending flag to collapse bursts into single file writes.

```typescript
// src/sdk/runtime/executor.ts:1988-2012
let snapshotPending = false;
const persistSnapshot = (): void => {
  if (snapshotPending) return;
  snapshotPending = true;
  queueMicrotask(() => {
    snapshotPending = false;
    const snap = panel.getSnapshot();
    void writeSnapshot(
      sessionsBaseDir,
      buildSnapshot({
        workflowRunId,
        tmuxSession: tmuxSessionName,
        ...snap,
      }),
    );
  });
};
const unsubscribePanel = panel.subscribe(persistSnapshot);
// Seed an initial snapshot so the file exists before any session starts.
persistSnapshot();
```

**Status query pattern:** `src/commands/cli/workflow-status.ts:84-131`
```typescript
async function buildReport(
  tmuxName: string,
  alive: boolean,
  deps: StatusDeps,
): Promise<WorkflowStatusReport | null> {
  const workflowRunId = workflowRunIdFromTmuxName(tmuxName);
  if (!workflowRunId) return null;

  const sessionDir = join(deps.sessionsBaseDir, workflowRunId);
  const snapshot = await deps.readSnapshot(sessionDir);

  if (!snapshot) {
    return {
      id: tmuxName,
      workflowRunId,
      workflowName: "",
      agent: "",
      overall: alive ? "in_progress" : "error",
      alive,
      updatedAt: null,
      sessions: [],
      fatalError: alive ? null : "orchestrator exited before writing status",
    };
  }

  // If the orchestrator has shut down but the snapshot still says
  // in_progress, downgrade to error
  const overall: WorkflowOverallStatus =
    !alive && snapshot.overall === "in_progress" ? "error" : snapshot.overall;

  return {
    id: tmuxName,
    workflowRunId,
    workflowName: snapshot.workflowName,
    agent: snapshot.agent,
    overall,
    alive,
    updatedAt: snapshot.updatedAt,
    sessions: snapshot.sessions,
    fatalError: // ... field extraction
  };
}
```

**Robustness patterns:**
- Debouncing via `queueMicrotask()` prevents filesystem thrashing
- Initial snapshot seeded before orchestrator starts (no window of missing data)
- Status queries check both on-disk snapshot AND tmux session liveness
- Fallback report when snapshot missing but tmux session alive
- Terminal state inference when orchestrator exits without final snapshot

**Variations / call-sites:**
- `src/commands/cli/workflow-status.ts:147-196` — lists all workflows or queries by ID
- JSON format output for script consumption, text format for humans


#### Pattern: Shared Workflow Execution State

**Where:** `src/sdk/runtime/executor.ts:1188-1222`, `src/sdk/runtime/executor.ts:2042-2049`

**What:** Orchestrator maintains a `SharedRunnerState` object threaded through all session spawning calls, capturing deterministic input state, provider configuration, and tracking active/completed/failed sessions for cleanup and transcript collection.

```typescript
// src/sdk/runtime/executor.ts:1188-1222
interface SharedRunnerState {
  tmuxSessionName: string;
  sessionsBaseDir: string;
  /**
   * The project root the workflow is operating against. Threaded through to
   * provider initialization so headless paths resolve project-scoped config
   * (e.g. `additional-instructions`) from the workflow's actual root rather
   * than `process.cwd()`, which can drift when workflows are invoked
   * programmatically or from a subdirectory.
   */
  projectRoot: string;
  agent: AgentType;
  /**
   * Structured inputs for this workflow run. Free-form workflows use
   * `{ prompt: "..." }`; structured workflows use their declared field
   * names. Workflow authors read both shapes via `ctx.inputs` — integer
   * inputs are parsed to `number`, everything else stays a `string`.
   */
  inputs: Record<string, string | number>;
  /** User-configured provider overrides (global + local merged). */
  providerOverrides: ProviderOverrides;
  /**
   * Extra CLI flags appended to the agent's chat flags, derived from
   * the project's scm selection. Currently only populated for Copilot
   * (which has no on-disk MCP toggle).
   */
  extraChatFlags: string[];
  panel: OrchestratorPanel;
  /** Sessions that have been spawned (for name uniqueness + cleanup). */
  activeRegistry: Map<string, ActiveSession>;
  /** Sessions that completed successfully (for transcript reads). */
  completedRegistry: Map<string, SessionResult>;
  /** Sessions that already failed before completing successfully. */
  failedRegistry: Set<string>;
}

// src/sdk/runtime/executor.ts:2042-2049
const shared: SharedRunnerState = {
  tmuxSessionName,
  sessionsBaseDir,
  projectRoot: cwd,
  agent,
  inputs,
  providerOverrides,
  extraChatFlags,
  // ... more fields
};
```

**Determinism aspects:**
- `inputs` captured once during orchestrator initialization (immutable during execution)
- `projectRoot` threaded through to provider clients (prevents cwd drift)
- `providerOverrides` resolved from config files at startup (no dynamic changes)
- Registry maps (active/completed/failed) track session lifecycle for deterministic cleanup


#### Pattern: Workflow Input Schema Exposure for Orchestrating Agents

**Where:** `src/commands/cli/workflow-inputs.ts:204-247`

**What:** Provides a structured interface for orchestrating agents (or scripts) to query workflow input schemas at runtime, synthesizing a `prompt` field for free-form workflows so both kinds present a uniform API.

```typescript
// src/commands/cli/workflow-inputs.ts:35-60 (schema building)
export function buildInputsPayload(
  workflowName: string,
  agent: string,
  description: string,
  inputs: readonly WorkflowInput[],
): WorkflowInputsResult {
  const freeform = inputs.length === 0;
  const declared: WorkflowInput[] = freeform
    ? [
        {
          name: "prompt",
          type: "text",
          required: false,
          description:
            "Free-form prompt — pass as a positional arg to `atomic workflow -n <name> -a <agent> \"<prompt>\"`.",
        },
      ]
    : inputs.map((i) => ({ ...i }));
  return {
    workflow: workflowName,
    agent,
    description,
    freeform,
    inputs: declared,
  };
}

// src/commands/cli/workflow-inputs.ts:210-247 (command)
export async function workflowInputsCommand(
  options: WorkflowInputsOptions,
  deps: WorkflowInputsDeps = defaultDeps,
): Promise<number> {
  const format: WorkflowInputsFormat = options.format ?? "json";

  const validAgents = Object.keys(AGENT_CONFIG);
  if (!validAgents.includes(options.agent)) {
    return reportError(
      format,
      `Unknown agent '${options.agent}'. Valid agents: ${validAgents.join(", ")}`,
    );
  }
  const agent = options.agent as AgentType;

  const discovered = await deps.findWorkflow(options.name, agent, options.cwd);
  if (!discovered) {
    return reportError(
      format,
      `Workflow '${options.name}' not found for agent '${agent}'.`,
    );
  }

  const loaded = await deps.loadWorkflow(discovered);
  if (!loaded.ok) {
    return reportError(format, loaded.message);
  }
  const def = loaded.value.definition;

  const payload = buildInputsPayload(def.name, agent, def.description, def.inputs);

  if (format === "json") {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    process.stdout.write(renderInputsText(payload));
  }
  return 0;
}
```

**Usage by orchestrating agents:**
- Query schema before invoking workflow: `atomic workflow inputs -n ralph -a claude --format json`
- Schema includes field names, types (text/integer/enum), required flags, defaults, placeholders
- Orchestrator can validate inputs locally before calling `atomic workflow -n <name> -a <agent> --field=value`
- Returns exit code 1 on error, 0 on success (shell integration friendly)

**Variations / call-sites:**
- `src/commands/cli/workflow-inputs.ts:178-197` — registry-based lookup (default)
- Testable via `deps` injection for mocked registry behavior


---

## Integration Summary

The deterministic workflow system composes these patterns into a coherent execution model:

1. **Launch phase** (`executeWorkflow`): CLI command creates a launcher script with base64-encoded inputs and deterministic environment variables, spawns tmux session.

2. **Re-entry phase**: User's entrypoint file re-executes with `ATOMIC_ORCHESTRATOR_MODE=1` and `ATOMIC_WF_KEY=<agent>/<name>`, `handleOrchestratorReEntry` detects and routes to `runOrchestrator`.

3. **Orchestration phase** (`runOrchestrator`): Parses inputs from `ATOMIC_WF_INPUTS` env var, initializes shared state with workflow definition, spawns agent sessions via `ctx.stage()` callbacks.

4. **Monitoring phase**: OrchestratorPanel mutations trigger debounced snapshot writes to `~/.atomic/sessions/<workflowRunId>/status.json`; external `atomic workflow status` queries read snapshots plus tmux liveness.

5. **Query phase** (`workflowInputsCommand`): Schema endpoint allows orchestrating agents to introspect input requirements before invocation, enabling deterministic prompt generation and validation.

All phases preserve the original inputs without transformation, with base64 serialization preventing shell-related corruption and file-backed snapshots enabling polling-based status without IPC overhead.

