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
