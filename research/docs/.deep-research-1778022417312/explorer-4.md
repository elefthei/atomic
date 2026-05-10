# Partition 4 of 16 — Findings

## Scope
`src/commands/` (24 files, 5,197 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Atomic Deterministic Workflows — File Locator (Partition 4/16)

## Scope
`src/commands/` — 24 files, ~4,950 LOC

Workflow CLI commands and orchestration hooks that expose the SDK to users and manage session state across agent boundaries.

---

## Implementation

### Workflow Execution Entry Points

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow.ts` — Thin delegation to SDK `WorkflowCli`, mounting the workflow command and its subcommands (`list`, `inputs`, `status`, `session`).

### Workflow Subcommands

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow-list.ts` — Lists registered workflows from the builtin registry, grouped by `(name, description)`, with agent badges; supports `-a <agent>` filtering.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow-inputs.ts` — Prints a workflow's declared input schema in JSON or text format. Free-form workflows synthesize a `prompt` field; structured workflows enumerate typed fields with defaults and enum values. Core functions: `buildInputsPayload()`, `renderInputsText()`.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow-status.ts` — Queries state of one or all running workflows. Reads status snapshots from `~/.atomic/sessions/<id>/status.json` (written by orchestrator on every panel mutation) and falls back to tmux liveness. Reports overall state (`in_progress|error|completed|needs_review`) and per-stage detail. Key functions: `buildReport()`, `workflowStatusCommand()`.

### Session Management

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/session.ts` — Shared session CLI commands for picker/inspector across chat and workflow scopes. Wraps tmux `list-sessions` / `attach-session` without direct tmux interaction. Filters by session type (chat|workflow) via the `type` field in tmux session names. Key exports: `renderSessionList()`, session commands injected via `SessionDeps`.

### Chat Command

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/chat.ts` — Barrel export for `commands/cli/chat/` directory.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/chat/index.ts` — Chat CLI implementation (free-form agent conversation without workflow structure).

### Claude Agent Integration Hooks

**All hooks write/read marker files in `~/.atomic/` subdirectories; driven by filesystem watches in the SDK runtime.**

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/claude-stop-hook.ts` — Invoked at end of each Claude turn. Writes completion marker to `~/.atomic/claude-stop/<session_id>` (read by runtime via `fs.watch`). Polls `~/.atomic/claude-queue/<session_id>` for follow-up prompts (no tmux send-keys). If prompt found, emits `{"decision":"block","reason":<prompt>}` to keep agent loop running. Signals session end via `~/.atomic/claude-release/<session_id>`. Core: `claudeHookDirs()` (exported for SDK provider and tests), `claudeStopHookCommand()`.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/claude-ask-hook.ts` — PreToolUse/PostToolUse/PostToolUseFailure hook for `AskUserQuestion` tool. Writes `~/.atomic/claude-hil/<session_id>` on enter; removes on exit. Drives the blue "awaiting_input" pulse on node cards via runtime watcher. Core: `claudeAskHookCommand(mode: "enter"|"exit")`.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/claude-session-start-hook.ts` — SessionStart hook that writes `~/.atomic/claude-ready/<session_id>` as positive readiness signal. Fires before JSONL transcript creation, stricter than file polling. Core: `claudeSessionStartHookCommand()`.

### Initialization

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/init.ts` — Barrel export.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/init/index.ts` — Init command for first-time setup.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/init/onboarding.ts` — Onboarding flow helpers.

### Configuration & Utilities

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/config.ts` — Config command (agent configuration inspection/management).

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/completions.ts` — Shell completions generator.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/footer.tsx` — React/OpenTUI footer component (common across TUI views).

---

## Tests

### Integration & Command Tests

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow-command.test.ts` — Tests `workflowCommand` (from `createWorkflowCli()`). Mocks `executeWorkflow` at module-load time (before dynamic import of workflow.ts) to spy on workflow execution invocations. Tests command parsing, option handling, and error cases. Module mock strategy ensures real executor is cached before mock.module replacement.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow-inputs.test.ts` — Tests `buildInputsPayload()` and `renderInputsText()`. Fixtures: `fakeDiscovered()`, `fakeDefinition()`, `makeDeps()`. Tests both free-form and structured workflows, enum rendering, required field handling.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow-list.test.ts` — Tests workflow list rendering and filtering.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/workflow-status.test.ts` — Tests status snapshot parsing, tmux liveness fallback, single vs. all-workflow queries.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/session.test.ts` — Tests session picker/list filtering by type (chat|workflow), session state rendering, attachment status. Mocks tmux operations and prompt selection via `SessionDeps`.

### Hook Tests

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/claude-ask-hook.test.ts` — Tests AskUserQuestion hook enter/exit paths, marker file creation/deletion.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/claude-stop-hook.test.ts` — Tests Stop hook queue polling, release detection, payload parsing, timeout handling.

- `/Users/norinlavaee/atomic-product-hunt/src/commands/cli/chat/index.test.ts` — Chat command tests.

---

## Types / Interfaces

Core workflow types (imported from SDK `workflows/index.ts`):
- `WorkflowDefinition` — Registered workflow metadata (name, agent, description, inputs)
- `WorkflowInput` — Single input field (name, type, required, description, values)
- `AgentType` — Agent variant (claude|copilot|opencode)

Command option types:
- `WorkflowStatusOptions` — Filters for status command (id, format)
- `WorkflowListOptions` — Agent filter
- `WorkflowInputsOptions` — Workflow name and agent
- `SessionScope` — "chat"|"workflow"|"all"

Hook payload types:
- `ClaudeStopHookPayload` — session_id, transcript_path, cwd, stop_hook_active
- `ClaudeAskHookPayload` — session_id, hook_event_name, tool_name, cwd
- `ClaudeSessionStartHookPayload` — session_id, source, transcript_path, cwd

Status reporting:
- `WorkflowStatusReport` — Resolved workflow state (id, workflowRunId, workflowName, agent, overall, alive, updatedAt, sessions[], fatalError)
- `WorkflowOverallStatus` — "in_progress"|"needs_review"|"completed"|"error"

Dependency injection:
- `StatusDeps` — isTmuxInstalled, sessionExists, listSessions, readSnapshot, sessionsBaseDir
- `SessionDeps` — All tmux operations + prompt functions (select, confirm)
- `WorkflowInputsDeps` — Registry lookup and workflow loading

---

## Configuration

None in scope; configuration files referenced but managed by parent services:
- `AGENT_CONFIG` (from `../../services/config/`) — Agent settings

---

## Examples / Fixtures

Test fixtures in `workflow-inputs.test.ts`:
- `fakeDiscovered()` — Mock `ResolvedWorkflowEntry`
- `fakeDefinition()` — Mock `WorkflowDefinition` with typed inputs
- `makeDeps()` — Mock `WorkflowInputsDeps` with fake registry

Session test fixtures:
- Mock sessions with type="chat"|"workflow", agent, created timestamp, attached status

---

## Documentation

### Inline Documentation

Each major file opens with a detailed JSDoc block explaining:

- **workflow.ts** — Delegates to SDK WorkflowCli, mounting command and subcommands
- **workflow-list.ts** — Registry listing, agent filtering, rendering logic
- **workflow-inputs.ts** — Schema discovery, free-form vs. structured workflows, output formats
- **workflow-status.ts** — Status sources (priority: snapshot > tmux fallback), report building
- **session.ts** — Tmux wrapping, session type filtering, picker/list UI
- **claude-stop-hook.ts** — Turn completion marker, queue polling, follow-up delivery via decision block, release signaling
- **claude-ask-hook.ts** — HIL marker for AskUserQuestion tool, watcher-driven UI pulse
- **claude-session-start-hook.ts** — SessionStart readiness signal (pre-JSONL)

### Architectural Notes

**Deterministic Workflow Orchestration:**

The commands layer exposes an event-driven, filesystem-based handshake protocol between the CLI orchestrator and Claude's agent loop:

1. **Execution Initiation** — `workflow.ts` delegates to SDK `createWorkflowCli()`, which reads workflow definitions from the builtin registry and executes via `executeWorkflow()`.

2. **Status Snapshots** — `workflow-status.ts` queries `~/.atomic/sessions/<id>/status.json`, written by the orchestrator on every panel mutation. Provides deterministic per-stage state and overall progress (`in_progress|error|completed|needs_review`).

3. **Turn Completion Signaling** — `claude-stop-hook.ts` writes `~/.atomic/claude-stop/<session_id>` at turn end. Orchestrator watches this via `fs.watch` to know when to read the updated transcript and decide next action (continue, HIL prompt, end).

4. **Follow-up Prompt Delivery** — Without tmux send-keys, `claude-stop-hook.ts` polls `~/.atomic/claude-queue/<session_id>` for enqueued prompts. If found, returns `{"decision":"block","reason":<prompt>}` to keep the agent loop running in the same session.

5. **Human-in-the-Loop (HIL) Signaling** — `claude-ask-hook.ts` writes/removes `~/.atomic/claude-hil/<session_id>` on AskUserQuestion tool entry/exit. Runtime watcher drives the blue "awaiting_input" pulse so users know the agent is blocked.

6. **Readiness Synchronization** — `claude-session-start-hook.ts` writes `~/.atomic/claude-ready/<session_id>` before JSONL exists, so spawn waits are resolved immediately rather than racing file creation.

**Session Metadata:** Tmux session names encode agent and workflow identity:
- `atomic-wf-<agent>-<name>-<runid>` (e.g., `atomic-wf-claude-ralph-a1b2c3d4`)
- `atomic-chat-<agent>-<runid>` (e.g., `atomic-chat-claude-abc123def`)

**Marker Files as State:** The `~/.atomic/` directory tree is the persistent, observable source of truth:
- `claude-stop/<id>` → turn completion
- `claude-queue/<id>` → pending follow-up
- `claude-release/<id>` → session end
- `claude-hil/<id>` → HIL active
- `claude-pid/<id>` → owning process ID
- `claude-ready/<id>` → session spawned

This allows orchestrators (including external agents) to coordinate without subprocess handles or shared memory.

---

## Notable Clusters

### Workflow Execution Pipeline
Files that together implement the workflow lifecycle:
- `workflow.ts` (entry) → `workflow-command.test.ts` (tested)
- Calls SDK `WorkflowCli` which invokes `executeWorkflow()` from `src/sdk/runtime/executor.ts`

### Hook Coordination
Three hooks share `claudeHookDirs()` to define marker locations:
- `claude-stop-hook.ts` (defines and exports `claudeHookDirs()`)
- `claude-ask-hook.ts` (imports `claudeHookDirs()`)
- `claude-session-start-hook.ts` (imports `claudeHookDirs()`)
- `src/sdk/providers/claude.ts` (runtime watcher, imports `claudeHookDirs()`)

### Status & Session Queries
Both query running tmux sessions and report state:
- `workflow-status.ts` — Workflow-specific (reads snapshot, reports per-stage detail)
- `session.ts` — Generic session picker (lists all, filters by type)

### Input Schema Discovery
Workflow inputs are printed by commands layer but defined in SDK:
- `workflow-inputs.ts` (CLI formatter/query) ← `buildInputsPayload()`, `renderInputsText()`
- SDK `workflows/index.ts` (WorkflowDefinition, WorkflowInput types)

---

## Summary Paragraph

The `src/commands/` directory implements the CLI surface for workflow orchestration and session management. It consists of thin, delegating command handlers that expose the SDK's `WorkflowCli`, `WorkflowDefinition` registry, and `executeWorkflow()` runtime to users. The deterministic workflow execution model is anchored in an event-driven, filesystem-based handshake: marker files in `~/.atomic/` subdirectories (stop, queue, release, hil, pid, ready) encode turn completion, follow-up delivery, and HIL status. Three Claude hooks (`stop`, `ask`, `session-start`) manage this protocol, writing and polling markers that the orchestrator watches via `fs.watch` to drive state transitions. Status queries read snapshots written by the orchestrator on every panel mutation, providing a deterministic, auditable view of workflow progress across stages and overall completion state. Session commands wrap tmux operations to allow users to inspect and reconnect to running sessions without direct tmux interaction, filtering by session type (chat vs. workflow) via naming conventions.

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
### Files Analysed

1. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/workflow.ts` (17 LOC)
2. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/workflow-list.ts` (131 LOC)
3. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/workflow-inputs.ts` (257 LOC)
4. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/workflow-status.ts` (331 LOC)
5. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/claude-stop-hook.ts` (406 LOC)
6. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/claude-ask-hook.ts` (85 LOC)
7. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/claude-session-start-hook.ts` (62 LOC)
8. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/session.ts` (392 LOC)
9. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/chat/index.ts` (372 LOC)
10. `/Users/norinlavaee/atomic-product-hunt/../atomic-product-hunt/src/commands/cli/init/index.ts` (42 LOC)

---

### Per-File Notes

#### 1. `src/commands/cli/workflow.ts`

**Role:** Thin entry-point barrel for the `atomic workflow` command tree.

**Key symbols:**
- `workflowCommand` (line 13) — a Commander `Command` object built by calling `toCommand(createWorkflowCli(createBuiltinRegistry()), "workflow")`. It is mounted by `src/cli.ts` and the `list`, `inputs`, `status`, and `session` subcommands are attached on top.

**Control flow:** Delegates entirely to `src/sdk/workflow-cli.ts` (via `createWorkflowCli`) and `src/sdk/workflows/builtin-registry.ts` (via `createBuiltinRegistry`). No logic lives here.

**Dependencies:**
- `../../sdk/workflow-cli.ts` — provides `createWorkflowCli`
- `../../sdk/commander.ts` — provides `toCommand`
- `../../sdk/workflows/builtin-registry.ts` — provides `createBuiltinRegistry`

---

#### 2. `src/commands/cli/workflow-list.ts`

**Role:** Implements `atomic workflow list [-a <agent>]`. Queries the builtin registry and renders all registered workflows, optionally filtered to a single agent.

**Key symbols:**
- `WorkflowListOptions` (line 15) — `{ agent?: string }`
- `WorkflowListDeps` (line 21) — injectable `{ list: () => readonly WorkflowDefinition[] }`, defaults to `createBuiltinRegistry().list()` (line 26)
- `groupEntries` (line 36) — groups registry entries by `(name, description)` key so each logical workflow prints once with all its agent variants
- `renderList` (line 72) — produces the indented terminal output block; suppresses agent badges when filter is active
- `workflowListCommand` (line 108) — validates agent name against `AGENT_CONFIG` keys, calls `deps.list()`, filters, renders, exits 0 or 1

**Control flow:**
1. If `options.agent` is set, validate against `Object.keys(AGENT_CONFIG)` (line 113); write to stderr and return 1 on unknown agent.
2. Call `deps.list()` (line 122), filter by agent if provided (line 123-126).
3. Call `renderList(filtered, options.agent !== undefined)` (line 128) and write to stdout.

**Data flow:** `WorkflowDefinition[]` → `groupEntries` → grouped `{ name, description, agents[] }[]` → terminal string.

---

#### 3. `src/commands/cli/workflow-inputs.ts`

**Role:** Implements `atomic workflow inputs <name> -a <agent>`. Prints the declared input schema of a specific workflow so an orchestrating agent can build a valid CLI invocation without reading workflow source.

**Key symbols:**
- `WorkflowInputsResult` (line 22) — `{ workflow, agent, description, freeform, inputs: WorkflowInput[] }`
- `buildInputsPayload` (line 35) — synthesizes a single optional `prompt` field for free-form (input-less) workflows so all consumers use the same envelope shape
- `renderInputsText` (line 63) — human-readable text layout for `--format text`
- `WorkflowInputsDeps` (line 173) — injectable `{ findWorkflow, loadWorkflow }` so tests can stub the registry
- `workflowInputsCommand` (line 210) — validates agent, resolves workflow via `deps.findWorkflow`, loads definition via `deps.loadWorkflow`, builds payload, writes JSON or text

**Control flow:**
1. Validate `options.agent` against `Object.keys(AGENT_CONFIG)` (line 216).
2. `deps.findWorkflow(options.name, agent, options.cwd)` (line 225) — returns `ResolvedWorkflowEntry | null`.
3. `deps.loadWorkflow(discovered)` (line 233) — returns `WorkflowLoadResult`.
4. `buildInputsPayload(def.name, agent, def.description, def.inputs)` (line 239).
5. Emit JSON (`process.stdout.write(JSON.stringify(...))`, line 242) or text (line 244).

**Data flow:** Registry `WorkflowDefinition.inputs: WorkflowInput[]` → `buildInputsPayload` → `WorkflowInputsResult` → stdout JSON or text.

---

#### 4. `src/commands/cli/workflow-status.ts`

**Role:** Implements `atomic workflow status [<id>]`. Queries per-run status snapshots from `~/.atomic/sessions/<workflowRunId>/status.json` (via `readSnapshot`), with a tmux liveness fallback when the snapshot is missing.

**Key symbols:**
- `WorkflowStatusReport` (line 36) — full per-workflow report: `{ id, workflowRunId, workflowName, agent, overall, alive, updatedAt, sessions, fatalError }`
- `WorkflowOverallStatus` (imported from `status-writer.ts`) — `"in_progress" | "error" | "completed" | "needs_review"`
- `StatusDeps` (line 56) — injectable deps: `{ isTmuxInstalled, sessionExists, listSessions, readSnapshot, sessionsBaseDir }`; `sessionsBaseDir` defaults to `join(homedir(), ".atomic", "sessions")` (line 75)
- `buildReport` (line 84) — extracts `workflowRunId` from tmux session name via `workflowRunIdFromTmuxName`, reads snapshot from `join(sessionsBaseDir, workflowRunId)`, downgrades `in_progress` to `error` when the orchestrator is no longer alive (line 114)
- `workflowStatusCommand` (line 144) — lists all tmux workflow sessions, builds a report for each, supports single-session queries with post-mortem fallback when the tmux session is gone but the snapshot still exists

**Control flow (all-workflow):**
1. `deps.listSessions()` → filter `s.type === "workflow"` (line 155).
2. For each session call `buildReport(s.name, true, deps)` (line 187).
3. Emit JSON or text (line 190-195).

**Control flow (single-workflow query):**
1. Find target in `workflowSessions` (line 159).
2. If not found, attempt post-mortem via `workflowRunIdFromTmuxName(options.id)` + `readSnapshot` (lines 164-170).
3. If found, `buildReport(target.name, true, deps)` (line 176).

**Filesystem dependency:** Reads `~/.atomic/sessions/<id>/status.json` via `readSnapshot` imported from `src/sdk/runtime/status-writer.ts`.

---

#### 5. `src/commands/cli/claude-stop-hook.ts`

**Role:** Internal handler for Claude Code's `Stop` hook (`atomic _claude-stop-hook`). This is the central IPC mechanism for deterministic multi-turn workflows with Claude.

**Key symbols:**
- `ClaudeStopHookPayload` (line 38) — `{ session_id, transcript_path?, cwd?, stop_hook_active? }`
- `claudeHookDirs()` (line 64) — single source of truth for all filesystem directories used in Claude IPC:
  - `marker`: `~/.atomic/claude-stop/<session_id>` — written after each Claude turn; `waitForIdle` in the workflow runtime watches this dir
  - `queue`: `~/.atomic/claude-queue/<session_id>` — workflow runtime writes a follow-up prompt here; hook reads it and emits `{"decision":"block","reason":<prompt>}` back to Claude on stdout
  - `release`: `~/.atomic/claude-release/<session_id>` — workflow runtime writes this to signal Claude should stop
  - `hil`: `~/.atomic/claude-hil/<session_id>` — written/unlinked by `_claude-ask-hook` to signal human-in-the-loop state
  - `pid`: `~/.atomic/claude-pid/<session_id>` — atomic workflow process PID; hook polls this to detect a crashed workflow
  - `ready`: `~/.atomic/claude-ready/<session_id>` — written by `_claude-session-start-hook` to signal Claude readiness
- `ClaudeStopHookOptions` (line 92) — `{ waitTimeoutMs?, pollIntervalMs?, livenessIntervalMs? }` for test overrides
- `DEFAULT_WAIT_TIMEOUT_MS` (line 129) — 2,147,483,000 ms (~24 days), aligned with Claude's own hook timeout
- `claudeStopHookCommand` (line 202) — main handler

**Control flow:**
1. Read stdin → parse `ClaudeStopHookPayload` (lines 211-225).
2. `fs.mkdir` for all hook dirs (lines 245-250).
3. Write marker file `~/.atomic/claude-stop/<session_id>` directly (not tmp+rename) at line 261. This unblocks `waitForIdle` in `src/sdk/providers/claude.ts`.
4. Initial synchronous `check()` (line 326) — reads queue and release dirs immediately in case the runtime already acted.
5. Start `Promise.all` of four concurrent tasks (lines 390-396):
   - `runWatcher(dirs.queue)` — `fs.watch` on the queue dir; calls `check()` on any event
   - `runWatcher(dirs.release)` — `fs.watch` on the release dir
   - `runPollFallback()` — polls `check()` every `pollIntervalMs` ms as dropped-event safety net
   - `runLivenessCheck()` — polls `isProcessAlive(atomicPid)` every `livenessIntervalMs` ms; aborts if the workflow crashed
6. On `check()` hit, `emit(hit)`:
   - If `kind === "queue"`: write `{"decision":"block","reason":<prompt>}` to stdout (lines 315-318) — Claude feeds `reason` back as the next user message
   - If `kind === "release"`: return 0 silently — Claude stops

**Data flow (prompt delivery):** Workflow runtime writes prompt to `~/.atomic/claude-queue/<id>` → hook reads file, unlinks it, emits `{"decision":"block","reason":<prompt>}` on stdout → Claude Code re-enters its turn loop with `reason` as the next user message.

**Data flow (turn-end signal):** Claude's turn ends → Stop hook fires → hook writes `~/.atomic/claude-stop/<session_id>` → `waitForIdle` in `src/sdk/providers/claude.ts` unblocks → workflow stage callback runs.

---

#### 6. `src/commands/cli/claude-ask-hook.ts`

**Role:** Internal handler for `PreToolUse` / `PostToolUse` hooks scoped to the `AskUserQuestion` built-in tool. Signals human-in-the-loop (HIL) state to the workflow runtime.

**Key symbols:**
- `ClaudeAskHookPayload` (line 26) — `{ session_id, hook_event_name?, tool_name?, cwd? }`
- `ClaudeAskHookMode` (line 33) — `"enter" | "exit"`
- `claudeAskHookCommand(mode)` (line 47)

**Control flow:**
1. Parse stdin JSON payload (lines 49-61).
2. Get `{ hil }` from `claudeHookDirs()` (line 63); mkdir (line 64).
3. If `mode === "enter"`: `Bun.write(markerPath, raw)` — creates `~/.atomic/claude-hil/<session_id>` (line 71).
4. If `mode === "exit"`: `fs.unlink(markerPath)` — removes the marker (line 74).

**Data flow:** `HIL create` → `fs.watch` in `src/sdk/providers/claude.ts` fires `onHIL(true)` → TUI node card shows "awaiting_input" pulse. `HIL unlink` → `onHIL(false)` → pulse clears. The runtime's `finally` block in `claudeQuery` calls `onHIL?.(false)` as a safety reset even if the hook's unlink was missed.

---

#### 7. `src/commands/cli/claude-session-start-hook.ts`

**Role:** Internal handler for the Claude `startup` matcher hook. Provides a positive readiness signal before the JSONL transcript exists.

**Key symbols:**
- `ClaudeSessionStartHookPayload` (line 23) — `{ session_id, source?, transcript_path?, cwd? }`
- `claudeSessionStartHookCommand()` (line 38)

**Control flow:**
1. Parse stdin JSON (lines 39-54).
2. `fs.mkdir(ready, { recursive: true })` (line 57).
3. `Bun.write(path.join(ready, payload.session_id), raw)` (line 58) — writes to `~/.atomic/claude-ready/<session_id>`.

**Data flow:** Claude fires SessionStart hook → hook writes `~/.atomic/claude-ready/<session_id>` → `fs.watch` on `ready` dir in `src/sdk/providers/claude.ts` resolves the spawn-wait promise — workflow runtime knows Claude is ready before the JSONL transcript is created.

---

#### 8. `src/commands/cli/session.ts`

**Role:** Implements the `atomic session list`, `atomic session connect`, interactive session picker, and `atomic session kill` commands. Shared between `atomic chat session` and `atomic workflow session`.

**Key symbols:**
- `SessionScope` (line 29) — `"chat" | "workflow" | "all"`
- `SessionDeps` (line 31) — injectable tmux wrappers from `src/sdk/workflows/index.ts`: `isTmuxInstalled`, `sessionExists`, `listSessions`, `isInsideAtomicSocket`, `isInsideTmux`, `switchClient`, `spawnMuxAttach`, `detachAndAttachAtomic`, `killSession`; plus `@clack/prompts` `select`, `confirm`, `isCancel`
- `renderSessionList` (line 72) — renders count header + per-session rows with attached indicator, age, and agent badge
- `filterByScope` (line 149) — maps `SessionScope` to `SessionType` for `TmuxSession` filtering
- `filterByAgent` (line 156) — filters sessions to a specific agent subset
- `sessionListCommand` (line 164) — lists and renders sessions
- `sessionConnectCommand` (line 186) — dispatches to `switchClient` (on atomic socket), `detachAndAttachAtomic` (inside different tmux), or `spawnMuxAttach` (outside tmux)
- `sessionPickerCommand` (line 235) — `@clack/prompts select` interactive picker → `sessionConnectCommand`
- `sessionKillCommand` (line 285) — confirms then calls `deps.killSession(sessionId)` per-session or bulk

**Control flow (connect):**
1. Check `deps.isInsideAtomicSocket()` → `switchClient(name)` (line 216-219).
2. Else check `deps.isInsideTmux()` → `detachAndAttachAtomic(name)` (line 221-224).
3. Else `spawnMuxAttach(name)` and await exit (line 225-226).

---

#### 9. `src/commands/cli/chat/index.ts`

**Role:** Implements `atomic chat -a <agent>`. Orchestrates agent CLI preflight (auth, onboarding, global config sync), builds a launcher script, creates a tmux session on the atomic socket, and attaches to it.

**Key symbols:**
- `ChatCommandOptions` (line 57) — `{ agentType?, passthroughArgs? }`
- `buildAgentArgs` (line 79) — assembles CLI flags from `AGENT_CONFIG[agentType].chat_flags`, `getProviderOverrides`, SCM disable flags (copilot), and `--append-system-prompt-file` (claude)
- `buildLauncherScript` (line 141) — generates a bash or PowerShell script that `cd`s to `projectRoot`, sets env vars, and runs the agent CLI with properly-quoted args; avoids shell-injection from passthrough args
- `chatCommand` (line 202) — main entry point

**Control flow:**
1. Validate `agentType` and check `isCommandInstalled(config.cmd)` (lines 208-215).
2. `checkAgentAuth(agentType)` (line 224) — early exit with actionable error if not logged in.
3. `ensureAtomicGlobalAgentConfigs(configRoot)` (line 234).
4. `ensureProjectSetup(agentType, projectRoot)` (line 237) — onboarding files, skills, SCM sync.
5. `buildAgentArgs(agentType, passthroughArgs, projectRoot)` (line 240).
6. Build `envVars` including `ATOMIC_AGENT: agentType` (line 245-249).
7. If no TTY (`!process.stdin.isTTY`, line 273) → `spawnDirect(cmd, projectRoot, envVars)`.
8. Ensure tmux installed (lines 278-289); if unavailable → `spawnDirect`.
9. Generate `chatId = crypto.randomUUID().slice(0, 8)` (line 293); session name `atomic-chat-${agentType}-${chatId}` (line 294).
10. Write launcher script to `~/.atomic/sessions/chat/${windowName}.{sh|ps1}` (lines 296-309).
11. `createSession(windowName, shellCmd, undefined, projectRoot)` → tmux session on atomic socket; attach footer pane; set kill-on-pane-exit hook.
12. Attach to session: `switchClient` / `detachAndAttachAtomic` / `spawnMuxAttach` based on current tmux context (lines 317-343).

---

#### 10. `src/commands/cli/init/index.ts`

**Role:** Implements `ensureProjectSetup(agentKey, projectRoot)` — idempotent first-time and per-run project configuration for any agent.

**Key symbols:**
- `ensureProjectSetup` (line 26) — called by `chatCommand` (chat/index.ts:237) and workflow launch paths

**Control flow:**
1. `getConfigRoot()` (line 28).
2. `applyManagedOnboardingFiles(agentKey, projectRoot, configRoot)` (line 31) — copies/merges bundled onboarding files.
3. `syncScmMcpServers(projectRoot)` (line 32) — enables/disables GitHub or Azure DevOps MCP servers in agent configs based on `.atomic/settings.json`.
4. If `agentKey === "opencode"`, `reconcileOpencodeInstructions(projectRoot)` (line 38) — syncs additional instructions into `.opencode/opencode.json`.

---

### Cross-Cutting Synthesis

The `src/commands/` layer forms the user-facing shell of Atomic's deterministic workflow runtime. Three subsystems interlock here.

The first is the **workflow discovery surface**: `workflow.ts` delegates to the SDK's `WorkflowCli` with a builtin registry. `workflow-list.ts` renders the registry by grouping entries across agents. `workflow-inputs.ts` serializes a workflow's declared input schema into a machine-parseable JSON envelope, allowing orchestrating agents to construct valid `atomic workflow -n ... -a ...` invocations without reading source code.

The second is the **inter-process coordination layer via filesystem signals**. Five `~/.atomic/` directories act as IPC channels between the running `atomic` workflow process and Claude Code's hook processes:

- `~/.atomic/claude-stop/<id>` (written by `_claude-stop-hook`) — signals turn completion; the SDK's `waitForIdle` watches this dir via `fs.watch`.
- `~/.atomic/claude-queue/<id>` (written by the workflow runtime, read+deleted by `_claude-stop-hook`) — carries follow-up prompts back to Claude as `{"decision":"block","reason":...}` on stdout.
- `~/.atomic/claude-release/<id>` (written by the runtime's `clearClaudeSession`) — tells `_claude-stop-hook` to exit 0 and let Claude stop.
- `~/.atomic/claude-hil/<id>` (created/unlinked by `_claude-ask-hook enter`/`exit`) — signals HIL state; the runtime watches this to drive the TUI pulse.
- `~/.atomic/claude-ready/<id>` (written by `_claude-session-start-hook`) — positive spawn readiness signal before the JSONL transcript exists.

The hook processes always exit 0 to avoid showing hook errors in Claude's transcript. The `_claude-stop-hook` combines `fs.watch` event-driven detection with a 100 ms polling fallback and a 5 s liveness check against the atomic process PID for dropped-event resilience.

The third is the **tmux session management surface**: `session.ts` provides the list/connect/pick/kill commands. `chat/index.ts` creates sessions via `createSession` from `src/sdk/workflows/index.ts`, writes launcher scripts to `~/.atomic/sessions/chat/` to safely pass CWD and env vars, and attaches using context-appropriate tmux primitives (`switchClient`, `detachAndAttachAtomic`, `spawnMuxAttach`). `workflow-status.ts` resolves per-run state from `~/.atomic/sessions/<workflowRunId>/status.json`, falling back to tmux liveness for snapshot-less sessions.

---

### Out-of-Partition References

- `src/sdk/workflow-cli.ts` — `createWorkflowCli` and the runtime-level `WorkflowCli` abstraction
- `src/sdk/workflows/builtin-registry.ts` — `createBuiltinRegistry`, `WorkflowDefinition`, `WorkflowInput`
- `src/sdk/workflows/index.ts` — tmux primitives: `createSession`, `listSessions`, `sessionExists`, `switchClient`, `spawnMuxAttach`, `detachAndAttachAtomic`, `killSession`, `killSessionOnPaneExit`, `isTmuxInstalled`, `isInsideAtomicSocket`, `isInsideTmux`
- `src/sdk/providers/claude.ts` — `waitForIdle` (watches `~/.atomic/claude-stop`), `claudeQuery` (watches `~/.atomic/claude-hil`), spawn-wait (watches `~/.atomic/claude-ready`), `clearClaudeSession` (writes `~/.atomic/claude-release`)
- `src/sdk/runtime/status-writer.ts` — `readSnapshot`, `workflowRunIdFromTmuxName`, `WorkflowStatusSnapshot`, `WorkflowOverallStatus`
- `src/sdk/runtime/tmux.ts` — `TmuxSession`, `SessionType`
- `src/sdk/runtime/attached-footer.ts` — `spawnAttachedFooter`
- `src/services/config/index.ts` — `AGENT_CONFIG`, `AgentKey`
- `src/services/config/settings.ts` — `setScmProvider`, `setTelemetryEnabled`
- `src/services/config/atomic-config.ts` — `getProviderOverrides`, `SCM_PROVIDERS`, `isScmProvider`
- `src/services/config/scm-sync.ts` — `syncScmMcpServers`, `getCopilotScmDisableFlags`
- `src/services/config/additional-instructions.ts` — `resolveAdditionalInstructionsPath`, `reconcileOpencodeInstructions`
- `src/services/config/atomic-global-config.ts` — `ensureAtomicGlobalAgentConfigs`
- `src/services/config/config-path.ts` — `getConfigRoot`
- `src/services/system/detect.ts` — `isCommandInstalled`
- `src/services/system/auth.ts` — `checkAgentAuth`, `printAuthError`
- `src/commands/cli/init/onboarding.ts` — `applyManagedOnboardingFiles`
- `src/lib/spawn.ts` — `ensureTmuxInstalled`
- `src/theme/colors.ts` — `COLORS`, `createPainter`, `PaletteKey`

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Atomic Deterministic Workflows: Concrete Patterns (Partition 4/16)

## Overview
Atomic's deterministic workflow system ensures reproducible execution across process boundaries through environment-based re-entry, base64-encoded input serialization, and file-backed status snapshots. The architecture separates CLI invocation from orchestration execution, with the user's entrypoint file serving as both entry point and orchestrator launcher.

---

#### Pattern: Environment-Based Orchestrator Re-Entry Guard

**Where:** `src/sdk/runtime/executor.ts:1939-1960`, `src/sdk/workflow-cli.ts:337-340`, `src/sdk/commander.ts:133-151`

**What:** Detects when a process is a detached orchestrator re-execution versus a fresh CLI invocation, using environment variables to signal re-entry without requiring file imports or registry scans.

```typescript
// src/sdk/runtime/executor.ts:1939-1960
export async function handleOrchestratorReEntry(
  resolve: (name: string, agent: AgentType) => WorkflowDefinition | undefined,
): Promise<boolean> {
  if (process.env.ATOMIC_ORCHESTRATOR_MODE !== "1") {
    return false;
  }
  const key = process.env.ATOMIC_WF_KEY ?? "";
  const slashIdx = key.indexOf("/");
  if (slashIdx < 0) {
    throw new Error(
      `ATOMIC_ORCHESTRATOR_MODE=1 but ATOMIC_WF_KEY "${key}" is malformed — expected "<agent>/<name>"`,
    );
  }
  const agent = key.slice(0, slashIdx) as AgentType;
  const name = key.slice(slashIdx + 1);
  const def = resolve(name, agent);
  if (!def) {
    throw new Error(`ATOMIC_WF_KEY "${key}" not found in registry`);
  }
  await runOrchestrator(def);
  return true;
}
```

**Usage in WorkflowCli:** `src/sdk/workflow-cli.ts:337-340`
```typescript
async run(runOpts = {}): Promise<void> {
  if (await handleOrchestratorReEntry((n, a) => registry.resolve(n, a))) {
    return;
  }
  // ... continue with normal CLI parsing
}
```

**Variations / call-sites:**
- `src/sdk/commander.ts:137-151` — `runCli()` embeds the same pattern for parent CLIs
- Guard checks `ATOMIC_ORCHESTRATOR_MODE==="1"` before parsing `ATOMIC_WF_KEY` format
- `resolve` callback passed to allow embedded workers to use trivial lookup vs. full registry
- Throws on malformed keys so authoring mistakes surface loudly


#### Pattern: Launcher Script Generation with Base64-Encoded Inputs

**Where:** `src/sdk/runtime/executor.ts:503-548`

**What:** Generates platform-specific shell scripts (Bash for Unix, PowerShell for Windows) that re-execute the user's entrypoint with deterministic environment variables, serializing all workflow inputs as base64-encoded JSON to survive shell quoting without additional escaping.

```typescript
// src/sdk/runtime/executor.ts:518-541 (simplified excerpt)
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
```

**Determinism aspects:**
- Inputs serialized once at launcher creation time, not re-parsed from CLI
- Base64 encoding preserves multiline values and special characters
- All paths made absolute before encoding (`projectRoot`, `entrypointFile`)
- Launcher file written with execute permissions (`mode: 0o755`)
- Separate log file captures stderr, enabling headless diagnostics

**Variations / call-sites:**
- `src/sdk/runtime/executor.ts:516` — inputs converted to base64 before string interpolation
- `src/sdk/runtime/executor.ts:543` — file written with explicit permissions for execute
- Platform detection via `process.platform === "win32"` selects escaper and shebang


#### Pattern: Input Deserialization and Type Coercion

**Where:** `src/sdk/runtime/executor.ts:412-430`, `src/sdk/runtime/executor.ts:441-459`

**What:** Provides two-stage input deserialization — first decoding base64-encoded JSON from the environment variable, then coercing declared types (integers parsed to `number`, all others remain `string`).

```typescript
// src/sdk/runtime/executor.ts:412-430
export function parseInputsEnv(
  raw: string | undefined,
): Record<string, string> {
  if (!raw) return {};
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

// src/sdk/runtime/executor.ts:441-459
export function coerceInputsBySchema(
  inputs: Record<string, string>,
  schema: readonly WorkflowInput[],
): Record<string, string | number> {
  const byName = new Map(schema.map((f) => [f.name, f]));
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(inputs)) {
    const field = byName.get(k);
    if (field?.type === "integer") {
      const parsed = Number.parseInt(v, 10);
      if (Number.isFinite(parsed) && Number.isInteger(parsed)) {
        out[k] = parsed;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}
```

**Robustness patterns:**
- Returns empty object on any deserialization error (prevents crash on corrupt env var)
- Filters out non-string values during JSON parse (malformed payloads gracefully degrade)
- Type coercion respects schema — only "integer" fields coerce to `number`
- Invalid integers silently dropped rather than throwing (upstream validation already ran)
- Free-form workflows have empty schema, so all inputs pass through as strings

**Variations / call-sites:**
- `src/sdk/runtime/executor.ts:1971` — parsed inputs immediately used by `runOrchestrator()`
- `src/commands/cli/workflow-inputs.ts:239` — schema displayed to orchestrating agents


#### Pattern: Input Validation and Merging Pipeline

**Where:** `src/sdk/workflow-cli.ts:90-136`

**What:** Merges inputs from three sources (CLI, programmatic run opts, dispatcher defaults) with explicit precedence, validates against the workflow's declared schema, and throws early on schema violations.

```typescript
// src/sdk/workflow-cli.ts:90-136
export async function resolveAndStart(
  registry: Registry,
  name: string,
  agent: AgentType,
  opts: {
    cliInputs?: Record<string, string>;
    runInputs?: Record<string, string>;
    dispatcherInputs?: Record<string, string>;
    detach?: boolean;
    entry: string;
  },
): Promise<void> {
  const def = registry.resolve(name, agent);
  if (!def) {
    const available = registry
      .list()
      .filter((w) => w.name === name)
      .map((w) => w.agent);
    const availableMsg =
      available.length > 0
        ? `available agents for "${name}": ${available.join(", ")}`
        : `no workflow named "${name}" in registry`;
    throw new Error(
      `no workflow named "${name}" for agent "${agent}"; ${availableMsg}`,
    );
  }

  const merged: Record<string, string> = {
    ...opts.dispatcherInputs,
    ...opts.runInputs,
    ...opts.cliInputs,
  };

  const resolvedInputs =
    def.inputs.length > 0
      ? validateAndResolve(merged, def.inputs)
      : { ...merged };

  await executeWorkflow({
    definition: def,
    agent,
    inputs: resolvedInputs,
    entrypointFile: opts.entry,
    workflowKey: `${agent}/${name}`,
    detach: opts.detach ?? false,
  });
}
```

**Determinism aspects:**
- Input precedence explicit and documented (highest to lowest: cliInputs > runInputs > dispatcherInputs > defaults)
- Validation runs before executor receives inputs (fail-fast)
- Workflow lookup includes helpful error messages listing available agents for the name
- Defaults passed through `opts` — not read from globals or files

**Variations / call-sites:**
- CLI mode calls with `cliInputs` from Commander parsing
- Programmatic mode (`run({ argv: false })`) calls with `runInputs`
- Both paths converge on `executeWorkflow()` with validated inputs


#### Pattern: File-Based Status Snapshots for Out-of-Process Polling

**Where:** `src/sdk/runtime/executor.ts:1988-2012`, `src/commands/cli/workflow-status.ts:84-131`

**What:** Orchestrator writes JSON snapshots to disk whenever the panel state mutates, allowing external processes to poll workflow status without IPC. Mutations are debounced through a pending flag to collapse bursts into single file writes.

```typescript
// src/sdk/runtime/executor.ts:1988-2012
let snapshotPending = false;
const persistSnapshot = (): void => {
  if (snapshotPending) return;
  snapshotPending = true;
  queueMicrotask(() => {
    snapshotPending = false;
    const snap = panel.getSnapshot();
    void writeSnapshot(
      sessionsBaseDir,
      buildSnapshot({
        workflowRunId,
        tmuxSession: tmuxSessionName,
        ...snap,
      }),
    );
  });
};
const unsubscribePanel = panel.subscribe(persistSnapshot);
// Seed an initial snapshot so the file exists before any session starts.
persistSnapshot();
```

**Status query pattern:** `src/commands/cli/workflow-status.ts:84-131`
```typescript
async function buildReport(
  tmuxName: string,
  alive: boolean,
  deps: StatusDeps,
): Promise<WorkflowStatusReport | null> {
  const workflowRunId = workflowRunIdFromTmuxName(tmuxName);
  if (!workflowRunId) return null;

  const sessionDir = join(deps.sessionsBaseDir, workflowRunId);
  const snapshot = await deps.readSnapshot(sessionDir);

  if (!snapshot) {
    return {
      id: tmuxName,
      workflowRunId,
      workflowName: "",
      agent: "",
      overall: alive ? "in_progress" : "error",
      alive,
      updatedAt: null,
      sessions: [],
      fatalError: alive ? null : "orchestrator exited before writing status",
    };
  }

  // If the orchestrator has shut down but the snapshot still says
  // in_progress, downgrade to error
  const overall: WorkflowOverallStatus =
    !alive && snapshot.overall === "in_progress" ? "error" : snapshot.overall;

  return {
    id: tmuxName,
    workflowRunId,
    workflowName: snapshot.workflowName,
    agent: snapshot.agent,
    overall,
    alive,
    updatedAt: snapshot.updatedAt,
    sessions: snapshot.sessions,
    fatalError: // ... field extraction
  };
}
```

**Robustness patterns:**
- Debouncing via `queueMicrotask()` prevents filesystem thrashing
- Initial snapshot seeded before orchestrator starts (no window of missing data)
- Status queries check both on-disk snapshot AND tmux session liveness
- Fallback report when snapshot missing but tmux session alive
- Terminal state inference when orchestrator exits without final snapshot

**Variations / call-sites:**
- `src/commands/cli/workflow-status.ts:147-196` — lists all workflows or queries by ID
- JSON format output for script consumption, text format for humans


#### Pattern: Shared Workflow Execution State

**Where:** `src/sdk/runtime/executor.ts:1188-1222`, `src/sdk/runtime/executor.ts:2042-2049`

**What:** Orchestrator maintains a `SharedRunnerState` object threaded through all session spawning calls, capturing deterministic input state, provider configuration, and tracking active/completed/failed sessions for cleanup and transcript collection.

```typescript
// src/sdk/runtime/executor.ts:1188-1222
interface SharedRunnerState {
  tmuxSessionName: string;
  sessionsBaseDir: string;
  /**
   * The project root the workflow is operating against. Threaded through to
   * provider initialization so headless paths resolve project-scoped config
   * (e.g. `additional-instructions`) from the workflow's actual root rather
   * than `process.cwd()`, which can drift when workflows are invoked
   * programmatically or from a subdirectory.
   */
  projectRoot: string;
  agent: AgentType;
  /**
   * Structured inputs for this workflow run. Free-form workflows use
   * `{ prompt: "..." }`; structured workflows use their declared field
   * names. Workflow authors read both shapes via `ctx.inputs` — integer
   * inputs are parsed to `number`, everything else stays a `string`.
   */
  inputs: Record<string, string | number>;
  /** User-configured provider overrides (global + local merged). */
  providerOverrides: ProviderOverrides;
  /**
   * Extra CLI flags appended to the agent's chat flags, derived from
   * the project's scm selection. Currently only populated for Copilot
   * (which has no on-disk MCP toggle).
   */
  extraChatFlags: string[];
  panel: OrchestratorPanel;
  /** Sessions that have been spawned (for name uniqueness + cleanup). */
  activeRegistry: Map<string, ActiveSession>;
  /** Sessions that completed successfully (for transcript reads). */
  completedRegistry: Map<string, SessionResult>;
  /** Sessions that already failed before completing successfully. */
  failedRegistry: Set<string>;
}

// src/sdk/runtime/executor.ts:2042-2049
const shared: SharedRunnerState = {
  tmuxSessionName,
  sessionsBaseDir,
  projectRoot: cwd,
  agent,
  inputs,
  providerOverrides,
  extraChatFlags,
  // ... more fields
};
```

**Determinism aspects:**
- `inputs` captured once during orchestrator initialization (immutable during execution)
- `projectRoot` threaded through to provider clients (prevents cwd drift)
- `providerOverrides` resolved from config files at startup (no dynamic changes)
- Registry maps (active/completed/failed) track session lifecycle for deterministic cleanup


#### Pattern: Workflow Input Schema Exposure for Orchestrating Agents

**Where:** `src/commands/cli/workflow-inputs.ts:204-247`

**What:** Provides a structured interface for orchestrating agents (or scripts) to query workflow input schemas at runtime, synthesizing a `prompt` field for free-form workflows so both kinds present a uniform API.

```typescript
// src/commands/cli/workflow-inputs.ts:35-60 (schema building)
export function buildInputsPayload(
  workflowName: string,
  agent: string,
  description: string,
  inputs: readonly WorkflowInput[],
): WorkflowInputsResult {
  const freeform = inputs.length === 0;
  const declared: WorkflowInput[] = freeform
    ? [
        {
          name: "prompt",
          type: "text",
          required: false,
          description:
            "Free-form prompt — pass as a positional arg to `atomic workflow -n <name> -a <agent> \"<prompt>\"`.",
        },
      ]
    : inputs.map((i) => ({ ...i }));
  return {
    workflow: workflowName,
    agent,
    description,
    freeform,
    inputs: declared,
  };
}

// src/commands/cli/workflow-inputs.ts:210-247 (command)
export async function workflowInputsCommand(
  options: WorkflowInputsOptions,
  deps: WorkflowInputsDeps = defaultDeps,
): Promise<number> {
  const format: WorkflowInputsFormat = options.format ?? "json";

  const validAgents = Object.keys(AGENT_CONFIG);
  if (!validAgents.includes(options.agent)) {
    return reportError(
      format,
      `Unknown agent '${options.agent}'. Valid agents: ${validAgents.join(", ")}`,
    );
  }
  const agent = options.agent as AgentType;

  const discovered = await deps.findWorkflow(options.name, agent, options.cwd);
  if (!discovered) {
    return reportError(
      format,
      `Workflow '${options.name}' not found for agent '${agent}'.`,
    );
  }

  const loaded = await deps.loadWorkflow(discovered);
  if (!loaded.ok) {
    return reportError(format, loaded.message);
  }
  const def = loaded.value.definition;

  const payload = buildInputsPayload(def.name, agent, def.description, def.inputs);

  if (format === "json") {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    process.stdout.write(renderInputsText(payload));
  }
  return 0;
}
```

**Usage by orchestrating agents:**
- Query schema before invoking workflow: `atomic workflow inputs -n ralph -a claude --format json`
- Schema includes field names, types (text/integer/enum), required flags, defaults, placeholders
- Orchestrator can validate inputs locally before calling `atomic workflow -n <name> -a <agent> --field=value`
- Returns exit code 1 on error, 0 on success (shell integration friendly)

**Variations / call-sites:**
- `src/commands/cli/workflow-inputs.ts:178-197` — registry-based lookup (default)
- Testable via `deps` injection for mocked registry behavior


---

## Integration Summary

The deterministic workflow system composes these patterns into a coherent execution model:

1. **Launch phase** (`executeWorkflow`): CLI command creates a launcher script with base64-encoded inputs and deterministic environment variables, spawns tmux session.

2. **Re-entry phase**: User's entrypoint file re-executes with `ATOMIC_ORCHESTRATOR_MODE=1` and `ATOMIC_WF_KEY=<agent>/<name>`, `handleOrchestratorReEntry` detects and routes to `runOrchestrator`.

3. **Orchestration phase** (`runOrchestrator`): Parses inputs from `ATOMIC_WF_INPUTS` env var, initializes shared state with workflow definition, spawns agent sessions via `ctx.stage()` callbacks.

4. **Monitoring phase**: OrchestratorPanel mutations trigger debounced snapshot writes to `~/.atomic/sessions/<workflowRunId>/status.json`; external `atomic workflow status` queries read snapshots plus tmux liveness.

5. **Query phase** (`workflowInputsCommand`): Schema endpoint allows orchestrating agents to introspect input requirements before invocation, enabling deterministic prompt generation and validation.

All phases preserve the original inputs without transformation, with base64 serialization preventing shell-related corruption and file-backed snapshots enabling polling-based status without IPC overhead.

## External References
<!-- Source: codebase-online-researcher sub-agent -->
---
source_url: file:///Users/norinlavaee/atomic-product-hunt/docs/claude-code/cli/hooks.md
fetched_at: 2026-05-05
fetch_method: local-file
topic: Claude Code Hooks API — deterministic workflow control in Atomic src/commands/
---

# Claude Code Hooks API — Relevance to Atomic Deterministic Workflows

## Local docs suffice — no external fetch required

`docs/claude-code/cli/hooks.md` is a full mirror of the Anthropic hooks guide. All findings below are drawn from that file plus the three hook-handler source files in `src/commands/cli/`.

---

## Summary

Claude Code Hooks are **central** to how Atomic achieves deterministic, multi-turn agent execution without tmux pane-scraping or keystroke injection. The hooks API gives Atomic guaranteed, lifecycle-bound entry points — `SessionStart`, `PreToolUse`, `PostToolUse`, and `Stop` — through which it can inject context, observe agent state, and drive the next turn programmatically.

---

## Detailed Findings

### 1. What Claude Code Hooks provide (from local docs)

**Source**: `docs/claude-code/cli/hooks.md` (lines 6–17)

> "Hooks are user-defined shell commands that execute at specific points in Claude Code's lifecycle. They provide **deterministic control** over Claude Code's behavior, ensuring certain actions always happen rather than relying on the LLM to choose to run them."

Key hook events consumed by Atomic:

| Hook event | Matcher | Purpose |
|---|---|---|
| `SessionStart` | `startup` | Readiness signal — fires before the JSONL transcript exists |
| `PreToolUse` | `AskUserQuestion` | Write HIL marker file, signal "awaiting_input" to TUI |
| `PostToolUse` / `PostToolUseFailure` | `AskUserQuestion` | Remove HIL marker file, signal HIL resolved |
| `Stop` | (none) | Write turn-completion marker; block Claude with next prompt or release |

**Exit-code semantics** (hooks.md lines 456–458):
- Exit 0: action proceeds; stdout injected into Claude's context (for `SessionStart`/`UserPromptSubmit`).
- Exit 2: action is blocked; stderr becomes Claude's feedback.
- Structured JSON on stdout (with exit 0): fine-grained control — `{"decision":"block","reason":"<next prompt>"}` keeps the agent loop alive without user keystrokes.

---

### 2. Stop hook — the turn-delivery mechanism (`claude-stop-hook.ts`)

**Source**: `src/commands/cli/claude-stop-hook.ts`

Atomic registers `atomic _claude-stop-hook` as the `Stop` hook. On each turn end:

1. **Writes a per-session marker file** at `~/.atomic/claude-stop/<session_id>`. The workflow runtime's `waitForIdle` watches this directory with `fs.watch`; detecting the file unblocks the stage callback with ~0 ms latency (no polling required in the happy path).

2. **Block-polls** two signal directories:
   - `~/.atomic/claude-queue/<session_id>` — written by `session.query(nextPrompt)` when the workflow wants another turn.
   - `~/.atomic/claude-release/<session_id>` — written by `clearClaudeSession()` when the workflow is done.

3. On finding a queued prompt, emits:
   ```json
   { "decision": "block", "reason": "<next user prompt>" }
   ```
   Claude Code treats `reason` as the next user message and continues the agent loop — no TUI keystrokes, no tmux, no sleep-polling.

4. On finding a release marker (or on atomic process death, detected via `process.kill(pid, 0)`), exits 0 so Claude stops normally.

The hook's default `waitTimeoutMs` is `2_147_483_000` ms (~24 days), aligned with the Claude-side `STOP_HOOK_TIMEOUT_SECONDS`. This means the hook holds Claude in the Stop phase indefinitely, giving the workflow unlimited time between turns — a key enabler of long-running deterministic pipelines.

**Why `stop_hook_active` is intentionally ignored** (source comment, lines 227–243):
Claude Code sets `stop_hook_active: true` on every Stop invocation after the first `block` response. In a multi-turn workflow every follow-up turn arrives with this flag set. Exiting early on it would prevent the marker write (hanging `waitForIdle`) and skip the queue poll (losing the next prompt). Atomic's design avoids infinite loops structurally — the workflow enqueues a finite number of prompts then writes a release marker.

---

### 3. SessionStart hook — reliable spawn detection (`claude-session-start-hook.ts`)

**Source**: `src/commands/cli/claude-session-start-hook.ts`

Atomic registers `atomic _claude-session-start-hook` on the `SessionStart` hook with a `startup` matcher. It writes `~/.atomic/claude-ready/<session_id>` as a **positive readiness signal**.

This is strictly more reliable than polling for the JSONL transcript file because `SessionStart` fires _before_ the transcript is created. The runtime's spawn-wait loop watches `~/.atomic/claude-ready/` via `fs.watch` and resolves the moment the file appears — eliminating the race condition inherent in transcript-file polling.

---

### 4. AskUserQuestion hooks — Human-in-the-Loop (HIL) signalling (`claude-ask-hook.ts`)

**Source**: `src/commands/cli/claude-ask-hook.ts`

Atomic registers `atomic _claude-ask-hook enter` on `PreToolUse` and `atomic _claude-ask-hook exit` on both `PostToolUse` and `PostToolUseFailure`, both scoped to the `AskUserQuestion` tool.

- **`enter`**: writes `~/.atomic/claude-hil/<session_id>`, which the runtime's `fs.watch` translates into `onHIL(true)` — triggering the "awaiting_input" blue pulse on the TUI node card.
- **`exit`**: unlinks `~/.atomic/claude-hil/<session_id>`, triggering `onHIL(false)` and returning the node to its normal state.

Both modes always exit 0. A non-zero exit would surface as a "hook error" banner in Claude's transcript; the runtime's `finally` block in `claudeQuery` calls `onHIL?.(false)` as a safety net even if the hook misses the exit event.

---

### 5. Shared signal directories (`claudeHookDirs`)

All three hook handlers import `claudeHookDirs()` from `claude-stop-hook.ts`. This single source of truth defines the six `~/.atomic/` directories:

| Directory | Signal |
|---|---|
| `claude-stop/` | Turn completed (written by Stop hook) |
| `claude-queue/` | Next prompt ready (written by workflow runtime) |
| `claude-release/` | Session done (written by workflow runtime) |
| `claude-hil/` | Agent is asking the user a question (written by AskUserQuestion hooks) |
| `claude-pid/` | PID of the owning `atomic` process (liveness guard) |
| `claude-ready/` | Claude process started (written by SessionStart hook) |

Every directory is watched via `fs.watch` (native inotify/FSEvents), with a polling fallback (`existsSync` every 100 ms by default) to survive dropped kernel events. The combination gives sub-millisecond wake-up in the common case with resilience against fs notification loss.

---

## Prose Summary

Claude Code Hooks are the foundational mechanism that makes Atomic's deterministic multi-turn workflows possible. Without them, coordinating a Claude Code process across multiple workflow stages would require fragile techniques like tmux pane-scraping or keystroke injection.

The three hook handlers in `src/commands/cli/` implement a file-based IPC protocol entirely within `~/.atomic/`:

- The **Stop hook** holds Claude in its inter-turn pause indefinitely, writes a marker that unblocks the workflow runtime, then polls for either a new prompt (delivered back as a `{"decision":"block","reason":...}` response that continues the agent loop) or a release signal that lets Claude stop. This is the core of multi-turn determinism.
- The **SessionStart hook** writes a readiness marker before the JSONL transcript exists, giving the runtime a reliable zero-race spawn-detection signal.
- The **AskUserQuestion hooks** (PreToolUse/PostToolUse pair) write and remove a HIL marker that drives the TUI's "awaiting_input" visual state.

The hooks API itself provides the guarantee expressed in the local docs: these actions "always happen rather than relying on the LLM to choose to run them." Atomic leverages exactly that guarantee — the turn-completion marker, the prompt delivery, and the HIL signals are all produced by shell-level hooks, not by asking Claude to cooperate.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
