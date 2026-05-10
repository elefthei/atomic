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

