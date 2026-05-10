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
