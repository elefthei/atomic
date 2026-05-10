# Partition 8 of 16 — Findings

## Scope
`examples/` (48 files, 1,998 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Deterministic Workflows in Atomic: File Location Report

## Implementation

- `examples/hello-world/claude/index.ts` — Basic workflow demonstrating `defineWorkflow().for("claude").run(...).compile()` pipeline
- `examples/hello-world/copilot/index.ts` — Copilot provider variant of hello-world workflow
- `examples/hello-world/opencode/index.ts` — OpenCode provider variant of hello-world workflow
- `examples/multi-workflow/hello/claude.ts` — Workflow definition for multi-workflow CLI registry
- `examples/multi-workflow/goodbye/claude.ts` — Second workflow in registry for multi-workflow composition
- `examples/multi-workflow/cli.ts` — `createWorkflowCli()` entry point showing registry pattern for deterministic dispatch
- `examples/sequential-describe-summarize/claude/index.ts` — Sequential stage handoff pattern: `ctx.stage()` → `s.save()` → `s.transcript(handle)` chain
- `examples/parallel-hello-world/claude/index.ts` — Parallel execution pattern using `Promise.all([ctx.stage(...), ctx.stage(...)])` with shared parent stage
- `examples/parallel-hello-world/opencode/index.ts` — OpenCode implementation of parallel stage pattern
- `examples/review-fix-loop/claude/index.ts` — Loop-driven determinism: `ctx.stage()` returning structured `result` field for verdict-driven iteration
- `examples/hil-favorite-color/claude/index.ts` — Human-in-the-loop workflow demonstrating transcript passing via `s.transcript(handle)` between stages
- `examples/hil-favorite-color-headless/claude/index.ts` — Headless variant of HIL workflow (no TUI interaction during background stage)
- `examples/headless-test/opencode/index.ts` — Demonstrates headless stage metadata, `Promise.all()` parallel execution, and result passing via `handle.result`
- `examples/structured-output-demo/claude/index.ts` — Schema-driven determinism: `outputFormat: { type: "json_schema", schema }` in `s.session.query()` with `s.session.lastStructuredOutput` validation
- `examples/structured-output-demo/opencode/index.ts` — OpenCode structured output variant using `format: { type: "json_schema" }` and `result.data.info.structured`
- `examples/structured-output-demo/copilot/index.ts` — Copilot structured output via tool definition with validated parameters
- `examples/reviewer-tool-test/copilot/index.ts` — Copilot-specific workflow with tool-based structured outputs
- `examples/commander-embed/claude/index.ts` — Single workflow definition ready for embedding under Commander framework
- `examples/structured-output-demo/helpers/schema.ts` — Shared Zod schema with OpenAPI-3.0 JSON Schema export; demonstrates provider-agnostic schema approach

## Tests

- `examples/hello-world/claude-worker.ts` — Worker harness executing workflow (calls `createWorkflowCli().run()`)
- `examples/hello-world/copilot-worker.ts` — Copilot worker harness entry point
- `examples/hello-world/opencode-worker.ts` — OpenCode worker harness entry point
- `examples/headless-test/claude-worker.ts` — Worker for headless-test example
- `examples/headless-test/copilot-worker.ts` — Copilot headless-test worker
- `examples/headless-test/opencode-worker.ts` — OpenCode headless-test worker
- `examples/hil-favorite-color/claude-worker.ts` — HIL workflow worker
- `examples/hil-favorite-color/copilot-worker.ts` — HIL copilot worker
- `examples/hil-favorite-color/opencode-worker.ts` — HIL opencode worker
- `examples/hil-favorite-color-headless/claude-worker.ts` — Headless HIL worker for Claude
- `examples/hil-favorite-color-headless/copilot-worker.ts` — Headless HIL worker for Copilot
- `examples/hil-favorite-color-headless/opencode-worker.ts` — Headless HIL worker for OpenCode
- `examples/parallel-hello-world/claude-worker.ts` — Parallel workflow worker for Claude
- `examples/parallel-hello-world/copilot-worker.ts` — Parallel workflow worker for Copilot
- `examples/parallel-hello-world/opencode-worker.ts` — Parallel workflow worker for OpenCode
- `examples/review-fix-loop/claude-worker.ts` — Review/fix loop worker
- `examples/sequential-describe-summarize/claude-worker.ts` — Sequential workflow worker
- `examples/structured-output-demo/claude-worker.ts` — Structured output demo worker for Claude
- `examples/structured-output-demo/copilot-worker.ts` — Structured output demo worker for Copilot
- `examples/structured-output-demo/opencode-worker.ts` — Structured output demo worker for OpenCode

## Configuration

- `examples/tsconfig.json` — Path mapping for `@bastani/atomic/*` imports to source SDK at `../src/sdk/`

## Notable Clusters

### Workflow Definition Pattern
- `examples/hello-world/` (6 files) — Foundation example across all three providers (claude, copilot, opencode) plus worker harnesses
- `examples/multi-workflow/` (3 files) — Registry and CLI composition showing how `defineWorkflow` instances compose into `createWorkflowCli()`
- `examples/parallel-hello-world/` (6 files) — Demonstrates deterministic parallel execution via `Promise.all([ctx.stage(), ctx.stage()])` across providers
- `examples/sequential-describe-summarize/` (2 files) — Canonical sequential handoff: stage 1 calls `s.save()`, stage 2 reads via `s.transcript(handle)`
- `examples/structured-output-demo/` (7 files) — Schema-driven outputs across all three providers; helper shows provider-agnostic Zod→JSON Schema approach

### Provider Patterns
- Claude implementations use `s.session.query(prompt, { outputFormat })` and `s.session.lastStructuredOutput`
- OpenCode implementations use `s.client.session.prompt({ parts, format })` and `result.data.info.structured`
- Copilot implementations use `s.session.send({ prompt })` and tool-based structured outputs with `defineTool`

### Determinism Mechanisms
All workflows follow the canonical `define → run → compile` chain:
1. `defineWorkflow({...})` — Static metadata (name, inputs, description)
2. `.for("provider")` — Provider selection
3. `.run(async (ctx) => { ... })` — Async stage body with `ctx.stage()` calls
4. `.compile()` — Final compilation gate ensuring deterministic composition

Stage bodies are deterministic via:
- **Stage sequencing**: `ctx.stage()` returns `SessionHandle` with `.result` field for verdict-driven loops
- **Data handoff**: `s.save(data)` persists session state; `s.transcript(handle)` retrieves it deterministically
- **Structured outputs**: Schema validation at SDK boundary ensures reproducible object shape
- **Parallel composition**: `Promise.all()` coordinates parallel stages; parent stage reads child `handle.result` or `handle.result` from headless children
- **Input immutability**: `ctx.inputs` is read-only dictionary populated from CLI flags or picker—never mutated during execution

### Human-in-the-Loop (HIL)
- `examples/hil-favorite-color/` (6 files) — HIL workflow allowing agent to call `AskUserQuestion` tool mid-execution
- `examples/hil-favorite-color-headless/` (6 files) — Same workflow with headless background stages (no TUI during those stages)

### Deterministic Deployment
- `examples/commander-embed/` (2 files) — Shows embedding atomic workflows under Commander CLI via `toCommand(cli, "greet")` and `runCli()` dispatcher that transparently handles orchestrator re-entry (ATOMIC_ORCHESTRATOR_MODE=1)

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
### Files Analysed

1. `examples/hello-world/claude/index.ts`
2. `examples/hello-world/copilot/index.ts`
3. `examples/hello-world/opencode/index.ts`
4. `examples/sequential-describe-summarize/claude/index.ts`
5. `examples/parallel-hello-world/claude/index.ts`
6. `examples/parallel-hello-world/opencode/index.ts`
7. `examples/review-fix-loop/claude/index.ts`
8. `examples/hil-favorite-color/claude/index.ts`
9. `examples/structured-output-demo/claude/index.ts`
10. `examples/structured-output-demo/helpers/schema.ts`
11. `examples/headless-test/opencode/index.ts`
12. `examples/multi-workflow/cli.ts`
13. `examples/multi-workflow/hello/claude.ts`
14. `examples/multi-workflow/goodbye/claude.ts`

---

### Per-File Notes

#### `examples/hello-world/claude/index.ts`

- **Role:** Canonical single-agent hello-world. Demonstrates the minimal end-to-end pattern: `defineWorkflow → .for("claude") → .run() → .compile()`.
- **Key symbols:**
  - `defineWorkflow` called at line 16, accepting a metadata object with `name`, `description`, and `inputs` array.
  - `.for("claude")` at line 43 binds the workflow to the Claude agent.
  - `.run(async (ctx) => {...})` at line 44 is where execution logic lives; `ctx` carries `ctx.inputs`.
  - `ctx.stage(metadata, {}, {}, async (s) => {...})` at line 46 declares a named execution unit ("hello").
  - `s.session.query(prompt)` at line 53 sends the first turn to the running Claude session.
  - A second `s.session.query(...)` at line 60 issues a follow-up turn in the same session, demonstrating sequential multi-turn within a single stage.
  - `s.save(s.sessionId)` at line 63 persists the session handle to disk so downstream stages can refer to it via `s.transcript()`.
  - `.compile()` at line 67 finalises the workflow object.
- **Control flow:** `buildHelloPrompt(ctx.inputs)` constructs the prompt → single `ctx.stage` block → two sequential `s.session.query()` calls → `s.save`.
- **Data flow:** `ctx.inputs` (string/enum/text fields populated by CLI flags or interactive picker) → `buildHelloPrompt` → query strings → Claude session → `s.save(s.sessionId)` writes transcript handle.
- **Dependencies:** `@bastani/atomic/workflows` (provides `defineWorkflow`).

---

#### `examples/hello-world/copilot/index.ts`

- **Role:** Same hello-world structure, targeting the Copilot agent. Shows provider-specific session API surface.
- **Key symbols:**
  - `.for("copilot")` at line 43.
  - `s.session.send({ prompt })` at line 51 — Copilot uses a `send` call rather than `query`.
  - `s.save(await s.session.getMessages())` at line 52 — persists the messages array (not just the session ID) as the transcript artifact.
- **Control flow:** Single stage, single send, save message list.
- **Data flow:** `buildHelloPrompt(ctx.inputs)` → `s.session.send({ prompt })` → `s.session.getMessages()` → `s.save(...)`.
- **Dependencies:** `@bastani/atomic/workflows`.

---

#### `examples/hello-world/opencode/index.ts`

- **Role:** Same hello-world, targeting the OpenCode agent. Shows the OpenCode SDK-native API.
- **Key symbols:**
  - `.for("opencode")` at line 43.
  - Third arg to `ctx.stage` is `{ title: "hello" }` at line 49 — OpenCode stages receive a title in their metadata object.
  - `s.client.session.prompt({ sessionID: s.session.id, parts: [...] })` at line 51–54 — OpenCode uses the SDK-level `session.prompt()` with a `parts` array containing typed objects (`{ type: "text", text: ... }`).
  - `s.save(result.data!)` at line 55 — persists the raw SDK response data object.
- **Control flow:** Single stage, single `s.client.session.prompt()`, save result.
- **Data flow:** `buildHelloPrompt(ctx.inputs)` → `parts` array → `s.client.session.prompt()` → `result.data` → `s.save`.
- **Dependencies:** `@bastani/atomic/workflows`.

---

#### `examples/sequential-describe-summarize/claude/index.ts`

- **Role:** Canonical two-stage sequential handoff. Documents the `s.save() / s.transcript()` pattern as the primary inter-stage data handoff mechanism.
- **Key symbols:**
  - Stage 1 `describe` at line 33: `await ctx.stage(...)` returns a `SessionHandle` assigned to `const describe`.
  - `s.save(s.sessionId)` at line 41 writes the transcript artifact.
  - Stage 2 `summarize` at line 49: `const prior = await s.transcript(describe)` at line 54 reads the stage-1 artifact from disk.
  - `prior.path` at line 56 is passed directly into the prompt so Claude can open the file using its Read tool — transcript content is referenced by file path rather than inlined.
  - `prior.content` is also available but not used here; `prior.path` is used instead for efficiency.
- **Control flow:** `ctx.stage("describe")` resolves → `ctx.stage("summarize")` starts → reads prior via `s.transcript(handle)` → queries Claude with file path reference → saves.
- **Data flow:** Stage 1 session ID → `s.save` writes to disk → `s.transcript(describe)` returns `{ path, content }` → `prior.path` embedded in prompt string → Stage 2 query.
- **Dependencies:** `@bastani/atomic/workflows`.

---

#### `examples/parallel-hello-world/claude/index.ts`

- **Role:** Demonstrates fan-out (parallel stages) and fan-in (merge stage) using `Promise.all`. Shows that `ctx.stage` returns a promise that can be combined with standard JavaScript concurrency primitives.
- **Key symbols:**
  - `const greet = await ctx.stage(...)` at line 34 — seed stage, runs first sequentially.
  - `const [formal, casual] = await Promise.all([ctx.stage(...), ctx.stage(...)])` at lines 44–69 — two stages dispatched concurrently.
  - Each parallel stage reads `await s.transcript(greet)` and uses `prior.path` in its query.
  - `const formalText = await s.transcript(formal)` at line 76 and `const casualText = await s.transcript(casual)` at line 77 — merge stage reads both handles.
  - Merge stage inlines `formalText.content` and `casualText.content` directly into the prompt string (line 79) — contrast with `prior.path` reference in sequential example.
- **Control flow:** Sequential seed → `Promise.all([formal, casual])` fan-out → await resolution → merge stage with both transcripts.
- **Data flow:** Seed transcript (`prior.path`) → two parallel queries → two `SessionHandle`s → merge stage uses `.content` of both → final query → `s.save`.
- **Dependencies:** `@bastani/atomic/workflows`.

---

#### `examples/parallel-hello-world/opencode/index.ts`

- **Role:** Same fan-out/fan-in pattern for OpenCode, showing that the parallelism model is provider-agnostic.
- **Key symbols:**
  - `const greet = await ctx.stage(...)` at line 34.
  - `const [formal, casual] = await Promise.all([...])` at line 47.
  - Each parallel OpenCode stage uses `s.client.session.prompt(...)` with `parts` and reads `prior.content` via `s.transcript(greet)` at line 53.
  - Merge stage reads both transcripts at lines 91–92 and inlines `.content` into the prompt.
  - `s.save(result.data!)` used throughout — OpenCode saves raw SDK result objects.
- **Control flow:** Seed → parallel fan-out via `Promise.all` → merge.
- **Data flow:** `s.transcript(handle).content` strings inlined into merge prompt.
- **Dependencies:** `@bastani/atomic/workflows`.

---

#### `examples/review-fix-loop/claude/index.ts`

- **Role:** Loop-driven workflow demonstrating verdict-controlled iteration. The `ctx.stage` callback can return a typed value that becomes `handle.result`, enabling the surrounding TypeScript to branch on LLM output.
- **Key symbols:**
  - `extractAssistantText` imported from `@bastani/atomic/workflows` at line 18 — utility for extracting assistant turn text from query result.
  - Seed stage at line 45 produces `const draft = await ctx.stage(...)`.
  - `let lastHandle = draft` at line 60 — mutable pointer tracks current valid draft.
  - `for (let i = 1; i <= maxIterations; i++)` at line 62 — bounded iteration.
  - Review stage callback at lines 67–78: calls `extractAssistantText(messages, 0)` at line 74, returns `"clean" as const` or `"needs_fix" as const` — the returned value becomes `review.result`.
  - `if (review.result === "clean") break` at line 81 — early exit on clean verdict.
  - `if (i === maxIterations) break` at line 85 — skip fix on final iteration.
  - Fix stage at lines 87–99 reads both `lastHandle` (current draft) and `review` (feedback) via `s.transcript()`.
  - `lastHandle = fix` at line 101 — pointer advances to latest fix.
  - `s.session.query(...)` returns the raw messages array; the callback returns a typed value that the runtime stores as `handle.result`.
- **Control flow:** Seed → for-loop: review → conditional fix → advance lastHandle → repeat until clean or max iterations.
- **Data flow:** Draft transcript path → review query → `extractAssistantText` → verdict string → `review.result` → branch → fix reads draft path + review path → revised draft.
- **Dependencies:** `@bastani/atomic/workflows` (both `defineWorkflow` and `extractAssistantText`).

---

#### `examples/hil-favorite-color/claude/index.ts`

- **Role:** Human-in-the-loop (HIL) example. Stage 1 instructs Claude to invoke `AskUserQuestion` tool; the runtime detects this and exposes it to the user. Stage 2 reads the full transcript (including the user's answer) via `s.transcript()`.
- **Key symbols:**
  - Stage 1 `ask-color` at line 18: query at line 27 instructs Claude to use `AskUserQuestion` tool exactly once.
  - `s.save(s.sessionId)` at line 35 captures the full session transcript including both the question and the user's typed answer.
  - Stage 2 `describe-color` at line 39: `const prior = await s.transcript(askColor)` at line 47 reads the saved artifact.
  - `prior.path` at line 49 passed into stage 2's query so Claude reads the transcript file to learn the user's answer.
- **Control flow:** Stage 1 triggers HIL pause → user answers → session resumes → `s.save` → stage 2 reads transcript path → describes the color.
- **Data flow:** User-typed color answer is embedded in stage-1 transcript on disk → `prior.path` reference in stage-2 prompt → stage-2 assistant output.
- **Dependencies:** `@bastani/atomic/workflows`.

---

#### `examples/structured-output-demo/claude/index.ts`

- **Role:** Demonstrates the structured/typed output path via the Claude Agent SDK's `outputFormat` option. Shows how a stage can operate headlessly and validate SDK output against a Zod schema.
- **Key symbols:**
  - Stage metadata includes `headless: true` at line 41 — stage runs without a visible TUI pane.
  - `s.session.query(buildPrompt(topic), { permissionMode, allowDangerouslySkipPermissions, outputFormat: { type: "json_schema", schema: LANGUAGE_FACTS_JSON_SCHEMA } })` at lines 45–52.
  - `s.session.lastStructuredOutput` at line 60 — runtime exposes the structured object returned by the SDK.
  - `LanguageFactsSchema.safeParse(s.session.lastStructuredOutput)` at line 59–61 — Zod validation; discrepancy between JSON Schema and Zod shape is caught explicitly.
  - `logFacts("claude", facts)` at line 66 — logs validated object to stdout.
  - `throw new Error(...)` at line 72 if validation fails — hard failure for schema drift.
- **Control flow:** Single headless stage → query with `outputFormat` → read `lastStructuredOutput` → safeParse → log or throw.
- **Data flow:** `LANGUAGE_FACTS_JSON_SCHEMA` passed to SDK → SDK returns structured JSON → `lastStructuredOutput` → Zod safeParse → `LanguageFacts` typed object.
- **Dependencies:** `@bastani/atomic/workflows`, `../helpers/schema.ts` (Zod schema, JSON schema, prompt builder, logger).

---

#### `examples/structured-output-demo/helpers/schema.ts`

- **Role:** Shared schema module consumed by all three provider variants of the structured-output demo. Single source of truth for the Zod shape and JSON Schema derivation.
- **Key symbols:**
  - `LanguageFactsSchema` at line 21 — `z.object(...)` with five typed fields: `name`, `year_created`, `paradigms`, `statically_typed`, `summary`.
  - `type LanguageFacts = z.infer<typeof LanguageFactsSchema>` at line 38 — TypeScript type derived from schema.
  - `LANGUAGE_FACTS_JSON_SCHEMA = z.toJSONSchema(LanguageFactsSchema, { target: "openapi-3.0" })` at line 49 — derives JSON Schema with `target: "openapi-3.0"` to omit `$schema` draft URL that causes the Claude Agent SDK to silently drop structured output.
  - `buildPrompt(topic: string)` at line 53 — returns the prompt string instructing the model to fill every field.
  - `logFacts(agent, facts)` at line 65 — provider-agnostic console logger for validated output.
- **Control flow:** Imported by each provider's index.ts; no independent execution.
- **Data flow:** `z.object` → `z.toJSONSchema` → passed into SDK `outputFormat` → SDK validates model response against schema → output returned to workflow.
- **Dependencies:** `zod`.

---

#### `examples/headless-test/opencode/index.ts`

- **Role:** Stress-tests headless stages and verifies the orchestrator timer stays alive across a mix of visible and headless stages. Pattern: visible seed → three parallel headless → visible merge → final headless.
- **Key symbols:**
  - Seed stage at line 31: visible (no `headless` flag), uses `s.client.session.prompt(...)`, returns `extractResponseText(result.data!.parts)` — the return value becomes `seed.result`.
  - Three parallel headless stages at line 51: `Promise.all([pros, cons, uses])`, each with `headless: true`, each consuming `seed.result` directly (passed by value into the prompt string, not via `s.transcript`).
  - `prosHandle.result`, `consHandle.result`, `usesHandle.result` at lines 117–119 — values passed directly into merge prompt.
  - Final headless verdict stage at line 134: consumes `mergeHandle.result`.
  - `s.save(result.data!)` throughout — saves OpenCode SDK response data.
  - `extractResponseText` local helper at line 4: filters `parts` array for `type === "text"` and joins.
- **Control flow:** Seed → `Promise.all` three headless → merge (visible) → verdict (headless).
- **Data flow:** `seed.result` (string) → inline into parallel prompts → `prosHandle.result`, `consHandle.result`, `usesHandle.result` → inline into merge prompt → `mergeHandle.result` → verdict prompt.
- **Dependencies:** `@bastani/atomic/workflows`.

---

#### `examples/multi-workflow/cli.ts`

- **Role:** Multi-workflow entrypoint demonstrating `createWorkflowCli` registry pattern. Shows how multiple compiled workflow objects are composed under a single CLI.
- **Key symbols:**
  - `import { createWorkflowCli } from "@bastani/atomic/workflows"` at line 25.
  - `import hello from "./hello/claude.ts"` at line 26 and `import goodbye from "./goodbye/claude.ts"` at line 27 — both are the objects returned by `.compile()`.
  - `createWorkflowCli([hello, goodbye]).run()` at line 29 — accepts an array of compiled workflows; dispatches via `-n/--name` flag; opens interactive picker in TTY if `-n` is omitted.
  - Comment at line 18 documents the alternative registry API: `createRegistry().register(hello).register(goodbye)` — produces identical CLI.
- **Control flow:** `createWorkflowCli([...])` constructs the CLI → `.run()` parses argv → dispatches to named workflow → resolves inputs → executes.
- **Data flow:** CLI argv (`-n hello`, `-a claude`, `--who=Alex`) → parsed flags → `ctx.inputs` → workflow `.run()` function.
- **Dependencies:** `@bastani/atomic/workflows`, `./hello/claude.ts`, `./goodbye/claude.ts`.

---

### Cross-Cutting Synthesis

Atomic's deterministic workflows are built on a five-part construction chain: `defineWorkflow(metadata)` declares the workflow's name, description, and typed input schema; `.for(agent)` binds it to a specific provider (claude/copilot/opencode); `.run(async (ctx) => {...})` receives the execution context; `.compile()` seals the object.

Inside `.run`, the unit of work is `ctx.stage(stageMetadata, {}, providerOpts, async (s) => {...})`. Each call to `ctx.stage` is an awaitable promise that resolves to a `SessionHandle`. Sequencing is enforced by `await`; parallelism is achieved via standard `Promise.all([ctx.stage(...), ctx.stage(...)])`. The ordering guarantee is entirely a JavaScript control-flow property — the runtime does not impose any scheduler.

Cross-stage data handoff uses a two-step disk-based protocol: the producing stage calls `s.save(artifact)` (either `s.sessionId` for Claude, raw `result.data` for OpenCode, or the messages array for Copilot), and the consuming stage calls `await s.transcript(handle)` which returns `{ path, content }`. Stages can embed `prior.path` in their prompt (to let the agent open the file via its Read tool) or embed `prior.content` directly as inline text.

Three composition shapes appear across the examples: sequential chains (stage A awaited before stage B), fan-out/fan-in (seed → `Promise.all` → merge), and verdict loops (`for` loop with `handle.result` controlling `break`). Headless stages (`headless: true`) suppress the TUI pane but are otherwise identical in API. Structured output adds `outputFormat: { type: "json_schema" }` to the query options and reads `s.session.lastStructuredOutput` post-query, validated against Zod via `safeParse`.

---

### Out-of-Partition References

- `@bastani/atomic/workflows` — the `defineWorkflow`, `createWorkflowCli`, `createRegistry`, and `extractAssistantText` exports come from the core library (out of partition, likely in `src/`).
- `SessionHandle` type and `handle.result` field — defined in the core workflows runtime, not in `examples/`.
- `s.session.query()` (Claude), `s.client.session.prompt()` (OpenCode), `s.session.send()` / `s.session.getMessages()` (Copilot) — each session API is implemented in the provider adapter layer in `src/`.
- `s.save()`, `s.transcript()`, `s.sessionId` — stage context (`s`) object is constructed and provided by the runtime, not defined in examples.
- `s.session.lastStructuredOutput` — Claude session adapter property, defined in the Claude provider adapter in `src/`.
- `zod` (v3+) — external dependency; `z.toJSONSchema` with `target: "openapi-3.0"` is a Zod v4 API used in `examples/structured-output-demo/helpers/schema.ts:49`.
- `examples/commander-embed/claude/index.ts` — not read; relevant for Commander.js embedding pattern.
- `examples/structured-output-demo/opencode/index.ts` and `examples/structured-output-demo/copilot/index.ts` — not read; contain provider-specific structured output variants.

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
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

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
