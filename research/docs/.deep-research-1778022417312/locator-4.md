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
