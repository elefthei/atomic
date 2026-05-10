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

