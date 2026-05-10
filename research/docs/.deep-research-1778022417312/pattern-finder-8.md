# Deterministic Workflows in Atomic: Pattern Catalog (Partition 8 — `examples/`)

## Research Question
How does Atomic's deterministic workflows work?

## Overview

Atomic's deterministic workflows are expressed through a fluent builder chain that guarantees reproducibility and stage-based orchestration across three agent providers (Claude, Copilot, OpenCode). The canonical pattern is:

```
defineWorkflow(...) → .for(provider) → .run(async ctx => { ... }) → .compile()
```

Each workflow partitions execution into deterministic **stages**, where each stage is an async function that operates within a bounded context (`ctx.stage`). Stages persist their results (`s.save()`), and downstream stages read prior results through handles (`s.transcript(handle)`), creating an explicit, auditable information flow.

---

## Patterns

#### Pattern: Basic Single-Stage Workflow (Canonical Form)

**Where:** `examples/hello-world/claude/index.ts:16–67`

**What:** The simplest deterministic workflow form: define metadata, pick a provider, run one stage, compile.

```typescript
export default defineWorkflow({
    name: "hello-world",
    description: "A simple single-session hello world workflow (two turns)",
    inputs: [
      {
        name: "greeting",
        type: "string",
        required: true,
        description: "the opening phrase the agent should echo back",
        placeholder: "Hello, world!",
      },
      {
        name: "style",
        type: "enum",
        required: true,
        description: "tone of the response",
        values: ["formal", "casual", "robotic"],
        default: "casual",
      },
      {
        name: "notes",
        type: "text",
        description: "extra guidance for the agent (optional)",
        placeholder: "anything you want to add…",
      },
    ],
  })
  .for("claude")
  .run(async (ctx) => {
    const prompt = buildHelloPrompt(ctx.inputs);
    await ctx.stage(
      { name: "hello", description: "Say hello to the world" },
      {},
      {},
      async (s) => {
        await s.session.query(prompt);
        await s.session.query(
          "Now translate your previous greeting into pig latin. One line only.",
        );
        s.save(s.sessionId);
      },
    );
  })
  .compile();
```

**Key aspects:**
- `defineWorkflow({...})` declares metadata and typed inputs
- `.for("claude")` binds to a specific agent provider
- `.run(async ctx => {...})` begins the deterministic execution context
- `ctx.stage(metadata, arg1, arg2, async s => {...})` defines a bounded execution boundary
- `s.save(s.sessionId)` persists the stage's result to disk for downstream stages
- `.compile()` finalizes the workflow definition for execution

**Variations / call-sites:**
- `examples/hello-world/copilot/index.ts:43–56` — Copilot provider variant
- `examples/hello-world/opencode/index.ts:43–59` — OpenCode provider variant
- `examples/multi-workflow/hello/claude.ts:3–22` — Minimal single-stage variant

---

#### Pattern: Sequential Stage Handoff (save/transcript Chain)

**Where:** `examples/sequential-describe-summarize/claude/index.ts:13–62`

**What:** Two-stage pipeline where stage 1 produces a result, saves it, and returns a handle; stage 2 reads that handle's transcript from disk and processes it.

```typescript
export default defineWorkflow({
  name: "sequential-describe-summarize",
  description: "Describe a topic, then summarize the description",
  inputs: [
    {
      name: "topic",
      type: "string",
      required: true,
      default: "TypeScript",
      description: "what to describe",
    },
  ],
})
  .for("claude")
  .run(async (ctx) => {
    // Stage 1: produce a detailed description
    const describe = await ctx.stage(
      { name: "describe", description: "Produce a detailed paragraph about the topic" },
      {},
      {},
      async (s) => {
        await s.session.query(
          `Write one detailed paragraph (4–6 sentences) explaining ${topic} to an engineering audience.`,
        );
        s.save(s.sessionId);
      },
    );

    // Stage 2: read stage 1's transcript off disk
    await ctx.stage(
      { name: "summarize", description: "Compress the description into two bullets" },
      {},
      {},
      async (s) => {
        const prior = await s.transcript(describe);
        await s.session.query(
          `Read the description in ${prior.path} and condense it into exactly two bullet points.`,
        );
        s.save(s.sessionId);
      },
    );
  })
  .compile();
```

**Key aspects:**
- Stage 1 returns a `SessionHandle` via `ctx.stage(...)`
- Stage 2 reads the prior stage using `const prior = await s.transcript(describe)`
- `s.transcript()` returns `{ path, content }` for efficient file-based reads
- Each stage calls `s.save(s.sessionId)` to persist for downstream consumption

**Variations / call-sites:**
- `examples/parallel-hello-world/claude/index.ts:34–69` — Sequential before parallel stages
- `examples/hil-favorite-color/claude/index.ts:18–59` — Two-stage HIL pattern
- `examples/review-fix-loop/claude/index.ts:45–104` — Extended sequential with loops

---

#### Pattern: Parallel Stages (Promise.all)

**Where:** `examples/parallel-hello-world/claude/index.ts:44–69`

**What:** Invoke multiple stages concurrently using `Promise.all`, all reading the same prior result.

```typescript
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

await ctx.stage(
  { name: "merge", description: "Combine both greetings" },
  {},
  {},
  async (s) => {
    const formalText = await s.transcript(formal);
    const casualText = await s.transcript(casual);
    await s.session.query(
      `Combine these two greetings:\n\n## Formal\n${formalText.content}\n\n## Casual\n${casualText.content}`,
    );
    s.save(s.sessionId);
  },
);
```

**Key aspects:**
- `await Promise.all([...])` awaits multiple `ctx.stage()` calls concurrently
- Each parallel stage reads from a common prior stage
- Parallel stages complete in parallel; execution resumes after all complete
- Downstream merge stage reads all parallel results via their handles

**Variations / call-sites:**
- `examples/headless-test/claude/index.ts:35–75` — Three parallel headless stages
- `examples/headless-test/copilot/index.ts:35–75` — Copilot variant

---

#### Pattern: Looped Stage Chain with Bounded Iterations

**Where:** `examples/review-fix-loop/claude/index.ts:40–104`

**What:** A bounded loop alternating between review and fix stages, exiting early when review verdict is "clean".

```typescript
  .run(async (ctx) => {
    const draft = await ctx.stage(
      { name: "draft", description: "Produce the initial two-paragraph draft" },
      {},
      {},
      async (s) => {
        await s.session.query(
          `Write a two-paragraph argument for ${topic}.`,
        );
        s.save(s.sessionId);
      },
    );

    let lastHandle = draft;

    for (let i = 1; i <= maxIterations; i++) {
      const review = await ctx.stage(
        { name: `review-${i}`, description: "Judge the latest draft" },
        {},
        {},
        async (s) => {
          const prior = await s.transcript(lastHandle);
          const messages = await s.session.query(
            `Read the draft in ${prior.path}. Reply with either "CLEAN" or "NEEDS_FIX: <issue>".`,
          );
          s.save(s.sessionId);

          const verdict = extractAssistantText(messages, 0).toUpperCase();
          return verdict.includes("CLEAN") && !verdict.includes("NEEDS_FIX")
            ? ("clean" as const)
            : ("needs_fix" as const);
        },
      );

      if (review.result === "clean") break;
      if (i === maxIterations) break;

      const fix = await ctx.stage(
        { name: `fix-${i}`, description: "Address the review's top issue" },
        {},
        {},
        async (s) => {
          const priorDraft = await s.transcript(lastHandle);
          const reviewFeedback = await s.transcript(review);
          await s.session.query(
            `Read draft in ${priorDraft.path} and feedback in ${reviewFeedback.path}. Produce revised draft.`,
          );
          s.save(s.sessionId);
        },
      );

      lastHandle = fix;
    }
  })
  .compile();
```

**Key aspects:**
- `for (let i = 1; i <= maxIterations; i++)` bounds the loop
- Each iteration creates new deterministic stages with unique names (`review-1`, `review-2`, etc.)
- Review stage **returns a structured verdict** via its callback's return value
- `review.result` reads the returned verdict to decide whether to break or continue
- `lastHandle` tracks the current draft source (seed or most recent fix)

**Variations / call-sites:**
- Unique to review-fix-loop example; the looped-stage idiom is main determinism feature

---

#### Pattern: Headless Stages with Structured Output

**Where:** `examples/structured-output-demo/claude/index.ts:22–79`

**What:** A headless (non-visible) stage that runs without user interaction and returns structured output validated against a JSON Schema.

```typescript
export default defineWorkflow({
  name: "structured-output-demo",
  description:
    "Ask for structured facts about a language and prove each SDK's structured-output path works",
  inputs: [
    {
      name: "prompt",
      type: "string",
      required: true,
      description: "programming language to describe",
      default: "Python",
    },
  ],
})
  .for("claude")
  .run(async (ctx) => {
    const topic = ctx.inputs.prompt ?? "Python";

    await ctx.stage(
      { name: "describe", headless: true },
      {},
      {},
      async (s) => {
        const result = await s.session.query(buildPrompt(topic), {
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          outputFormat: {
            type: "json_schema",
            schema: LANGUAGE_FACTS_JSON_SCHEMA,
          },
        });
        s.save(s.sessionId);

        const parsed = LanguageFactsSchema.safeParse(
          s.session.lastStructuredOutput,
        );
        const facts: LanguageFacts | null = parsed.success
          ? parsed.data
          : null;

        logFacts("claude", facts);
        if (!facts) throw new Error("Schema validation failed");
      },
    );
  })
  .compile();
```

**Key aspects:**
- `{ name: "describe", headless: true }` — the stage does not appear in TUI; runs in background
- `outputFormat` parameter on `s.session.query()` enforces structured output validation
- `s.session.lastStructuredOutput` retrieves the validated structured object
- Zod schema validation guards against SDK/schema drift
- Headless stages can run in parallel or standalone

**Variations / call-sites:**
- `examples/headless-test/claude/index.ts:36–74` — Three parallel headless stages
- `examples/structured-output-demo/copilot/index.ts` — Copilot variant

---

#### Pattern: Provider-Specific Session APIs with Shared Metadata

**Where:** `examples/hello-world/{claude,copilot,opencode}/index.ts`

**What:** Each provider gets its own implementation file sharing workflow metadata but using provider-specific session APIs.

**Claude** (`examples/hello-world/claude/index.ts:43–56`):
```typescript
  .for("claude")
  .run(async (ctx) => {
    await ctx.stage(
      { name: "hello", description: "Say hello to the world" },
      {},
      {},
      async (s) => {
        await s.session.query(prompt);
        s.save(s.sessionId);
      },
    );
  })
```

**Copilot** (`examples/hello-world/copilot/index.ts:43–56`):
```typescript
  .for("copilot")
  .run(async (ctx) => {
    await ctx.stage(
      { name: "hello", description: "Say hello to the world" },
      {},
      {},
      async (s) => {
        await s.session.send({ prompt });
        s.save(await s.session.getMessages());
      },
    );
  })
```

**OpenCode** (`examples/hello-world/opencode/index.ts:43–59`):
```typescript
  .for("opencode")
  .run(async (ctx) => {
    await ctx.stage(
      { name: "hello", description: "Say hello to the world" },
      {},
      {},
      async (s) => {
        const result = await s.client.session.prompt({
          sessionID: s.session.id,
          parts: [{ type: "text", text: prompt }],
        });
        s.save(result.data!);
      },
    );
  })
```

**Key aspects:**
- Metadata and inputs identical across providers
- Stage structure (names, descriptions) identical
- Only session interaction API differs
- Each provider implementation developed independently
- Deterministic guarantee applies within each provider

**Variations / call-sites:**
- All examples follow multi-file pattern: `{example}/claude/index.ts`, `{example}/copilot/index.ts`, `{example}/opencode/index.ts`
- Each has a corresponding `-worker.ts` file

---

#### Pattern: Workflow Invocation via CLI Wrapper

**Where:** `examples/hello-world/claude-worker.ts:1–4`

**What:** A worker file that imports a compiled workflow and invokes it via the CLI runtime.

```typescript
import { createWorkflowCli } from "@bastani/atomic/workflows";
import workflow from "./claude/index.ts";

await createWorkflowCli(workflow).run();
```

**Key aspects:**
- `createWorkflowCli(workflow)` wraps the compiled workflow for CLI execution
- `.run()` starts the workflow runtime, which handles:
  - Parsing CLI arguments (inputs, --flag overrides)
  - Spawning agent CLIs (Claude, Copilot, OpenCode)
  - Managing session lifecycle and transcripts
  - Publishing stage/session events
  - Recording deterministic audit trail
- Worker files are entry points for `bun run`, `atomic workflow`, etc.

**Variations / call-sites:**
- `examples/hello-world/copilot-worker.ts` — Copilot workflow invocation
- `examples/hello-world/opencode-worker.ts` — OpenCode workflow invocation
- `examples/review-fix-loop/claude-worker.ts` — Worker for looped workflow

---

#### Pattern: Structured Inputs with Type-Safe Defaults

**Where:** `examples/hello-world/claude/index.ts:19–41`

**What:** Workflows declare typed inputs populated from CLI flags or picker UI, with type safety and defaults.

```typescript
export default defineWorkflow({
    name: "hello-world",
    description: "A simple single-session hello world workflow (two turns)",
    inputs: [
      {
        name: "greeting",
        type: "string",
        required: true,
        description: "the opening phrase the agent should echo back",
        placeholder: "Hello, world!",
      },
      {
        name: "style",
        type: "enum",
        required: true,
        description: "tone of the response",
        values: ["formal", "casual", "robotic"],
        default: "casual",
      },
      {
        name: "notes",
        type: "text",
        description: "extra guidance for the agent (optional)",
        placeholder: "anything you want to add…",
      },
    ],
  })
  .for("claude")
  .run(async (ctx) => {
    const prompt = buildHelloPrompt(ctx.inputs);
  })
```

**Key aspects:**
- `inputs: [...]` declares all workflow parameters
- Each input has `name`, `type` (string, enum, text, integer), and optional `required`, `default`, `description`, `placeholder`, `values`
- `ctx.inputs` populated from CLI flags or picker
- Defaults applied if not provided
- Enums enforce closed sets
- Type information used by CLI parsers and UI pickers

**Variations / call-sites:**
- `examples/review-fix-loop/claude/index.ts:24–36` — Integer input (`max_iterations`)
- `examples/parallel-hello-world/claude/index.ts:14–28` — Multiple enum and string inputs

---

## Synthesis: How Determinism Works

Atomic's deterministic workflows are built on three pillars:

1. **Declarative Stage Definition**: Each workflow is a sequence of stages defined in TypeScript. Stages have names, descriptions, and bounded async bodies. The `.for().run().compile()` chain ensures the definition is complete before execution.

2. **Explicit Information Flow via Handles**: Stages don't share mutable state. When a stage completes, it calls `s.save(...)` to persist its result to disk. Downstream stages read priors via `s.transcript(handle)`, creating an auditable, reproducible chain. This prevents hidden dependencies and race conditions.

3. **Provider Abstraction with Deterministic Scheduling**: Each provider (Claude, Copilot, OpenCode) has its own session API, but the stage orchestration is provider-agnostic. The runtime ensures stages execute in order (with parallel exception), that each stage's transcript is recorded, and that input/output handoffs happen deterministically.

The combination creates workflows that are:
- **Reproducible**: Given the same inputs, a workflow always follows the same stage sequence.
- **Auditable**: Every stage transition, result, and transcript is persisted and queryable.
- **Composable**: Stages can be parallel, sequential, or looped, and information flow remains explicit.
- **Provider-Agnostic**: The same workflow structure works across multiple agent CLIs.
