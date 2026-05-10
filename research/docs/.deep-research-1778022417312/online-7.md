(no external research applicable)

The research question — "how does Atomic's deterministic workflows work?" — is fully answered by existing markdown design documents in the `research/` directory. The question is about Atomic's own internal architecture, not about an external library. The relevant external SDKs (LangGraph, Temporal, Inngest, Claude Agent SDK, Copilot SDK, OpenCode SDK) appear in these docs only as inspirational comparisons used when the graph engine was originally designed; they are not the subject of the question and fetching their live docs would not add anything that the local research files do not already cover in detail.

---

## Summary of Findings (from local research/ docs)

The following is a synthesised answer drawn entirely from the markdown design and research documentation in `research/docs/`.

### Sources

- `research/docs/2026-02-25-graph-execution-engine.md` — primary technical reference for the graph builder, executor, and node types
- `research/docs/2026-03-21-workflow-sdk-simplification-z3-verification.md` — complete file-by-file inventory of the workflow SDK with control-flow code excerpts
- `research/docs/2026-01-31-graph-execution-pattern-design.md` — original design synthesis from LangGraph, XState, RxJS, Effect-TS, and n8n
- `research/docs/2026-03-20-ralph-workflow-redesign-analysis.md` — Ralph case study: graph phases, EagerDispatchCoordinator, loop mechanics
- `research/docs/2026-03-23-ask-user-question-dsl-node-type.md` — DSL node types including tool nodes and HITL (ask-user) nodes

---

### 1. What "deterministic" means in this context

In the Atomic workflow vocabulary a deterministic node is any node that does not spawn an agent session. The two DSL-level node categories are:

- **stage nodes** (`type: "agent"`) — create a fresh coding-agent session (Claude, OpenCode, Copilot), stream a prompt, and capture output. These are non-deterministic because the LLM response is stochastic.
- **tool nodes** (`type: "tool"`) and control nodes (`type: "decision"`, `"wait"`, `"ask_user"`) — execute a plain TypeScript function with access to the current `ExecutionContext<TState>`. No model call is made. Given the same state, they produce the same output. These are the deterministic nodes.

The conductor explicitly distinguishes the two: "agent" nodes are handed off to the conductor's session pipeline; tool and control nodes are executed directly by the graph executor via `NodeDefinition.execute(ctx)` (see `research/docs/2026-03-23-ask-user-question-dsl-node-type.md`, line 76, and the conductor architecture diagram at lines 344–358).

---

### 2. The graph builder — how a deterministic workflow is declared

Workflows are declared using the `GraphBuilder` fluent API (`src/services/workflows/graph/authoring/builder.ts`). The builder accumulates `NodeDefinition` objects and `Edge` objects and produces a frozen `CompiledGraph<TState>` via `.compile()`.

Key builder methods relevant to deterministic execution:

| Method | What it produces |
|---|---|
| `.then(node)` | Unconditional edge from `currentNodeId` to `node` |
| `.if(cond).then(n).else().then(m).endif()` | Decision node with conditional edges; a merge node re-joins both branches |
| `.loop(bodyNodes, { until, maxIterations })` | `loop_start` + `loop_check` decision nodes with a conditional back-edge |
| `.parallel(config)` | Parallel node routing execution to multiple branch node IDs simultaneously |
| `.wait(prompt)` | Wait node that emits `human_input_required` signal (pauses execution) |
| `.tool(config)` | Tool node executing a plain async function |
| `.catch(handler)` | Registers a global error handler node |
| `.end()` | Marks `currentNodeId` as a terminal node |
| `.compile()` | Copies internal maps/arrays into a `CompiledGraph`; auto-discovers end nodes |

The build phase is entirely static and synchronous: no agent sessions are created, no model calls are made. The resulting `CompiledGraph<TState>` is a pure data structure of nodes and edges.

---

### 3. The execution engine — how deterministic nodes run

`GraphExecutor.streamSteps()` (`src/services/workflows/graph/runtime/`) is the main execution loop. It operates as a **queue-based graph traversal**:

1. **Initialise**: seed `nodeQueue` with `[graph.startNode]` and create a fresh `BaseState` (or restore from a `resumeFrom` snapshot).
2. **Dequeue**: shift the next `NodeId` from the queue.
3. **Loop-detection guard**: skip a node if its `"${nodeId}:${stepCount}"` visit key was already seen, unless it is a `loop_start` or `loop_check` node (these are intentionally re-visited on each iteration).
4. **Execute with retry**: call `executeWithRetry(node, state, …)`. For tool/decision/control nodes this simply calls `node.execute(ctx)` and applies exponential backoff on failure (default: 3 attempts, 1 s base, 2× multiplier).
5. **Merge state**: if `result.stateUpdate` exists, `mergeState(state, result.stateUpdate)` shallow-merges it (with special handling for the `outputs` sub-object).
6. **Signal handling**: if a node emits `human_input_required` the executor yields a `"paused"` step and returns — execution halts until `resumeFrom` is supplied with the correct snapshot.
7. **Checkpoint**: if `config.autoCheckpoint` is true, the executor saves after every node via the configured `Checkpointer`.
8. **Get next nodes**: `getNextNodes(currentNodeId, state, result)` checks `result.goto` first; if absent, evaluates outgoing `EdgeCondition<TState>` predicates (`(state) => boolean`) and enqueues all edges whose condition returns true (or all unconditional edges).
9. **Termination**: a node is terminal when it is in `graph.endNodes` and the queue is empty.

The full data-flow summary (from `research/docs/2026-02-25-graph-execution-engine.md`, lines 756–790):

```
graph<TState>()           GraphBuilder
  .start(node)               |-- accumulates nodes/edges (static, no I/O)
  .then(node)                |
  .loop(body, config)        |
  .if(cond).then().endif()   |
  .end()                     |
  .compile(config)        CompiledGraph<TState>
                              |
              createExecutor(compiledGraph)
                              |
                        GraphExecutor<TState>
                              |
              .execute()  or  .stream()
                              |
                        streamSteps()  [AsyncGenerator]
                              |
          +---------+---------+---------+
          |         |         |         |
      init state  node queue  retry   signals
          |         |         |         |
          v         v         v         v
      mergeState  getNextNodes  executeWithRetry  checkpoint/pause
```

---

### 4. Deterministic control-flow mechanisms in detail

#### 4a. Sequential execution

The default. `.then(node)` creates an unconditional `Edge { from, to }` with no `condition` field. The executor follows all unconditional edges.

#### 4b. Conditional branching

`.if(cond).then(A).else().then(B).endif()` inserts:

- A synthetic `decision` node (no-op execute, returns `{}`)
- Edge: `decision → A` with condition `cond(state)`
- Edge: `decision → B` with condition `!cond(state)` (negated automatically)
- A synthetic `merge` node that both A and B converge into

The condition is a pure TypeScript predicate `(state: TState) => boolean` — no LLM involved.

#### 4c. Loops

`.loop([workerNode], { until: state => state.done, maxIterations: 10 })` compiles to:

```
prevNode → loop_start → workerNode → loop_check
               ↑                          |
               |--- (continue: !until && iter < max)
               (exit: until || iter >= max) → nextNode
```

`loop_start` initialises an iteration counter in `state.outputs["loop_start_N_iteration"]`. `loop_check` increments it. Both are `decision`-type nodes with deterministic execute functions. The back-edge condition is a plain boolean test. Default `maxIterations` is 100.

#### 4d. Dynamic routing via `goto`

Any node's `execute` can return `{ goto: nodeId }` in its `NodeResult`, bypassing edge evaluation entirely. `decisionNode()` uses this to implement multi-route decisions:

```typescript
// iterates routes in order; returns { goto: route.target } for the first match
const router = decisionNode({ id: 'router', routes: [...], fallback: 'end' });
```

#### 4e. Parallel branches

`.parallel({ branches: ['nodeA', 'nodeB'], strategy: 'all' })` inserts a `parallel` node whose execute stores branch metadata in `state.outputs[parallelNodeId]` and returns `{ goto: ['nodeA', 'nodeB'] }`. The executor enqueues all branch node IDs simultaneously. The `strategy` field (`"all"` | `"race"` | `"any"`) controls when the parallel segment is considered complete.

---

### 5. State management

All workflow state extends `BaseState`:

```typescript
interface BaseState {
  executionId: string;    // unique per execution instance
  lastUpdated: string;    // ISO timestamp, refreshed on every mergeState()
  outputs: Record<NodeId, unknown>;  // per-node output store
}
```

`mergeState(current, update)` is an immutable merge: `outputs` is shallow-merged (existing keys preserved, new keys added); all other fields replace. `lastUpdated` is always overwritten. This means deterministic nodes accumulate their outputs in `state.outputs[nodeId]` and can read prior outputs via `ctx.getNodeOutput(nodeId)`.

The annotation system (`graph/annotation.ts`) lets state fields declare custom reducers (`replace`, `concat`, `merge`, `mergeById`, `max`, `min`), enabling richer merge semantics when needed.

---

### 6. Error handling and retry

`executeWithRetry` loops up to `retryConfig.maxAttempts` (default 3). On each failure it checks:
- `node.onError` handler → returns an `ErrorAction` (`"retry"`, `"skip"`, `"abort"`, `"goto"`)
- `retryConfig.retryOn` predicate → if false, throws immediately
- Otherwise applies exponential backoff: `backoffMs * backoffMultiplier^(attempt-1)`

Errors are accumulated in `ctx.errors: ExecutionError[]` and never silently swallowed. A global `.catch(handler)` node can be registered to redirect execution to a recovery node on any unhandled failure.

---

### 7. Checkpointing and resumption

`GraphConfig.autoCheckpoint: true` (the default) causes the executor to call `checkpointer.save(executionId, state)` after every node. Any `Checkpointer<TState>` implementation can be provided (in-memory, file-based, database-backed).

Execution can be resumed from any saved checkpoint by passing `resumeFrom: ExecutionSnapshot<TState>` to `execute()` or `stream()`. The snapshot includes `state`, `visitedNodes`, `errors`, `signals`, and the current `nodeQueue`, so the executor restores and continues exactly from where it paused.

---

### 8. Streaming output modes

`streamGraph(graph, { modes: ["values", "updates", "events", "debug"] })` wraps each `StepResult` through `StreamRouter`, emitting typed `StreamEvent` objects:

- `"values"` — full state after each node
- `"updates"` — only the `stateUpdate` delta
- `"events"` — one event per emitted signal
- `"debug"` — execution time, retry count, model used, state snapshot

---

### 9. The DSL layer (higher-level abstraction)

Above the graph builder sits a `defineWorkflow()` DSL (`src/services/workflows/dsl/`) that reduces boilerplate. It exposes two deterministic node types:

- `.tool(id, { name, execute, description?, reads?, outputs? })` — maps directly to a `"tool"` graph node
- `.askUserQuestion(id, options)` — maps to an `"ask_user"` graph node that pauses execution and surfaces a HITL dialog in the TUI

The compiler (`dsl/compiler.ts`) translates DSL instructions into a `CompiledGraph<BaseState>` and a `WorkflowDefinition`. Stage (agent) nodes are also registered as `StageDefinition` entries consumed by the `WorkflowSessionConductor`; tool and ask-user nodes are not — they execute directly through the graph executor.

---

### 10. Ralph as the reference production workflow

Ralph is the only deployed workflow and demonstrates the full deterministic-plus-agent stack:

- **Phase 1 (deterministic tool)**: `parse-tasks` tool node calls `parseTasks(specDoc)` to extract `TaskItem[]` from the planner's JSON output.
- **Phase 2 (loop with deterministic control)**: a `.loop()` wraps `select-ready-tasks` (deterministic tool node calling `getReadyTasks(state.tasks)`) and `worker` (agent node). Loop exits when all tasks are terminal or `maxIterations: 100` is reached.
- **Phase 3 (conditional)**: a `.if()` block routes to `prepare-fix-tasks` (deterministic) and `fixer` (agent) only when the reviewer found actionable findings.

The `EagerDispatchCoordinator` handles parallel sub-agent spawning within the worker phase, but the graph-level coordination (which tasks are ready, when to exit the loop, when to run the fixer) is entirely deterministic TypeScript logic.
