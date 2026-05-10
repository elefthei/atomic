# Partition 7 of 16 — Findings

## Scope
`research/` (2 files, 2,307 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Locator Report: Deterministic Workflows in Atomic

## Research Question
How does Atomic's deterministic workflows work?

## Scope
`research/` directory (2 files, 2,307 LOC baseline + research/)

---

## Documentation

### Primary Architecture Documents
- `research/docs/2026-02-25-graph-execution-engine.md` — Core technical documentation of the graph execution engine: builder fluent API, compiled graph execution via BFS, node/edge data structures, state merging mechanics, retry logic with exponential backoff, and deterministic step-by-step execution model.
- `research/docs/2026-02-25-graph-execution-engine-technical-documentation.md` — Detailed breakdown of `GraphBuilder` (internal state: nodes Map, edges array, startNodeId, currentNodeId, conditionalStack), `GraphExecutor` (BFS traversal, retry mechanisms, state snapshots), type system, node factories, and error handling.
- `research/docs/2026-02-25-workflow-sdk-standardization.md` — Comprehensive research document covering graph engine design, state management with annotation system (default factories + reducers), 12 node factory system, sub-agent integration, Ralph workflow implementation, checkpointing strategies (memory/file/research backends), and external SDK pattern comparison (LangGraph, Temporal, Inngest, Claude Agent SDK, Copilot SDK, OpenCode SDK).

### Graph Execution & State Management
- `research/docs/2026-02-25-workflow-sdk-design.md` — Workflow SDK design covering `GraphConfig` (checkpointer field, maxSteps, defaultModel), checkpointing implementation patterns, optional `resumeFrom` for state restoration, and graph defaults injection via `applyGraphDefaults()`.
- `research/docs/2026-02-25-unified-workflow-execution-research.md` — Unified execution architecture: initialization with providers/workflows/agents/checkpointing, graph defaults auto-injection, signal handling (human_input_required, checkpoint saves), and state snapshot mechanics.
- `research/docs/2026-01-31-sdk-migration-and-graph-execution.md` — SDK migration patterns showing `resumeFrom` parameter for checkpoint-based resumption, checkpointer backends (ResearchDirSaver, FileSaver, MemoryCheckpointer), and invocation patterns: `graph.invoke(input, { checkpoint: checkpoints[0] })`.

### Deterministic Execution Patterns
- `research/docs/2026-02-25-workflow-sdk-patterns.md` — External SDK pattern analysis covering LangGraph's `StateGraph` with typed state + reducers, deterministic replay mechanisms, checkpoint APIs (InMemorySaver, SqliteSaver, PostgresSaver), and resumption semantics: `checkpointer.get_tuple()` → `app.invoke(input, config=checkpoint_tuple.config)`.
- `research/docs/2026-02-26-opencode-event-bus-patterns.md` — Event bus patterns including replay buffers (last 100 events), idempotent state updates, and event ordering guarantees for deterministic execution.
- `research/docs/2026-03-05-claude-at-subagent-streaming-done-state-ordering.md` — State ordering guarantees: buffering/replay for agent-scoped events when inline agent part not present yet (stream-pipeline.ts:1145, 1288), explicit mitigations for race windows at micro-order level.

### Checkpointing & Resumption
- `research/docs/2026-02-25-workflow-sdk-refactor-research.md` — Checkpointing system overview: `src/graph/checkpointer.ts` with basic backends (Memory, File), checkpointer configuration in `GraphConfig`, completeness questions around SQLite/PostgreSQL support.
- `research/docs/2026-02-28-workflow-tui-rendering-unification-refactor.md` — Checkpointer infrastructure mapping: `MemoryCheckpointSaver`, `FileSaver`, `ResearchCheckpointSaver` at `checkpointer.ts:52,186,420`; notes that `executeWorkflow()` never configures checkpointer and never passes `resumeFrom`, indicating incomplete resumption implementation.
- `research/docs/2026-02-15-ralph-dag-orchestration-implementation.md` — DAG orchestration with checkpoints directory structure: `checkpoints/node-001.json` storing graph state snapshots for manual worker dispatch and debug loop termination.

### Ralph Workflow (Built-in Deterministic Workflow)
- `research/docs/2026-02-25-ralph-workflow-implementation.md` — Ralph workflow creates session directory with three subdirectories (`checkpoints`, `agents`, `logs`), implements task-decomposition → DAG-dispatch → review loop with state checkpointing.
- `research/docs/2026-03-20-ralph-workflow-redesign-analysis.md` — Workflow redesign analysis covering deterministic stage advancement, interrupt/resume mechanics, and state persistence across execution boundaries.
- `research/docs/2026-02-15-ralph-dag-orchestration-blockedby.md` — DAG orchestration blocked-by semantics for deterministic task scheduling and replay.

### Workflow Control Flow & Execution
- `research/docs/2026-02-25-graph-execution-engine.md` — Builder API methods: `start()` (sets startNodeId), `then()` (sequential chaining), `if()/else()/endif()` (conditional branching with ConditionalBranch stack), `loop()` (loop_start → body → loop_check with maxIterations), `parallel()` (concurrent branch execution with strategy: "all"/"race"/"any"), `catch()` (global error handler), `compile()` (produces CompiledGraph with nodes Map, edges array, startNode, endNodes).
- `research/docs/2026-01-31-graph-execution-pattern-design.md` — Graph execution pattern design with deterministic node queue processing (BFS), state merging, edge evaluation, and signal propagation.
- `research/docs/2026-02-03-workflow-composition-patterns.md` — Composition patterns including state persistence between subgraphs via `clearContextNode`, ensuring important state survives context window boundaries.

### Workflow Discovery & Configuration
- `research/docs/2026-02-02-atomic-builtin-workflows-research.md` — Built-in workflow definitions including checkpoint node type for saving state for resumption.
- `research/docs/2026-02-25-workflow-registration-flow.md` — Workflow discovery and registration: local (`.atomic/workflows/`) and global (`~/.atomic/workflows/`) TypeScript files, standardized exports.
- `research/docs/2026-01-31-workflow-config-semantics.md` — Workflow configuration semantics and state initialization.

### State Management & Annotations
- `research/docs/2026-02-25-workflow-sdk-standardization.md` (section 2) — Annotation system for deterministic state merging: `annotation<T>(default, reducer)` pattern, `AnnotationRoot` schema, built-in reducers (replace, concat, merge, mergeById, max, min, sum, or, and, ifDefined), `AtomicStateAnnotation` and `RalphStateAnnotation` schemas.

### Bug Fixes & Refinements
- `research/docs/2026-03-25-workflow-interrupt-resume-bugs.md` — Interrupt/resume bug analysis and fixes for deterministic resumption semantics.
- `research/docs/2026-03-24-workflow-interrupt-stage-advancement-bug.md` — Stage advancement bug during workflow interruption, affecting deterministic state progression.
- `research/docs/2026-03-21-workflow-sdk-simplification-z3-verification.md` — Workflow SDK simplification with formal verification (Z3) for deterministic correctness.
- `research/docs/2026-03-18-ralph-eager-dispatch-research.md` — Eager dispatch research for Ralph workflow determinism.

### Event Bus & Observability
- `research/docs/2026-02-26-streaming-event-bus-spec-audit.md` — Event bus specification audit noting missing event replay capability and JSONL dump for debugging deterministic execution traces.
- `research/docs/2026-03-14-event-bus-callback-elimination-sdk-event-types.md` — Event bus patterns with early tool event queuing and replay mechanics: tool events buffered in `Map<string, EarlyToolEvent[]>` and replayed when parent subagent starts.
- `research/docs/2026-04-02-logging-debugging-traces-unified-research.md` — Logging and debugging traces research for deterministic execution observability.

### Sub-Agent Integration
- `research/docs/2026-02-05-pluggable-workflows-sdk-design.md` — Pluggable workflows with sub-agent building blocks: BFS execution with retry and checkpointing at executor level.

### Performance & Optimization
- `research/docs/2026-03-03-bun-migration-startup-optimization.md` — Startup optimization mentioning checkpointer usage: `src/workflows/graph/checkpointer.ts:15` file system operations (mkdir, readFile, writeFile, readdir, unlink, rm).
- `research/docs/2026-03-01-opencode-tui-concurrency-bottlenecks.md` — TUI concurrency patterns affecting deterministic rendering during workflow execution.

### Additional Context
- `research/docs/.deep-research-1778022417312/locator-14.md` — Windows installer determinism: `install.ps1` implements deterministic workflow patterns through Invoke-Step pattern with background PowerShell jobs, progress tracking via StepIndex/StepTotal variables, and structured initialization via `src/services/system/auto-sync.ts`.
- `research/docs/.deep-research-1778022417312/locator-16.md` — Cross-partition determinism research covering test suite determinism and workflow execution guarantees.

---

## Notable Clusters

### Workflow SDK Core (`research/docs/2026-02-25-*workflow-sdk-*.md`)
- **5 files**: Standardization, design, patterns, refactor research, and SDK implementation guide. These collectively document the declarative builder API, state annotation system, node factory system, checkpointing architecture, and external SDK comparisons.

### Graph Execution Documentation (`research/docs/2026-02-25-graph-execution-*.md`)
- **2 files**: Technical documentation and engine design. Core reference for BFS traversal, node queueing, state merging mechanics, retry logic, and deterministic step-by-step execution semantics.

### Ralph Workflow Implementation (`research/docs/2026-02-25-ralph-*` + `2026-02-15-ralph-*` + `2026-03-*ralph-*`)
- **4+ files**: Implementation details, DAG orchestration, redesign analysis, and eager dispatch research. Documents the built-in task-decomposition workflow with session-based checkpointing and state persistence.

### Workflow Interruption & Resumption Bugs (`research/docs/2026-03-2[45]-workflow-interrupt-*`)
- **2 files**: Bug reports and fixes for deterministic resumption semantics during workflow interruption and stage advancement.

### Event Bus & Streaming Patterns (`research/docs/2026-02-26-*` + `2026-03-*event*`)
- **4+ files**: Event bus patterns, streaming architecture, event ordering guarantees, callback elimination, and early event replay mechanics.

---

## Summary

The `research/docs/` directory contains 40+ markdown documents documenting Atomic's deterministic workflow architecture. The core determinism is achieved through:

1. **Graph-Based Execution**: Declarative builder API (`.start()`, `.then()`, `.if()`, `.loop()`, `.parallel()`) producing a `CompiledGraph` with nodes and edges executed via BFS traversal.

2. **State Management**: Annotation system with default factories and reducers enabling deterministic state merging across node boundaries. State schemas (`AtomicStateAnnotation`, `RalphStateAnnotation`) define typed state shapes with immutable merge semantics.

3. **Checkpointing**: Multiple checkpoint backends (MemoryCheckpointSaver, FileSaver, ResearchCheckpointSaver) storing execution snapshots in `checkpoints/` directories. Resumption via `resumeFrom` parameter and checkpoint tuple retrieval.

4. **Deterministic Execution**: BFS node queue processing, exponential backoff retry logic, edge evaluation determinism, and state snapshot capture after each step. Signal propagation (human_input_required, checkpoint saves) enables pausing and resuming.

5. **Event Ordering**: Event bus patterns with replay buffers, idempotent state updates, buffering/replay for async agent events, and explicit race window mitigations for micro-order guarantees.

6. **Built-in Ralph Workflow**: Task-decomposition → DAG-dispatch → review loop with session-based checkpoints and state persistence.

The documentation emphasizes completeness of the checkpointing infrastructure but notes incomplete resumption implementation in `executeWorkflow()`, suggesting this is an area under active development.

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
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

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Atomic's Deterministic Workflows: Pattern Findings
**Partition:** research/ (7 of 16)  
**Question:** How does atomic's deterministic workflows work?

---

## Overview

Atomic's deterministic workflow execution is implemented through a queue-based graph traversal engine. The system ensures reproducibility via explicit state management, conditional routing, and a single execution path per state snapshot. Workflows are declaratively constructed, compiled to an immutable graph, then executed with full state tracking and resumption capability.

---

## Pattern Findings

#### Pattern: Queue-Based Graph Traversal with Node Execution Loop
**Where:** `research/docs/2026-02-25-graph-execution-engine.md:216-250`
**What:** The core execution loop uses a node queue (FIFO) for deterministic traversal of graph nodes, with state mutations tracked and merged after each node completes.

```typescript
// Main Loop (lines 367-547)
while (nodeQueue.length > 0 && stepCount < maxSteps) {
  // 1. Abort check (lines 369-381)
  // 2. Node lookup (lines 383-394)
  const currentNode = this.graph.nodes.get(nodeId);
  // 3. Loop detection (lines 397-402)
  const visitKey = `${currentNodeId}:${stepCount}`;
  if (this.visitedNodes.has(visitKey) && !isLoopNode(currentNodeId)) {
    continue; // Skip already-visited nodes
  }
  // 4. Node execution with retry (lines 410-447)
  const { result } = await executeWithRetry(node, state, errors, abortSignal);
  // 5. State merge (lines 454-457)
  state = mergeState(state, result.stateUpdate);
  // 6. Signal handling (lines 464-495)
  // 7. Next node resolution (lines 518-521)
  const nextNodes = getNextNodes(currentNodeId, state, result);
  nodeQueue.push(...nextNodes);
}
```

**Variations / call-sites:**
- `research/docs/2026-02-25-graph-execution-engine-technical-documentation.md:322-547` — Detailed breakdown of streamSteps() implementation
- `research/docs/2026-02-25-graph-execution-engine.md:309` — Entry point: `stream(options)` method

---

#### Pattern: State Immutability Through Shallow Merging
**Where:** `research/docs/2026-02-25-graph-execution-engine.md:303-305`
**What:** State updates are merged via `mergeState()` which preserves `executionId`, overwrites `lastUpdated`, and performs shallow merge of `outputs` to prevent node output conflicts.

```typescript
// initializeExecutionState (lines 188-217)
function initializeExecutionState(executionId: string, initial?: Partial<TState>) {
  return {
    executionId,
    lastUpdated: new Date().toISOString(),
    outputs: {},
    ...initial,
  };
}

// mergeState (lines 219-230)
function mergeState(current: TState, update: Partial<TState>): TState {
  const result = { ...current, ...update };
  if (update.outputs) {
    result.outputs = { ...current.outputs, ...update.outputs };
  }
  result.lastUpdated = new Date().toISOString();
  return result;
}
```

**Variations / call-sites:**
- Node execution returns `NodeResult<TState>` with optional `stateUpdate: Partial<TState>`
- Each node execution preserves all previous state and adds/overwrites only its outputs

---

#### Pattern: Deterministic Edge Resolution with Conditional Routing
**Where:** `research/docs/2026-02-25-graph-execution-engine.md:281-287`
**What:** Next node selection is deterministic: edges without conditions are always followed; conditional edges are followed only when their condition function evaluates to true on current state.

```typescript
// getNextNodes (lines 758-790)
function getNextNodes(
  currentNodeId: NodeId,
  state: TState,
  result: NodeResult<TState>
): NodeId[] {
  // 1. Check for explicit goto override
  if (result.goto) {
    return Array.isArray(result.goto) ? result.goto : [result.goto];
  }
  
  // 2. Filter outgoing edges from currentNodeId
  const outgoingEdges = this.graph.edges.filter(e => e.from === currentNodeId);
  
  // 3. Evaluate conditions deterministically
  return outgoingEdges
    .filter(edge => !edge.condition || edge.condition(state))
    .map(edge => edge.to);
}
```

**Variations / call-sites:**
- Edges stored as `Edge<TState>[]` with optional `condition?: EdgeCondition<TState>` 
- Builder methods `.if()` / `.endif()` construct conditional branches with decision nodes
- `result.goto` allows explicit override of next node(s) from within node execution

---

#### Pattern: Snapshot-Based Resumption and Checkpointing
**Where:** `research/docs/2026-02-25-graph-execution-engine.md:224-226, 293-295`
**What:** Workflows support resumption from snapshots containing full execution state (state, visitedNodes, errors, signals, nodeQueue). Checkpointing is automatic or explicit.

```typescript
// ExecutionSnapshot<TState> (lines 555-573)
interface ExecutionSnapshot<TState> {
  executionId: string;
  state: TState;
  status: ExecutionStatus;
  currentNodeId?: NodeId;
  visitedNodes: NodeId[];
  errors: ExecutionError[];
  signals: SignalData[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  nodeExecutionCount: number;
}

// Resume from snapshot (lines 324-331)
if (options.resumeFrom) {
  state = resumeFrom.state;
  visitedNodes = new Set(resumeFrom.visitedNodes);
  errors = resumeFrom.errors;
  signals = resumeFrom.signals;
  nodeQueue = [resumeFrom.currentNodeId];
}
```

**Variations / call-sites:**
- `createSnapshot(stepResult)` builds snapshots after each step
- `saveCheckpoint(checkpointer, executionId, state, label)` persists snapshots
- Multiple checkpointer backends: memory, file, session-based

---

#### Pattern: Retry Logic with Exponential Backoff
**Where:** `research/docs/2026-02-25-graph-execution-engine.md:261-280`
**What:** Node execution failures trigger configurable retries with exponential backoff. Retry conditions are evaluated; error handlers can skip, abort, or jump to recovery nodes.

```typescript
// executeWithRetry (lines 615-750)
async executeWithRetry(
  node: NodeDefinition<TState>,
  state: TState,
  errors: ExecutionError[],
  abortSignal?: AbortSignal,
  parentContext?: any
) {
  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      const context: ExecutionContext<TState> = {
        state, config, errors, abortSignal, model: resolveModel(node),
        emit: (type, data) => emittedEvents.push({ type, data }),
      };
      const result = await node.execute(context);
      return { result, retryCount: attempt - 1, modelUsed, emittedEvents };
    } catch (error) {
      if (node.onError) {
        const action = await node.onError(error, context);
        if (action.action === "skip") return { result: { stateUpdate: action.fallbackState } };
        if (action.action === "abort") throw error;
        if (action.action === "goto") return { goto: action.nodeId };
      }
      if (!retryConfig.retryOn(error)) throw error;
      const delay = retryConfig.backoffMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1);
      await sleep(delay);
    }
  }
}
```

**Variations / call-sites:**
- Default retry config: 3 attempts, 1000ms base, 2x multiplier
- Nodes can define custom `onError` handlers with discriminated error actions
- `ErrorAction<TState>` union: `retry`, `skip`, `abort`, `goto` recovery nodes

---

#### Pattern: Loop Detection via Visited Nodes Set
**Where:** `research/docs/2026-02-25-graph-execution-engine.md:233-234`
**What:** Loop detection prevents infinite revisits by tracking visited node-step pairs. Loop infrastructure nodes (`loop_start`, `loop_check`) are exempt to allow controlled iteration.

```typescript
// Loop detection (lines 397-402)
const visitKey = `${currentNodeId}:${stepCount}`;
if (visitedNodes.has(visitKey) && !isLoopNode(currentNodeId)) {
  continue; // Skip re-visited nodes
}
visitedNodes.add(visitKey);

// isLoopNode helper (line 176)
function isLoopNode(nodeId: NodeId): boolean {
  return nodeId.includes("loop_start") || nodeId.includes("loop_check");
}
```

**Variations / call-sites:**
- Visitor set keyed as `"${nodeId}:${stepCount}"` for context-aware detection
- Loop nodes auto-generated with prefixes by `.loop()` builder method
- Kahn's algorithm (task-order.ts) used for dependency ordering in ralph workflows

---

#### Pattern: Centralized Orchestrator with Parallel Sub-agents
**Where:** `research/docs/2026-02-15-ralph-dag-orchestration-implementation.md:469-490`
**What:** Ralph uses a centralized orchestrator (main process) that dispatches multiple worker sub-agents in parallel via `SubagentGraphBridge.spawnParallel()`, with the orchestrator as the sole writer to `tasks.json`.

```typescript
// Parallel dispatch pattern
┌──────────────────────────────────────┐
│     Ralph Orchestrator (Main)        │
│  - Maintains in-memory task DAG      │
│  - Computes ready set                │
│  - Dispatches workers via bridge     │
│  - SOLE writer to tasks.json         │
│  - Receives completion events        │
└──────────────────┬───────────────────┘
                   │ SubagentGraphBridge.spawnParallel()
       ┌───────────┼───────────┐
       │           │           │
┌──────▼─────┐ ┌──▼────────┐ ┌▼───────────┐
│  Worker 1  │ │  Worker 2  │ │  Worker 3  │
│ (assigned  │ │ (assigned  │ │ (assigned  │
│  task #1)  │ │  task #2)  │ │  task #5)  │
└────────────┘ └────────────┘ └────────────┘
```

**Variations / call-sites:**
- `research/docs/2026-02-15-ralph-dag-orchestration-implementation.md:152-169` — `SubagentGraphBridge.spawnParallel()` uses `Promise.allSettled()` for concurrent execution
- Current serial loop: `workflow-commands.ts:796-809` — spawns one worker per iteration
- DAG scheduling via topological sort: `research/docs/2026-02-15-ralph-dag-orchestration-implementation.md:239-270`

---

## Supporting Concepts from Research

### Control Flow Structures

1. **Conditionals**: `.if(condition)` creates decision nodes; `.endif()` merges branches with conditional edges
2. **Loops**: `.loop(bodyNodes, { until, maxIterations })` creates loop_start and loop_check nodes with back-edges
3. **Parallel**: `.parallel({ branches, strategy })` dispatches multiple branches; strategies: `"all"` (Promise.all), `"race"` (Promise.race), `"any"` (Promise.any)

### Signal Handling

Nodes emit signals to alter execution flow:
- `human_input_required`: Pause for user input
- `checkpoint`: Save state snapshot
- `context_window_warning`: LLM context threshold exceeded
- `debug_report_generated`: Diagnostic information

### Runtime Dependencies

Graph execution requires injected dependencies:
- `clientProvider`: Maps agent type names to `CodingAgentClient` instances
- `workflowResolver`: Named workflow lookup for subgraph nodes
- `subagentBridge`: Parallel sub-agent spawning
- `subagentRegistry`: Sub-agent metadata

---

## Related Patterns in Research

| File | Topic | Lines |
|------|-------|-------|
| `2026-02-25-graph-execution-engine.md` | Core execution loop and state management | 216-547 |
| `2026-02-25-graph-execution-engine-technical-documentation.md` | Detailed builder and executor APIs | 1-790 |
| `2026-02-25-workflow-sdk-design.md` | SDK facade and dependency injection | 1-135 |
| `2026-02-15-ralph-dag-orchestration-implementation.md` | Deterministic task scheduling and blockedBy enforcement | 1-655 |
| `2026-02-25-workflow-sdk-patterns.md` | Builder patterns and composition | N/A |

---

## Key Determinism Guarantees

1. **Reproducible traversal**: Given identical state, the same edges fire, the same nodes execute, in the same order
2. **Atomic state updates**: State is immutable; updates merge via shallow copy
3. **Idempotent node retry**: Nodes can be re-executed without side effects (SDK session isolation, tool idempotency)
4. **Loop safety**: Iteration counts and visited-node tracking prevent infinite loops
5. **Resumption fidelity**: Full snapshots allow resuming from any paused state with zero data loss
6. **Dependency enforcement**: Ralph's topological sort ensures blockedBy constraints are respected (when enabled)

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
