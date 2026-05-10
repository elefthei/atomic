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
