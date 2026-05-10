# Atomic Deterministic Workflows — Partition 1 File Locator

## Summary

Atomic's deterministic workflows operate through a three-layer architecture:
1. **DSL Layer** — Workflow definitions compiled into sealed WorkflowDefinition objects
2. **Runtime/Execution Layer** — Deterministic orchestration via `GraphFrontierTracker` + environment-based re-entry
3. **Status Persistence Layer** — JSON snapshots written to disk for out-of-process consumers

Determinism is achieved through:
- **Frontier-based graph inference**: Session execution order (sequential/parallel) is inferred from JavaScript control flow (await vs Promise.all), tracked via `GraphFrontierTracker`
- **Environment variable-based re-entry**: The orchestrator re-executes the user's entrypoint file with `ATOMIC_ORCHESTRATOR_MODE=1` + workflow key, enabling deterministic session hydration
- **Persistent status snapshots**: `status.json` written atomically to `~/.atomic/sessions/<workflowRunId>/` on every PanelStore mutation, enabling resumability and external monitoring
- **Frozen input schema**: Workflow inputs are validated, deduplicated, and frozen at compile time; integer inputs parsed to numbers; enums validated

---

### Implementation

- `src/sdk/define-workflow.ts` — DSL entry point (`defineWorkflow()`), chainable builder pattern (`.for()`, `.run()`, `.compile()`), validation of input names/types/duplicates, frozen input schema
- `src/sdk/types.ts` — Type definitions: `WorkflowDefinition`, `WorkflowContext`, `SessionContext`, `SessionHandle`, `RegistrableWorkflow`, `Registry`, input schema types (`WorkflowInput`, `InputsOf`, `WorkflowInputType`), `SaveTranscript` interface
- `src/sdk/runtime/executor.ts` — Main execution loop: `executeWorkflow()` spawns tmux session + orchestrator pane, `runOrchestrator()` runs user's `.run()` callback with workspace hydration, session lifecycle management, provider client/session creation, transcript/message I/O, deterministic env var passing (`ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`, `ATOMIC_ORCHESTRATOR_MODE`, `ATOMIC_WF_KEY`)
- `src/sdk/runtime/graph-inference.ts` — Deterministic graph topology inference via `GraphFrontierTracker`: tracks completion frontier, identifies sequential vs parallel edges by observing `onSpawn()` timing relative to pending completions (1:1 deterministic mapping of control flow to graph edges)
- `src/sdk/runtime/status-writer.ts` — Atomic status snapshot I/O: `buildSnapshot()` → JSON serialization, `writeSnapshot()` → disk write; tracks per-session status (pending/running/complete/error/awaiting_input), timestamps, error messages, parent edges; derives overall workflow state (error > awaiting_input > completed > in_progress)
- `src/sdk/runtime/executor-env.ts` — Orchestrator environment validation: reads + validates 4 required env vars (`ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`), returns typed context for downstream orchestrator code
- `src/sdk/runtime/tmux.ts` — tmux session management: pane creation, message passing, attachment, detach-and-background spawn
- `src/sdk/runtime/panel.tsx` — OpenTUI-based orchestrator panel (React component) — displays live graph + attached pane; subscribes to PanelStore mutations
- `src/sdk/registry.ts` — Registry implementation: immutable, chainable registry of compiled workflow definitions; generic type accumulation for compile-time type safety in `get()` / `resolve()`
- `src/sdk/workflow-cli.ts` — Multi-workflow dispatcher CLI: wraps `createWorkflowCli()`, parses `-n/--name -a/--agent` + per-input flags, calls `executeWorkflow()` with resolved registry definition
- `src/sdk/providers/claude.ts` — Claude SDK wrapper: `ClaudeClientWrapper`, `ClaudeSessionWrapper`, headless variants, session message transcript I/O, idle detection via session state events
- `src/sdk/providers/copilot.ts` — Copilot SDK wrapper: client init, session creation, message I/O, onPermissionRequest handler
- `src/sdk/providers/opencode.ts` — OpenCode SDK wrapper: client init, session creation, message I/O, headless env vars
- `src/sdk/worker-shared.ts` — Shared CLI helpers: `validateAndResolve()` (input validation against schema), `toCamelCase()` (flag name normalization), `stringifyDefaults()` (coerce typed defaults to strings)
- `src/sdk/errors.ts` — Typed error classes: `MissingDependencyError`, `WorkflowNotCompiledError`, `InvalidWorkflowError`, `IncompatibleSDKError`, `errorMessage()` helper

### Tests

- `src/sdk/define-workflow.test.ts` — Builder pattern tests, input validation, compile-time type safety
- `src/sdk/errors.test.ts` — Error class instantiation + message formatting
- `src/sdk/runtime/executor.test.ts` — Executor flow, env var validation, session spawning, transcript I/O
- `src/sdk/runtime/status-writer.test.ts` — Snapshot building, overall status derivation logic
- `src/sdk/components/orchestrator-panel-store.test.ts` — PanelStore mutations, frontier tracking side effects
- `src/sdk/components/connectors.test.ts` — Graph edge rendering
- `src/sdk/components/layout.test.ts` — Layout computation for graph visualization
- `src/sdk/providers/headless-hil-policy.test.ts` — Human-in-the-loop timeout policy
- `src/sdk/worker-shared.test.ts` — Input validation, flag parsing, defaults coercion

### Types / Interfaces

- `src/sdk/types.ts` — Comprehensive type definitions:
  - `AgentType` — "copilot" | "opencode" | "claude"
  - `WorkflowInput` — Field name, type (string/text/enum/integer), required, description, placeholder, default, values (for enums)
  - `WorkflowInputType` — "string" | "text" | "enum" | "integer"
  - `InputsOf<I>` — Computed type for `ctx.inputs` shape from declared schema
  - `WorkflowOptions<I>` — Workflow metadata: name, description, inputs schema, minSDKVersion
  - `WorkflowBuilder<A, I>` — Chainable builder (internal, sealed by `.compile()`)
  - `WorkflowDefinition<A, I>` — Sealed compiled output: name, agent, description, inputs, minSDKVersion, run() method
  - `SessionContext<A, I>` — Per-stage context: client, session, inputs, transcript(), getMessages(), save, stage(), sessionDir, paneId, sessionId
  - `WorkflowContext<A, I>` — Top-level context (no session-specific fields): inputs, agent, transcript(), getMessages(), stage()
  - `SessionHandle<T>` — Return from `ctx.stage()`: name, id, result
  - `SessionRunOptions` — Stage options: name, description, headless flag
  - `Transcript` — Rendered text + file path
  - `SavedMessage` — Provider-native message wrapper (Copilot SessionEvent | OpenCode SessionPromptResponse | Claude SessionMessage)
  - `SaveTranscript` — Function overloads for saving provider-specific messages
  - `Registry<T>` — Immutable registry: register(), get(), has(), list(), resolve()
  - `RegistrableWorkflow` — Constraint for workflows accepted by Registry (uses `(...args: never[])` to sidestep contravariance)
  - `WorkflowCli<T>` — CLI program: registry, entry, defaults, run()
  - `StageClientOptions<A>`, `StageSessionOptions<A>`, `ProviderClient<A>`, `ProviderSession<A>` — Type maps for agent-specific client/session types
  - Validation: `ValidationWarning`, `ValidationRule`, `validateWorkflowSource()`, `createProviderValidator()`

- `src/sdk/runtime/status-writer.ts` — Status tracking types:
  - `WorkflowOverallStatus` — "in_progress" | "error" | "completed" | "needs_review"
  - `SessionStatus` — "pending" | "running" | "complete" | "error" | "awaiting_input"
  - `WorkflowStatusSnapshot` — Versioned schema: workflowRunId, tmuxSession, workflowName, agent, prompt, overall, completionReached, fatalError, updatedAt, sessions[]
  - `WorkflowStatusSession` — Per-session mirror: name, status, parents, error, startedAt, endedAt
  - `StatusWriterInputs` — Input struct for buildSnapshot()

- `src/sdk/components/orchestrator-panel-types.ts` — Panel state types:
  - `SessionStatus` — same as above
  - `ViewMode` — "graph" | "attached"
  - `PanelSession` — name, parents[]
  - `SessionData` — name, status, parents, error, startedAt, endedAt

- `src/sdk/components/orchestrator-panel-store.ts` — Reactive panel state:
  - `PanelStore` — Subscription-based store (Zustand-like), tracks session creation/completion/errors
  - Frontier integration: calls `tracker.onSpawn()` / `tracker.onSettle()` when sessions are created/completed

### Configuration

- `src/sdk/index.ts` — SDK exports: `defineWorkflow`, `createWorkflowCli`, `executeWorkflow`, `runOrchestrator`, `extractAssistantText`, `Registry`, types
- `.claude` config (global + local) — Claude Code agent configuration (outside SDK scope but referenced in executor environment setup)
- `.opencode` config (global + local) — OpenCode agent configuration
- `.github` config (global + local) — Copilot CLI configuration

### Examples / Fixtures

- `src/sdk/workflows/builtin/deep-research-codebase/claude/index.ts` — Deterministic batch orchestration pattern: Wave 1 (locator + pattern-finder batches) → TS reads files → Wave 2 (analyzer + online-researcher batches) → aggregator; demonstrates filesystem-based inter-stage communication and Promise.allSettled for fault isolation
- `src/sdk/workflows/builtin/ralph/claude/index.ts` — Code review workflow; sequential stage chain
- `src/sdk/workflows/builtin/open-claude-design/claude/index.ts` — Design system workflow; demonstrates transcript/message reading between stages
- `src/sdk/workflows/builtin/deep-research-codebase/copilot/index.ts` — Copilot variant of deep-research
- `src/sdk/workflows/builtin/deep-research-codebase/opencode/index.ts` — OpenCode variant of deep-research
- Builtin helpers: batching, heuristics, prompts, scout, scratch (file I/O for inter-stage communication), design-system, export/import, validation, git operations, review logic

### Documentation

- Code comments in core modules:
  - `executor.ts` — Architecture overview: re-entry mechanism, tmux session + orchestrator pane model, environment variable semantics
  - `graph-inference.ts` — Frontier-based inference algorithm: sequential (frontier non-empty), parallel (frontier empty on 2nd spawn in same frame), fan-in (frontier repopulated after Promise.all resolves)
  - `status-writer.ts` — Snapshot semantics: per-session status tracking, overall state derivation
  - `define-workflow.ts` — Builder DSL usage + compile-time guarantees
  - Built-in workflow headers (claude/copilot/opencode index.ts files) — Topology diagrams, batching rationale, failure isolation patterns

### Notable Clusters

- `src/sdk/runtime/` (9 files) — Execution engine: executor.ts + graph-inference.ts (determinism core), status-writer.ts (persistence), tmux.ts (session I/O), panel.tsx + attached-footer.ts (TUI visualization), executor-env.ts + version-compat.ts + cc-debounce.ts + theme.ts (supporting infrastructure). **Why it's a cluster**: Encapsulates the full deterministic orchestration lifecycle — from env validation through graph inference, status persistence, and live visualization.

- `src/sdk/providers/` (3 files + tests) — Agent SDK adapters: claude.ts, copilot.ts, opencode.ts. **Why it's a cluster**: Each file wraps a provider SDK (Claude Agent SDK, Copilot SDK, OpenCode SDK) with Atomic-specific abstractions (e.g., ClaudeClientWrapper, ClaudeSessionWrapper for session management + idle detection; headless variants for invisible sub-sessions).

- `src/sdk/workflows/builtin/` (36 files across 3 workflows + shared helpers) — Built-in workflow implementations:
  - `deep-research-codebase/` — Multi-agent codebase analysis (claude/copilot/opencode variants + shared batching/heuristic/prompt/scout/scratch helpers)
  - `ralph/` — Code review (claude/copilot/opencode + shared copilot-reviewer/git/prompts/review helpers)
  - `open-claude-design/` — Design system integration (claude/copilot/opencode + shared constants/design-system/export/import/prompts/scan/validation helpers)
  **Why it's a cluster**: Demonstrates deterministic orchestration patterns (batching, filesystem-based inter-stage communication, sequential pipelines, parallel fan-out with Promise.allSettled) at scale; serves as reference implementations for SDK users.

- `src/sdk/components/` (22 files) — React/OpenTUI-based visualization layer:
  - Core: orchestrator-panel.tsx (main panel), orchestrator-panel-store.ts (reactive state with frontier tracking), orchestrator-panel-types.ts (types)
  - Graph rendering: node-card.tsx, edge.tsx, connectors.ts, layout.ts (d3-like layout computation)
  - TUI chrome: header.tsx, statusline.tsx, attached-statusline.tsx, session-graph-panel.tsx
  - Utilities: color-utils.ts, graph-theme.ts, hooks.ts, error-boundary.tsx, compact-switcher.tsx
  **Why it's a cluster**: Visualizes the deterministically-inferred workflow graph in real time; PanelStore integrates frontier tracking to update edges as sessions complete.

---

## Research Question Relevance

**How does Atomic's deterministic workflows work?**

The research question maps directly to:

1. **DSL → Compilation** (`define-workflow.ts`, `types.ts`): User-authored workflows are compiled into sealed `WorkflowDefinition` objects with frozen inputs and typed context
2. **Deterministic Execution** (`runtime/executor.ts`, `runtime/executor-env.ts`): Orchestrator re-executes entrypoint file with env vars (`ATOMIC_ORCHESTRATOR_MODE=1`, workflow key), enabling deterministic session hydration
3. **Graph Topology Inference** (`runtime/graph-inference.ts`): `GraphFrontierTracker` maps JavaScript control flow (await vs Promise.all) to deterministic parent-child + sibling edges
4. **Status Persistence** (`runtime/status-writer.ts`): Atomic snapshots written to `status.json` on every state mutation, enabling resumability + external monitoring
5. **Provider Abstraction** (`providers/{claude,copilot,opencode}.ts`): Unified session lifecycle across 3 SDKs; transcript/message I/O preserved for inter-stage communication
6. **Built-in Examples** (`workflows/builtin/*`): Demonstrate deterministic patterns (batching, Promise.allSettled, filesystem-based inter-stage communication) at production scale

**Determinism** is achieved through:
- **Execution order inference** from sync/async boundaries (frontier-based)
- **Environment-driven re-entry** (not file-system paths or process discovery)
- **Frozen input schema** validated at compile time (no mutation surface)
- **Persistent snapshots** enabling external state observation + resumability
- **Sealed types** (WorkflowDefinition, RegistrableWorkflow) preventing post-compilation mutation
