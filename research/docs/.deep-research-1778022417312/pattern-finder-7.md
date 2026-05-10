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

