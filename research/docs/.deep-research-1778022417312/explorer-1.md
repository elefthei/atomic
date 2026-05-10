# Partition 1 of 16 — Findings

## Scope
`src/sdk/` (78 files, 24,162 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Atomic Deterministic Workflows — Partition 1 File Locator

## Summary

Atomic's deterministic workflows operate through a three-layer architecture:
1. **DSL Layer** — Workflow definitions compiled into sealed WorkflowDefinition objects
2. **Runtime/Execution Layer** — Deterministic orchestration via `GraphFrontierTracker` + environment-based re-entry
3. **Status Persistence Layer** — JSON snapshots written to disk for out-of-process consumers

Determinism is achieved through:
- **Frontier-based graph inference**: Session execution order (sequential/parallel) is inferred from JavaScript control flow (await vs Promise.all), tracked via `GraphFrontierTracker`
- **Environment variable-based re-entry**: The orchestrator re-executes the user's entrypoint file with `ATOMIC_ORCHESTRATOR_MODE=1` + workflow key, enabling deterministic session hydration
- **Persistent status snapshots**: `status.json` written atomically to `~/.atomic/sessions/<workflowRunId>/` on every PanelStore mutation, enabling resumability and external monitoring
- **Frozen input schema**: Workflow inputs are validated, deduplicated, and frozen at compile time; integer inputs parsed to numbers; enums validated

---

### Implementation

- `src/sdk/define-workflow.ts` — DSL entry point (`defineWorkflow()`), chainable builder pattern (`.for()`, `.run()`, `.compile()`), validation of input names/types/duplicates, frozen input schema
- `src/sdk/types.ts` — Type definitions: `WorkflowDefinition`, `WorkflowContext`, `SessionContext`, `SessionHandle`, `RegistrableWorkflow`, `Registry`, input schema types (`WorkflowInput`, `InputsOf`, `WorkflowInputType`), `SaveTranscript` interface
- `src/sdk/runtime/executor.ts` — Main execution loop: `executeWorkflow()` spawns tmux session + orchestrator pane, `runOrchestrator()` runs user's `.run()` callback with workspace hydration, session lifecycle management, provider client/session creation, transcript/message I/O, deterministic env var passing (`ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`, `ATOMIC_ORCHESTRATOR_MODE`, `ATOMIC_WF_KEY`)
- `src/sdk/runtime/graph-inference.ts` — Deterministic graph topology inference via `GraphFrontierTracker`: tracks completion frontier, identifies sequential vs parallel edges by observing `onSpawn()` timing relative to pending completions (1:1 deterministic mapping of control flow to graph edges)
- `src/sdk/runtime/status-writer.ts` — Atomic status snapshot I/O: `buildSnapshot()` → JSON serialization, `writeSnapshot()` → disk write; tracks per-session status (pending/running/complete/error/awaiting_input), timestamps, error messages, parent edges; derives overall workflow state (error > awaiting_input > completed > in_progress)
- `src/sdk/runtime/executor-env.ts` — Orchestrator environment validation: reads + validates 4 required env vars (`ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`), returns typed context for downstream orchestrator code
- `src/sdk/runtime/tmux.ts` — tmux session management: pane creation, message passing, attachment, detach-and-background spawn
- `src/sdk/runtime/panel.tsx` — OpenTUI-based orchestrator panel (React component) — displays live graph + attached pane; subscribes to PanelStore mutations
- `src/sdk/registry.ts` — Registry implementation: immutable, chainable registry of compiled workflow definitions; generic type accumulation for compile-time type safety in `get()` / `resolve()`
- `src/sdk/workflow-cli.ts` — Multi-workflow dispatcher CLI: wraps `createWorkflowCli()`, parses `-n/--name -a/--agent` + per-input flags, calls `executeWorkflow()` with resolved registry definition
- `src/sdk/providers/claude.ts` — Claude SDK wrapper: `ClaudeClientWrapper`, `ClaudeSessionWrapper`, headless variants, session message transcript I/O, idle detection via session state events
- `src/sdk/providers/copilot.ts` — Copilot SDK wrapper: client init, session creation, message I/O, onPermissionRequest handler
- `src/sdk/providers/opencode.ts` — OpenCode SDK wrapper: client init, session creation, message I/O, headless env vars
- `src/sdk/worker-shared.ts` — Shared CLI helpers: `validateAndResolve()` (input validation against schema), `toCamelCase()` (flag name normalization), `stringifyDefaults()` (coerce typed defaults to strings)
- `src/sdk/errors.ts` — Typed error classes: `MissingDependencyError`, `WorkflowNotCompiledError`, `InvalidWorkflowError`, `IncompatibleSDKError`, `errorMessage()` helper

### Tests

- `src/sdk/define-workflow.test.ts` — Builder pattern tests, input validation, compile-time type safety
- `src/sdk/errors.test.ts` — Error class instantiation + message formatting
- `src/sdk/runtime/executor.test.ts` — Executor flow, env var validation, session spawning, transcript I/O
- `src/sdk/runtime/status-writer.test.ts` — Snapshot building, overall status derivation logic
- `src/sdk/components/orchestrator-panel-store.test.ts` — PanelStore mutations, frontier tracking side effects
- `src/sdk/components/connectors.test.ts` — Graph edge rendering
- `src/sdk/components/layout.test.ts` — Layout computation for graph visualization
- `src/sdk/providers/headless-hil-policy.test.ts` — Human-in-the-loop timeout policy
- `src/sdk/worker-shared.test.ts` — Input validation, flag parsing, defaults coercion

### Types / Interfaces

- `src/sdk/types.ts` — Comprehensive type definitions:
  - `AgentType` — "copilot" | "opencode" | "claude"
  - `WorkflowInput` — Field name, type (string/text/enum/integer), required, description, placeholder, default, values (for enums)
  - `WorkflowInputType` — "string" | "text" | "enum" | "integer"
  - `InputsOf<I>` — Computed type for `ctx.inputs` shape from declared schema
  - `WorkflowOptions<I>` — Workflow metadata: name, description, inputs schema, minSDKVersion
  - `WorkflowBuilder<A, I>` — Chainable builder (internal, sealed by `.compile()`)
  - `WorkflowDefinition<A, I>` — Sealed compiled output: name, agent, description, inputs, minSDKVersion, run() method
  - `SessionContext<A, I>` — Per-stage context: client, session, inputs, transcript(), getMessages(), save, stage(), sessionDir, paneId, sessionId
  - `WorkflowContext<A, I>` — Top-level context (no session-specific fields): inputs, agent, transcript(), getMessages(), stage()
  - `SessionHandle<T>` — Return from `ctx.stage()`: name, id, result
  - `SessionRunOptions` — Stage options: name, description, headless flag
  - `Transcript` — Rendered text + file path
  - `SavedMessage` — Provider-native message wrapper (Copilot SessionEvent | OpenCode SessionPromptResponse | Claude SessionMessage)
  - `SaveTranscript` — Function overloads for saving provider-specific messages
  - `Registry<T>` — Immutable registry: register(), get(), has(), list(), resolve()
  - `RegistrableWorkflow` — Constraint for workflows accepted by Registry (uses `(...args: never[])` to sidestep contravariance)
  - `WorkflowCli<T>` — CLI program: registry, entry, defaults, run()
  - `StageClientOptions<A>`, `StageSessionOptions<A>`, `ProviderClient<A>`, `ProviderSession<A>` — Type maps for agent-specific client/session types
  - Validation: `ValidationWarning`, `ValidationRule`, `validateWorkflowSource()`, `createProviderValidator()`

- `src/sdk/runtime/status-writer.ts` — Status tracking types:
  - `WorkflowOverallStatus` — "in_progress" | "error" | "completed" | "needs_review"
  - `SessionStatus` — "pending" | "running" | "complete" | "error" | "awaiting_input"
  - `WorkflowStatusSnapshot` — Versioned schema: workflowRunId, tmuxSession, workflowName, agent, prompt, overall, completionReached, fatalError, updatedAt, sessions[]
  - `WorkflowStatusSession` — Per-session mirror: name, status, parents, error, startedAt, endedAt
  - `StatusWriterInputs` — Input struct for buildSnapshot()

- `src/sdk/components/orchestrator-panel-types.ts` — Panel state types:
  - `SessionStatus` — same as above
  - `ViewMode` — "graph" | "attached"
  - `PanelSession` — name, parents[]
  - `SessionData` — name, status, parents, error, startedAt, endedAt

- `src/sdk/components/orchestrator-panel-store.ts` — Reactive panel state:
  - `PanelStore` — Subscription-based store (Zustand-like), tracks session creation/completion/errors
  - Frontier integration: calls `tracker.onSpawn()` / `tracker.onSettle()` when sessions are created/completed

### Configuration

- `src/sdk/index.ts` — SDK exports: `defineWorkflow`, `createWorkflowCli`, `executeWorkflow`, `runOrchestrator`, `extractAssistantText`, `Registry`, types
- `.claude` config (global + local) — Claude Code agent configuration (outside SDK scope but referenced in executor environment setup)
- `.opencode` config (global + local) — OpenCode agent configuration
- `.github` config (global + local) — Copilot CLI configuration

### Examples / Fixtures

- `src/sdk/workflows/builtin/deep-research-codebase/claude/index.ts` — Deterministic batch orchestration pattern: Wave 1 (locator + pattern-finder batches) → TS reads files → Wave 2 (analyzer + online-researcher batches) → aggregator; demonstrates filesystem-based inter-stage communication and Promise.allSettled for fault isolation
- `src/sdk/workflows/builtin/ralph/claude/index.ts` — Code review workflow; sequential stage chain
- `src/sdk/workflows/builtin/open-claude-design/claude/index.ts` — Design system workflow; demonstrates transcript/message reading between stages
- `src/sdk/workflows/builtin/deep-research-codebase/copilot/index.ts` — Copilot variant of deep-research
- `src/sdk/workflows/builtin/deep-research-codebase/opencode/index.ts` — OpenCode variant of deep-research
- Builtin helpers: batching, heuristics, prompts, scout, scratch (file I/O for inter-stage communication), design-system, export/import, validation, git operations, review logic

### Documentation

- Code comments in core modules:
  - `executor.ts` — Architecture overview: re-entry mechanism, tmux session + orchestrator pane model, environment variable semantics
  - `graph-inference.ts` — Frontier-based inference algorithm: sequential (frontier non-empty), parallel (frontier empty on 2nd spawn in same frame), fan-in (frontier repopulated after Promise.all resolves)
  - `status-writer.ts` — Snapshot semantics: per-session status tracking, overall state derivation
  - `define-workflow.ts` — Builder DSL usage + compile-time guarantees
  - Built-in workflow headers (claude/copilot/opencode index.ts files) — Topology diagrams, batching rationale, failure isolation patterns

### Notable Clusters

- `src/sdk/runtime/` (9 files) — Execution engine: executor.ts + graph-inference.ts (determinism core), status-writer.ts (persistence), tmux.ts (session I/O), panel.tsx + attached-footer.ts (TUI visualization), executor-env.ts + version-compat.ts + cc-debounce.ts + theme.ts (supporting infrastructure). **Why it's a cluster**: Encapsulates the full deterministic orchestration lifecycle — from env validation through graph inference, status persistence, and live visualization.

- `src/sdk/providers/` (3 files + tests) — Agent SDK adapters: claude.ts, copilot.ts, opencode.ts. **Why it's a cluster**: Each file wraps a provider SDK (Claude Agent SDK, Copilot SDK, OpenCode SDK) with Atomic-specific abstractions (e.g., ClaudeClientWrapper, ClaudeSessionWrapper for session management + idle detection; headless variants for invisible sub-sessions).

- `src/sdk/workflows/builtin/` (36 files across 3 workflows + shared helpers) — Built-in workflow implementations:
  - `deep-research-codebase/` — Multi-agent codebase analysis (claude/copilot/opencode variants + shared batching/heuristic/prompt/scout/scratch helpers)
  - `ralph/` — Code review (claude/copilot/opencode + shared copilot-reviewer/git/prompts/review helpers)
  - `open-claude-design/` — Design system integration (claude/copilot/opencode + shared constants/design-system/export/import/prompts/scan/validation helpers)
  **Why it's a cluster**: Demonstrates deterministic orchestration patterns (batching, filesystem-based inter-stage communication, sequential pipelines, parallel fan-out with Promise.allSettled) at scale; serves as reference implementations for SDK users.

- `src/sdk/components/` (22 files) — React/OpenTUI-based visualization layer:
  - Core: orchestrator-panel.tsx (main panel), orchestrator-panel-store.ts (reactive state with frontier tracking), orchestrator-panel-types.ts (types)
  - Graph rendering: node-card.tsx, edge.tsx, connectors.ts, layout.ts (d3-like layout computation)
  - TUI chrome: header.tsx, statusline.tsx, attached-statusline.tsx, session-graph-panel.tsx
  - Utilities: color-utils.ts, graph-theme.ts, hooks.ts, error-boundary.tsx, compact-switcher.tsx
  **Why it's a cluster**: Visualizes the deterministically-inferred workflow graph in real time; PanelStore integrates frontier tracking to update edges as sessions complete.

---

## Research Question Relevance

**How does Atomic's deterministic workflows work?**

The research question maps directly to:

1. **DSL → Compilation** (`define-workflow.ts`, `types.ts`): User-authored workflows are compiled into sealed `WorkflowDefinition` objects with frozen inputs and typed context
2. **Deterministic Execution** (`runtime/executor.ts`, `runtime/executor-env.ts`): Orchestrator re-executes entrypoint file with env vars (`ATOMIC_ORCHESTRATOR_MODE=1`, workflow key), enabling deterministic session hydration
3. **Graph Topology Inference** (`runtime/graph-inference.ts`): `GraphFrontierTracker` maps JavaScript control flow (await vs Promise.all) to deterministic parent-child + sibling edges
4. **Status Persistence** (`runtime/status-writer.ts`): Atomic snapshots written to `status.json` on every state mutation, enabling resumability + external monitoring
5. **Provider Abstraction** (`providers/{claude,copilot,opencode}.ts`): Unified session lifecycle across 3 SDKs; transcript/message I/O preserved for inter-stage communication
6. **Built-in Examples** (`workflows/builtin/*`): Demonstrate deterministic patterns (batching, Promise.allSettled, filesystem-based inter-stage communication) at production scale

**Determinism** is achieved through:
- **Execution order inference** from sync/async boundaries (frontier-based)
- **Environment-driven re-entry** (not file-system paths or process discovery)
- **Frozen input schema** validated at compile time (no mutation surface)
- **Persistent snapshots** enabling external state observation + resumability
- **Sealed types** (WorkflowDefinition, RegistrableWorkflow) preventing post-compilation mutation

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
### Files Analysed

- `src/sdk/define-workflow.ts` — DSL entry point and builder
- `src/sdk/types.ts` — all core type definitions for the workflow system
- `src/sdk/registry.ts` — immutable registry implementation
- `src/sdk/runtime/executor.ts` — main execution engine (executeWorkflow, runOrchestrator, createSessionRunner)
- `src/sdk/runtime/graph-inference.ts` — frontier-based topology inference
- `src/sdk/runtime/status-writer.ts` — persistent status snapshot I/O
- `src/sdk/runtime/executor-env.ts` — orchestrator environment validation
- `src/sdk/workflow-cli.ts` — CLI dispatcher (resolveAndStart, buildCliCommand)
- `src/sdk/runtime/panel.tsx` — OrchestratorPanel re-export (delegates to components/)
- `src/sdk/runtime/tmux.ts` — tmux session/window management primitives

---

### Per-File Notes

#### `src/sdk/define-workflow.ts`

- **Role:** DSL entry point. Exposes `defineWorkflow()` which returns a `WorkflowBuilder`. The builder is a chainable object that collects the agent type (`.for()`), the run callback (`.run()`), and then seals everything into a frozen `WorkflowDefinition` via `.compile()`.
- **Key symbols:**
  - `defineWorkflow` (`define-workflow.ts:248`) — factory function, validates non-empty name, returns `WorkflowBuilder<AgentType, I>`.
  - `WorkflowBuilder` (`define-workflow.ts:109`) — class with private fields `options`, `runFn`, `agentValue`.
  - `WorkflowBuilder.for()` (`define-workflow.ts:144`) — creates a new `WorkflowBuilder` instance narrowed to agent type `B`; does not mutate in place.
  - `WorkflowBuilder.run()` (`define-workflow.ts:159`) — records the callback; throws if called twice.
  - `WorkflowBuilder.compile()` (`define-workflow.ts:176`) — validates all declared inputs via `validateWorkflowInput` (`define-workflow.ts:48`), checks for duplicate names, deep-freezes the inputs array, and returns the sealed `WorkflowDefinition` object literal at `define-workflow.ts:210-218`.
  - `RESERVED_INPUT_NAMES` (`define-workflow.ts:32`) — list of names forbidden as workflow input identifiers (`name`, `agent`, `detach`, `list`, `help`, `version`, `session`, `status`).
  - `validateWorkflowInput` (`define-workflow.ts:48`) — validates name format via regex `^[a-zA-Z][a-zA-Z0-9_-]*$` (line 54), checks reserved names (line 62), validates enum values (lines 68-90), validates integer defaults (lines 91-102).
- **Control flow:** `defineWorkflow(opts)` → `new WorkflowBuilder(opts)` → `.for(agent)` returns new builder with `agentValue` set → `.run(fn)` sets `runFn` → `.compile()` validates inputs, throws if `runFn` is null or `agentValue` is null, returns sealed object.
- **Data flow:** `WorkflowOptions<I>` → builder accumulates agent + callback → `compile()` emits `WorkflowDefinition<A,I>` with `Object.freeze`d inputs array at line 199.
- **Dependencies:** `./types.ts` (type imports only).

---

#### `src/sdk/types.ts`

- **Role:** Central type definitions. Declares all interfaces consumed by DSL, runtime, and registry. Also contains two runtime utility functions for provider-specific source validation.
- **Key symbols:**
  - `AgentType` (`types.ts:28`) — `"copilot" | "opencode" | "claude"`.
  - `WorkflowDefinition<A, I>` (`types.ts:584`) — the sealed output of `.compile()`; has `__brand`, `name`, `agent`, `description`, `inputs`, `minSDKVersion`, and `run` method (bivariant, see comment at line 606).
  - `WorkflowContext<A, I>` (`types.ts:349`) — top-level context passed to the `.run()` callback; has `inputs`, `agent`, `stage()`, `transcript()`, `getMessages()`.
  - `SessionContext<A, I>` (`types.ts:290`) — per-session context inside a `stage()` callback; extends WorkflowContext fields with `client`, `session`, `save`, `sessionDir`, `paneId`, `sessionId`, nested `stage()`.
  - `SessionHandle<T>` (`types.ts:259`) — return value of `ctx.stage()`; carries `name`, `id`, `result`.
  - `SessionRunOptions` (`types.ts:271`) — `{ name, description?, headless? }` passed as first arg of `ctx.stage()`.
  - `InputsOf<I>` (`types.ts:200`) — conditional mapped type converting declared `WorkflowInput[]` to `{ [name]?: value_type }`. Falls back to `Record<string, string | undefined>` for untyped workflows.
  - `WorkflowInputType` (`types.ts:151`) — `"string" | "text" | "enum" | "integer"`.
  - `SavedMessage` (`types.ts:231`) — discriminated union `{ provider: "copilot" | "opencode" | "claude"; data: ... }`.
  - `SaveTranscript` (`types.ts:243`) — overloaded interface; three call signatures for Copilot `SessionEvent[]`, OpenCode `SessionPromptResponse`, and Claude session ID `string`.
  - `Registry<T>` (`types.ts:459`) — immutable chainable registry type; keys are `${agent}/${name}`.
  - `validateWorkflowSource` (`types.ts:115`) — strips single-line comments, runs regex rules against source text.
  - `createProviderValidator` (`types.ts:135`) — higher-order function returning a `(source: string) => ValidationWarning[]` closure.
- **Control flow:** Pure type/interface declarations plus two utility functions; no imperative logic beyond the validation loop at `types.ts:122-128`.
- **Data flow:** Types flow outward to all other modules. `InputsOf<I>` is the conduit that maps compile-time input declarations into the `ctx.inputs` shape seen by workflow authors.
- **Dependencies:** `@github/copilot-sdk`, `@opencode-ai/sdk/v2`, `@anthropic-ai/claude-agent-sdk`, `./providers/claude.ts` (for `ClaudeClientWrapper`/`ClaudeSessionWrapper` types).

---

#### `src/sdk/registry.ts`

- **Role:** Implements the `Registry<T>` interface as an immutable `RegistryImpl` class backed by a `ReadonlyMap`. Runs provider-specific source validation at registration time.
- **Key symbols:**
  - `createRegistry()` (`registry.ts:127`) — factory returning an empty `Registry<Record<string, never>>`.
  - `RegistryImpl` (`registry.ts:63`) — internal class; `register()` at line 71 throws on duplicate key, calls `validateAtRegistration`, copies the map, returns a new `RegistryImpl` instance.
  - `validateAtRegistration` (`registry.ts:47`) — derives source from `wf.run.toString()` (line 39), passes to provider validator, emits `console.warn` for each warning.
  - `providerValidators` (`registry.ts:21`) — `Record<AgentType, (source) => ValidationWarning[]>` dispatching to `validateClaudeWorkflow`, `validateOpenCodeWorkflow`, `validateCopilotWorkflow`.
  - `RegistryImpl.resolve()` (`registry.ts:108`) — looks up `${agent}/${name}` key; returns `undefined` when absent.
  - `RegistryImpl.list()` (`registry.ts:104`) — returns frozen array of all registered definitions.
- **Control flow:** `createRegistry()` → `.register(wf)` validates → copies map → returns new registry. Each `.register()` call is O(n) map copy. Lookup via `.resolve()` is O(1).
- **Data flow:** `WorkflowDefinition` objects enter the map keyed by `${agent}/${name}`. `runProviderValidation` at line 37 calls `wf.run.toString()` to get source text for regex validation.
- **Dependencies:** `./types.ts`, `./providers/copilot.ts`, `./providers/opencode.ts`, `./providers/claude.ts`.

---

#### `src/sdk/runtime/graph-inference.ts`

- **Role:** Deterministic graph topology inference. Observes when stages are spawned and when they settle, maintaining a `frontier` array to infer parent–child relationships without requiring authors to declare them explicitly.
- **Key symbols:**
  - `GraphFrontierTracker` (`graph-inference.ts:12`) — class with `frontier: string[]` (line 17) and `parallelAncestors: string[]` (line 23).
  - `GraphFrontierTracker.onSpawn()` (`graph-inference.ts:33`) — called synchronously when a new stage fires. If `frontier` is non-empty, the prior wave completed (sequential), so `parallelAncestors` is updated to the frontier and frontier is cleared. Returns `parallelAncestors` as the parent set.
  - `GraphFrontierTracker.onSettle(name)` (`graph-inference.ts:47`) — called when a stage completes. Pushes `name` onto `frontier`.
- **Control flow — sequential stages:** Stage A settles → `onSettle("A")` → frontier = `["A"]`. Stage B spawns → `onSpawn()` sees non-empty frontier → `parallelAncestors = ["A"]`, frontier = `[]` → returns `["A"]` (B depends on A).
- **Control flow — parallel stages:** Stage A and B fire in same synchronous frame. A's `onSpawn()` sees empty frontier → returns `["orchestrator"]` (root parent). B's `onSpawn()` also fires before any settle → frontier still empty → also returns `["orchestrator"]` (siblings). After both settle, frontier = `["A", "B"]`. Stage C's `onSpawn()` → `parallelAncestors = ["A", "B"]` → fan-in edge.
- **Data flow:** Constructor takes `parentName` string, sets `parallelAncestors = [parentName]` at line 26. Subsequent spawns and settles update internal state; callers receive parent arrays from `onSpawn()`.
- **Dependencies:** None (pure class, no imports).

---

#### `src/sdk/runtime/status-writer.ts`

- **Role:** Bridges in-process orchestrator panel state with out-of-process consumers by writing a versioned JSON snapshot to `~/.atomic/sessions/<workflowRunId>/status.json` on every panel store mutation.
- **Key symbols:**
  - `STATUS_FILE_NAME` (`status-writer.ts:15`) — constant `"status.json"`.
  - `WorkflowStatusSnapshot` (`status-writer.ts:38`) — versioned schema `{ schemaVersion: 1, workflowRunId, tmuxSession, workflowName, agent, prompt, overall, completionReached, fatalError, updatedAt, sessions }`.
  - `WorkflowOverallStatus` (`status-writer.ts:18`) — `"in_progress" | "error" | "completed" | "needs_review"`.
  - `deriveOverallStatus()` (`status-writer.ts:84`) — precedence: `fatalError` → `"error"`, any session with `status === "error"` → `"error"`, any session `status === "awaiting_input"` → `"needs_review"`, `completionReached` → `"completed"`, else `"in_progress"`.
  - `buildSnapshot()` (`status-writer.ts:99`) — pure function mapping `StatusWriterInputs` to `WorkflowStatusSnapshot`; exported for tests.
  - `writeSnapshot()` (`status-writer.ts:140`) — atomic write: `Bun.write(tmpPath, ...)` then `rename(tmp, final)` at line 148-149. Errors are silently swallowed at line 150.
  - `readSnapshot()` (`status-writer.ts:160`) — reads, parses, and validates snapshot from disk; returns `null` on any failure.
  - `workflowRunIdFromTmuxName()` (`status-writer.ts:193`) — extracts the trailing 8-hex segment from a tmux session name shaped `atomic-wf-<agent>-<name>-<id>`.
- **Control flow:** Orchestrator creates a subscription to `OrchestratorPanel` via `panel.subscribe(persistSnapshot)`. `persistSnapshot` uses a `snapshotPending` debounce flag (executor.ts:1993-2009) so bursts collapse into one microtask write. On shutdown, a final snapshot is written synchronously before `panel.destroy()`.
- **Data flow:** `panel.getSnapshot()` → `buildSnapshot({ workflowRunId, tmuxSession, ...snap })` → `writeSnapshot(sessionsBaseDir, snapshot)` → `~/.atomic/sessions/<id>/status.json`.
- **Dependencies:** `node:path`, `../components/orchestrator-panel-types.ts` (for `SessionData`, `SessionStatus` types).

---

#### `src/sdk/runtime/executor-env.ts`

- **Role:** Validates the four required orchestrator environment variables on re-entry, throwing descriptively on the first missing or invalid value.
- **Key symbols:**
  - `validateOrchestratorEnv()` (`executor-env.ts:17`) — reads `ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`; validates agent via `isValidAgent`; returns `{ workflowRunId, tmuxSessionName, agent, cwd }`.
- **Control flow:** Iterates `requiredEnvVars` array at line 29-32, throws on first missing var. Then validates `rawAgent` against `isValidAgent` at line 38.
- **Data flow:** Reads from `process.env` exclusively. Outputs a plain validated object consumed by `runOrchestrator()`.
- **Dependencies:** `../types.ts`, `../../services/config/definitions.ts` (for `isValidAgent`).

---

#### `src/sdk/runtime/executor.ts`

- **Role:** The main execution engine. Implements the two-process model: `executeWorkflow()` is the launcher (CLI-facing) and `runOrchestrator()` is the orchestrator (re-entry, runs inside a tmux pane). The inner `createSessionRunner()` function is the `ctx.stage()` implementation and is the unit that enforces deterministic ordering.
- **Key symbols:**
  - `executeWorkflow()` (`executor.ts:472`) — CLI entry point. Generates `workflowRunId = generateId()` (8-char hex UUID slice, line 498). Computes `tmuxSessionName = "atomic-wf-${agent}-${definition.name}-${workflowRunId}"` (line 499). Serializes `inputs` as base64-encoded JSON in `ATOMIC_WF_INPUTS` (line 516). Writes a launcher shell script (`orchestrator.sh` / `orchestrator.ps1`) at lines 518-541 that sets all `ATOMIC_WF_*` env vars and re-execs the user's entrypoint via `bun run`. Creates the tmux session with the launcher as the initial command (line 548). Attaches or detaches based on `detach` flag (lines 551-569).
  - `handleOrchestratorReEntry()` (`executor.ts:1939`) — detects `ATOMIC_ORCHESTRATOR_MODE=1`, parses `ATOMIC_WF_KEY` into agent + name, resolves definition via caller-supplied `resolve` callback, calls `runOrchestrator(def)`.
  - `runOrchestrator()` (`executor.ts:1962`) — called inside the re-executed process. Reads validated env via `validateOrchestratorEnv()`, parses inputs via `parseInputsEnv(process.env.ATOMIC_WF_INPUTS)`, calls `process.chdir(cwd)` (line 1976), creates `OrchestratorPanel`, wires a debounced `persistSnapshot` subscription to panel state mutations (lines 1993-2010), builds `SharedRunnerState`, coerces integer inputs via `coerceInputsBySchema` (line 2060), builds `WorkflowContext` at line 2083, then calls `definition.run(workflowCtx)` raced against `panel.waitForAbort()` at line 2095.
  - `createSessionRunner()` (`executor.ts:1512`) — returns a function implementing `ctx.stage()`. Creates a `GraphFrontierTracker(parentName)` at line 1521. Each call: validates name uniqueness (lines 1531-1541), calls `graphTracker.onSpawn()` synchronously (line 1549) to get graph parents, creates a `donePromise` (lines 1552-1559), registers in `shared.activeRegistry` (line 1563), allocates port via `getRandomPort()` (line 1571), either creates a tmux window (line 1593) or uses headless mode (line 1585), waits for server readiness via `waitForServer()` (line 1604), calls `shared.panel.addSession(name, graphParents)` (line 1607), creates session directory (lines 1611-1616), constructs `SessionContext` with `save` closure and a nested `createSessionRunner(shared, name)` for sub-stages (line 1811), runs the user callback `await run(ctx)` (line 1835), marks session complete via `shared.panel.sessionSuccess(name)` (line 1865), moves entry from `activeRegistry` to `completedRegistry` (lines 1868-1869), resolves `donePromise` (line 1870), calls `graphTracker.onSettle(name)` (line 1874).
  - `initProviderClientAndSession()` (`executor.ts:1291`) — creates the agent-specific client and session based on agent type and `headless` flag. Returns `{ client, session, cleanup? }`.
  - `parseInputsEnv()` (`executor.ts:412`) — base64-decodes `ATOMIC_WF_INPUTS` JSON into `Record<string, string>`.
  - `coerceInputsBySchema()` (`executor.ts:441`) — converts integer-typed input strings to `number`, passes all others through as strings.
  - `escBash()` (`executor.ts:384`) / `escPwsh()` (`executor.ts:397`) — shell-escape helpers for injecting inputs into the launcher script.
  - `AGENT_CLI` (`executor.ts:69`) — static config map specifying `cmd`, `chatFlags`, and `envVars` for each agent type.
  - `buildPaneCommand()` (`executor.ts:292`) — constructs the CLI command for the tmux window per agent type.
  - `wrapCopilotSend()` (`executor.ts:940`) — wraps Copilot's fire-and-forget `send()` to block until `session.idle` event fires.
  - `watchOpencodeStreamForHIL()` (`executor.ts:1005`) — consumes OpenCode SSE event stream, calls `onHIL(true/false)` on `question.asked`/`question.replied`/`question.rejected`.
  - `watchCopilotSessionForHIL()` (`executor.ts:1057`) — subscribes to `tool.execution_start`/`tool.execution_complete` for `ask_user` tool, calls `onHIL()`.
  - `renderMessagesToText()` (`executor.ts:865`) — dispatches to `renderClaudeTranscript`, `renderCopilotTranscript`, `renderOpencodeTranscript`; produces Markdown.
- **Control flow — full execution path:**
  1. `executeWorkflow()` invoked by CLI → generates IDs → writes launcher script → `tmux.createSession(tmuxSessionName, shellCmd, "orchestrator")` → attaches client.
  2. Tmux session re-execs user's entrypoint with `ATOMIC_ORCHESTRATOR_MODE=1`.
  3. User's entrypoint calls `handleOrchestratorReEntry(resolve)` → calls `runOrchestrator(def)`.
  4. `runOrchestrator()` creates panel, wires snapshot persistence, builds `WorkflowContext`, calls `definition.run(ctx)`.
  5. Each `ctx.stage()` call → `createSessionRunner` closure → `graphTracker.onSpawn()` (synchronous) → tmux window + agent server → `initProviderClientAndSession()` → runs user callback → `graphTracker.onSettle()` → `donePromise` resolves.
  6. Sequential awaits chain through `donePromise`; parallel `Promise.all` calls fire synchronously in the same frame, so `onSpawn()` sees empty frontier for siblings.
- **Data flow:** `inputs` start as `Record<string, string>` from CLI → base64-encoded into `ATOMIC_WF_INPUTS` → decoded in orchestrator process → `coerceInputsBySchema` converts integers → stored in `shared.inputs` → threaded into every `SessionContext` as `ctx.inputs`.
- **Dependencies:** `./types.ts`, `./executor-env.ts`, `./graph-inference.ts`, `./status-writer.ts`, `./panel.tsx`, `./tmux.ts`, `./attached-footer.ts`, `../providers/claude.ts`, `../providers/opencode.ts`, `../providers/copilot.ts`, `../../services/config/atomic-config.ts`, `../../services/config/additional-instructions.ts`, `../../services/config/scm-sync.ts`, `../../services/system/copy.ts`, `../../theme/colors.ts`, `../errors.ts`, `@github/copilot-sdk`, `@opencode-ai/sdk/v2`, `@anthropic-ai/claude-agent-sdk`.

---

#### `src/sdk/workflow-cli.ts`

- **Role:** CLI dispatcher factory. `createWorkflowCli()` accepts a registry (or single workflow or array), builds a Commander program with `-n/--name`, `-a/--agent`, per-input flags, and `--detach`, handles orchestrator re-entry, and dispatches to `resolveAndStart()`.
- **Key symbols:**
  - `resolveAndStart()` (`workflow-cli.ts:90`) — merges inputs from three sources (dispatcher < run < CLI, line 117-121), calls `validateAndResolve` if inputs schema is declared (line 124-126), then calls `executeWorkflow()` at line 128.
  - `buildCliCommand()` (`workflow-cli.ts:146`) — builds a `Command` with positional options enabled (line 165), registers `-n`, `-a`, per-input `--<name>` flags (lines 167-190), `--detach` (line 192), and a free-form `[prompt...]` argument (line 194).
  - `normalizeToRegistry()` (`workflow-cli.ts:50`) — detects Registry vs array vs single workflow by structural check on `.register` method.
  - `handleOrchestratorReEntry()` — imported from `./runtime/executor.ts`; called first in `run()` to handle re-entry before argv parsing.
- **Control flow:** `createWorkflowCli(target, opts)` → normalize to registry → return `WorkflowCli` object. `WorkflowCli.run()` → `handleOrchestratorReEntry(...)` first (returns `true` if re-entry, exits) → parse argv with Commander → open picker if TTY and no name → `resolveAndStart()` → `executeWorkflow()`.
- **Data flow:** CLI flags and positional prompt → `cliInputs` record → merged with `runInputs` and `dispatcherInputs` → passed to `executeWorkflow`.
- **Dependencies:** `@commander-js/extra-typings`, `./types.ts`, `./runtime/executor.ts`, `./components/workflow-picker-panel.tsx`, `./registry.ts`, `./worker-shared.ts`.

---

#### `src/sdk/runtime/tmux.ts`

- **Role:** Low-level tmux primitives. Creates sessions, windows/panes, kills them, captures pane output, sends keys, detects tmux context. Uses a dedicated `SOCKET_NAME = "atomic"` tmux socket to isolate workflow sessions.
- **Key symbols:**
  - `SOCKET_NAME` (`tmux.ts:20`) — `"atomic"`.
  - `getMuxBinary()` (`tmux.ts:57`) — resolves and caches `tmux` (Unix/macOS) or `psmux`/`pmux` (Windows) binary.
  - `createSession()` — creates a named tmux session on the atomic socket with a given command and window name.
  - `createWindow()` — creates a new tmux window within a session, returns the pane ID.
  - `killWindow()`, `killSession()` — terminate specific windows or whole sessions.
  - `capturePane()` — captures visible content of a pane (used by `waitForServer` to detect agent TUI readiness).
  - `isInsideTmux()`, `isInsideAtomicSocket()` — detect current tmux context for attach routing.
  - `switchClient()`, `detachAndAttachAtomic()`, `spawnMuxAttach()` — three paths for attaching the user's terminal to the workflow session depending on context.
- **Control flow:** All operations shell out via `Bun.spawnSync` with `[getMuxBinary(), "-L", SOCKET_NAME, ...]`. The socket isolation (`-L atomic`) means Atomic sessions never appear in the user's default `tmux ls`.
- **Data flow:** Session names, window names, pane IDs, and commands flow in as strings. Pane IDs returned from `createWindow()` are threaded into `initProviderClientAndSession()` and stored in `SessionResult`.
- **Dependencies:** `node:path`, `node:fs`, `node:os`, `../../lib/spawn.ts`.

---

### Cross-Cutting Synthesis

Atomic's deterministic workflow system is a two-process model. In process 1, `executeWorkflow()` (`executor.ts:472`) generates a unique `workflowRunId`, serializes inputs as base64 JSON, writes a launcher shell script that injects six `ATOMIC_WF_*` env vars, and creates a tmux session running that script. The script re-execs the user's own entrypoint file — this is the re-entry point. In process 2 (the orchestrator tmux pane), `handleOrchestratorReEntry()` (`executor.ts:1939`) detects `ATOMIC_ORCHESTRATOR_MODE=1`, resolves the `WorkflowDefinition` by `ATOMIC_WF_KEY`, and calls `runOrchestrator()` (`executor.ts:1962`).

Determinism of stage ordering is achieved entirely through JavaScript's event loop semantics plus the `GraphFrontierTracker` (`graph-inference.ts:12`). `createSessionRunner()` (`executor.ts:1512`) wraps every `ctx.stage()` call: it calls `graphTracker.onSpawn()` **synchronously** before any `await`, exploiting the fact that parallel stages (inside `Promise.all`) fire in the same synchronous frame — both see an empty frontier and become siblings. Sequential stages (awaited serially) see a non-empty frontier from the prior stage's `onSettle()`, establishing a parent-child edge. This inferred graph is used both to render the TUI panel and to persist the graph topology in `status.json`.

Status persistence (`status-writer.ts`) makes the live in-process panel state visible to external consumers without IPC: every `OrchestratorPanel` store mutation triggers a debounced microtask write of a versioned JSON snapshot via an atomic rename.

---

### Out-of-Partition References

- `src/commands/cli/workflow.ts` — CLI sub-command that calls `executeWorkflow()` and handles the picker UX.
- `src/sdk/components/orchestrator-panel.tsx` — concrete `OrchestratorPanel` implementation (OpenTUI React component); `panel.tsx` re-exports from here.
- `src/sdk/components/orchestrator-panel-types.ts` — `SessionData`, `SessionStatus`, `PanelSession` types consumed by status-writer and executor.
- `src/sdk/components/workflow-picker-panel.tsx` — interactive workflow picker launched from `workflow-cli.ts` when no `--name` is given in a TTY.
- `src/sdk/providers/claude.ts` — `ClaudeClientWrapper`, `ClaudeSessionWrapper`, `HeadlessClaudeClientWrapper`, `HeadlessClaudeSessionWrapper`; `clearClaudeSession`; `validateClaudeWorkflow`.
- `src/sdk/providers/copilot.ts` — `copilotSubprocessEnv`, `mergeCopilotSystemMessage`, `validateCopilotWorkflow`.
- `src/sdk/providers/opencode.ts` — `withHeadlessOpencodeEnv`, `validateOpenCodeWorkflow`.
- `src/sdk/worker-shared.ts` — `toCamelCase`, `validateAndResolve`, `buildInputUnion` utilities used by `workflow-cli.ts`.
- `src/sdk/commander.ts` — Commander adapter (`toCommand`) for embedding a `WorkflowCli` under a parent Commander program.
- `src/services/config/atomic-config.ts` — `getProviderOverrides` (merges global+local provider config).
- `src/services/config/additional-instructions.ts` — `reconcileOpencodeInstructions`, `resolveAdditionalInstructionsContent`.
- `src/services/config/scm-sync.ts` — `getCopilotScmDisableFlags`.
- `src/services/config/definitions.ts` — `isValidAgent`, `ProviderOverrides`.
- `src/services/system/copy.ts` — `ensureDir`.
- `src/sdk/runtime/attached-footer.ts` — `spawnAttachedFooter` (renders a status bar below each tmux agent window).
- `src/sdk/runtime/cc-debounce.ts` — Ctrl+C debounce script referenced from `tmux.conf`.
- `src/lib/spawn.ts` — `requiredMuxBinaryCandidatesForPlatform`.
- `src/theme/colors.ts` — `createPainter` used for detached banner output.
- `src/sdk/errors.ts` — `errorMessage` utility.
- `src/sdk/index.ts` — public API barrel export.

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Pattern Finder: How Atomic's Deterministic Workflows Work

## Overview

Atomic achieves determinism through three core mechanisms:

1. **DSL Compilation**: Workflows defined with `defineWorkflow().for(agent).run(...).compile()` seal the definition into an immutable, typed `WorkflowDefinition` object
2. **Frontier-based Graph Inference**: JavaScript's execution order (async/await vs Promise.all) automatically infers parent-child dependencies
3. **Ordered Session Spawning**: Each `ctx.stage()` call is synchronously tracked to determine graph topology before any async execution

---

## Pattern Examples

#### Pattern 1: Workflow Definition & Compilation
**Where:** `src/sdk/define-workflow.ts:248-257`
**What:** Entry point that validates inputs, chains builder methods, and seals definition into immutable `WorkflowDefinition` object.

```typescript
export function defineWorkflow<
  const I extends readonly WorkflowInput[] = readonly WorkflowInput[],
>(
  options: WorkflowOptions<I>,
): WorkflowBuilder<AgentType, I> {
  if (!options.name || options.name.trim() === "") {
    throw new Error("Workflow name is required.");
  }
  return new WorkflowBuilder<AgentType, I>(options);
}
```

**Compilation step** (line 176-219):
```typescript
compile(): WorkflowDefinition<A, I> {
  if (!this.runFn) {
    throw new Error(
      `Workflow "${this.options.name}" has no run callback. ` +
        `Add a .run(async (ctx) => { ... }) call before .compile().`,
    );
  }

  const runFn = this.runFn;

  // Freeze the declared inputs so consumers can read the schema without
  // worrying that picker or executor code has mutated it upstream.
  const declaredInputs = this.options.inputs ?? [];
  const seen = new Set<string>();
  for (const input of declaredInputs) {
    validateWorkflowInput(input, this.options.name);
    if (seen.has(input.name)) {
      throw new Error(
        `Workflow "${this.options.name}" has duplicate input name "${input.name}".`,
      );
    }
    seen.add(input.name);
  }
  const inputs = Object.freeze(
    declaredInputs.map((i) => Object.freeze({ ...i })),
  ) as unknown as I;

  if (this.agentValue === null) {
    throw new Error(
      `Workflow "${this.options.name}" has no agent. ` +
        `Call .for("copilot") / .for("opencode") / .for("claude") before .compile().`,
    );
  }

  return {
    __brand: "WorkflowDefinition" as const,
    name: this.options.name,
    agent: this.agentValue as A,
    description: this.options.description ?? "",
    inputs,
    minSDKVersion: this.options.minSDKVersion ?? null,
    run: runFn,
  };
}
```

**Variations / call-sites:**
- Used in all example workflows: `examples/parallel-hello-world/claude/index.ts:10-85`
- All built-in workflows: `src/sdk/workflows/builtin/*/claude/index.ts`

---

#### Pattern 2: Frontier-Based Graph Inference
**Where:** `src/sdk/runtime/graph-inference.ts:12-50`
**What:** Synchronously tracks JavaScript execution order to auto-infer sequential, parallel, and fan-in dependencies without explicit graph declarations.

```typescript
export class GraphFrontierTracker {
  /**
   * Stages that completed since the last stage was spawned in this scope.
   * When non-empty at spawn time, the new stage is sequential (depends on frontier).
   */
  private frontier: string[] = [];

  /**
   * The parent set for the current parallel batch — a snapshot of the frontier
   * at the point the first sibling consumed it.
   */
  private parallelAncestors: string[];

  constructor(parentName: string) {
    this.parallelAncestors = [parentName];
  }

  /**
   * Called synchronously when a new stage is spawned.
   * Returns the inferred graph parents for this stage.
   */
  onSpawn(): string[] {
    if (this.frontier.length > 0) {
      // Sequential: previous stage(s) completed → new wave
      this.parallelAncestors = [...this.frontier];
      this.frontier = [];
    }
    // Parallel sibling, first stage, or sequential → same ancestors
    return [...this.parallelAncestors];
  }

  /**
   * Called when a stage settles (completes or fails).
   * Adds the stage to the frontier so the next spawn can chain from it.
   */
  onSettle(name: string): void {
    this.frontier.push(name);
  }
}
```

**Variations / call-sites:**
- Used in `createSessionRunner` at `src/sdk/runtime/executor.ts:1521`
- Frontier updated on completion/failure at lines 1874, 1899

---

#### Pattern 3: Deterministic Session Spawning via `ctx.stage()`
**Where:** `src/sdk/runtime/executor.ts:1512-1560` (session runner creation)
**What:** Synchronously validates session name, infers graph parents from frontier, registers in active registry — all before any async execution.

```typescript
function createSessionRunner(
  shared: SharedRunnerState,
  parentName: string,
): <T = void>(
  options: SessionRunOptions,
  clientOpts: StageClientOptions<AgentType>,
  sessionOpts: StageSessionOptions<AgentType>,
  run: (ctx: SessionContext) => Promise<T>,
) => Promise<SessionHandle<T>> {
  const graphTracker = new GraphFrontierTracker(parentName);

  return async <T = void>(
    options: SessionRunOptions,
    clientOpts: StageClientOptions<AgentType>,
    sessionOpts: StageSessionOptions<AgentType>,
    run: (ctx: SessionContext) => Promise<T>,
  ): Promise<SessionHandle<T>> => {
    const { name } = options;

    // ── 1. Validate name uniqueness (synchronous, before any await) ──
    if (!name || name.trim() === "") {
      throw new Error("Session name is required.");
    }
    if (
      shared.activeRegistry.has(name) ||
      shared.completedRegistry.has(name) ||
      shared.failedRegistry.has(name)
    ) {
      throw new Error(`Duplicate session name: "${name}"`);
    }

    const isHeadless = options.headless === true;

    // ── 2. Auto-infer graph parents from frontier (synchronous) ──
    // Headless stages are invisible in the graph — they must not consume or
    // update the frontier, otherwise the next visible stage gets orphaned
    // parent refs that don't exist in the panel.
    const graphParents = isHeadless ? [] : graphTracker.onSpawn();

    // ── 3. Create done promise so dependent sessions can await this one ──
    let resolveDone!: () => void;
    let rejectDone!: (err: unknown) => void;
    const donePromise = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    // Prevent "unhandled rejection" noise when no dependent awaits us.
    donePromise.catch(() => {});

    // ── 4. Register in active registry (synchronous) ──
    // Placeholder paneId — filled in after tmux window creation.
    shared.activeRegistry.set(name, { name, paneId: "", done: donePromise });
```

**Key determinism aspects:**
- Graph parent inference happens **synchronously** before any I/O (line 1549)
- Frontier updates happen **after stage settles**, not during spawn (lines 1874, 1899)
- Headless stages transparently skip frontier updates (line 1549 check, lines 1874/1899 condition)

**Variations / call-sites:**
- Created at workflow root: `src/sdk/runtime/executor.ts:2081`
- Created recursively for each session's nested stages: line 1811

---

#### Pattern 4: Execution Order via Async/Await and Promise.all
**Where:** `examples/parallel-hello-world/claude/index.ts:32-84`
**What:** Native TypeScript control flow determines graph topology deterministically through execution order detection.

```typescript
.run(async (ctx) => {
  const seedPrompt = buildGreetPrompt(ctx.inputs);
  
  // Sequential: greet stage
  const greet = await ctx.stage(
    { name: "greet", description: "Generate a greeting topic" },
    {},
    {},
    async (s) => {
      await s.session.query(seedPrompt);
      s.save(s.sessionId);
    },
  );

  // Parallel: formal and casual both spawn in same sync frame
  const [formal, casual] = await Promise.all([
    ctx.stage(
      { name: "formal", description: "Write a formal greeting" },
      {},
      {},
      async (s) => {
        const prior = await s.transcript(greet);
        await s.session.query(
          `Read ${prior.path} and rewrite it as a formal greeting.`,
        );
        s.save(s.sessionId);
      },
    ),
    ctx.stage(
      { name: "casual", description: "Write a casual greeting" },
      {},
      {},
      async (s) => {
        const prior = await s.transcript(greet);
        await s.session.query(
          `Read ${prior.path} and rewrite it as a casual greeting.`,
        );
        s.save(s.sessionId);
      },
    ),
  ]);

  // Fan-in: merge depends on both formal and casual
  await ctx.stage(
    { name: "merge", description: "Combine both greetings" },
    {},
    {},
    async (s) => {
      const formalText = await s.transcript(formal);
      const casualText = await s.transcript(casual);
      await s.session.query(
        `Combine these two greetings into a single message:\n\n## Formal\n${formalText.content}\n\n## Casual\n${casualText.content}`,
      );
      s.save(s.sessionId);
    },
  );
})
.compile();
```

**Determinism mechanism:**
- `await ctx.stage(...)` → frontier grows → next spawn after `await` sees non-empty frontier → infers as sequential parent
- `Promise.all([ctx.stage(...), ctx.stage(...)])` → both spawns fire synchronously before either resolves → frontier empty for second → infers as sibling
- After `Promise.all` resolves → both in frontier → next spawn sees both → infers fan-in dependency

**Variations / call-sites:**
- Sequential pattern: `examples/sequential-describe-summarize/claude/index.ts`
- Fan-in pattern: `src/sdk/workflows/builtin/deep-research-codebase/claude/index.ts`

---

#### Pattern 5: Workflow Execution Entry Point
**Where:** `src/sdk/runtime/executor.ts:472-548` (executeWorkflow)
**What:** Sets up tmux session, injects environment variables via launcher script, re-executes the worker file with `ATOMIC_ORCHESTRATOR_MODE=1` for deterministic graph state management.

```typescript
export async function executeWorkflow(
  options: WorkflowRunOptions,
): Promise<void> {
  const {
    definition,
    agent,
    inputs = {},
    entrypointFile,
    workflowKey,
    projectRoot = process.cwd(),
    detach = false,
  } = options;

  // ... setup code ...

  const workflowRunId = generateId();
  const tmuxSessionName = `atomic-wf-${agent}-${definition.name}-${workflowRunId}`;
  const sessionsBaseDir = join(getSessionsBaseDir(), workflowRunId);
  await ensureDir(sessionsBaseDir);

  // Write a launcher script for the orchestrator pane.
  // Re-executes the user's entrypoint file with ATOMIC_ORCHESTRATOR_MODE=1
  // so the worker can detect re-entry and call runOrchestrator().
  const isWin = process.platform === "win32";
  const launcherExt = isWin ? "ps1" : "sh";
  const launcherPath = join(sessionsBaseDir, `orchestrator.${launcherExt}`);
  const logPath = join(sessionsBaseDir, "orchestrator.log");

  // Inputs are passed through as base64-encoded JSON so long multiline
  // text values survive shell quoting without any further escaping.
  // Free-form workflows ride the same pipe — their single positional
  // prompt is stored under the `prompt` key so workflow authors always
  // read the user's prompt via `ctx.inputs.prompt`.
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
  tmux.setSessionEnv(tmuxSessionName, "ATOMIC_AGENT", agent);
```

**Determinism aspect:**
- Unique workflow ID ensures isolated session directories
- Environment variables guarantee deterministic re-entry (not re-discovered via filesystem)
- Tmux session acts as the graph container with deterministic window/pane ordering

**Variations / call-sites:**
- Orchestrator setup: `src/sdk/runtime/executor.ts:2025-2125` (runOrchestrator entry point)

---

#### Pattern 6: Workflow Definition's `run()` Method Invocation
**Where:** `src/sdk/runtime/executor.ts:2095`
**What:** Executes the sealed workflow's run callback with constructed `WorkflowContext`, racing against user abort signal.

```typescript
// Build the WorkflowContext — top-level context for the .run() callback
const sessionRunner = createSessionRunner(shared, "orchestrator");

const workflowCtx: WorkflowContext = {
  inputs: shared.inputs as WorkflowContext["inputs"],
  agent,
  stage: sessionRunner as WorkflowContext["stage"],
  transcript: createTranscriptReader(shared.completedRegistry),
  getMessages: createMessagesReader(shared.completedRegistry),
};

// Run the workflow, racing against user abort (q / Ctrl+C)
const abortPromise = panel.waitForAbort().then(() => {
  throw new WorkflowAbortError();
});
await Promise.race([definition.run(workflowCtx), abortPromise]);
```

**Determinism aspects:**
- `definition.run()` receives a fully typed `WorkflowContext` with `stage()` bound to a fresh `GraphFrontierTracker("orchestrator")`
- Graph edges are inferred from JavaScript execution order during run, not pre-declared
- Abort signal races the workflow, allowing graceful cancellation without losing graph state

**Variations / call-sites:**
- Called only once per workflow execution at line 2095

---

## Summary

Atomic achieves deterministic workflows through a three-tier model:

1. **Sealed DSL** (`defineWorkflow().compile()`): Immutable workflow definitions with validated inputs
2. **Frontier Tracking** (`GraphFrontierTracker`): Synchronous parent inference from async execution order
3. **Ordered Execution** (`ctx.stage()` → `createSessionRunner()`): Each session spawn reads frontier state before any I/O, guaranteeing reproducible topology

The key insight: **JavaScript's native execution order (await vs. Promise.all) is the single source of truth for graph edges.** No explicit DAG declarations needed—the runtime watches when stages spawn and settle to deterministically build the dependency graph.

## External References
<!-- Source: codebase-online-researcher sub-agent -->
#### @anthropic-ai/claude-agent-sdk (^0.2.119)
**Docs:** https://code.claude.com/docs/en/agent-sdk/overview, https://code.claude.com/docs/en/agent-sdk/typescript
**Relevant behaviour:**
- `query(prompt, options)` — streams `SessionMessage[]` from a headless Claude Code subprocess. Used in `HeadlessClaudeSessionWrapper.query()` to drive fully unattended (headless) Claude stages in deterministic workflows; the function accepts a plain `string` or an `AsyncIterable<SDKUserMessage>` for multi-turn streaming. Options thread through abort-controllers, allowed-tool lists, and `pathToClaudeCodeExecutable` so the runtime can point at the local `claude` binary.
- `getSessionMessages(sessionId, { dir, includeSystemMessages })` — reads the JSONL transcript for a completed session and returns `SessionMessage[]`. The interactive Claude path (`ClaudeSessionWrapper`) calls this inside `waitForIdle()` after the Stop hook fires (to slice new messages since the last known count) and again in the final teardown to build the saved transcript. The headless path (`HeadlessClaudeSessionWrapper`) calls it at the end of every `query()` call to return native messages to workflow authors via `s.getMessages()`.
- `SessionMessage` type — the union of `{ type: "user" | "assistant"; message: unknown; uuid: string; session_id: string }` objects surfaced in `ctx.getMessages()` and rendered by `renderClaudeTranscript()`.
- `SDKUserMessage` / `Options` — the parameter types that `HeadlessClaudeSessionWrapper.query()` and `mergeSystemPromptAppend()` expose directly, so workflow authors writing headless Claude stages get the full SDK surface without re-wrapping.

**Where used:**
- `src/sdk/providers/claude.ts:20–26` — imports `getSessionMessages`, `query as sdkQuery`, `SessionMessage`, `SDKUserMessage`, `Options`; these drive all Claude transcript retrieval and headless prompt delivery in the executor.

---

#### @github/copilot-sdk (^0.3.0)
**Docs:** https://github.com/github/copilot-sdk (local mirror at `docs/copilot-cli/sdk.md`)
**Relevant behaviour:**
- `CopilotClient({ cliUrl })` — connects to an already-running `copilot --ui-server --port <N>` process. Atomic spawns the server in a tmux pane, then uses `new CopilotClient({ cliUrl: serverUrl })` for liveness probing (`waitForServer`) and for workflow `s.client`.
- `client.start()` / `client.stop()` — lifecycle methods called by the executor around each stage.
- `client.createSession(config)` — creates a Copilot chat session. `config.onPermissionRequest` is set to `approveAll` by default; `systemMessage` is merged with atomic-managed additional-instructions via `mergeCopilotSystemMessage`.
- `session.send({ prompt })` — delivers a prompt to the session. Workflow authors call this inside `ctx.stage()` callbacks.
- `session.on("assistant.message" | "session.idle", handler)` — event-driven transcript collection. `renderCopilotTranscript()` in `executor.ts` walks these events to build Markdown output for downstream stages.
- `SessionEvent` — the union type stored as `{ provider: "copilot"; data: SessionEvent }` in `SavedMessage`, written to disk by `s.save()` and re-read by `ctx.getMessages()`.
- `CopilotClientOptions`, `CopilotSession`, `SessionConfig` — re-exported from `types.ts` and consumed by `ClientOptionsMap` / `SessionOptionsMap` / `ClientMap` / `SessionMap` to make `ctx.stage()` type-safe per agent.

**Where used:**
- `src/sdk/types.ts:7–17` — imports `SessionEvent`, `CopilotClient`, `CopilotClientOptions`, `CopilotSession`, `SessionConfig as CopilotSessionConfig` to build the provider type maps.
- `src/sdk/providers/copilot.ts:8` — imports `SessionConfig` for `mergeCopilotSystemMessage`.
- `src/sdk/runtime/executor.ts:45,358–363` — imports `SessionEvent` for `SavedMessage`; dynamically imports `CopilotClient` to probe server liveness.

---

#### @opencode-ai/sdk (^1.14.24, sub-path `/v2`)
**Docs:** https://opencode.ai/docs/server (local mirror at `docs/opencode/sdk.md`)
**Relevant behaviour:**
- `createOpencode({ port: 0 })` — spawns an embedded OpenCode server on a random port and returns `{ client, server }`. Used in headless OpenCode stages (`headless: true` in `ctx.stage()`). The `port: 0` convention lets the OS assign a free port, matching atomic's `getRandomPort()` pattern for pane-based stages.
- `client.session.create(opts)` — creates an OpenCode session given `{ parentID?, title?, workspaceID? }`. The result's `.id` becomes `s.sessionId`.
- `SessionPromptResponse` type — the object returned by `client.session.prompt()` (shape `{ info, parts }`). Stored as `{ provider: "opencode"; data: SessionPromptResponse }` in `SavedMessage` and consumed by `renderOpencodeTranscript()`.
- `OpencodeClient` / `Session as OpencodeSession` — the client and session types that flow into `ClientMap["opencode"]` and `SessionMap["opencode"]`, giving workflow authors `s.client` and `s.session` typed for OpenCode inside a stage callback.
- `OPENCODE_CLIENT=sdk` env override (`withHeadlessOpencodeEnv`) — set around `createOpencode()` to suppress the interactive `question` tool so headless stages don't hang waiting for a human answer.

**Where used:**
- `src/sdk/types.ts:21` — imports `OpencodeClient`, `Session as OpencodeSession`, `SessionPromptResponse` to build the provider type maps.
- `src/sdk/runtime/executor.ts:46,1386` — imports `SessionPromptResponse` type; dynamically imports `createOpencode` from `@opencode-ai/sdk/v2` inside headless OpenCode stage branches.
- `src/sdk/providers/opencode.ts` — `withHeadlessOpencodeEnv` wraps every `createOpencode()` call to set the `OPENCODE_CLIENT=sdk` override.

---

The three external SDK libraries are all central to understanding how Atomic's deterministic workflows operate. `@anthropic-ai/claude-agent-sdk` drives transcript retrieval and headless Claude prompt delivery; `@github/copilot-sdk` provides the typed client/session model and event stream that Copilot stages depend on; `@opencode-ai/sdk` supplies the embedded-server API used in headless OpenCode stages. Their types are re-exported from `src/sdk/types.ts` to form the generic `ctx.stage()` interface, and their clients/sessions are auto-created and torn down by the executor so workflow authors only author pure async TypeScript orchestration logic.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
