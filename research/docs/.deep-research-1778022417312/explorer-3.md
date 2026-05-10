# Partition 3 of 16 — Findings

## Scope
`tests/` (36 files, 8,682 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Deterministic Workflows: Test File Locations
## Research Question: How does Atomic's deterministic workflows work?
## Partition: `tests/` directory (36 files, ~8,682 LOC)

### Implementation
Tests directly exercising workflow definition, registration, and deterministic execution:

- `tests/sdk/workflow-cli.test.ts` (630 LOC) — Registry-based multi-workflow CLI factory; tests `createWorkflowCli()`, input precedence, environment variable binding for orchestrator re-entry (`ATOMIC_ORCHESTRATOR_MODE`, `ATOMIC_WF_KEY`)
- `tests/sdk/registry.test.ts` (227 LOC) — Immutable chainable workflow registry; tests registration, lookup by `<agent>/<name>` key, validation on register, type-level generics
- `tests/sdk/commander.test.ts` (246 LOC) — Commander adapter; tests `toCommand(cli)` and `runCli()` with orchestrator re-entry path, cli array handling, ATOMIC_ORCHESTRATOR_MODE environment variable flow
- `tests/sdk/runtime/executor.test.ts` (210 LOC) — WorkflowRunOptions shape validation, launcher script env vars (ATOMIC_ORCHESTRATOR_MODE, ATOMIC_WF_KEY vs removed ATOMIC_WF_FILE), runOrchestrator signature verification

### Runtime Execution & Graph Inference
Tests covering deterministic stage sequencing and dependency resolution:

- `tests/sdk/runtime/graph-inference.test.ts` (205 LOC) — GraphFrontierTracker; tests sequential chains (`onSpawn()` / `onSettle()`), parallel fan-out, fan-in with shared parents, nested scopes, diamond patterns, conditional skips, fire-and-forget stages
- `tests/sdk/runtime/tmux.test.ts` (1000+ LOC) — Tmux session/window/pane management, session environment variables, literal text/special key sending, capture/kill operations, session name parsing
- `tests/sdk/runtime/attached-footer.test.ts` — Output footer attachment
- `tests/sdk/runtime/cc-debounce.test.ts` — Debouncing logic
- `tests/sdk/runtime/version-compat.test.ts` — SDK version compatibility checks

### Orchestration & State Management
Tests for workflow execution state tracking and UI panel coordination:

- `tests/sdk/components/orchestrator-panel-store.test.ts` (150+ LOC) — PanelStore; tests workflow metadata (name, agent, prompt), session creation with parent tracking, session lifecycle (`startSession`, `completeSession`, `sessionError`), version increments for state changes
- `tests/sdk/components/orchestrator-panel.test.tsx` (150+ LOC) — OrchestratorPanel lifecycle; tests showWorkflowInfo, session start/success/error/awaiting-input/resumed, showCompletion, showFatalError, waitForExit promise
- `tests/sdk/components/session-graph-panel.test.tsx` (100+ LOC) — SessionGraphPanel rendering; tests node name rendering, workflow completion state, session duration display, parent dependency visualization
- `tests/sdk/components/workflow-picker-panel.test.tsx` (400+ LOC) — WorkflowPickerPanel; tests fuzzy matching, field validation, registry filtering by agent, input resolution, theme building

### Management Commands
Tests for session and status subcommands:

- `tests/sdk/management-commands.test.ts` (84 LOC) — Tests `addSessionSubcommand()` (list/connect/kill), `addStatusSubcommand()` (format option), command option exposure (agent filters)

### Utilities & Components
- `tests/sdk/components/graph-theme.test.ts` — Graph visualization theming
- `tests/sdk/components/orchestrator-panel-contexts.test.tsx` — Context providers for orchestrator panel
- `tests/sdk/components/layout.test.ts` — Layout calculations
- `tests/sdk/components/connectors.test.ts` — Visual connectors between nodes
- `tests/sdk/components/status-helpers.test.ts` — Status display helpers
- `tests/sdk/components/color-utils.test.ts` — Color manipulation
- `tests/sdk/providers/claude-wait-for-idle.test.ts` — Claude provider idle detection
- `tests/sdk/providers/claude-watch-hil-marker.test.ts` — Claude HIL marker watching

### Configuration & System
- `tests/services/config/scm-sync.test.ts` — Source control manager synchronization
- `tests/services/system/detect.test.ts` — System detection
- `tests/services/system/copy.test.ts` — File operations
- `tests/lib/common-ignore.test.ts` — Ignore pattern handling
- `tests/lib/merge.test.ts` — Merge operations
- `tests/lib/path-root-guard.test.ts` — Path validation

### CLI Integration
- `tests/commands/cli/footer.test.ts` — CLI footer rendering

### Notable Clusters

**Workflow Execution Determinism** (`tests/sdk/runtime/`):
- Graph inference drives deterministic parent-child relationships between stages
- Environment variables (`ATOMIC_WF_*`) enable orchestrator re-entry into launcher script
- Registry maintains `<agent>/<name>` keys for lookup determinism across multiple CLI invocations
- Orchestrator mode flag (`ATOMIC_ORCHESTRATOR_MODE=1`) gates re-entry vs normal CLI flow

**State Synchronization** (`tests/sdk/components/`):
- PanelStore manages single source of truth for workflow/session state with version increments
- OrchestratorPanel renders from store subscriptions (listener pattern)
- SessionGraphPanel derives visual layout from parent dependency arrays
- WorkflowPickerPanel filters registry by agent to present only relevant workflows

**Entry Point Coordination**:
- `createWorkflowCli(registry)` builds the primary entry point
- `toCommand(cli)` adapts to Commander for CLI integration
- `runCli([clis], cliFn)` handles orchestrator re-entry detection transparently

## Summary

Atomic's deterministic workflows operate through three key mechanisms tested extensively in `tests/`:

1. **Registry-based Dispatch** — Immutable workflow registry indexed by `<agent>/<name>` ensures consistent lookup across all execution contexts
2. **Graph Inference** — GraphFrontierTracker infers deterministic dependency graphs from stage spawn/settle calls, supporting sequential chains, parallel fans, and nested scopes
3. **Orchestrator Re-entry Pattern** — Environment variables (`ATOMIC_ORCHESTRATOR_MODE`, `ATOMIC_WF_KEY`, `ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`, `ATOMIC_WF_INPUTS`) enable workflows to be spawned as child processes while maintaining state visibility and execution determinism through the parent orchestrator

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
### Files Analysed

1. `tests/sdk/workflow-cli.test.ts` (630 LOC)
2. `tests/sdk/registry.test.ts` (227 LOC)
3. `tests/sdk/commander.test.ts` (246 LOC)
4. `tests/sdk/runtime/executor.test.ts` (210 LOC)
5. `tests/sdk/runtime/graph-inference.test.ts` (205 LOC)
6. `tests/sdk/runtime/tmux.test.ts` (1000+ LOC, sampled to ~590 LOC)
7. `tests/sdk/components/orchestrator-panel-store.test.ts` (344 LOC)
8. `tests/sdk/providers/claude-wait-for-idle.test.ts` (346 LOC)
9. `tests/sdk/providers/claude-watch-hil-marker.test.ts` (167 LOC)
10. `tests/sdk/management-commands.test.ts` (84 LOC)

---

### Per-File Notes

#### `tests/sdk/workflow-cli.test.ts`

- **Role:** Primary integration test for `createWorkflowCli`, the registry-based CLI factory that is the user-facing entry point for launching deterministic workflows. Covers construction, option shape, argv parsing, input precedence resolution, orchestrator re-entry detection, and the interactive picker branch.

- **Key tests:**
  - `"ATOMIC_ORCHESTRATOR_MODE=1 + ATOMIC_WF_KEY calls runOrchestrator, not executeWorkflow"` (`workflow-cli.test.ts:406`) — verifies that when the environment signals orchestrator re-entry, the CLI dispatches to `runOrchestrator(def)` (the in-process agent execution path) and never touches `executeWorkflow` (the tmux spawn path).
  - `"ATOMIC_ORCHESTRATOR_MODE=1 without ATOMIC_WF_KEY throws"` (`workflow-cli.test.ts:422`) — guards the invariant that both env vars must be set together.
  - `"ATOMIC_WF_KEY not found in registry throws"` (`workflow-cli.test.ts:431`) — validates registry-lookup failure semantics.
  - `"without ATOMIC_ORCHESTRATOR_MODE, runOrchestrator is never called"` (`workflow-cli.test.ts:441`) — confirms the normal path always uses `executeWorkflow`.
  - `"same-name + different-type inputs across two workflows throws with both workflow names"` (`workflow-cli.test.ts:172`) — verifies the CLI's upfront input-union validation: conflicting input types across registered workflows are caught at construction time, not at runtime.
  - `".run() inputs override createWorkflowCli({ inputs })"` (`workflow-cli.test.ts:345`) — exercises the three-level input precedence: `defineWorkflow` default < `createWorkflowCli` factory default < `.run()` call-site override < CLI argv.
  - `"--output-type value reaches workflow inputs under key 'output-type'"` (`workflow-cli.test.ts:458`) — exercises hyphenated input name round-trip through Commander's camelCase conversion back to the original key name.
  - Picker branch tests (`workflow-cli.test.ts:559–622`) — verify that when `--name` is omitted in a TTY, `WorkflowPickerPanel.create` is called with the filtered agent-specific registry, and that `destroy()` is called on both selection and cancellation.

- **Control flow exercised:**
  - `cli.run()` detects `ATOMIC_ORCHESTRATOR_MODE === "1"` → reads `ATOMIC_WF_KEY` → calls `registry.get(key)` → dispatches `runOrchestrator(def)`.
  - Without the env signal: parses argv via Commander → resolves `(name, agent)` → calls `executeWorkflow(opts)` with `workflowKey`, `entrypointFile`, `inputs`.
  - Construction: `createWorkflowCli(registry)` performs upfront union of all registered workflow input schemas, throwing on type conflicts.

- **Data flow exercised:**
  - `WorkflowRunOptions.workflowKey` takes the form `"<agent>/<name>"` and is passed verbatim to `executeWorkflow`.
  - Input values flow: argv string → Commander parsed value → key de-camelCased → `WorkflowRunOptions.inputs` map.
  - Picker result (`WorkflowPickerResult`) carries `{ workflow, inputs }` and feeds directly into `executeWorkflow`.

- **Dependencies:** `createWorkflowCli` (`src/sdk/workflow-cli.ts`), `executeWorkflow` and `runOrchestrator` (`src/sdk/runtime/executor.ts`, mocked), `WorkflowPickerPanel` (`src/sdk/components/workflow-picker-panel.tsx`, mock-patched), `createRegistry` (`src/sdk/registry.ts`), `defineWorkflow` (`src/sdk/define-workflow.ts`), `toCommand` (`src/sdk/commander.ts`).

---

#### `tests/sdk/registry.test.ts`

- **Role:** Unit tests for the immutable, chainable workflow registry. Validates that workflows are stored and looked up under a deterministic `"<agent>/<name>"` composite key, that the registry is copy-on-write (each `.register()` returns a new instance), and that provider-level validators fire synchronously at registration time.

- **Key tests:**
  - `"returns a NEW registry instance"` (`registry.test.ts:38`) — immutability of the chainable API.
  - `"original registry unchanged after register (immutability)"` (`registry.test.ts:44`) — verifies `.register()` does not mutate the receiver.
  - `"adds workflow at key ${agent}/${name}"` (`registry.test.ts:51`) — confirms the exact composite key format used throughout the workflow system.
  - `"duplicate key throws with exact error message"` (`registry.test.ts:65`) — guards against accidental double-registration.
  - `"missing key throws with exact error message"` (`registry.test.ts:84`) — specifies the runtime contract of `.get()`.
  - `"result is frozen (push throws)"` (`registry.test.ts:121`) — `.list()` returns a `Object.freeze`-d array, preventing mutation.
  - `"warnings from provider validator surface via console.warn with [registry] prefix"` (`registry.test.ts:152`) — verifies that copilot-provider validators run during `.register()` and emit structured warnings.
  - `"insertion order matches"` (`registry.test.ts:110`) — `.list()` preserves registration order, which determines graph traversal order.

- **Control flow exercised:**
  - `.register(wf)` → validates provider constraints (synchronous) → copies internal map with new entry → returns new `Registry` instance.
  - `.get(key)` → map lookup → throws `[atomic] Workflow "<key>" is not registered.` on miss.
  - `.resolve(name, agent)` → composed `.get(agent + "/" + name)` → returns `undefined` on miss (no-throw variant).

- **Data flow exercised:**
  - `WorkflowDefinition.agent` + `WorkflowDefinition.name` → composite key string.
  - Internal map preserved as frozen array snapshot via `.list()`.

- **Dependencies:** `createRegistry` (`src/sdk/registry.ts`), `defineWorkflow` (`src/sdk/define-workflow.ts`), `WorkflowDefinition` type (`src/sdk/types.ts`).

---

#### `tests/sdk/commander.test.ts`

- **Role:** Focused unit tests for `runCli`, the bootstrap helper that transparently intercepts orchestrator re-entry before handing control to the user-supplied CLI callback. Confirms the two-branch dispatch, the key-parsing contract, and multi-cli array resolution.

- **Key tests:**
  - `"invokes the cliFn callback when ATOMIC_ORCHESTRATOR_MODE is unset"` (`commander.test.ts:85`) — normal (non-orchestrator) path calls the user function.
  - `"resolves the cli's registry and calls runOrchestrator, skipping cliFn"` (`commander.test.ts:125`) — orchestrator path: `runOrchestrator` is called with the resolved `WorkflowDefinition`, `cliFn` is never called.
  - `"tries clis in order; picks the first match"` (`commander.test.ts:159`) — when an array of clis is provided, `runCli` searches each registry in order.
  - `"throws when ATOMIC_WF_KEY is malformed (no slash)"` (`commander.test.ts:174`) — validates the `"<agent>/<name>"` key format before attempting registry lookup.
  - `"throws when ATOMIC_WF_KEY is missing entirely"` (`commander.test.ts:184`) — missing key is also treated as malformed.
  - `"ATOMIC_ORCHESTRATOR_MODE=0 does not trigger orchestrator path"` (`commander.test.ts:206`) — only the string value `"1"` activates re-entry.

- **Control flow exercised:**
  - `runCli(cli, cliFn)`: checks `process.env.ATOMIC_ORCHESTRATOR_MODE === "1"` → if true, splits `ATOMIC_WF_KEY` on first `/` → iterates `clis` searching for registry hit → calls `runOrchestrator(def)` → returns. Otherwise calls `await cliFn()`.

- **Data flow exercised:**
  - `ATOMIC_WF_KEY` string → `[agent, name]` destructure → `registry.resolve(name, agent)` → `WorkflowDefinition` passed to `runOrchestrator`.

- **Dependencies:** `runCli`, `toCommand` (`src/sdk/commander.ts`), `createWorkflowCli` (`src/sdk/workflow-cli.ts`), `runOrchestrator` (`src/sdk/runtime/executor.ts`, mocked), `createRegistry` (`src/sdk/registry.ts`), `defineWorkflow` (`src/sdk/define-workflow.ts`).

---

#### `tests/sdk/runtime/executor.test.ts`

- **Role:** Unit tests for `WorkflowRunOptions` shape, `validateOrchestratorEnv`, and `runOrchestrator`'s TypeScript contract. Also contains a source-text regression guard that verifies the env var names in the launcher script built inside `executeWorkflow`.

- **Key tests:**
  - `"accepts entrypointFile and workflowKey (compile-time coverage)"` (`executor.test.ts:15`) — documents the required fields `entrypointFile` (path to the Bun worker entry) and `workflowKey` (`"<agent>/<name>"`) in `WorkflowRunOptions`.
  - `"WorkflowRunOptions does not have workflowFile field"` (`executor.test.ts:45`) — regression guard: the old `workflowFile` field is gone; `@ts-expect-error` enforces the absence.
  - `"throws when ATOMIC_WF_ID is missing"` (`executor.test.ts:96`) — four required env vars for the orchestrator process: `ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`.
  - `"throws for invalid ATOMIC_WF_AGENT value"` (`executor.test.ts:133`) — agent value is validated against the known enum of `"claude"`, `"opencode"`, `"copilot"`.
  - `"signature accepts a compiled WorkflowDefinition"` (`executor.test.ts:165`) — `runOrchestrator` parameter type is `WorkflowDefinition`, not a file path string.
  - `"ATOMIC_ORCHESTRATOR_MODE is the orchestrator re-entry signal (not ATOMIC_WF_FILE)"` (`executor.test.ts:193`) — reads the actual source of `executor.ts` and asserts the exact env var names used in the inline launcher script template.

- **Control flow exercised:**
  - `validateOrchestratorEnv()` (from `src/sdk/runtime/executor-env.ts`): reads all four `ATOMIC_WF_*` vars from `process.env`, throws with the missing var name if any is absent, throws with the bad value if `ATOMIC_WF_AGENT` is not in the allowed set.

- **Data flow exercised:**
  - `ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD` → validated struct passed to the orchestrator run loop inside `runOrchestrator`.
  - `WorkflowRunOptions`: `{ definition, agent, entrypointFile, workflowKey, inputs? }` → provided to `executeWorkflow`, which uses `entrypointFile` to build the Bun re-entry launcher and injects `ATOMIC_ORCHESTRATOR_MODE=1` + `ATOMIC_WF_KEY` into the child process env.

- **Dependencies:** `runOrchestrator` and `WorkflowRunOptions` (`src/sdk/runtime/executor.ts`), `validateOrchestratorEnv` (`src/sdk/runtime/executor-env.ts`), `defineWorkflow` (`src/sdk/define-workflow.ts`).

---

#### `tests/sdk/runtime/graph-inference.test.ts`

- **Role:** Pure unit tests for `GraphFrontierTracker`, the stateful object that infers the DAG of stage dependencies from the sequence of `onSpawn()` and `onSettle(name)` calls as the workflow's `async` function executes. This is the mechanism by which Atomic's deterministic multi-agent graphs are reconstructed at runtime without any explicit edge declarations.

- **Key tests:**
  - `"first stage gets the scope parent"` (`graph-inference.test.ts:6`) — `new GraphFrontierTracker("orchestrator")` → `onSpawn()` returns `["orchestrator"]`.
  - `"sequential chain: each stage depends on the previous"` (`graph-inference.test.ts:10`) — after `onSettle("a")`, the next `onSpawn()` returns `["a"]`.
  - `"parallel fan-out: siblings share the same parent"` (`graph-inference.test.ts:26`) — two `onSpawn()` calls before either `onSettle` both return `["a"]`, using the `parallelAncestors` buffer.
  - `"fan-in: stage after Promise.all depends on all parallel stages"` (`graph-inference.test.ts:39`) — after `onSettle("b")` and `onSettle("c")`, the next `onSpawn()` returns `["b", "c"]`.
  - `"hello-parallel: describe → [summarize-a, summarize-b] → merge"` (`graph-inference.test.ts:56`) — end-to-end example of the canonical parallel pattern.
  - `"ralph loop: sequential chain across iterations"` (`graph-inference.test.ts:73`) — multi-iteration loop: each planner/orchestrator/reviewer stage correctly depends on the previous one across loop boundaries.
  - `"diamond pattern: sequential → parallel → fan-in → parallel → fan-in"` (`graph-inference.test.ts:149`) — complex nested fan-out/fan-in topology.
  - `"nested scopes get independent trackers"` (`graph-inference.test.ts:132`) — each `ctx.stage()` callback gets its own `GraphFrontierTracker` instance.
  - `"conditional skip: skipped stage is invisible to tracker"` (`graph-inference.test.ts:94`) — stages inside un-entered branches produce no `onSpawn`/`onSettle` and are invisible.
  - `"fire-and-forget: concurrent stages are siblings"` (`graph-inference.test.ts:190`) — an un-awaited `ctx.stage()` that spawns before another `onSpawn` both receive the same parent.

- **Control flow exercised:**
  - `onSpawn()`: reads the current `frontier` (array of last-settled names); if frontier is empty uses `parallelAncestors`; clears frontier; returns the parent list.
  - `onSettle(name)`: appends `name` to frontier and to `parallelAncestors`; clears `parallelAncestors` on first frontier population after a spawn group.

- **Data flow exercised:**
  - `GraphFrontierTracker` state: `frontier: string[]`, `parallelAncestors: string[]`, `scopeParent: string` — transitions driven by the interleaved spawn/settle event sequence that mirrors `async`/`await` control flow in the workflow `run` function.

- **Dependencies:** `GraphFrontierTracker` (`src/sdk/runtime/graph-inference.ts`).

---

#### `tests/sdk/runtime/tmux.test.ts`

- **Role:** Tests for the tmux infrastructure layer — the low-level session/pane/window lifecycle operations, cross-platform mux binary resolution, env var injection, session naming conventions, and output normalization. These operations underpin the session isolation mechanism that gives each workflow stage its own tmux pane.

- **Key tests:**
  - `"caches the result after first call"` (`tmux.test.ts:116`) — `getMuxBinary()` is deterministic: it resolves once and returns the cached value on subsequent calls; `resetMuxBinaryCache()` invalidates it.
  - `"ignores tmux-only shims on Windows"` (`tmux.test.ts:130`) — on `win32`, plain `tmux` is excluded; `psmux`/`pmux` are preferred.
  - `"returns true when TMUX env var is set"` (`tmux.test.ts:197`) and `"returns true when PSMUX env var is set"` (`tmux.test.ts:202`) — `isInsideTmux()` checks both `TMUX` and `PSMUX` env vars.
  - `"parses workflow session with agent"` (`tmux.test.ts:361`) — `parseSessionName("atomic-wf-claude-ralph-a1b2c3d4")` returns `{ type: "workflow", agent: "claude" }`.
  - `"parses workflow session with hyphenated workflow name"` (`tmux.test.ts:365`) — hyphenated names like `"atomic-wf-opencode-my-cool-workflow-a1b2c3d4"` still parse agent correctly.
  - `"filters psmux internal target sessions and metadata leakage"` (`tmux.test.ts:432`) — `parseListSessionsOutput` strips psmux-internal rows and returns only `atomic-*` sessions.
  - `"installs a direct pane-kill hook alongside the tmux pane-exited hook"` (`tmux.test.ts:509`) — `buildKillSessionOnPaneExitHooks` generates two hook entries (`pane-exited` and `after-kill-pane`) so that sessions self-terminate when their main pane exits.
  - Integration tests (conditional on `tmuxAvailable`, `tmux.test.ts:549–586`) — `createSession`, `sessionExists`, `createWindow`, `createPane`, `killSession` full lifecycle with real tmux.

- **Control flow exercised:**
  - `getMuxBinary()` → `Bun.which` lookup for `psmux`, `pmux`, then `tmux` (platform-gated) → cached.
  - `parseSessionName(name)` → regex match on `atomic-chat-<agent>-<hash>` or `atomic-wf-<agent>-<name>-<hash>` patterns → `{ type, agent }`.
  - `parseListSessionsOutput(output, getEnv)` → line-by-line parse with field delimiter `__ATOMIC_SESSION_FIELD__` → filters non-atomic rows → calls `getEnv(name, "ATOMIC_AGENT")` fallback for `atomic-senv-*` sessions.

- **Data flow exercised:**
  - Session name string → parsed `{ type: "chat"|"workflow", agent: "claude"|"opencode"|"copilot" }`.
  - `setSessionEnv` / `getSessionEnv` → `ATOMIC_AGENT` value stored and retrieved from the tmux session environment, used as an agent fallback when the session name does not encode the agent.

- **Dependencies:** All exported symbols from `src/sdk/runtime/tmux.ts`; node `fs`, `os`, `path` for fixture creation.

---

#### `tests/sdk/components/orchestrator-panel-store.test.ts`

- **Role:** Tests for `PanelStore`, the observable state container that tracks the lifecycle of every session in a running workflow execution — orchestrator plus all stages. Validates the full set of status transitions that the panel UI reacts to.

- **Key tests:**
  - `"creates orchestrator session as first entry"` (`orchestrator-panel-store.test.ts:58`) — `setWorkflowInfo` always inserts an `"orchestrator"` session in `"running"` state with `parents: []` as the first element.
  - `"adds sessions with default parent of orchestrator"` (`orchestrator-panel-store.test.ts:66`) — stage sessions with empty `parents` get `["orchestrator"]` injected as their parent list.
  - `"preserves explicit parents when provided"` (`orchestrator-panel-store.test.ts:74`) — stages with a non-empty `parents` array (e.g. `["s1"]`) are stored verbatim, encoding the DAG edges.
  - `"transitions session from running to awaiting_input"` (`orchestrator-panel-store.test.ts:225`) — `awaitingInput(name)` is a guarded transition: only applies when the session is currently `"running"`.
  - `"does NOT transition session from pending status"` (`orchestrator-panel-store.test.ts:242`) — `awaitingInput` on a pending session is a no-op; the guard prevents premature HIL signaling.
  - `"transitions session from awaiting_input back to running"` (`orchestrator-panel-store.test.ts:288`) — `resumeSession` is the symmetric guard: only from `"awaiting_input"` → `"running"`.
  - `"marks orchestrator as complete"` (`orchestrator-panel-store.test.ts:176`) — `setCompletion` transitions the synthetic orchestrator session to `"complete"`.
  - `"marks orchestrator as error"` (`orchestrator-panel-store.test.ts:199`) — `setFatalError` marks the orchestrator as `"error"` and sets `completionReached`.
  - `"calls listener on emit"` (`orchestrator-panel-store.test.ts:25`) and `"unsubscribe removes listener"` (`orchestrator-panel-store.test.ts:31`) — pub/sub mechanism driving UI re-renders.

- **Control flow exercised:**
  - Status machine per session: `pending` → `running` → `complete`|`error`; `running` → `awaiting_input` → `running`.
  - Each mutation increments `store.version` (optimistic concurrency for UI diffing) and emits to all subscribers.
  - Guard conditions: `awaitingInput` and `resumeSession` both check current status before applying the transition and silently no-op + skip emit if the guard fails.

- **Data flow exercised:**
  - `setWorkflowInfo(name, agent, stages, prompt)` → builds `sessions` array with orchestrator prepended; each stage entry receives `{ name, parents, status: "pending", startedAt: 0 }`.
  - `startSession(name)` / `completeSession(name)` / `failSession(name, error)` → locate session by name, mutate `status`/`endedAt`/`error`, emit.

- **Dependencies:** `PanelStore` (`src/sdk/components/orchestrator-panel-store.ts`).

---

#### `tests/sdk/providers/claude-wait-for-idle.test.ts`

- **Role:** Tests for `waitForIdle`, the mechanism by which the orchestrator detects when a Claude Code agent session has finished its turn. The function watches a marker file directory (`~/.atomic/claude-stop/<sessionId>`) via `fs.watch` and reads the transcript once the marker appears. Covers slicing, mid-loop flush races, and the pre-existing-marker race.

- **Key tests:**
  - `"resolves and returns sliced messages when marker appears with no HIL"` (`claude-wait-for-idle.test.ts:105`) — core flow: marker write triggers transcript read; the returned array is sliced to only messages added since `transcriptBeforeCount`.
  - `"returns empty slice when transcript has no new messages beyond baseline"` (`claude-wait-for-idle.test.ts:171`) — when `getSessionMessages` returns exactly `transcriptBeforeCount` items, the slice is empty.
  - `"polls the transcript on one marker event when the final assistant message hasn't flushed yet"` (`claude-wait-for-idle.test.ts:214`) — mid-loop flush race: first transcript read shows `stop_reason: "tool_use"` (mid-agent-loop); `waitForIdle` detects `_isMidAgentLoop` and polls until the final `stop_reason: "end_turn"` message appears.
  - `"resolves immediately when the marker already exists at call time"` (`claude-wait-for-idle.test.ts:285`) — pre-existing-marker race: if the Stop hook fires between `clearStaleMarker()` and `fs.watch` attach, the file is already on disk; `waitForIdle` must check on startup.
  - `"resolves cleanly without throwing when marker appears (abort path exercised)"` (`claude-wait-for-idle.test.ts:319`) — the `fs.watch` watcher is aborted (via internal abort controller) after the marker is detected; no unhandled rejection.

- **Control flow exercised:**
  - `waitForIdle(claudeSessionId, transcriptBeforeCount)` → optionally checks for pre-existing marker synchronously → attaches `fs.watch` on `markerDir()` → on `"rename"` event matching `sessionId` filename → calls `getSessionMessages(sessionId)` → checks `_isMidAgentLoop` on last message → if mid-loop, polls with delay → slices from `transcriptBeforeCount` → resolves with slice.

- **Data flow exercised:**
  - `claudeSessionId` → `markerPath(sessionId)` file path → `fs.watch` filename match → `getSessionMessages(sessionId)` → `SessionMessage[]` → `.slice(transcriptBeforeCount)` → returned array.
  - `sessionMessageQueue` (test fixture) → mocked `getSessionMessages` → drives the polling sequence.

- **Dependencies:** `waitForIdle`, `markerDir`, `markerPath` (`src/sdk/providers/claude.ts`); `getSessionMessages` (`@anthropic-ai/claude-agent-sdk`, mocked); `node:fs/promises`, `node:crypto`.

---

#### `tests/sdk/providers/claude-watch-hil-marker.test.ts`

- **Role:** Tests for `watchHILMarker`, the Human-In-the-Loop detection mechanism. Claude Code's `PreToolUse`/`PostToolUse` hooks write/remove a marker file at `~/.atomic/claude-hil/<sessionId>` when the agent invokes an `AskUserQuestion` tool. `watchHILMarker` exposes these state changes via a boolean callback.

- **Key tests:**
  - `"fires onHIL(true) when marker is created, then onHIL(false) when it is removed"` (`claude-watch-hil-marker.test.ts:56`) — end-to-end: marker write → `onHIL(true)`; marker unlink → `onHIL(false)`.
  - `"fires onHIL(true) on attach when marker already exists (resumed-session race)"` (`claude-watch-hil-marker.test.ts:84`) — handles the case where the session resumes mid-HIL; the initial `existsSync` check fires `onHIL(true)` synchronously.
  - `"ignores marker events for unrelated session ids"` (`claude-watch-hil-marker.test.ts:103`) — `fs.watch` watches the whole `hil/` directory; events for other sessions are filtered by filename comparison.
  - `"resolves cleanly when aborted before any events arrive"` (`claude-watch-hil-marker.test.ts:125`) — `AbortSignal` terminates the watcher cleanly; the returned promise resolves to `undefined`.
  - `"does not fire redundant callbacks on repeated events with the same HIL state"` (`claude-watch-hil-marker.test.ts:142`) — a `wasHIL` guard prevents duplicate `onHIL(true)` calls when a modify event fires after the create event.

- **Control flow exercised:**
  - `watchHILMarker(sessionId, onHIL, signal)` → `existsSync(markerPath)` check at attach time → `fs.watch(hilDir, { signal })` → on each event: filter by `event.filename === sessionId` → `existsSync` to determine current state → compare to `wasHIL` guard → call `onHIL(current)` if changed.
  - `AbortSignal` passed to `fs.watch` causes the watcher to stop; promise resolves.

- **Data flow exercised:**
  - `sessionId` → `join(claudeHookDirs().hil, sessionId)` file path → `existsSync` result (boolean) → `onHIL(boolean)` callback invocation.

- **Dependencies:** `watchHILMarker` (`src/sdk/providers/claude.ts`), `claudeHookDirs` (`src/commands/cli/claude-stop-hook.ts`); `node:fs/promises`, `node:crypto`.

---

#### `tests/sdk/management-commands.test.ts`

- **Role:** Tests for `addSessionSubcommand`, `addStatusSubcommand`, and `addManagementCommands` — the builders that attach session-management subcommands to any Commander program. Verifies the declared command/option shape without executing the commands.

- **Key tests:**
  - `"adds a 'session' command with 'list' / 'connect' / 'kill' children"` (`management-commands.test.ts:17`) — the `session` subcommand tree has exactly three children.
  - `"'session kill' exposes -y/--yes for non-interactive callers"` (`management-commands.test.ts:28`) — the kill command supports a `--yes` flag for scripted use.
  - `"all three subcommands accept repeatable -a/--agent filters"` (`management-commands.test.ts:38`) — each session subcommand supports filtering by agent name.
  - `"adds a 'status' command accepting an optional session id"` (`management-commands.test.ts:51`) — the `status` command takes an optional positional argument.
  - `"'status' exposes --format json|text option with 'json' default"` (`management-commands.test.ts:64`) — default format is `"json"` for machine consumption.

- **Control flow exercised:** Command registration only; no execution. `addManagementCommands` delegates to both `addSessionSubcommand` and `addStatusSubcommand` in a single call.

- **Data flow exercised:** Commander `Command` tree construction; option/argument metadata inspection.

- **Dependencies:** `addSessionSubcommand`, `addStatusSubcommand`, `addManagementCommands` (`src/sdk/management-commands.ts`); `@commander-js/extra-typings`.

---

### Cross-Cutting Synthesis

The test suite exercises Atomic's deterministic workflow mechanism through three interlocking layers. The first layer, covered by `registry.test.ts` and `workflow-cli.test.ts`, establishes the static contract: workflows are registered under immutable `"<agent>/<name>"` composite keys, input schemas are validated for cross-workflow consistency at construction time, and input values resolve through a fixed three-level precedence chain (workflow default < factory default < call-site override < CLI argv). The second layer, covered by `executor.test.ts` and `commander.test.ts`, exercises the two-branch dispatch mechanism that makes re-entry deterministic: when `ATOMIC_ORCHESTRATOR_MODE=1` is present in the environment (set by `executeWorkflow`'s inline launcher script on the re-spawned process), `runCli`/`cli.run()` skips the normal path entirely and routes directly to `runOrchestrator(def)` using `ATOMIC_WF_KEY` to retrieve the workflow definition from the registry. The third layer, covered by `graph-inference.test.ts`, `orchestrator-panel-store.test.ts`, `claude-wait-for-idle.test.ts`, and `claude-watch-hil-marker.test.ts`, exercises the runtime determinism mechanisms: `GraphFrontierTracker` reconstructs the DAG of stage dependencies purely from the interleaved `onSpawn`/`onSettle` event sequence (no explicit edge declarations), `PanelStore` enforces a guarded session status machine (pending → running → awaiting_input ↔ running → complete|error) with version-tagged change notification, and the Claude provider uses marker-file-based synchronization (`~/.atomic/claude-stop/<id>` and `~/.atomic/claude-hil/<id>`) with polling fallback for mid-loop flush races and pre-existing-marker startup races, ensuring that transcript slicing and HIL detection remain correct even under concurrent filesystem timing.

---

### Out-of-Partition References

The test files in `tests/` directly exercise source modules from `src/`:

- `/Users/norinlavaee/atomic-product-hunt/src/sdk/workflow-cli.ts` — `createWorkflowCli`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/registry.ts` — `createRegistry`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/define-workflow.ts` — `defineWorkflow`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/commander.ts` — `toCommand`, `runCli`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/types.ts` — `WorkflowDefinition`, `WorkflowRunOptions`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/runtime/executor.ts` — `executeWorkflow`, `runOrchestrator`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/runtime/executor-env.ts` — `validateOrchestratorEnv`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/runtime/graph-inference.ts` — `GraphFrontierTracker`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/runtime/tmux.ts` — all tmux operations
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/components/orchestrator-panel-store.ts` — `PanelStore`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/components/workflow-picker-panel.tsx` — `WorkflowPickerPanel`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/providers/claude.ts` — `waitForIdle`, `watchHILMarker`, `markerDir`, `markerPath`
- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/claude-stop-hook.ts` — `claudeHookDirs`
- `/Users/norinlavaee/atomic-product-hunt/src/sdk/management-commands.ts` — `addSessionSubcommand`, `addStatusSubcommand`, `addManagementCommands`
- `@anthropic-ai/claude-agent-sdk` — `getSessionMessages`, `SessionMessage` (mocked in `claude-wait-for-idle.test.ts`)
- `@commander-js/extra-typings` — `Command` (used in `management-commands.test.ts` and `commander.test.ts`)

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
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

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
