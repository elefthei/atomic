# How Atomic's Deterministic Workflows Work

(no external research applicable)

<justification>
The workflow API — `defineWorkflow`, `ctx.stage`, `s.save`, `s.transcript`, `s.session.query`, `Promise.all`, and the `headless` / `result` handoff — is fully described by reading the 48 example files in `examples/`. The Zod and `json_schema` usage in `examples/structured-output-demo/helpers/schema.ts` is self-documenting (the comments explain the `target: "openapi-3.0"` quirk in-file). No SDK reference page adds information beyond what the examples already contain.
</justification>

---

## Summary

Atomic workflows are deterministic TypeScript programs. Nondeterminism lives inside individual agent calls (`s.session.query`, `s.client.session.prompt`, `s.session.send`); everything around those calls — sequencing, branching, looping, parallelism, and data handoff — is plain TypeScript. The runtime provides three primitives: `defineWorkflow` to declare the workflow, `ctx.stage` to run a named agent session, and `s.save` / `s.transcript` to persist and retrieve each stage's output.

---

## Detailed Findings

### 1. Workflow Declaration — `defineWorkflow`

**File**: `examples/hello-world/claude/index.ts` (line 16), `examples/sequential-describe-summarize/claude/index.ts` (line 13)

Every workflow is created with `defineWorkflow({ name, description, inputs })`. The builder is then chained:

```
defineWorkflow({ … })
  .for("claude")          // bind to a provider
  .run(async (ctx) => {   // define the orchestration function
    …
  })
  .compile();             // produce a workflow object for createWorkflowCli
```

`ctx.inputs` is typed as `Record<string, string>` and populated from CLI flags, the interactive picker, or direct API callers. Inputs are declared with `name`, `type` (`"string"`, `"enum"`, `"text"`, `"integer"`), `required`, `default`, `placeholder`, and `values` (for enums). (`examples/hello-world/claude/index.ts` lines 19–41)

### 2. The Stage Primitive — `ctx.stage`

**File**: `examples/sequential-describe-summarize/claude/index.ts` (lines 33–60)

`ctx.stage` is the atomic unit of work. Its signature (as inferred from usage) is:

```ts
ctx.stage(
  stageOptions,     // { name, description?, headless? }
  {},               // reserved / provider-specific session options
  {},               // provider-specific extras (tools, customAgents, title)
  async (s) => {    // callback that runs inside the stage
    …
    return optionalResult;
  }
)
```

`ctx.stage` returns a `Promise<SessionHandle>`. Awaiting it means the stage completes before the next line of TypeScript runs. The callback receives a stage context `s` that exposes:

- `s.session` — the live agent session (provider-specific API)
- `s.sessionId` — stable identifier for the session
- `s.save(…)` — persists the session's output to disk
- `s.transcript(handle)` — reads a prior stage's persisted output from disk
- `s.client` (OpenCode only) — raw OpenCode SDK client

The callback's return value (if any) becomes `handle.result`. (`examples/review-fix-loop/claude/index.ts` lines 67–79)

### 3. Sequential Execution — Await Chaining

**File**: `examples/sequential-describe-summarize/claude/index.ts`

The simplest pattern is sequential: await one stage, use its handle to seed the next.

```ts
const describe = await ctx.stage({ name: "describe" }, {}, {}, async (s) => {
  await s.session.query(`Write one detailed paragraph about ${topic}…`);
  s.save(s.sessionId);
});

await ctx.stage({ name: "summarize" }, {}, {}, async (s) => {
  const prior = await s.transcript(describe);   // reads describe's output file
  await s.session.query(`Read the description in ${prior.path} and condense it…`);
  s.save(s.sessionId);
});
```

`s.transcript(handle)` returns `{ path, content }`. Passing `prior.path` into the prompt lets the agent open the file via its Read tool, keeping the prompt itself short. Passing `prior.content` inlines the text directly — used when the content is short or the provider's session has no file-access tools.

### 4. Parallel Execution — `Promise.all`

**File**: `examples/parallel-hello-world/claude/index.ts` (lines 44–69), `examples/headless-test/claude/index.ts` (lines 35–75)

Parallel stages are plain `Promise.all`. The runtime starts all stages in the array concurrently; each gets its own agent session.

```ts
const greet = await ctx.stage({ name: "greet" }, {}, {}, async (s) => { … });

const [formal, casual] = await Promise.all([
  ctx.stage({ name: "formal" }, {}, {}, async (s) => {
    const prior = await s.transcript(greet);
    await s.session.query(`Read ${prior.path} and rewrite it as a formal greeting.`);
    s.save(s.sessionId);
  }),
  ctx.stage({ name: "casual" }, {}, {}, async (s) => {
    const prior = await s.transcript(greet);
    await s.session.query(`Read ${prior.path} and rewrite it as a casual greeting.`);
    s.save(s.sessionId);
  }),
]);

await ctx.stage({ name: "merge" }, {}, {}, async (s) => {
  const formalText = await s.transcript(formal);
  const casualText = await s.transcript(casual);
  await s.session.query(`Combine…\n${formalText.content}\n${casualText.content}`);
  s.save(s.sessionId);
});
```

This is the fan-out/fan-in (map-reduce) pattern. The merge stage reads both parallel outputs by handle.

### 5. Loop with Early Exit — `for` + `handle.result`

**File**: `examples/review-fix-loop/claude/index.ts`

Because the orchestrator is plain TypeScript, loops are native `for` loops. The stage callback can return a typed value; `handle.result` carries it into the outer scope, making it possible to branch on LLM output without text parsing in the outer loop body.

```ts
let lastHandle = draft;

for (let i = 1; i <= maxIterations; i++) {
  const review = await ctx.stage({ name: `review-${i}` }, {}, {}, async (s) => {
    const prior = await s.transcript(lastHandle);
    const messages = await s.session.query(`Read ${prior.path}. Reply "CLEAN" or "NEEDS_FIX: …"`);
    s.save(s.sessionId);
    const verdict = extractAssistantText(messages, 0).toUpperCase();
    return verdict.includes("CLEAN") && !verdict.includes("NEEDS_FIX")
      ? ("clean" as const)
      : ("needs_fix" as const);
  });

  if (review.result === "clean") break;
  if (i === maxIterations) break;

  const fix = await ctx.stage({ name: `fix-${i}` }, {}, {}, async (s) => { … });
  lastHandle = fix;
}
```

The loop variable `lastHandle` is updated after each fix, so the next review always reads the most recent draft. `extractAssistantText(messages, 0)` (from `@bastani/atomic/workflows`) extracts the first assistant turn from the SDK's message array.

### 6. Headless Stages

**File**: `examples/headless-test/claude/index.ts`, `examples/hil-favorite-color-headless/claude/index.ts`

Passing `headless: true` in the stage options runs the agent without a TUI pane. The runtime injects `permissionMode: "bypassPermissions"` and blocks tools that require a human (e.g. `AskUserQuestion` is auto-denied). Headless stages are used for background fan-out branches that do not need user interaction.

```ts
ctx.stage({ name: "pros", headless: true }, {}, {}, async (s) => {
  const result = await s.session.query(
    `List 3 pros:\n\n${seed.result}`,
    { permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true },
  );
  s.save(s.sessionId);
  return extractAssistantText(result, 0);
})
```

`handle.result` here carries the extracted assistant text inline, which the merge stage uses directly rather than going through `s.transcript`.

### 7. Structured Output — Zod + `json_schema`

**Files**: `examples/structured-output-demo/helpers/schema.ts`, `examples/structured-output-demo/claude/index.ts`, `examples/structured-output-demo/opencode/index.ts`, `examples/structured-output-demo/copilot/index.ts`

Structured output is gated by provider. The shared schema is declared once in Zod (`LanguageFactsSchema`), and a JSON Schema is derived with `z.toJSONSchema(LanguageFactsSchema, { target: "openapi-3.0" })`. The `target: "openapi-3.0"` option is required because the Claude Agent SDK silently drops structured output when a `$schema` draft URL is present in the JSON Schema object (which Zod's default serialization adds).

- **Claude**: Pass `outputFormat: { type: "json_schema", schema: LANGUAGE_FACTS_JSON_SCHEMA }` in `s.session.query()` options. Read the result from `s.session.lastStructuredOutput`. Validate with `LanguageFactsSchema.safeParse(…)`. (`claude/index.ts` lines 45–65)
- **OpenCode**: Pass `format: { type: "json_schema", schema: LANGUAGE_FACTS_JSON_SCHEMA }` in `s.client.session.prompt()`. Read the result from `result.data.info.structured`. (`opencode/index.ts` lines 45–68)
- **Copilot**: No native `json_schema` response format. Use `defineTool("submit_facts", { parameters: LanguageFactsSchema, handler })` to force the agent to call a schema-validated tool. The handler receives the already-validated `data` object. (`copilot/index.ts` lines 46–54)

The Zod `safeParse` step after retrieving `lastStructuredOutput` / `structured` is intentional: it catches schema drift between the JSON Schema the SDK validated against and the Zod shape the workflow types consume.

### 8. Multi-Workflow CLI — `createWorkflowCli` and `createRegistry`

**File**: `examples/multi-workflow/cli.ts`

Multiple compiled workflow objects can be passed as an array to `createWorkflowCli([wf1, wf2])`. The CLI exposes `-n/--name` for dispatch and builds the union of all workflows' input flags. The registry variant (`createRegistry().register(wf1).register(wf2)`) is equivalent and preferred when workflows are added programmatically.

### 9. Provider-Specific Session APIs

The stage callback's `s` object exposes a different session API per provider, but the orchestration skeleton (`ctx.stage`, `s.save`, `s.transcript`) is identical across all three.

| Provider | Send a prompt | Save output | Notes |
|---|---|---|---|
| Claude | `s.session.query(prompt, opts?)` | `s.save(s.sessionId)` | Returns SDK message array; `extractAssistantText(result, 0)` extracts text |
| OpenCode | `s.client.session.prompt({ sessionID, parts, format? })` | `s.save(result.data!)` | `result.data` is the AssistantMessage object |
| Copilot | `s.session.send({ prompt })` | `s.save(await s.session.getMessages())` | Tools registered via `defineTool`; custom subagents via `customAgents` option |

---

## Gaps or Limitations

The internal implementation of `ctx.stage`, `s.save`, `s.transcript`, and `SessionHandle` is not in `examples/` — those live in `src/`. The examples fully describe the external API contract but not the runtime machinery (session lifecycle, TUI pane management, stop-hook wiring, or transcript file format).
