### Files Analysed

- `src/sdk/define-workflow.ts` — DSL entry point and builder
- `src/sdk/types.ts` — all core type definitions for the workflow system
- `src/sdk/registry.ts` — immutable registry implementation
- `src/sdk/runtime/executor.ts` — main execution engine (executeWorkflow, runOrchestrator, createSessionRunner)
- `src/sdk/runtime/graph-inference.ts` — frontier-based topology inference
- `src/sdk/runtime/status-writer.ts` — persistent status snapshot I/O
- `src/sdk/runtime/executor-env.ts` — orchestrator environment validation
- `src/sdk/workflow-cli.ts` — CLI dispatcher (resolveAndStart, buildCliCommand)
- `src/sdk/runtime/panel.tsx` — OrchestratorPanel re-export (delegates to components/)
- `src/sdk/runtime/tmux.ts` — tmux session/window management primitives

---

### Per-File Notes

#### `src/sdk/define-workflow.ts`

- **Role:** DSL entry point. Exposes `defineWorkflow()` which returns a `WorkflowBuilder`. The builder is a chainable object that collects the agent type (`.for()`), the run callback (`.run()`), and then seals everything into a frozen `WorkflowDefinition` via `.compile()`.
- **Key symbols:**
  - `defineWorkflow` (`define-workflow.ts:248`) — factory function, validates non-empty name, returns `WorkflowBuilder<AgentType, I>`.
  - `WorkflowBuilder` (`define-workflow.ts:109`) — class with private fields `options`, `runFn`, `agentValue`.
  - `WorkflowBuilder.for()` (`define-workflow.ts:144`) — creates a new `WorkflowBuilder` instance narrowed to agent type `B`; does not mutate in place.
  - `WorkflowBuilder.run()` (`define-workflow.ts:159`) — records the callback; throws if called twice.
  - `WorkflowBuilder.compile()` (`define-workflow.ts:176`) — validates all declared inputs via `validateWorkflowInput` (`define-workflow.ts:48`), checks for duplicate names, deep-freezes the inputs array, and returns the sealed `WorkflowDefinition` object literal at `define-workflow.ts:210-218`.
  - `RESERVED_INPUT_NAMES` (`define-workflow.ts:32`) — list of names forbidden as workflow input identifiers (`name`, `agent`, `detach`, `list`, `help`, `version`, `session`, `status`).
  - `validateWorkflowInput` (`define-workflow.ts:48`) — validates name format via regex `^[a-zA-Z][a-zA-Z0-9_-]*$` (line 54), checks reserved names (line 62), validates enum values (lines 68-90), validates integer defaults (lines 91-102).
- **Control flow:** `defineWorkflow(opts)` → `new WorkflowBuilder(opts)` → `.for(agent)` returns new builder with `agentValue` set → `.run(fn)` sets `runFn` → `.compile()` validates inputs, throws if `runFn` is null or `agentValue` is null, returns sealed object.
- **Data flow:** `WorkflowOptions<I>` → builder accumulates agent + callback → `compile()` emits `WorkflowDefinition<A,I>` with `Object.freeze`d inputs array at line 199.
- **Dependencies:** `./types.ts` (type imports only).

---

#### `src/sdk/types.ts`

- **Role:** Central type definitions. Declares all interfaces consumed by DSL, runtime, and registry. Also contains two runtime utility functions for provider-specific source validation.
- **Key symbols:**
  - `AgentType` (`types.ts:28`) — `"copilot" | "opencode" | "claude"`.
  - `WorkflowDefinition<A, I>` (`types.ts:584`) — the sealed output of `.compile()`; has `__brand`, `name`, `agent`, `description`, `inputs`, `minSDKVersion`, and `run` method (bivariant, see comment at line 606).
  - `WorkflowContext<A, I>` (`types.ts:349`) — top-level context passed to the `.run()` callback; has `inputs`, `agent`, `stage()`, `transcript()`, `getMessages()`.
  - `SessionContext<A, I>` (`types.ts:290`) — per-session context inside a `stage()` callback; extends WorkflowContext fields with `client`, `session`, `save`, `sessionDir`, `paneId`, `sessionId`, nested `stage()`.
  - `SessionHandle<T>` (`types.ts:259`) — return value of `ctx.stage()`; carries `name`, `id`, `result`.
  - `SessionRunOptions` (`types.ts:271`) — `{ name, description?, headless? }` passed as first arg of `ctx.stage()`.
  - `InputsOf<I>` (`types.ts:200`) — conditional mapped type converting declared `WorkflowInput[]` to `{ [name]?: value_type }`. Falls back to `Record<string, string | undefined>` for untyped workflows.
  - `WorkflowInputType` (`types.ts:151`) — `"string" | "text" | "enum" | "integer"`.
  - `SavedMessage` (`types.ts:231`) — discriminated union `{ provider: "copilot" | "opencode" | "claude"; data: ... }`.
  - `SaveTranscript` (`types.ts:243`) — overloaded interface; three call signatures for Copilot `SessionEvent[]`, OpenCode `SessionPromptResponse`, and Claude session ID `string`.
  - `Registry<T>` (`types.ts:459`) — immutable chainable registry type; keys are `${agent}/${name}`.
  - `validateWorkflowSource` (`types.ts:115`) — strips single-line comments, runs regex rules against source text.
  - `createProviderValidator` (`types.ts:135`) — higher-order function returning a `(source: string) => ValidationWarning[]` closure.
- **Control flow:** Pure type/interface declarations plus two utility functions; no imperative logic beyond the validation loop at `types.ts:122-128`.
- **Data flow:** Types flow outward to all other modules. `InputsOf<I>` is the conduit that maps compile-time input declarations into the `ctx.inputs` shape seen by workflow authors.
- **Dependencies:** `@github/copilot-sdk`, `@opencode-ai/sdk/v2`, `@anthropic-ai/claude-agent-sdk`, `./providers/claude.ts` (for `ClaudeClientWrapper`/`ClaudeSessionWrapper` types).

---

#### `src/sdk/registry.ts`

- **Role:** Implements the `Registry<T>` interface as an immutable `RegistryImpl` class backed by a `ReadonlyMap`. Runs provider-specific source validation at registration time.
- **Key symbols:**
  - `createRegistry()` (`registry.ts:127`) — factory returning an empty `Registry<Record<string, never>>`.
  - `RegistryImpl` (`registry.ts:63`) — internal class; `register()` at line 71 throws on duplicate key, calls `validateAtRegistration`, copies the map, returns a new `RegistryImpl` instance.
  - `validateAtRegistration` (`registry.ts:47`) — derives source from `wf.run.toString()` (line 39), passes to provider validator, emits `console.warn` for each warning.
  - `providerValidators` (`registry.ts:21`) — `Record<AgentType, (source) => ValidationWarning[]>` dispatching to `validateClaudeWorkflow`, `validateOpenCodeWorkflow`, `validateCopilotWorkflow`.
  - `RegistryImpl.resolve()` (`registry.ts:108`) — looks up `${agent}/${name}` key; returns `undefined` when absent.
  - `RegistryImpl.list()` (`registry.ts:104`) — returns frozen array of all registered definitions.
- **Control flow:** `createRegistry()` → `.register(wf)` validates → copies map → returns new registry. Each `.register()` call is O(n) map copy. Lookup via `.resolve()` is O(1).
- **Data flow:** `WorkflowDefinition` objects enter the map keyed by `${agent}/${name}`. `runProviderValidation` at line 37 calls `wf.run.toString()` to get source text for regex validation.
- **Dependencies:** `./types.ts`, `./providers/copilot.ts`, `./providers/opencode.ts`, `./providers/claude.ts`.

---

#### `src/sdk/runtime/graph-inference.ts`

- **Role:** Deterministic graph topology inference. Observes when stages are spawned and when they settle, maintaining a `frontier` array to infer parent–child relationships without requiring authors to declare them explicitly.
- **Key symbols:**
  - `GraphFrontierTracker` (`graph-inference.ts:12`) — class with `frontier: string[]` (line 17) and `parallelAncestors: string[]` (line 23).
  - `GraphFrontierTracker.onSpawn()` (`graph-inference.ts:33`) — called synchronously when a new stage fires. If `frontier` is non-empty, the prior wave completed (sequential), so `parallelAncestors` is updated to the frontier and frontier is cleared. Returns `parallelAncestors` as the parent set.
  - `GraphFrontierTracker.onSettle(name)` (`graph-inference.ts:47`) — called when a stage completes. Pushes `name` onto `frontier`.
- **Control flow — sequential stages:** Stage A settles → `onSettle("A")` → frontier = `["A"]`. Stage B spawns → `onSpawn()` sees non-empty frontier → `parallelAncestors = ["A"]`, frontier = `[]` → returns `["A"]` (B depends on A).
- **Control flow — parallel stages:** Stage A and B fire in same synchronous frame. A's `onSpawn()` sees empty frontier → returns `["orchestrator"]` (root parent). B's `onSpawn()` also fires before any settle → frontier still empty → also returns `["orchestrator"]` (siblings). After both settle, frontier = `["A", "B"]`. Stage C's `onSpawn()` → `parallelAncestors = ["A", "B"]` → fan-in edge.
- **Data flow:** Constructor takes `parentName` string, sets `parallelAncestors = [parentName]` at line 26. Subsequent spawns and settles update internal state; callers receive parent arrays from `onSpawn()`.
- **Dependencies:** None (pure class, no imports).

---

#### `src/sdk/runtime/status-writer.ts`

- **Role:** Bridges in-process orchestrator panel state with out-of-process consumers by writing a versioned JSON snapshot to `~/.atomic/sessions/<workflowRunId>/status.json` on every panel store mutation.
- **Key symbols:**
  - `STATUS_FILE_NAME` (`status-writer.ts:15`) — constant `"status.json"`.
  - `WorkflowStatusSnapshot` (`status-writer.ts:38`) — versioned schema `{ schemaVersion: 1, workflowRunId, tmuxSession, workflowName, agent, prompt, overall, completionReached, fatalError, updatedAt, sessions }`.
  - `WorkflowOverallStatus` (`status-writer.ts:18`) — `"in_progress" | "error" | "completed" | "needs_review"`.
  - `deriveOverallStatus()` (`status-writer.ts:84`) — precedence: `fatalError` → `"error"`, any session with `status === "error"` → `"error"`, any session `status === "awaiting_input"` → `"needs_review"`, `completionReached` → `"completed"`, else `"in_progress"`.
  - `buildSnapshot()` (`status-writer.ts:99`) — pure function mapping `StatusWriterInputs` to `WorkflowStatusSnapshot`; exported for tests.
  - `writeSnapshot()` (`status-writer.ts:140`) — atomic write: `Bun.write(tmpPath, ...)` then `rename(tmp, final)` at line 148-149. Errors are silently swallowed at line 150.
  - `readSnapshot()` (`status-writer.ts:160`) — reads, parses, and validates snapshot from disk; returns `null` on any failure.
  - `workflowRunIdFromTmuxName()` (`status-writer.ts:193`) — extracts the trailing 8-hex segment from a tmux session name shaped `atomic-wf-<agent>-<name>-<id>`.
- **Control flow:** Orchestrator creates a subscription to `OrchestratorPanel` via `panel.subscribe(persistSnapshot)`. `persistSnapshot` uses a `snapshotPending` debounce flag (executor.ts:1993-2009) so bursts collapse into one microtask write. On shutdown, a final snapshot is written synchronously before `panel.destroy()`.
- **Data flow:** `panel.getSnapshot()` → `buildSnapshot({ workflowRunId, tmuxSession, ...snap })` → `writeSnapshot(sessionsBaseDir, snapshot)` → `~/.atomic/sessions/<id>/status.json`.
- **Dependencies:** `node:path`, `../components/orchestrator-panel-types.ts` (for `SessionData`, `SessionStatus` types).

---

#### `src/sdk/runtime/executor-env.ts`

- **Role:** Validates the four required orchestrator environment variables on re-entry, throwing descriptively on the first missing or invalid value.
- **Key symbols:**
  - `validateOrchestratorEnv()` (`executor-env.ts:17`) — reads `ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`; validates agent via `isValidAgent`; returns `{ workflowRunId, tmuxSessionName, agent, cwd }`.
- **Control flow:** Iterates `requiredEnvVars` array at line 29-32, throws on first missing var. Then validates `rawAgent` against `isValidAgent` at line 38.
- **Data flow:** Reads from `process.env` exclusively. Outputs a plain validated object consumed by `runOrchestrator()`.
- **Dependencies:** `../types.ts`, `../../services/config/definitions.ts` (for `isValidAgent`).

---

#### `src/sdk/runtime/executor.ts`

- **Role:** The main execution engine. Implements the two-process model: `executeWorkflow()` is the launcher (CLI-facing) and `runOrchestrator()` is the orchestrator (re-entry, runs inside a tmux pane). The inner `createSessionRunner()` function is the `ctx.stage()` implementation and is the unit that enforces deterministic ordering.
- **Key symbols:**
  - `executeWorkflow()` (`executor.ts:472`) — CLI entry point. Generates `workflowRunId = generateId()` (8-char hex UUID slice, line 498). Computes `tmuxSessionName = "atomic-wf-${agent}-${definition.name}-${workflowRunId}"` (line 499). Serializes `inputs` as base64-encoded JSON in `ATOMIC_WF_INPUTS` (line 516). Writes a launcher shell script (`orchestrator.sh` / `orchestrator.ps1`) at lines 518-541 that sets all `ATOMIC_WF_*` env vars and re-execs the user's entrypoint via `bun run`. Creates the tmux session with the launcher as the initial command (line 548). Attaches or detaches based on `detach` flag (lines 551-569).
  - `handleOrchestratorReEntry()` (`executor.ts:1939`) — detects `ATOMIC_ORCHESTRATOR_MODE=1`, parses `ATOMIC_WF_KEY` into agent + name, resolves definition via caller-supplied `resolve` callback, calls `runOrchestrator(def)`.
  - `runOrchestrator()` (`executor.ts:1962`) — called inside the re-executed process. Reads validated env via `validateOrchestratorEnv()`, parses inputs via `parseInputsEnv(process.env.ATOMIC_WF_INPUTS)`, calls `process.chdir(cwd)` (line 1976), creates `OrchestratorPanel`, wires a debounced `persistSnapshot` subscription to panel state mutations (lines 1993-2010), builds `SharedRunnerState`, coerces integer inputs via `coerceInputsBySchema` (line 2060), builds `WorkflowContext` at line 2083, then calls `definition.run(workflowCtx)` raced against `panel.waitForAbort()` at line 2095.
  - `createSessionRunner()` (`executor.ts:1512`) — returns a function implementing `ctx.stage()`. Creates a `GraphFrontierTracker(parentName)` at line 1521. Each call: validates name uniqueness (lines 1531-1541), calls `graphTracker.onSpawn()` synchronously (line 1549) to get graph parents, creates a `donePromise` (lines 1552-1559), registers in `shared.activeRegistry` (line 1563), allocates port via `getRandomPort()` (line 1571), either creates a tmux window (line 1593) or uses headless mode (line 1585), waits for server readiness via `waitForServer()` (line 1604), calls `shared.panel.addSession(name, graphParents)` (line 1607), creates session directory (lines 1611-1616), constructs `SessionContext` with `save` closure and a nested `createSessionRunner(shared, name)` for sub-stages (line 1811), runs the user callback `await run(ctx)` (line 1835), marks session complete via `shared.panel.sessionSuccess(name)` (line 1865), moves entry from `activeRegistry` to `completedRegistry` (lines 1868-1869), resolves `donePromise` (line 1870), calls `graphTracker.onSettle(name)` (line 1874).
  - `initProviderClientAndSession()` (`executor.ts:1291`) — creates the agent-specific client and session based on agent type and `headless` flag. Returns `{ client, session, cleanup? }`.
  - `parseInputsEnv()` (`executor.ts:412`) — base64-decodes `ATOMIC_WF_INPUTS` JSON into `Record<string, string>`.
  - `coerceInputsBySchema()` (`executor.ts:441`) — converts integer-typed input strings to `number`, passes all others through as strings.
  - `escBash()` (`executor.ts:384`) / `escPwsh()` (`executor.ts:397`) — shell-escape helpers for injecting inputs into the launcher script.
  - `AGENT_CLI` (`executor.ts:69`) — static config map specifying `cmd`, `chatFlags`, and `envVars` for each agent type.
  - `buildPaneCommand()` (`executor.ts:292`) — constructs the CLI command for the tmux window per agent type.
  - `wrapCopilotSend()` (`executor.ts:940`) — wraps Copilot's fire-and-forget `send()` to block until `session.idle` event fires.
  - `watchOpencodeStreamForHIL()` (`executor.ts:1005`) — consumes OpenCode SSE event stream, calls `onHIL(true/false)` on `question.asked`/`question.replied`/`question.rejected`.
  - `watchCopilotSessionForHIL()` (`executor.ts:1057`) — subscribes to `tool.execution_start`/`tool.execution_complete` for `ask_user` tool, calls `onHIL()`.
  - `renderMessagesToText()` (`executor.ts:865`) — dispatches to `renderClaudeTranscript`, `renderCopilotTranscript`, `renderOpencodeTranscript`; produces Markdown.
- **Control flow — full execution path:**
  1. `executeWorkflow()` invoked by CLI → generates IDs → writes launcher script → `tmux.createSession(tmuxSessionName, shellCmd, "orchestrator")` → attaches client.
  2. Tmux session re-execs user's entrypoint with `ATOMIC_ORCHESTRATOR_MODE=1`.
  3. User's entrypoint calls `handleOrchestratorReEntry(resolve)` → calls `runOrchestrator(def)`.
  4. `runOrchestrator()` creates panel, wires snapshot persistence, builds `WorkflowContext`, calls `definition.run(ctx)`.
  5. Each `ctx.stage()` call → `createSessionRunner` closure → `graphTracker.onSpawn()` (synchronous) → tmux window + agent server → `initProviderClientAndSession()` → runs user callback → `graphTracker.onSettle()` → `donePromise` resolves.
  6. Sequential awaits chain through `donePromise`; parallel `Promise.all` calls fire synchronously in the same frame, so `onSpawn()` sees empty frontier for siblings.
- **Data flow:** `inputs` start as `Record<string, string>` from CLI → base64-encoded into `ATOMIC_WF_INPUTS` → decoded in orchestrator process → `coerceInputsBySchema` converts integers → stored in `shared.inputs` → threaded into every `SessionContext` as `ctx.inputs`.
- **Dependencies:** `./types.ts`, `./executor-env.ts`, `./graph-inference.ts`, `./status-writer.ts`, `./panel.tsx`, `./tmux.ts`, `./attached-footer.ts`, `../providers/claude.ts`, `../providers/opencode.ts`, `../providers/copilot.ts`, `../../services/config/atomic-config.ts`, `../../services/config/additional-instructions.ts`, `../../services/config/scm-sync.ts`, `../../services/system/copy.ts`, `../../theme/colors.ts`, `../errors.ts`, `@github/copilot-sdk`, `@opencode-ai/sdk/v2`, `@anthropic-ai/claude-agent-sdk`.

---

#### `src/sdk/workflow-cli.ts`

- **Role:** CLI dispatcher factory. `createWorkflowCli()` accepts a registry (or single workflow or array), builds a Commander program with `-n/--name`, `-a/--agent`, per-input flags, and `--detach`, handles orchestrator re-entry, and dispatches to `resolveAndStart()`.
- **Key symbols:**
  - `resolveAndStart()` (`workflow-cli.ts:90`) — merges inputs from three sources (dispatcher < run < CLI, line 117-121), calls `validateAndResolve` if inputs schema is declared (line 124-126), then calls `executeWorkflow()` at line 128.
  - `buildCliCommand()` (`workflow-cli.ts:146`) — builds a `Command` with positional options enabled (line 165), registers `-n`, `-a`, per-input `--<name>` flags (lines 167-190), `--detach` (line 192), and a free-form `[prompt...]` argument (line 194).
  - `normalizeToRegistry()` (`workflow-cli.ts:50`) — detects Registry vs array vs single workflow by structural check on `.register` method.
  - `handleOrchestratorReEntry()` — imported from `./runtime/executor.ts`; called first in `run()` to handle re-entry before argv parsing.
- **Control flow:** `createWorkflowCli(target, opts)` → normalize to registry → return `WorkflowCli` object. `WorkflowCli.run()` → `handleOrchestratorReEntry(...)` first (returns `true` if re-entry, exits) → parse argv with Commander → open picker if TTY and no name → `resolveAndStart()` → `executeWorkflow()`.
- **Data flow:** CLI flags and positional prompt → `cliInputs` record → merged with `runInputs` and `dispatcherInputs` → passed to `executeWorkflow`.
- **Dependencies:** `@commander-js/extra-typings`, `./types.ts`, `./runtime/executor.ts`, `./components/workflow-picker-panel.tsx`, `./registry.ts`, `./worker-shared.ts`.

---

#### `src/sdk/runtime/tmux.ts`

- **Role:** Low-level tmux primitives. Creates sessions, windows/panes, kills them, captures pane output, sends keys, detects tmux context. Uses a dedicated `SOCKET_NAME = "atomic"` tmux socket to isolate workflow sessions.
- **Key symbols:**
  - `SOCKET_NAME` (`tmux.ts:20`) — `"atomic"`.
  - `getMuxBinary()` (`tmux.ts:57`) — resolves and caches `tmux` (Unix/macOS) or `psmux`/`pmux` (Windows) binary.
  - `createSession()` — creates a named tmux session on the atomic socket with a given command and window name.
  - `createWindow()` — creates a new tmux window within a session, returns the pane ID.
  - `killWindow()`, `killSession()` — terminate specific windows or whole sessions.
  - `capturePane()` — captures visible content of a pane (used by `waitForServer` to detect agent TUI readiness).
  - `isInsideTmux()`, `isInsideAtomicSocket()` — detect current tmux context for attach routing.
  - `switchClient()`, `detachAndAttachAtomic()`, `spawnMuxAttach()` — three paths for attaching the user's terminal to the workflow session depending on context.
- **Control flow:** All operations shell out via `Bun.spawnSync` with `[getMuxBinary(), "-L", SOCKET_NAME, ...]`. The socket isolation (`-L atomic`) means Atomic sessions never appear in the user's default `tmux ls`.
- **Data flow:** Session names, window names, pane IDs, and commands flow in as strings. Pane IDs returned from `createWindow()` are threaded into `initProviderClientAndSession()` and stored in `SessionResult`.
- **Dependencies:** `node:path`, `node:fs`, `node:os`, `../../lib/spawn.ts`.

---

### Cross-Cutting Synthesis

Atomic's deterministic workflow system is a two-process model. In process 1, `executeWorkflow()` (`executor.ts:472`) generates a unique `workflowRunId`, serializes inputs as base64 JSON, writes a launcher shell script that injects six `ATOMIC_WF_*` env vars, and creates a tmux session running that script. The script re-execs the user's own entrypoint file — this is the re-entry point. In process 2 (the orchestrator tmux pane), `handleOrchestratorReEntry()` (`executor.ts:1939`) detects `ATOMIC_ORCHESTRATOR_MODE=1`, resolves the `WorkflowDefinition` by `ATOMIC_WF_KEY`, and calls `runOrchestrator()` (`executor.ts:1962`).

Determinism of stage ordering is achieved entirely through JavaScript's event loop semantics plus the `GraphFrontierTracker` (`graph-inference.ts:12`). `createSessionRunner()` (`executor.ts:1512`) wraps every `ctx.stage()` call: it calls `graphTracker.onSpawn()` **synchronously** before any `await`, exploiting the fact that parallel stages (inside `Promise.all`) fire in the same synchronous frame — both see an empty frontier and become siblings. Sequential stages (awaited serially) see a non-empty frontier from the prior stage's `onSettle()`, establishing a parent-child edge. This inferred graph is used both to render the TUI panel and to persist the graph topology in `status.json`.

Status persistence (`status-writer.ts`) makes the live in-process panel state visible to external consumers without IPC: every `OrchestratorPanel` store mutation triggers a debounced microtask write of a versioned JSON snapshot via an atomic rename.

---

### Out-of-Partition References

- `src/commands/cli/workflow.ts` — CLI sub-command that calls `executeWorkflow()` and handles the picker UX.
- `src/sdk/components/orchestrator-panel.tsx` — concrete `OrchestratorPanel` implementation (OpenTUI React component); `panel.tsx` re-exports from here.
- `src/sdk/components/orchestrator-panel-types.ts` — `SessionData`, `SessionStatus`, `PanelSession` types consumed by status-writer and executor.
- `src/sdk/components/workflow-picker-panel.tsx` — interactive workflow picker launched from `workflow-cli.ts` when no `--name` is given in a TTY.
- `src/sdk/providers/claude.ts` — `ClaudeClientWrapper`, `ClaudeSessionWrapper`, `HeadlessClaudeClientWrapper`, `HeadlessClaudeSessionWrapper`; `clearClaudeSession`; `validateClaudeWorkflow`.
- `src/sdk/providers/copilot.ts` — `copilotSubprocessEnv`, `mergeCopilotSystemMessage`, `validateCopilotWorkflow`.
- `src/sdk/providers/opencode.ts` — `withHeadlessOpencodeEnv`, `validateOpenCodeWorkflow`.
- `src/sdk/worker-shared.ts` — `toCamelCase`, `validateAndResolve`, `buildInputUnion` utilities used by `workflow-cli.ts`.
- `src/sdk/commander.ts` — Commander adapter (`toCommand`) for embedding a `WorkflowCli` under a parent Commander program.
- `src/services/config/atomic-config.ts` — `getProviderOverrides` (merges global+local provider config).
- `src/services/config/additional-instructions.ts` — `reconcileOpencodeInstructions`, `resolveAdditionalInstructionsContent`.
- `src/services/config/scm-sync.ts` — `getCopilotScmDisableFlags`.
- `src/services/config/definitions.ts` — `isValidAgent`, `ProviderOverrides`.
- `src/services/system/copy.ts` — `ensureDir`.
- `src/sdk/runtime/attached-footer.ts` — `spawnAttachedFooter` (renders a status bar below each tmux agent window).
- `src/sdk/runtime/cc-debounce.ts` — Ctrl+C debounce script referenced from `tmux.conf`.
- `src/lib/spawn.ts` — `requiredMuxBinaryCandidatesForPlatform`.
- `src/theme/colors.ts` — `createPainter` used for detached banner output.
- `src/sdk/errors.ts` — `errorMessage` utility.
- `src/sdk/index.ts` — public API barrel export.
