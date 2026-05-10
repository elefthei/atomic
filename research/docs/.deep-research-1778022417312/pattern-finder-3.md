# Atomic Deterministic Workflows — Test Patterns

## Pattern 1: Workflow Definition & Compilation

**Where:** `tests/sdk/registry.test.ts:15-17`

**What:** Workflows are defined using a chainable builder pattern, then compiled into immutable `WorkflowDefinition` objects. This deterministic structure captures the workflow's shape at definition time.

```typescript
const wfA = defineWorkflow({ name: "alpha" }).for("claude").run(async (_ctx) => {}).compile();
const wfB = defineWorkflow({ name: "beta" }).for("opencode").run(async (_ctx) => {}).compile();
const wfC = defineWorkflow({ name: "gamma" }).for("copilot").run(async (_ctx) => {}).compile();
```

**Variations / call-sites:**
- `tests/sdk/workflow-cli.test.ts:77-101` — Fixture helpers that create workflows with inputs (enums, strings)
- `tests/sdk/commander.test.ts:44-48` — Simple workflow fixtures
- `tests/sdk/runtime/executor.test.ts:19-22` — Inline compiled definitions in test setup
- Pattern: `.for(agent).run(async callback).compile()` always returns typed `WorkflowDefinition`

---

## Pattern 2: Registry — Immutable Chainable Registration

**Where:** `tests/sdk/registry.test.ts:38-63`

**What:** Workflows are registered in an immutable, chainable registry. Each `.register()` call returns a new registry instance, preventing accidental mutations. This enables deterministic workflow lookups by key (`<agent>/<name>`).

```typescript
test("returns a NEW registry instance", () => {
  const r0 = createRegistry();
  const r1 = r0.register(wfA);
  expect(r1).not.toBe(r0);
});

test("original registry unchanged after register (immutability)", () => {
  const r0 = createRegistry();
  r0.register(wfA);
  expect(r0.list()).toHaveLength(0);
  expect(r0.has("claude/alpha")).toBe(false);
});

test("chainable — register three workflows lists all three", () => {
  const r = createRegistry()
    .register(wfA)
    .register(wfB)
    .register(wfC);
  expect(r.list()).toHaveLength(3);
});
```

**Variations / call-sites:**
- `tests/sdk/registry.test.ts:51-55` — Key format `${agent}/${name}`
- `tests/sdk/registry.test.ts:110-119` — Insertion order is preserved in `.list()`
- `tests/sdk/registry.test.ts:121-126` — `.list()` returns frozen array
- `tests/sdk/registry.test.ts:132-142` — `.resolve(name, agent)` for lookups

---

## Pattern 3: Orchestrator Re-entry via Environment Variables

**Where:** `tests/sdk/workflow-cli.test.ts:405-420`

**What:** Deterministic workflow execution is triggered by environment variables. When `ATOMIC_ORCHESTRATOR_MODE=1` is set, the system looks up `ATOMIC_WF_KEY` in the registry and calls `runOrchestrator` instead of `executeWorkflow`. This enables re-entry for multi-stage orchestration.

```typescript
describe("orchestrator re-entry", () => {
  test("ATOMIC_ORCHESTRATOR_MODE=1 + ATOMIC_WF_KEY calls runOrchestrator, not executeWorkflow", async () => {
    const wf = makeSimpleWorkflow("foo", "claude");
    const registry = createRegistry().register(wf);
    const cli = createWorkflowCli(registry);

    process.env.ATOMIC_ORCHESTRATOR_MODE = "1";
    process.env.ATOMIC_WF_KEY = "claude/foo";

    await cli.run();

    expect(runOrchestratorCalls).toHaveLength(1);
    expect(executeWorkflowCalls).toHaveLength(0);
    expect(runOrchestratorCalls[0]!.name).toBe("foo");
    expect(runOrchestratorCalls[0]!.agent).toBe("claude");
  });
```

**Variations / call-sites:**
- `tests/sdk/workflow-cli.test.ts:422-429` — Missing `ATOMIC_WF_KEY` throws
- `tests/sdk/workflow-cli.test.ts:431-439` — Nonexistent key throws
- `tests/sdk/workflow-cli.test.ts:441-452` — Without env var, normal path (execute)
- `tests/sdk/commander.test.ts:124-173` — Higher-level `runCli` orchestrator dispatch

---

## Pattern 4: Stage Graph Inference — Deterministic Dependency Tracking

**Where:** `tests/sdk/runtime/graph-inference.test.ts:10-24`

**What:** `GraphFrontierTracker` deterministically infers stage dependencies by tracking `onSpawn()` and `onSettle()` calls. Each stage gets a deterministic parent list, enabling reproducible parallel execution graphs.

```typescript
test("sequential chain: each stage depends on the previous", () => {
  const t = new GraphFrontierTracker("orchestrator");

  // await ctx.stage("a")
  expect(t.onSpawn()).toEqual(["orchestrator"]);
  t.onSettle("a");

  // await ctx.stage("b")
  expect(t.onSpawn()).toEqual(["a"]);
  t.onSettle("b");

  // await ctx.stage("c")
  expect(t.onSpawn()).toEqual(["b"]);
  t.onSettle("c");
});
```

**Variations / call-sites:**
- `tests/sdk/runtime/graph-inference.test.ts:26-37` — Parallel fan-out: siblings share parent
- `tests/sdk/runtime/graph-inference.test.ts:39-54` — Fan-in: merge stage depends on all parallel stages
- `tests/sdk/runtime/graph-inference.test.ts:56-71` — Real-world "hello-parallel" pattern
- `tests/sdk/runtime/graph-inference.test.ts:73-92` — Loop iterations with sequential chaining
- `tests/sdk/runtime/graph-inference.test.ts:149-170` — Diamond pattern
- Core: `onSpawn()` returns deterministic parent list, `onSettle()` records completion

---

## Pattern 5: Workflow Execution — Input Precedence Chain

**Where:** `tests/sdk/workflow-cli.test.ts:344-400`

**What:** Inputs resolve deterministically through a precedence chain: CLI argv > `.run()` inputs > `createWorkflowCli({ inputs })` > `defineWorkflow` defaults. This ensures reproducible behavior.

```typescript
test(".run() inputs override createWorkflowCli({ inputs })", async () => {
  const wf = makeSeverityWorkflow("wf", "claude");
  const registry = createRegistry().register(wf);
  const cli = createWorkflowCli(registry, {
    inputs: { severity: "medium" },
  });

  await cli.run({
    name: "wf",
    agent: "claude",
    inputs: { severity: "high" },
    argv: false,
  });

  expect(executeWorkflowCalls).toHaveLength(1);
  expect(executeWorkflowCalls[0]!.inputs?.["severity"]).toBe("high");
});
```

**Variations / call-sites:**
- `tests/sdk/workflow-cli.test.ts:363-374` — `createWorkflowCli({ inputs })` overrides definition default
- `tests/sdk/workflow-cli.test.ts:376-389` — CLI argv `--flag` overrides all others
- `tests/sdk/workflow-cli.test.ts:391-400` — Definition default used when nothing else given
- Pattern: Each layer is tested independently for determinism

---

## Pattern 6: Mock-Based Executor Testing — Preventing Side Effects

**Where:** `tests/sdk/workflow-cli.test.ts:26-38`

**What:** Tests mock `executeWorkflow` and `runOrchestrator` before importing the module under test, preventing tmux spawning and subprocess creation. This enables deterministic testing without external state.

```typescript
const executeWorkflowCalls: WorkflowRunOptions[] = [];
const runOrchestratorCalls: WorkflowDefinition[] = [];

const realExecutor = await import("../../src/sdk/runtime/executor.ts");
await mock.module("../../src/sdk/runtime/executor.ts", () => ({
  ...realExecutor,
  executeWorkflow: async (opts: WorkflowRunOptions): Promise<void> => {
    executeWorkflowCalls.push(opts);
  },
  runOrchestrator: async (def: WorkflowDefinition): Promise<void> => {
    runOrchestratorCalls.push(def);
  },
}));
```

**Variations / call-sites:**
- `tests/sdk/commander.test.ts:24-34` — Higher-level `runCli` mocking
- `tests/sdk/workflow-cli.test.ts:40-63` — `WorkflowPickerPanel` mocking to avoid TUI rendering
- Pattern: Mock before dynamic import; track calls in arrays for assertions

---

## Pattern 7: Environment Variable Isolation — Save/Restore Pattern

**Where:** `tests/sdk/runtime/executor.test.ts:74-94`

**What:** Tests save environment state before each test and restore after, ensuring deterministic isolation. This prevents test pollution.

```typescript
afterEach(restoreEnv);

function saveEnv(): void {
  for (const key of [...REQUIRED_VARS, "ATOMIC_ORCHESTRATOR_MODE", "ATOMIC_WF_KEY", "ATOMIC_WF_INPUTS"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
```

**Variations / call-sites:**
- `tests/sdk/workflow-cli.test.ts:123-140` — Orchestrator env var isolation
- `tests/sdk/commander.test.ts:53-80` — ENV_KEYS constant for clarity
- Pattern: Save in `beforeEach`, restore in `afterEach`, track in object map

---

## Pattern 8: Workflow Definition Input Validation

**Where:** `tests/sdk/registry.test.ts:147-206`

**What:** Provider validators are synchronously invoked during `.register()`, ensuring deterministic validation before workflows run. Warnings surface with a `[registry]` prefix for traceability.

```typescript
test("warnings from provider validator surface via console.warn with [registry] prefix", () => {
  const wfWithWarning = defineWorkflow({ name: "bad-copilot" })
    .for("copilot")
    .run(async (_ctx) => {})
    .compile();

  const spy = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const original = wfWithWarning.run.toString;
    wfWithWarning.run.toString = () => "async (_ctx) => { new CopilotClient(); }";

    createRegistry().register(wfWithWarning);

    const calls = spy.mock.calls;
    const hasRegistryPrefix = calls.some(
      (args) => typeof args[0] === "string" && args[0].startsWith("[registry]"),
    );
    expect(hasRegistryPrefix).toBe(true);
  } finally {
    spy.mockRestore();
  }
});
```

**Variations / call-sites:**
- `tests/sdk/registry.test.ts:184-206` — Second validation pattern also warns synchronously
- Pattern: Deterministic, synchronous, with clear error prefixes

---

## Test Infrastructure Summary

Atomic's deterministic workflows are tested through eight core patterns that emphasize reproducibility. The workflow definition system uses immutable, chainable builders that produce sealed `WorkflowDefinition` objects at compile time, ensuring no mutations affect workflow shape. The registry pattern enforces immutability through object identity—each `.register()` call returns a new instance—while maintaining insertion order and frozen `.list()` results. Deterministic re-entry is managed via environment variables: `ATOMIC_ORCHESTRATOR_MODE` signals orchestrator mode, and `ATOMIC_WF_KEY` specifies which workflow to run, triggering `runOrchestrator` dispatch instead of standard execution. Stage graph inference uses `GraphFrontierTracker` to deterministically map parallel and sequential stage dependencies via `onSpawn()` and `onSettle()` calls, producing consistent parent lists for execution graphs. Input resolution follows a strict precedence chain—CLI argv overrides `.run()` inputs, which override CLI-factory defaults, which override definition defaults—ensuring reproducible behavior at each layer. Mock-before-import testing prevents side effects by mocking `executeWorkflow` and `runOrchestrator` before importing the module under test, capturing all calls in arrays for deterministic assertions. Environment variable isolation via save/restore helpers in `beforeEach`/`afterEach` prevents test pollution. Synchronous provider validation at registration time ensures errors are caught early with clear `[registry]`-prefixed messages. Together, these patterns create a system where given identical inputs (workflows, registry state, environment variables, stage call sequences), the outcome is always deterministic and reproducible.
