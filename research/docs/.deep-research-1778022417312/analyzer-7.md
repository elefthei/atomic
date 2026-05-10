## Analysis: Atomic's Deterministic Workflows

### Files Analysed

- `research/docs/2026-02-25-graph-execution-engine.md` — primary technical reference for GraphBuilder, GraphExecutor, and all node factories
- `research/docs/2026-02-25-workflow-sdk-standardization.md` — comprehensive standardization survey covering annotation system, Ralph, sub-agents, and discovery
- `research/docs/2026-02-25-workflow-sdk-design.md` — WorkflowSDK facade class, provider registry, SubagentGraphBridge, and runtime dependency wiring
- `research/docs/2026-02-25-unified-workflow-execution-research.md` — maps the full lifecycle from app startup to command execution; documents Ralph vs generic dispatch and the gap for non-Ralph workflows
- `research/docs/2026-01-31-sdk-migration-and-graph-execution.md` — earliest design document proposing the fluent graph API, retry/checkpointing patterns, and LangGraph comparison
- `research/docs/2026-03-21-workflow-sdk-simplification-z3-verification.md` — later refactoring snapshot showing the refined file structure across `graph/authoring/`, `graph/contracts/`, `graph/nodes/`, conductor layer, and Z3 formal verification direction
- `research/docs/2026-03-25-workflow-interrupt-resume-bugs.md` — documents interrupt/resume semantics inside `WorkflowSessionConductor.runStageSession()`

---

### Per-File Notes

#### `research/docs/2026-02-25-graph-execution-engine.md`

- **Role:** The canonical low-level reference for every class and method in the graph execution engine. Produced by analyzing `src/workflows/graph/` files directly.

- **Key sections:**
  - `GraphBuilder` (line 229 of `builder.ts`): Maintains `nodes: Map<NodeId, NodeDefinition<TState>>`, `edges: Edge<TState>[]`, `startNodeId`, `endNodeIds`, `currentNodeId`, `conditionalStack`, `nodeCounter`, and `errorHandlerId`. A `graph<TState>()` factory (line 971) instantiates it.
  - Fluent chain methods on `GraphBuilder`: `.start()` (line 318), `.then()` (line 338), `.if()` (lines 374 and 382), `.else()` (line 503), `.endif()` (line 529), `.parallel()` (line 590), `.loop()` (line 647), `.wait()` (line 745), `.subagent()` (line 786), `.tool()` (line 829), `.catch()` (line 859), `.end()` (line 871), `.compile()` (line 885).
  - `.compile()` (line 885): Copies internal maps into a frozen `CompiledGraph<TState>` object containing `nodes`, `edges`, `startNode`, `endNodes`, and `config`. Auto-discovers terminal nodes by finding nodes with no outgoing edges (lines 891–898).
  - `GraphExecutor` (line 253 of `compiled.ts`): Takes a `CompiledGraph<TState>` and runs `streamSteps()` (line 322), an async generator implementing a queue-based BFS traversal.
  - Core BFS loop (lines 367–547): `while (nodeQueue.length > 0 && stepCount < maxSteps)`. Each iteration: abort check → node lookup → loop detection → `executeWithRetry()` → `mergeState()` → signal handling → auto-checkpoint → progress callback → `getNextNodes()`.
  - Loop detection (lines 397–402): Creates visit key `"${currentNodeId}:${stepCount}"`. Nodes are skipped if revisited, unless `isLoopNode()` (line 176) detects `"loop_start"` or `"loop_check"` in the node ID.
  - `executeWithRetry()` (line 615): Retries up to `retryConfig.maxAttempts` with exponential backoff formula `backoffMs × backoffMultiplier^(attempt-1)` (line 744). Supports `onError` returning `"retry" | "skip" | "abort" | "goto"` actions (line 682).
  - `getNextNodes()` (line 758): Evaluates outgoing edges; edges without conditions are always followed; conditional edges followed when `condition(state)` returns true. Also honors `result.goto` overrides.
  - `mergeState()` (line 219): Immutably merges updates; `outputs` is shallow-spread; `lastUpdated` always refreshed.
  - `initializeExecutionState()` (line 188): Creates fresh `BaseState` with `executionId`, `lastUpdated`, and empty `outputs`.
  - Signal handling (lines 464–495): `human_input_required` yields `"paused"` and halts; `checkpoint` saves via checkpointer.
  - `createSnapshot()` (line 818): Captures `executionId`, `state`, `status`, `currentNodeId`, `visitedNodes`, `errors`, `signals`.

- **Determinism claims:**
  - Queue-based BFS produces deterministic node ordering given fixed graph structure and state (lines 367–521).
  - Loop back-edges are allowed only for nodes with IDs containing `"loop_start"` or `"loop_check"` (line 176); all others are deduplicated by `nodeId:stepCount` key.
  - Loop exit is bounded by `maxIterations` (default 100, line 660) in addition to the `until` predicate.
  - `maxSteps` (default 1000, line 226) provides an absolute safety ceiling.
  - Edge conditions are pure functions `(state: TState) => boolean` (line 488 of `types.ts`), making branch selection fully state-determined.
  - `mergeState()` is a pure function (line 219); state is never mutated in place.

- **Dependencies/refs:** `src/workflows/graph/builder.ts`, `src/workflows/graph/compiled.ts`, `src/workflows/graph/nodes.ts`, `src/workflows/graph/types.ts`, `src/workflows/graph/errors.ts`, `src/workflows/graph/stream.ts`.

---

#### `research/docs/2026-02-25-workflow-sdk-standardization.md`

- **Role:** Synthesizes the full SDK landscape — graph engine, annotation system, node factories, sub-agent system, Ralph workflow, custom workflow discovery, and external SDK comparisons.

- **Key sections:**
  - Annotation system (`src/graph/annotation.ts`, line 312): `annotation<T>(default, reducer)` creates an `Annotation<T>` defining how state fields merge. Built-in reducers: `replace`, `concat`, `merge`, `mergeById`, `max`, `min`, `sum`, `or`, `and`, `ifDefined`.
  - `AtomicStateAnnotation` (line 312) and `RalphStateAnnotation` (line 552) are predefined state schemas.
  - Node factory table (line 179): 12 factories in `src/graph/nodes.ts`.
  - `SubagentGraphBridge` (line 129 of `subagent-bridge.ts`): `spawn()` (line 145) creates session, streams response, collects text + tool_use blocks, truncates to 4000 chars. `spawnParallel()` (line 277) uses `Promise.allSettled()`.
  - `SubagentTypeRegistry` singleton (line 28 of `subagent-registry.ts`): populated by scanning `.claude/agents/`, `.opencode/agents/`, `.github/agents/`.
  - Custom workflow discovery: files in `.atomic/workflows/` (local, highest priority) and `~/.atomic/workflows/` (global) are dynamically imported; required exports are `name` and `description`; optional `buildGraph<TState>(): CompiledGraph<TState>`.
  - Ralph workflow structure (line 302): Phase 1 (planner subagent → parse-tasks tool) → Phase 2 (loop of select-ready-tasks + worker) → Phase 3 (reviewer subagent → conditional fixer).

- **Determinism claims:**
  - BFS execution order stated at line 89: `GraphExecutor` uses a node queue, dequeuing one node at a time.
  - State merging described as immutable at line 97: `{ ...state, ...stateUpdate, outputs: { ...state.outputs, ...stateUpdate.outputs } }`.
  - Reducer system (line 141) ensures each state field is merged by a declared rule, not arbitrary mutation.
  - `maxIterations` default 100 enforced in `.loop()` (line 84).

- **Dependencies/refs:** `src/graph/builder.ts`, `src/graph/compiled.ts`, `src/graph/types.ts`, `src/graph/annotation.ts`, `src/graph/nodes.ts`, `src/graph/subagent-bridge.ts`, `src/graph/subagent-registry.ts`, `src/ui/commands/workflow-commands.ts`, `src/workflows/session.ts`.

---

#### `research/docs/2026-02-25-workflow-sdk-design.md`

- **Role:** Deep-dive into the `WorkflowSDK` facade class, providers, SubagentGraphBridge, SubagentTypeRegistry, runtime dependency injection, and the gap between SDK design and actual Ralph runtime usage.

- **Key sections:**
  - `WorkflowSDK.init()` (line 123 of `sdk.ts`): Static factory, private constructor validates at least one provider (line 68–70), then assembles `providerRegistry`, `subagentBridge`, `subagentRegistry`, and `runtimeDependencies`.
  - `applyGraphDefaults()` (lines 216–263 of `sdk.ts`): Injects checkpointer, `defaultModel`, strips `outputSchema` if validation disabled, and fills in the four runtime dependency slots (`clientProvider`, `workflowResolver`, `subagentBridge`, `subagentRegistry`) where absent.
  - `GraphRuntimeDependencies` (line 396 of `types.ts`): Interface with `clientProvider`, `workflowResolver`, `subagentBridge`, `subagentRegistry` — all injected via `GraphConfig.runtime` (line 474).
  - `resolveWorkflow()` (lines 198–214 of `sdk.ts`): Adapts `CompiledGraph` to `CompiledSubgraph` by wrapping `.execute()` — the resolved subgraph returns `result.state`.
  - Checkpointer interface (line 30 of `types.ts`): `save(executionId, state, label?)`, `load(executionId)`, `list(executionId)`, `delete(executionId, label?)`.
  - Four checkpointer types available via `createCheckpointer()`: `"memory"`, `"file"`, `"research"`, `"session"`.
  - Ralph bypass (lines 350–427 of the doc): Ralph constructs an ad-hoc bridge object delegating to `context.spawnSubagentParallel!()`, creates a fresh `SubagentTypeRegistry` inline, mutates `compiled.config.runtime` directly, and calls `streamGraph()` from `compiled.ts` instead of `sdk.stream()`.
  - `WorkflowSDK.stream()` (lines 149–157): Calls `applyGraphDefaults()`, creates `GraphExecutor`, routes through `routeStream()` with selected modes.
  - Four stream modes (`values`, `updates`, `events`, `debug`) projected by `StreamRouter` (line 56 of `stream.ts`).

- **Determinism claims:**
  - `applyGraphDefaults()` produces a new graph object only if changes are needed (lines 216–263), never mutating the compiled graph's node/edge structure.
  - `resolveSubagentProviderName()` (lines 180–196) has a deterministic three-level priority chain: explicit provider → `defaultModel` prefix → first registered provider.
  - `ExecutionOptions.resumeFrom` (line 50 of `compiled.ts`) allows restoring exact `state`, `visitedNodes`, `errors`, `signals`, and `nodeQueue` from a snapshot to deterministically resume interrupted runs.

- **Dependencies/refs:** `src/workflows/graph/sdk.ts`, `src/workflows/graph/provider-registry.ts`, `src/workflows/graph/agent-providers.ts`, `src/workflows/graph/subagent-bridge.ts`, `src/workflows/graph/subagent-registry.ts`, `src/workflows/graph/compiled.ts`, `src/workflows/graph/types.ts`, `src/workflows/ralph/graph.ts`, `src/ui/commands/workflow-commands.ts`.

---

#### `research/docs/2026-02-25-unified-workflow-execution-research.md`

- **Role:** End-to-end mapping of how a workflow command travels from app boot through command registry to actual graph execution; documents the Ralph-only dispatch and what is missing for generic workflows.

- **Key sections:**
  - App startup chain (lines 49–63): `src/cli.ts:281` → `src/commands/chat.ts:196` → `src/ui/index.ts:306` → `initializeCommandsAsync` at line 2022 → `loadWorkflowsFromDisk()` then `registerWorkflowCommands()`.
  - `registerWorkflowCommands()` (line 899 of `workflow-commands.ts`): Calls `getAllWorkflows()` → `createWorkflowCommand()` for each, registers with `globalRegistry`.
  - Dispatch gate (lines 543–548 of `workflow-commands.ts`): `if (metadata.name === "ralph")` routes to `createRalphCommand()`; all others get a generic handler that only sets `workflowActive: true` and sends the prompt through normal chat with no graph execution.
  - `createRalphCommand()` (lines 597–793 of `workflow-commands.ts`): ~200-line handler performing session init, ad-hoc bridge construction, `SubagentTypeRegistry` population, `createRalphWorkflow()`, runtime mutation, and `streamGraph()` streaming.
  - `WorkflowSDK` identified as unused at runtime (lines 196–260); tests at `sdk.test.ts` verify its design but it is never called from production code paths.
  - Workflow templates in `src/workflows/graph/templates.ts` (line 324): `sequential(nodes)`, `mapReduce(options)`, `reviewCycle(options)`, `taskLoop(options)` — available but not used by Ralph.

- **Determinism claims:**
  - `streamGraph()` is a pure async generator over a `CompiledGraph`; the caller controls when to read next values (lines 314–315).
  - `loadWorkflowsFromDisk()` (lines 393–400): Local `.atomic/workflows/` takes priority over `~/.atomic/workflows/` by name deduplication, making discovery order deterministic.
  - `CUSTOM_WORKFLOW_SEARCH_PATHS` constant at line 268–273 of `workflow-commands.ts` defines a fixed ordered list of search paths.

- **Dependencies/refs:** `src/ui/commands/workflow-commands.ts`, `src/ui/index.ts`, `src/ui/commands/index.ts`, `src/ui/commands/registry.ts`, `src/ui/chat.tsx`, `src/workflows/graph/sdk.ts`, `src/workflows/ralph/graph.ts`, `src/workflows/graph/templates.ts`.

---

#### `research/docs/2026-01-31-sdk-migration-and-graph-execution.md`

- **Role:** Earliest research document. Proposes the graph execution pattern design, establishes the `BaseState`/`NodeResult`/`ExecutionContext` type triad, and maps external libraries (LangGraph, XState, RxJS, Effect-TS, n8n) that shaped the design.

- **Key sections:**
  - Initial type definitions (lines 399–427): `BaseState { executionId, lastUpdated, outputs }`, `ExecutionContext<TState>`, `NodeResult<TState> { stateUpdate?, goto?, signals? }`, `NodeType` union.
  - Fluent API proposal (lines 429–460): `.then()`, `.if()/.else()/.endif()`, `.loop()`, `.parallel()`, `.wait()`, `.catch()`, `.compile({ checkpointer })`.
  - Checkpointer types proposed (lines 500–513): `MemorySaver`, `FileSaver`, `ResearchDirSaver`.
  - Retry pattern (lines 517–525): `withRetry(node, { maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 })`.
  - LangGraph influence (line 394): Annotation system with reducers directly inspired by LangGraph's `StateGraph`.
  - `resumeFrom` concept appears here as `resumeSession(id)` in Claude Agent SDK notes (line 148).

- **Determinism claims:**
  - Proposed execution as streaming iteration `for await (const state of workflow.stream(...))`, making each step observable and deterministic relative to the same input state (lines 452–460).
  - `LoopConfig.maxIterations` as safety limit introduced at line 383.
  - Exponential backoff formula proposed at line 522: `backoffMs × backoffMultiplier^(attempt-1)`.

- **Dependencies/refs:** `research/docs/2026-01-31-graph-execution-pattern-design.md`, `research/docs/2026-01-31-opencode-sdk-research.md`, `research/docs/2026-01-31-claude-agent-sdk-research.md`, `research/docs/2026-01-31-github-copilot-sdk-research.md`.

---

#### `research/docs/2026-03-21-workflow-sdk-simplification-z3-verification.md`

- **Role:** Later refactoring snapshot documenting an evolved file layout with ~65 files across `services/workflows/`, and the direction toward single-file declarative workflow definitions with Z3 formal verification.

- **Key sections:**
  - Refined module layout (lines 36–98): `graph/authoring/` (builder DSL split into `builder.ts`, `conditional-dsl.ts`, `iteration-dsl.ts`, `node-factories.ts`, `node-adapters.ts`), `graph/contracts/` (core types, runtime types, constants, guards), `graph/nodes/` (one file per node type), `graph/runtime/`, `graph/persistence/` (4 checkpointing implementations), and a `conductor/` subsystem.
  - `WorkflowSessionConductor` in `conductor/conductor.ts`: Executes Ralph's stages sequentially in isolated agent sessions.
  - `getNextExecutableNodes()` in `conductor/graph-traversal.ts`: Separate module for next-node resolution.
  - `StageDefinition` pattern (line 77 of the doc): Each Ralph stage is declared as a `StageDefinition` object wiring prompts to parsers.
  - Ralph as 7-file, ~1470-line workflow (lines 108–120): `definition.ts`, `stages.ts`, `prompts.ts`, `state.ts`, `conductor-graph.ts`, `graph.ts`, `graph/task-helpers.ts`.
  - Z3 verifiable properties (line 24): reachability (all nodes reachable from START), termination (all paths reach END), loop bound proofs, deadlock-freedom.

- **Determinism claims:**
  - Conductor execution is explicitly sequential: stages run one at a time in fixed order (lines 102–106).
  - Z3 formal verification proposed to prove at compile time that all graph paths terminate and all nodes are reachable (lines 24–25) — making termination a statically guaranteed property.
  - `LoopConfig` and `IfConfig` declarative forms identified as foundations for formal encoding (line 28).

- **Dependencies/refs:** `src/services/workflows/graph/authoring/builder.ts`, `src/services/workflows/conductor/conductor.ts`, `src/services/workflows/conductor/graph-traversal.ts`, `src/services/workflows/ralph/definition.ts`, `src/services/workflows/ralph/stages.ts`.

---

#### `research/docs/2026-03-25-workflow-interrupt-resume-bugs.md`

- **Role:** Bug investigation documenting the interrupt/resume runtime semantics of `WorkflowSessionConductor.runStageSession()`, revealing how session preservation and `preserveSessionForResume` are wired.

- **Key sections:**
  - `runStageSession()` control flow (lines 49–63): `while (true)` continuation loop containing a `try/finally`; `finally` at lines 551–558 always destroys the session.
  - `preserveSessionForResume` flag (lines 78, 221, 375–379 of `conductor.ts`): Instance field set to `true` in `execute()` after a stage returns `"interrupted"`, but by that point the `finally` block has already destroyed the session. On re-entry, the flag changes the prompt text but `createSession()` is always called fresh at line 381.
  - Queued message drain loop (lines 478–512 of `conductor.ts`): When a queued message arrives during an active stage (no interruption), it is sent to the current session on stage completion — this path works correctly.
  - `onStageTransition()` at line 294 is called on every `executeAgentStage()` entry, causing stage banner to re-show even on resume.

- **Determinism claims:**
  - The continuation loop `while (true)` at `conductor.ts` is exited only by explicit `return { status: "completed" }` or `return { status: "interrupted" }` — no unbounded spin.
  - `preserveSessionForResume` is a binary flag; its state transitions are: `false` (initial) → `true` (set by `execute()` on interrupt, line 221) → `false` (cleared immediately on next `runStageSession()` entry at line 379).
  - `ExecutionSnapshot` (defined in `types.ts` line 555) captures `nodeQueue` alongside state, allowing deterministic requeue on resume via `resumeFrom` in `ExecutionOptions`.

- **Dependencies/refs:** `src/services/workflows/conductor/conductor.ts`, `src/services/workflows/runtime/executor/conductor-executor.ts`, `src/services/workflows/runtime/executor/session-runtime.ts`.

---

### Cross-Cutting Synthesis

Atomic's deterministic workflows are built on three interlocking mechanisms.

First, the **GraphBuilder** (`src/workflows/graph/builder.ts:229`) accumulates nodes and edges through a fluent chainable API — `.start()`, `.then()`, `.if()/.else()/.endif()`, `.loop()`, `.parallel()`, `.wait()` — and produces an immutable `CompiledGraph<TState>` via `.compile()` (line 885). Control-flow constructs are reified as synthetic decision/merge nodes and conditional edges at compile time, not at runtime.

Second, the **GraphExecutor** (`src/workflows/graph/compiled.ts:253`) traverses the compiled graph via a single BFS node queue in `streamSteps()` (line 322). Each step: dequeues one node, calls `executeWithRetry()` with exponential backoff (backoff formula at line 744), merges the immutable state update via `mergeState()` (line 219), evaluates outgoing edge conditions (pure boolean functions over state), and enqueues matching targets. Loop re-visitation is only permitted for nodes whose IDs contain `"loop_start"` or `"loop_check"` (line 176); all other nodes are deduplicated. `maxSteps` (default 1000) and `maxIterations` (default 100 per loop) provide hard upper bounds.

Third, **state is never mutated in place**. `BaseState.outputs` is spread-merged on every step; `lastUpdated` is always overwritten; fields with declared annotations use typed reducers (`Reducers.replace`, `concat`, `merge`, `mergeById`, etc.) from `src/graph/annotation.ts`. Checkpoints (`save(executionId, state, label?)`) and snapshots (`ExecutionSnapshot` at `types.ts:555`) allow exact-state resume via `resumeFrom` in `ExecutionOptions`.

---

### Out-of-Partition References

- `src/workflows/graph/builder.ts` — GraphBuilder class (line 229); `graph<TState>()` factory (line 971)
- `src/workflows/graph/compiled.ts` — GraphExecutor (line 253); `streamSteps()` (line 322); `executeWithRetry()` (line 615); `mergeState()` (line 219); `initializeExecutionState()` (line 188); `createSnapshot()` (line 818)
- `src/workflows/graph/types.ts` — `BaseState` (line 114); `NodeDefinition<TState>` (line 323); `ExecutionContext<TState>` (line 267); `GraphConfig<TState>` (line 414); `ExecutionSnapshot<TState>` (line 555); `GraphRuntimeDependencies` (line 396); `DEFAULT_RETRY_CONFIG` (line 698); `DEFAULT_GRAPH_CONFIG` (line 707)
- `src/workflows/graph/nodes.ts` — 12 node factory functions; `agentNode()` (line 144); `toolNode()` (line 343); `decisionNode()` (line 567); `waitNode()` (line 657); `parallelNode()` (line 967); `subgraphNode()` (line 1121); `subagentNode()` (line 1664); `parallelSubagentNode()` (line 1764)
- `src/workflows/graph/annotation.ts` — `annotation<T>()`, `Reducers` object, `AtomicStateAnnotation` (line 312), `RalphStateAnnotation` (line 552)
- `src/workflows/graph/sdk.ts` — `WorkflowSDK.init()` (line 123); `applyGraphDefaults()` (lines 216–263); `resolveWorkflow()` (lines 198–214)
- `src/workflows/graph/stream.ts` — `StreamRouter` (line 56); `routeStream()` (line 123)
- `src/workflows/graph/subagent-bridge.ts` — `SubagentGraphBridge` (line 129 or 132); `spawn()` (line 144); `spawnParallel()` (line 276)
- `src/workflows/graph/subagent-registry.ts` — `SubagentTypeRegistry` (line 33); `populateSubagentRegistry()` (line 64)
- `src/workflows/graph/templates.ts` — `sequential()`, `mapReduce()`, `reviewCycle()`, `taskLoop()` reusable patterns
- `src/workflows/ralph/graph.ts` — `createRalphWorkflow()` (line 98); three-phase graph definition
- `src/workflows/ralph/state.ts` — `RalphWorkflowState` (line 51); annotation reducers (`mergeByIdReducer`, `concatReducer`)
- `src/workflows/session.ts` — `WorkflowSession` interface (line 17); `initWorkflowSession()` (line 51)
- `src/ui/commands/workflow-commands.ts` — `createWorkflowCommand()` (line 543); `createRalphCommand()` (line 597); `loadWorkflowsFromDisk()` (line 401); `CUSTOM_WORKFLOW_SEARCH_PATHS` (line 268)
- `src/services/workflows/conductor/conductor.ts` — `WorkflowSessionConductor`; `runStageSession()` (lines 355–560); `preserveSessionForResume` (line 78); queued message drain (lines 478–512)
- `src/services/workflows/conductor/graph-traversal.ts` — `getNextExecutableNodes()`
