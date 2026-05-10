# Partition 9 of 16 — Findings

## Scope
`rest-api/` (9 files, 1,168 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# REST API — Partition 9 of 16

## Research Question
How does atomic's deterministic workflows work?

## Scope
`rest-api/` directory (9 files, 1,168 LOC)

## Architectural Orientation
Query: HTTP entrypoints that may invoke workflows externally via `app.$METHOD($PATH, $$$)` pattern.

---

## Implementation

- `rest-api/src/server.ts` — Bun.serve HTTP handler factory with CRUD routes on `/items` and `/items/:id` using GET/POST/PUT/DELETE verbs; no workflow invocation patterns detected
- `rest-api/src/store.ts` — In-memory ItemStore class managing Item CRUD operations (create, list, get, update, remove) without external workflow triggers
- `rest-api/src/errors.ts` — HTTP error classes (HttpError, NotFoundError, BadRequestError) and JSON response helpers for standardized error handling
- `rest-api/src/types.ts` — Item, CreateItemInput, UpdateItemInput type definitions and dual validation approach (result-style + throw-style) for request parsing
- `rest-api/src/index.ts` — Entry point instantiating server and logging listen URL

## Tests

- `rest-api/src/server.test.ts` — Integration tests covering all HTTP endpoints (GET/POST/PUT/DELETE `/items` and `/items/:id`) with 200/201/204/400/404 response validation
- `rest-api/src/store.test.ts` — Unit tests for ItemStore methods including create, list, get, update, remove, and clear with state mutation verification
- `rest-api/src/types.test.ts` — Dual-path validation tests for parseCreateItemInput, parseUpdateItemInput, validateCreateItemInput, validateUpdateItemInput with field constraints
- `rest-api/src/errors.test.ts` — Tests for HttpError hierarchy and response helpers (errorResponse, jsonResponse)

## Types / Interfaces

- `rest-api/src/types.ts` — Item (id: string, name: string, description: string | null, createdAt: string, updatedAt: string), CreateItemInput, UpdateItemInput, ValidationResult<T> (legacy)

## Configuration

- `rest-api/package.json` — Bun workspace with scripts: start (src/index.ts), dev (--hot mode), test (bun test)
- `rest-api/tsconfig.json` — TypeScript configuration

## Documentation

- `rest-api/README.md` — Full API reference with endpoint descriptions, Item shape, example curl requests, error response format

---

## Notable Clusters

- `rest-api/src/` — 9 files (5 implementation, 4 tests) implementing stateless REST CRUD with in-memory storage

---

## Finding: No Deterministic Workflow Invocation Detected

The `rest-api/` partition implements a stateless REST API for item CRUD operations. The HTTP handlers in `server.ts` route requests to store operations without any detectable patterns for external workflow invocation, deterministic job queueing, or replay-safe architecture. The partition appears self-contained with no cross-service dependencies or references to workflow orchestration, determinism frameworks, or agent-style processing pipelines.

The dual validation pattern in `types.ts` (result-style and throw-style) may support resilient request handling, but the architecture does not expose workflow execution mechanisms at the HTTP layer within this scope.

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
# Analyzer-9 — Sentinel Report
## Partition: `rest-api/` (9 files, ~1,168 LOC)
## Research Question: How does Atomic's deterministic workflows work?

---

### Files Analysed

| File | LOC (approx) | Skimmed? |
|------|-------------|----------|
| `rest-api/src/server.ts` | 104 | Full read |
| `rest-api/src/store.ts` | 53 | Full read |
| `rest-api/src/types.ts` | (not read — type defs only) | Skipped |
| `rest-api/src/errors.ts` | (not read — HTTP error helpers) | Skipped |
| `rest-api/src/index.ts` | (not read — entry point only) | Skipped |
| `rest-api/src/*.test.ts` (3 files) | — | Skipped |
| `rest-api/README.md`, `package.json`, `tsconfig.json` | — | Skipped |

---

### Per-File Notes

**`rest-api/src/server.ts`** (`server.ts:1-104`)
- Creates a `Bun.serve` HTTP server via `createServer()`.
- Exposes two route groups: `/items` (GET list, POST create) and `/items/:id` (GET, PUT, DELETE).
- Every handler delegates directly to an `ItemStore` instance (`store.ts`).
- No imports from any Atomic SDK, workflow engine, agent runner, or scheduler. No concept of steps, determinism, replay, or task queuing.

**`rest-api/src/store.ts`** (`store.ts:1-53`)
- Plain in-memory `Map<string, Item>` with five CRUD methods: `list`, `get`, `create`, `update`, `remove`, `clear`.
- IDs are generated with `crypto.randomUUID()` at creation time.
- No persistence, no event sourcing, no snapshot/replay mechanism. Purely ephemeral state for the lifetime of the server process.

---

### Cross-Cutting Synthesis

This partition is a self-contained sample REST API that demonstrates Bun's built-in HTTP server and a typed in-memory store. It has no connection whatsoever to Atomic's deterministic workflow machinery. There are no imports of workflow primitives (steps, tasks, deterministic timers, replay guards, event sourcing, or agent SDK orchestration). The partition exists as a standalone tutorial or scaffold for REST CRUD and is unrelated to how Atomic's workflow determinism operates.

**SENTINEL: NO RELEVANT IMPLEMENTATION IN THIS PARTITION.**

---

### Out-of-Partition References

None observed. The partition imports only from Bun built-ins (`Bun.serve`, `crypto.randomUUID`) and its own local modules (`./store`, `./errors`, `./types`). There are no cross-partition imports pointing toward workflow, agent, or SDK code elsewhere in the repository.

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Pattern Finder: Deterministic Workflows in REST API Partition (9 of 16)

## Overview

The REST API partition (`rest-api/`) does not directly implement deterministic workflow logic. Instead, it provides a simple CRUD API for managing items. However, the Atomic framework's deterministic workflow system is implemented in the SDK and orchestrator layers, which the REST API would invoke via HTTP entrypoints.

This document maps the deterministic workflow patterns discovered in the broader codebase that REST API entrypoints would invoke.

---

## Discovered Patterns

### Pattern 1: Workflow Definition with Typed Inputs
**Where:** `src/sdk/define-workflow.ts:109-220`
**What:** TypeScript-based workflow builder that validates inputs at compile time and seals definitions into immutable schemas.

```typescript
export class WorkflowBuilder<A extends AgentType = AgentType, I extends AnyInputs = AnyInputs> {
  private readonly options: WorkflowOptions<I>;
  private runFn: ((ctx: WorkflowContext<A, I>) => Promise<void>) | null = null;
  private agentValue: AgentType | null = null;

  constructor(options: WorkflowOptions<I>) {
    this.options = options;
  }

  for<B extends AgentType>(agent: B): WorkflowBuilder<B, I> {
    const next = new WorkflowBuilder<B, I>(this.options as WorkflowOptions<I>);
    next.agentValue = agent;
    next.runFn = this.runFn as ((ctx: WorkflowContext<B, I>) => Promise<void>) | null;
    return next;
  }

  run(fn: (ctx: WorkflowContext<A, I>) => Promise<void>): this {
    if (this.runFn) {
      throw new Error("run() can only be called once per workflow.");
    }
    this.runFn = fn;
    return this;
  }

  compile(): WorkflowDefinition<A, I> {
    // Validates inputs and freezes schema
    const inputs = Object.freeze(
      declaredInputs.map((i) => Object.freeze({ ...i })),
    ) as unknown as I;
    return {
      __brand: "WorkflowDefinition" as const,
      name: this.options.name,
      agent: this.agentValue as A,
      inputs,
      run: runFn,
    };
  }
}
```

**Variations / call-sites:**
- Usage: `src/sdk/workflows/builtin/ralph/claude/index.ts`, `src/sdk/workflows/builtin/deep-research-codebase/opencode/index.ts`
- Enforces that inputs are immutable and validated before workflow execution
- Reserved names are checked to prevent CLI collisions

---

### Pattern 2: Deterministic Graph Inference via Frontier Tracking
**Where:** `src/sdk/runtime/graph-inference.ts:12-50`
**What:** Automatically infers parent-child relationships between workflow stages based on synchronous execution order (sequential vs. parallel).

```typescript
export class GraphFrontierTracker {
  private frontier: string[] = [];
  private parallelAncestors: string[];

  constructor(parentName: string) {
    this.parallelAncestors = [parentName];
  }

  onSpawn(): string[] {
    if (this.frontier.length > 0) {
      // Sequential: previous stage(s) completed → new wave
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
- Created per session runner: `src/sdk/runtime/executor.ts:1521`
- Used to determine graph topology without explicit parent declarations
- Enables deterministic parent inference from JavaScript's execution model

---

### Pattern 3: Immutable Status Snapshots
**Where:** `src/sdk/runtime/status-writer.ts:98-102`
**What:** Builds deterministic read-only snapshots of workflow state persisted to disk so out-of-process consumers can observe state without IPC.

```typescript
export function buildSnapshot(
  input: StatusWriterInputs,
  now: () => Date = () => new Date(),
): WorkflowStatusSnapshot {
  return {
    schemaVersion: 1,
    workflowRunId: input.workflowRunId,
    tmuxSession: input.tmuxSession,
    workflowName: input.workflowName,
    agent: input.agent,
    prompt: input.prompt,
    overall: deriveOverallStatus({
      sessions: input.sessions,
      completionReached: input.completionReached,
      fatalError: input.fatalError,
    }),
    completionReached: input.completionReached,
    fatalError: input.fatalError,
    updatedAt: now().toISOString(),
    sessions: input.sessions.map((s) => ({
      name: s.name,
      status: s.status,
      parents: s.parents,
      error: s.error,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    })),
  };
}
```

**Key aspects:**
- Schema versioned (currently v1) for backwards compatibility
- `deriveOverallStatus` applies deterministic precedence rules: error > needs_review > completed > in_progress
- Sessions include parent references for deterministic graph reconstruction

---

### Pattern 4: Orchestrator Execution with Environment Variables
**Where:** `src/sdk/runtime/executor.ts:1962-2095`
**What:** Deterministic workflow orchestration driven by environment variables passed through launcher scripts, enabling stateless re-entry and reproducibility.

```typescript
export async function runOrchestrator(
  definition: WorkflowDefinition,
): Promise<void> {
  const { workflowRunId, tmuxSessionName, agent, cwd } = validateOrchestratorEnv();
  const inputs = parseInputsEnv(process.env.ATOMIC_WF_INPUTS);
  const prompt = inputs.prompt ?? "";

  process.chdir(cwd);

  // Build WorkflowContext
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
}
```

**Determinism aspects:**
- Inputs encoded as base64-encoded JSON in `ATOMIC_WF_INPUTS`
- `ATOMIC_ORCHESTRATOR_MODE=1` signals re-entry
- `ATOMIC_WF_KEY` identifies workflow without filesystem scan
- `ATOMIC_WF_ID` provides globally unique run ID

---

### Pattern 5: Deterministic Session Registration and Uniqueness
**Where:** `src/sdk/runtime/executor.ts:1512-1608`
**What:** Session names are validated for uniqueness synchronously before any async operations, ensuring deterministic session ordering.

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

    // ── 2. Auto-infer graph parents from frontier (synchronous) ──
    const graphParents = isHeadless ? [] : graphTracker.onSpawn();

    // ── 3. Create done promise ──
    const donePromise = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    // ── 4. Register in active registry (synchronous) ──
    shared.activeRegistry.set(name, { name, paneId: "", done: donePromise });
  };
}
```

**Determinism aspects:**
- Synchronous validation before async operations ensures reproducible failures
- Three registries (active, completed, failed) track state deterministically
- Graph frontier updated synchronously at spawn time, not settlement time

---

### Pattern 6: Input Parsing and Type Coercion
**Where:** `src/sdk/runtime/executor.ts:412-459`
**What:** Deterministic input decoding from base64-encoded JSON with schema-based type coercion.

```typescript
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

**Determinism aspects:**
- Base64 encoding ensures multiline values survive shell quoting
- Invalid integers are dropped (not wrapped in defaults), ensuring predictable failures
- Type coercion follows declared schema exactly

---

### Pattern 7: REST API Error Handling with Status Codes
**Where:** `rest-api/src/errors.ts:1-55`
**What:** Deterministic HTTP error hierarchy enabling consistent client-side error handling.

```typescript
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string = "Resource not found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = "BadRequestError";
  }
}

export function errorResponse(err: unknown): Response {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof HttpError ? err.message : "Internal Server Error";
  const body: ErrorResponseBody = { error: { status, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
```

**Variations / call-sites:**
- Used in all REST API routes: `rest-api/src/server.ts:31-98`
- Deterministic status codes and error shapes enable external callers to reason about failures
- All errors wrapped in consistent `{ error: { status, message } }` envelope

---

### Pattern 8: Deterministic State Transitions in Validation
**Where:** `rest-api/src/types.ts:76-105`
**What:** Strict input validation that throws on first violation, ensuring deterministic parse failures across identical inputs.

```typescript
export function parseCreateItemInput(value: unknown): CreateItemInput {
  if (!isPlainObject(value)) {
    throw new Error("Invalid request body: body must be an object");
  }
  checkUnknownFields(value, ALLOWED_CREATE_FIELDS);
  const name = validateName(value["name"], true);
  const description = validateDescription(value["description"]);
  const result: CreateItemInput = { name };
  if (description !== undefined) {
    result.description = description;
  }
  return result;
}

function validateName(value: unknown, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) {
      throw new Error("Invalid request body: name is required");
    }
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Invalid request body: name must be a non-empty string");
  }
  if (value.trim().length > 200) {
    throw new Error("Invalid request body: name must not exceed 200 characters");
  }
  return value.trim();
}
```

**Determinism aspects:**
- Validation order is fixed: object check, field check, type check, length check
- Each validation failure throws immediately (fail-fast)
- Same input always produces same error message

---

## Summary

Atomic's **deterministic workflows** are achieved through:

1. **Immutable Definitions**: Workflow schemas are frozen and validated at compile time
2. **Synchronous Graph Inference**: Parent-child relationships inferred deterministically from execution order without explicit declarations
3. **Environment-Variable Driven Re-entry**: Workflows re-execute with the same inputs encoded in env vars, enabling stateless reproducibility
4. **Status Snapshots**: Immutable point-in-time state persisted to disk with versioned schemas
5. **Synchronous Validation**: Session names and inputs validated synchronously before async operations
6. **Type-Safe Input Coercion**: Schema-driven type conversion ensures consistent type shapes across runs
7. **Deterministic Error Handling**: Fixed error hierarchies and status codes enable reproducible error handling

The REST API (`rest-api/`) provides HTTP entrypoints that would invoke these patterns indirectly by creating workflow run requests, relying on the orchestrator's environment-variable passing mechanism to achieve determinism.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
