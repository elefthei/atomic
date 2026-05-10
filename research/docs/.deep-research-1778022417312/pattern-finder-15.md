# Pattern Finder 15: Deterministic Workflows Architecture

## Patterns Found

#### Pattern: Workflow Definition Builder with Type-Safe Inputs

**Where:** `src/sdk/define-workflow.ts:109-220`

**What:** Chainable fluent API that enforces workflow structure: declaration → agent narrowing → execution → compilation into sealed definition.

```typescript
export class WorkflowBuilder<
  A extends AgentType = AgentType,
  I extends AnyInputs = AnyInputs,
> {
  private readonly options: WorkflowOptions<I>;
  private runFn: ((ctx: WorkflowContext<A, I>) => Promise<void>) | null = null;
  private agentValue: AgentType | null = null;

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
    // Freeze inputs and validate against schema, throw on duplicates
    const inputs = Object.freeze(
      declaredInputs.map((i) => Object.freeze({ ...i })),
    ) as unknown as I;

    return {
      __brand: "WorkflowDefinition" as const,
      name: this.options.name,
      agent: this.agentValue,
      inputs,
      run: runFn,
    };
  }
}
```

**Determinism aspects:** Workflow definition is immutable after `.compile()`. Inputs are frozen. No runtime state modifications allowed after declaration.

#### Pattern: Immutable Registry with Type-Accumulating Generics

**Where:** `src/sdk/registry.ts:63-111`

**What:** Read-only registry that accumulates workflow definitions with type-safe keying (`${agent}/${name}`); registration is immutable—returns new registry, original unchanged.

```typescript
class RegistryImpl<T extends Record<string, WorkflowDefinition>> {
  private readonly map: ReadonlyMap<string, WorkflowDefinition>;

  register<W extends RegistrableWorkflow>(
    wf: W,
  ): Registry<T & Record<`${W["agent"]}/${W["name"]}`, W>> {
    const key = `${wf.agent}/${wf.name}`;

    if (this.map.has(key)) {
      throw new Error(
        `[atomic] Duplicate workflow registration: "${key}" is already registered.`,
      );
    }

    validateAtRegistration(wf);

    const next = new Map(this.map);
    next.set(key, wf);
    return new RegistryImpl<T & Record<`${W["agent"]}/${W["name"]}`, W>>(next) as Registry<
      T & Record<`${W["agent"]}/${W["name"]}`, W>
    >;
  }

  resolve(name: string, agent: AgentType): WorkflowDefinition | undefined {
    return this.map.get(`${agent}/${name}`);
  }
}
```

**Determinism aspects:** Duplicate keys throw at registration time. Each `.register()` call produces an immutable snapshot. Lookups are pure; no side effects.

#### Pattern: Orchestrator Re-Entry via Environment Variables

**Where:** `src/sdk/commander.ts:137-158`

**What:** Framework-transparent dispatch: on fresh CLI invocation runs bootstrap + parse; when `ATOMIC_ORCHESTRATOR_MODE=1` is set, skips CLI parsing and directly invokes workflow executor.

```typescript
export async function runCli(
  target: WorkflowCli | ReadonlyArray<WorkflowCli>,
  cliFn: () => void | Promise<void>,
): Promise<void> {
  if (process.env.ATOMIC_ORCHESTRATOR_MODE === "1") {
    const key = process.env.ATOMIC_WF_KEY ?? "";
    const slashIdx = key.indexOf("/");
    if (slashIdx < 0) {
      throw new Error(
        `ATOMIC_ORCHESTRATOR_MODE=1 but ATOMIC_WF_KEY "${key}" is malformed`,
      );
    }
    const agent = key.slice(0, slashIdx) as AgentType;
    const name = key.slice(slashIdx + 1);

    const clis = Array.isArray(target) ? target : [target];
    for (const cli of clis) {
      const def = cli.registry.resolve(name, agent);
      if (def) {
        await runOrchestrator(def);
        return;
      }
    }
    throw new Error(`ATOMIC_WF_KEY "${key}" not found`);
  }

  await cliFn();
}
```

**Determinism aspects:** Workflow resolution is deterministic—`${agent}/${name}` uniquely identifies a compiled definition. Re-entry is transparent to parent CLI; no explicit guards needed.

#### Pattern: Declarative Input Schema with Compile-Time Validation

**Where:** `src/sdk/define-workflow.ts:48-103`

**What:** Validation runs at workflow definition time (not runtime), enforcing reserved names, type consistency, enum exhaustiveness, and integer bounds.

```typescript
function validateWorkflowInput(input: WorkflowInput, workflowName: string): void {
  if (!input.name || input.name.trim() === "") {
    throw new Error(`Workflow "${workflowName}" has an input with an empty name.`);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input.name)) {
    throw new Error(`input "${input.name}" has an invalid name`);
  }
  if ((RESERVED_INPUT_NAMES as readonly string[]).includes(input.name)) {
    throw new Error(`input name "${input.name}" is reserved by the worker CLI`);
  }
  if (input.type === "enum") {
    if (!Array.isArray(input.values) || input.values.length === 0) {
      throw new Error(`enum input "${input.name}" declares no values`);
    }
    if (input.default !== undefined && !input.values.includes(input.default)) {
      throw new Error(`default "${input.default}" not in declared values`);
    }
  }
}
```

**Determinism aspects:** Input schema is frozen and validated at compile time. Malformed schemas throw during workflow definition, not during execution.

#### Pattern: Multi-Stage Workflow with Deterministic Control Flow

**Where:** `src/sdk/workflows/builtin/ralph/claude/index.ts:89-243`

**What:** Workflow runs are orchestrated entirely via TypeScript control flow (for loops, Promise.all, conditionals); stages spawn agent sessions and return typed results that feed into deterministic iteration logic.

```typescript
export default defineWorkflow({
  name: "ralph",
  inputs: [
    { name: "prompt", type: "text", required: true },
    { name: "max_loops", type: "integer", default: DEFAULT_MAX_LOOPS },
  ],
})
  .for("claude")
  .run(async (ctx) => {
    const maxLoops = ctx.inputs.max_loops ?? DEFAULT_MAX_LOOPS;
    let reviewReport = "";

    for (let iteration = 1; iteration <= maxLoops; iteration++) {
      await ctx.stage({ name: `planner-${iteration}` }, {}, {}, async (s) => {
        await s.session.query(buildPlannerPrompt(prompt, { iteration, reviewReport }));
        s.save(s.sessionId);
      });

      const [locatorResult, analyzerResult, patternResult] = await Promise.all([
        ctx.stage({ name: `infra-locate-${iteration}`, headless: true }, {}, {}, 
          async (s) => { /* parallel stage */ }),
        ctx.stage({ name: `infra-analyze-${iteration}`, headless: true }, {}, {}, 
          async (s) => { /* parallel stage */ }),
        ctx.stage({ name: `infra-patterns-${iteration}`, headless: true }, {}, {}, 
          async (s) => { /* parallel stage */ }),
      ]);

      const [reviewA, reviewB] = await Promise.all([
        runReviewer(`reviewer-${iteration}-a`),
        runReviewer(`reviewer-${iteration}-b`),
      ]);

      const merged = mergeReviewResults(reviewA.result, reviewB.result);
      if (!hasActionableFindings(parsed, reviewRaw)) break;
      reviewReport = formatReviewForReplan(parsed, reviewRaw);
    }
  })
  .compile();
```

**Determinism aspects:** Loop terminates on explicit conditions (`max_loops` or actionable findings). Parallel stages use Promise.all (deterministic ordering). Each iteration feeds previous results (reviewReport) into next planner invocation.

#### Pattern: Built-in Registry with Static Imports

**Where:** `src/sdk/workflows/builtin-registry.ts:1-23`

**What:** Central registry factory statically imports all built-in workflows by agent variant and chainably registers them in a single factory function.

```typescript
import { createRegistry } from "../registry";

import ralphClaude from "./builtin/ralph/claude";
import ralphCopilot from "./builtin/ralph/copilot";
import ralphOpencode from "./builtin/ralph/opencode";

import drcClaude from "./builtin/deep-research-codebase/claude";
import drcCopilot from "./builtin/deep-research-codebase/copilot";
import drcOpencode from "./builtin/deep-research-codebase/opencode";

export function createBuiltinRegistry() {
  return createRegistry()
    .register(ralphClaude).register(ralphCopilot).register(ralphOpencode)
    .register(drcClaude).register(drcCopilot).register(drcOpencode)
    .register(ocdClaude).register(ocdCopilot).register(ocdOpencode);
}
```

**Determinism aspects:** All workflows are known at build time. Registry is created once at startup in `main()` and immutable thereafter.

#### Pattern: CLI Bootstrap with Orchestrator Transparency

**Where:** `src/cli.ts:343-386`

**What:** Main entry point uses `runCli()` wrapper that detects orchestrator re-entry via env vars and routes to executor, bypassing normal CLI parsing entirely.

```typescript
async function main(): Promise<void> {
  try {
    const { createWorkflowCli } = await import("./sdk/workflow-cli.ts");
    const { runCli } = await import("./sdk/commander.ts");
    const { createBuiltinRegistry } = await import("./sdk/workflows/builtin-registry.ts");

    const builtinCli = createWorkflowCli(createBuiltinRegistry());

    await runCli([builtinCli], async () => {
      const { ensureGlobalAtomicSettings } = await import(
        "./services/config/settings.ts"
      );
      await ensureGlobalAtomicSettings();

      const argv = process.argv.slice(2);
      const isInfoCommand = argv.includes("--version") || argv.includes("--help");

      if (!isInfoCommand) {
        const { autoSyncIfStale } = await import(
          "./services/system/auto-sync.ts"
        );
        await autoSyncIfStale();
      }

      await program.parseAsync();
    });
  } catch (error) {
    console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`);
    process.exit(1);
  }
}
```

**Determinism aspects:** Re-entry check happens before bootstrap. Same entrypoint file is executed twice—once for CLI, once for orchestrator—but `ATOMIC_ORCHESTRATOR_MODE` env var deterministically routes to correct branch.

---

## How Determinism Works

**1. Definition-Time Seal:** Workflows are defined once via `defineWorkflow()...compile()` chain. The result is a `WorkflowDefinition` with frozen inputs and a sealed `run` callback. No mutations after compilation.

**2. Registry Immutability:** Each `.register()` call returns a new registry. Duplicate keys throw at registration. Lookups by `${agent}/${name}` are pure functions.

**3. Orchestrator Re-Entry:** The process is spawned twice—first as CLI, then as orchestrator. Environment variables (`ATOMIC_ORCHESTRATOR_MODE=1`, `ATOMIC_WF_KEY=agent/name`) deterministically signal which path to take. The same user file is re-executed both times; `runCli()` transparently detects re-entry and skips normal bootstrap.

**4. Control Flow as Orchestration:** Workflows use native TypeScript—for loops (bounded iteration), Promise.all (parallel stages), conditionals (termination), variable accumulators (feedthrough). All deterministic and debuggable. No hidden async state machines.

**5. Input Coercion:** Workflow inputs are declared in a schema, validated at compile time, and parsed from CLI flags or environment variables (base64-encoded JSON) at runtime. Coercion rules are deterministic (enum → string, integer → number, rest → string).

**6. Session Isolation:** Each `ctx.stage()` call spawns a named tmux pane running the agent CLI. The pane ID is deterministically derived from the stage name. All session data (transcripts, results) is persisted to `~/.atomic/sessions/{id}/` before the stage callback returns.

**7. Headless vs. Attached:** Stages can be `headless: true` for programmatic results (JSON schema validation, no TUI) or attached (default) for interactive tmux panes. Both produce deterministic outputs for the orchestrator to consume.

The architecture ensures that a given workflow definition + inputs + current codebase state + agent implementation will always produce the same sequence of agent invocations and decisions, making workflows reproducible and debuggable.
