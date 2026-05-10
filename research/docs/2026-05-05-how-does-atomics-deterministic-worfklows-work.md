---
date: 2026-05-05 16:21:35 PDT
researcher: deep-research-codebase workflow
git_commit: aed53d43cb80584dfd31c680fe41abc7426eb578
branch: flora131/feature/atomic-product-hunt
repository: atomic-product-hunt
topic: "how does atomic's deterministic worfklows work?"
tags: [research, codebase, deep-research]
status: complete
last_updated: 2026-05-05
---

# Research: How Atomic's Deterministic Workflows Work

## Research Question
how does atomic's deterministic worfklows work?

## Executive Summary

Atomic's deterministic workflow runtime is a **two-process, three-layer system** that reduces orchestration determinism to ordinary JavaScript control flow. The three layers live entirely under `src/sdk/`:

1. **DSL** (`src/sdk/define-workflow.ts`, `src/sdk/types.ts`, `src/sdk/registry.ts`) — Authors call `defineWorkflow({...}).for(agent).run(async (ctx) => {...}).compile()`. `.compile()` validates inputs, deep-freezes the input schema, and returns a sealed `WorkflowDefinition` carrying a `__brand: "WorkflowDefinition"` tag. An immutable `Registry` keys workflows under `"<agent>/<name>"` and copies-on-register.
2. **Runtime** (`src/sdk/runtime/executor.ts`, `runtime/graph-inference.ts`, `runtime/status-writer.ts`, `runtime/executor-env.ts`, `runtime/tmux.ts`). `executeWorkflow()` is the launcher: it generates an 8-hex `workflowRunId`, base64-encodes inputs, writes a `bash`/`pwsh` launcher script that re-executes the user's entrypoint with the env var `ATOMIC_ORCHESTRATOR_MODE=1` and `ATOMIC_WF_KEY="<agent>/<name>"`, and spawns it inside a dedicated tmux session on the `-L atomic` socket. The re-executed entrypoint detects orchestrator mode via `handleOrchestratorReEntry()` and calls `runOrchestrator(def)`, which executes the user's `.run()` callback inside an `OrchestratorPanel`. Each `ctx.stage(...)` call is implemented by `createSessionRunner()`, which calls `GraphFrontierTracker.onSpawn()` **synchronously** before any `await` to derive the parent set, then `onSettle()` after the callback resolves. Sequential vs. parallel topology is therefore an emergent property of `await` vs. `Promise.all`, not an explicit graph declaration.
3. **Providers** (`src/sdk/providers/{claude,copilot,opencode}.ts`) — wrap the three vendor SDKs (`@anthropic-ai/claude-agent-sdk`, `@github/copilot-sdk`, `@opencode-ai/sdk/v2`) into a uniform `client + session + transcript` surface. Cross-stage data handoff goes through `s.save(artifact)` → `s.transcript(handle)` (returns `{ path, content }`), and Claude-specific synchronization uses marker files in `~/.atomic/claude-{stop,queue,release,hil,pid,ready}/<sessionId>` driven by `_claude-stop-hook`, `_claude-ask-hook`, and `_claude-session-start-hook` (in `src/commands/cli/`).

External observability is achieved by writing a versioned `WorkflowStatusSnapshot` JSON to `~/.atomic/sessions/<workflowRunId>/status.json` on every `OrchestratorPanel` mutation, via a debounced subscription that performs an atomic write+rename (`runtime/status-writer.ts`). `atomic workflow status` queries that file and falls back to tmux liveness.

Three additional layers reinforce reproducibility outside the runtime: (a) the configuration cascade in `src/services/config/` merges global `~/.atomic/settings.json` with project-local `.atomic/settings.json` (local wins) and resolves agent overrides via `getProviderOverrides`; (b) `src/services/system/auto-sync.ts` gates global tooling on a `~/.atomic/.synced-version` marker compared to the bundled `VERSION`; (c) `src/sdk/runtime/version-compat.ts` evaluates each workflow's optional `minSDKVersion` against `VERSION` and throws `IncompatibleSDKError` (`src/sdk/errors.ts:47-58`) when the CLI is too old.

The historical research (`specs/2026-03-23-workflow-sdk-simplification-z3-verification.md`, `specs/2026-03-23-ralph-workflow-redesign.md`) describes a `WorkflowSessionConductor`/Z3-verification model — none of those names are present in the current code; the live system is the `executor.ts` + `GraphFrontierTracker` design described above.

## Detailed Findings

### 1. The DSL: `defineWorkflow → .for → .run → .compile`

`src/sdk/define-workflow.ts:248` exports `defineWorkflow(options)` which constructs a `WorkflowBuilder<AgentType, I>` (`define-workflow.ts:109`). The builder is a chainable, copy-on-narrow class:

- `.for(agent)` (`define-workflow.ts:144`) — narrows the agent type parameter and returns a *new* `WorkflowBuilder`; does not mutate.
- `.run(fn)` (`define-workflow.ts:159`) — records the callback once; throws on a second call.
- `.compile()` (`define-workflow.ts:176`) — validates every declared input via `validateWorkflowInput` (`define-workflow.ts:48`), checks for duplicates, deep-freezes the inputs array (`define-workflow.ts:432-434`), and returns a sealed `WorkflowDefinition<A,I>` literal (`define-workflow.ts:443-451`) carrying `__brand: "WorkflowDefinition"`, `name`, `agent`, `description`, `inputs`, `minSDKVersion`, and `run`.

Validation rules in `validateWorkflowInput`:
- Input names must match `/^[a-zA-Z][a-zA-Z0-9_-]*$/` (`define-workflow.ts:54`).
- Reserved names (`name`, `agent`, `detach`, `list`, `help`, `version`, `session`, `status`) are rejected (`define-workflow.ts:32, 62`).
- Enum values are validated; integer defaults are parsed and bounded (`define-workflow.ts:68-102`).

Input typing is computed from the schema array via `InputsOf<I>` (`types.ts:200`) — a conditional mapped type that converts a tuple of `WorkflowInput` literals into the precise `ctx.inputs` shape. `WorkflowInputType = "string" | "text" | "enum" | "integer"` (`types.ts:151`).

### 2. Registry — Immutable, Copy-on-Register, Keyed by `<agent>/<name>`

`src/sdk/registry.ts:127` exports `createRegistry()`. The implementation (`RegistryImpl`, `registry.ts:63`) wraps a `ReadonlyMap`. Every `.register(wf)`:
- Calls `validateAtRegistration` (`registry.ts:47`), which derives `wf.run.toString()` and runs the matching `providerValidators[wf.agent]` (`registry.ts:21`) — `validateClaudeWorkflow`, `validateOpenCodeWorkflow`, or `validateCopilotWorkflow`. Warnings surface via `console.warn("[registry] …")` (verified in `tests/sdk/registry.test.ts:152`).
- Throws on duplicate composite key `${agent}/${name}` (`registry.ts:71`).
- Returns a *new* `RegistryImpl` over a copied map — verified by `tests/sdk/registry.test.ts:38` ("returns a NEW registry instance") and `:44` ("original registry unchanged").

`.list()` is `Object.freeze`d (`tests/sdk/registry.test.ts:121`); `.resolve(name, agent)` is the no-throw lookup; `.get(key)` throws on miss.

### 3. CLI Surface and Orchestrator Re-Entry

`src/sdk/workflow-cli.ts:50-73` (`normalizeToRegistry`) accepts a single workflow, an array, or a `Registry` (detected structurally by the presence of `.register`). `createWorkflowCli(target, opts)` returns a `WorkflowCli` whose `.run()`:
1. Calls `handleOrchestratorReEntry((n,a) => registry.resolve(n,a))` first (`workflow-cli.ts:337-340`).
2. If not re-entry, parses argv via Commander (`buildCliCommand`, `workflow-cli.ts:146-228`) — registers `-n/--name`, `-a/--agent`, per-input `--<name>` flags, `--detach`, and a free-form `[prompt...]` positional.
3. If `-n` is omitted in a TTY, opens `WorkflowPickerPanel` (`workflow-cli.ts:559-622`).
4. Routes to `resolveAndStart()` (`workflow-cli.ts:90-136`), which merges inputs with deterministic precedence — `dispatcherInputs < runInputs < cliInputs` (verified at `tests/sdk/workflow-cli.test.ts:344-400`) — runs `validateAndResolve` against the schema, and finally calls `executeWorkflow({ definition, agent, inputs, entrypointFile, workflowKey, detach })`.

`handleOrchestratorReEntry` (`src/sdk/runtime/executor.ts:1939-1960`):

```typescript
if (process.env.ATOMIC_ORCHESTRATOR_MODE !== "1") return false;
const key = process.env.ATOMIC_WF_KEY ?? "";
const slashIdx = key.indexOf("/");
if (slashIdx < 0) throw new Error(`… ATOMIC_WF_KEY "${key}" is malformed …`);
const agent = key.slice(0, slashIdx) as AgentType;
const name  = key.slice(slashIdx + 1);
const def   = resolve(name, agent);
if (!def)   throw new Error(`ATOMIC_WF_KEY "${key}" not found in registry`);
await runOrchestrator(def);
return true;
```

`src/sdk/commander.ts` exposes `runCli(clis, cliFn)` which embeds the same gate (`commander.ts:137-158`) so external Commander-based CLIs can host atomic workflows transparently — verified by `tests/sdk/commander.test.ts:125-173`.

### 4. The Two-Process Launch Path — `executeWorkflow`

`src/sdk/runtime/executor.ts:472-548` implements `executeWorkflow(options)`. The deterministic launch sequence is:

1. `workflowRunId = generateId()` — `crypto.randomUUID().slice(0,8)` (`executor.ts:498`).
2. `tmuxSessionName = "atomic-wf-${agent}-${definition.name}-${workflowRunId}"` (`executor.ts:499`).
3. `sessionsBaseDir = join(getSessionsBaseDir(), workflowRunId)` (`executor.ts:500`); `~/.atomic/sessions/<workflowRunId>/` is created via `ensureDir`.
4. `inputsB64 = Buffer.from(JSON.stringify(inputs)).toString("base64")` (`executor.ts:516`) — base64 sidesteps shell-quoting hazards for multiline text inputs and free-form prompts (the `prompt` positional rides the same pipe under the key `prompt`).
5. A platform-specific launcher script (`orchestrator.sh` or `orchestrator.ps1`) is written into `sessionsBaseDir` (`executor.ts:518-541`) with these env vars (escaped via `escBash`/`escPwsh`, `executor.ts:384, 397`):
   - `ATOMIC_WF_ID` — `workflowRunId`
   - `ATOMIC_WF_TMUX` — `tmuxSessionName`
   - `ATOMIC_WF_AGENT` — agent key
   - `ATOMIC_WF_INPUTS` — base64 JSON inputs
   - `ATOMIC_ORCHESTRATOR_MODE` — `"1"`
   - `ATOMIC_WF_KEY` — `"<agent>/<name>"`
   - `ATOMIC_WF_CWD` — `projectRoot`
   The script ends with `bun run "${entrypointFile}" 2>"${logPath}"`.
6. `tmux.createSession(tmuxSessionName, shellCmd, "orchestrator")` creates the session on the dedicated `-L atomic` socket (`runtime/tmux.ts:20`). `tmux.setSessionEnv(tmuxSessionName, "ATOMIC_AGENT", agent)` mirrors the agent into the session env so cross-context queries can resolve it.
7. Attach behaviour branches by context (`executor.ts:551-569`): inside an atomic socket → `switchClient`; inside other tmux → `detachAndAttachAtomic`; otherwise `spawnMuxAttach`. With `--detach`, the launcher returns immediately and the session continues headless.

### 5. Orchestrator Process — `runOrchestrator`

The re-executed Bun process re-imports the user's entrypoint (typically `examples/.../claude-worker.ts` or `src/cli.ts`), enters `runCli` / `cli.run()`, and is caught by `handleOrchestratorReEntry` which calls `runOrchestrator(def)` (`executor.ts:1962`).

`runOrchestrator()` (`executor.ts:1962-2125`):
1. `validateOrchestratorEnv()` (`runtime/executor-env.ts:17`) reads + validates the four required env vars (`ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`) — missing or invalid values throw with the exact var name (`tests/sdk/runtime/executor.test.ts:96, 133`).
2. `parseInputsEnv(process.env.ATOMIC_WF_INPUTS)` base64-decodes (`executor.ts:412`).
3. `process.chdir(cwd)` (`executor.ts:1976`).
4. Constructs an `OrchestratorPanel` (OpenTUI React, `src/sdk/runtime/panel.tsx`, re-exported from `src/sdk/components/orchestrator-panel.tsx`).
5. Subscribes a debounced `persistSnapshot` to panel mutations (`executor.ts:1993-2010`) so every panel state change collapses into a single microtask `writeSnapshot()` call.
6. Builds `SharedRunnerState` (`activeRegistry`, `completedRegistry`, `failedRegistry`, etc.).
7. Coerces inputs via `coerceInputsBySchema` (`executor.ts:441, 2060`) — converts `integer`-typed strings to `number`, others stay as strings.
8. Builds `WorkflowContext` (`executor.ts:2083-2090`):
   ```typescript
   const sessionRunner = createSessionRunner(shared, "orchestrator");
   const workflowCtx: WorkflowContext = {
     inputs: shared.inputs,
     agent,
     stage: sessionRunner,
     transcript: createTranscriptReader(shared.completedRegistry),
     getMessages: createMessagesReader(shared.completedRegistry),
   };
   ```
9. Races the user callback against `panel.waitForAbort()` (`executor.ts:2095`):
   ```typescript
   const abortPromise = panel.waitForAbort().then(() => { throw new WorkflowAbortError(); });
   await Promise.race([definition.run(workflowCtx), abortPromise]);
   ```
10. On clean exit, writes a final snapshot synchronously, then `panel.destroy()`.

### 6. Stage Execution and Graph Inference — the Determinism Core

Every `ctx.stage(...)` call is the closure returned by `createSessionRunner()` (`executor.ts:1512-1898`). The closure captures a fresh `GraphFrontierTracker(parentName)` — at the workflow root, `parentName === "orchestrator"`; nested `ctx.stage()` callbacks each get their own tracker (`executor.ts:1811`), giving lexical isolation per stage scope.

The synchronous prefix of each call (executed before any `await`) does:

1. Validates `name` is non-empty and not in `activeRegistry`/`completedRegistry`/`failedRegistry` (`executor.ts:1531-1547`).
2. Calls `graphTracker.onSpawn()` (`executor.ts:1549`) — but only if the stage is not headless. `headless: true` stages do **not** consume or update the frontier, otherwise the next visible stage would be orphaned (`executor.ts:1549, 1874, 1899`).
3. Creates `donePromise` and registers a placeholder in `activeRegistry` (`executor.ts:1552-1569`).
4. Allocates a port via `getRandomPort()` (`executor.ts:1571`).

It then proceeds asynchronously:

5. Either creates a tmux window (`tmux.createWindow`, `executor.ts:1593`) that runs `buildPaneCommand(agent, …)` (`executor.ts:292`) or spawns a headless provider in-process (`executor.ts:1585`).
6. Waits for server readiness via `waitForServer()` (`executor.ts:1604`) — for Claude this watches `~/.atomic/claude-ready/<sessionId>` written by the SessionStart hook (`src/commands/cli/claude-session-start-hook.ts:38-58`).
7. Calls `shared.panel.addSession(name, graphParents)` (`executor.ts:1607`) — the inferred parents become the visible graph edges.
8. Calls `initProviderClientAndSession()` (`executor.ts:1291`) returning `{ client, session, cleanup? }`.
9. Builds a `SessionContext` and runs the user callback (`executor.ts:1835`).
10. On success, `shared.panel.sessionSuccess(name)` (`executor.ts:1865`), moves the entry to `completedRegistry`, resolves `donePromise`, and calls `graphTracker.onSettle(name)` (`executor.ts:1874`). On error the symmetric `sessionError` path runs.

`GraphFrontierTracker` (`src/sdk/runtime/graph-inference.ts:12-50`) is a 50-line state machine with two arrays:

```typescript
constructor(parentName: string) { this.parallelAncestors = [parentName]; }
onSpawn(): string[] {
  if (this.frontier.length > 0) {            // sequential: prior wave settled
    this.parallelAncestors = [...this.frontier];
    this.frontier = [];
  }
  return [...this.parallelAncestors];        // parallel siblings reuse ancestors
}
onSettle(name: string): void { this.frontier.push(name); }
```

Because `onSpawn()` runs synchronously before `await`, `Promise.all([ctx.stage(A), ctx.stage(B)])` fires both `onSpawn` calls in the same microtask before either settles, so both observe `frontier === []` and become siblings of `parallelAncestors`. After both `onSettle`, the next `await ctx.stage(C)` sees `frontier === [A, B]` and becomes a fan-in child. `tests/sdk/runtime/graph-inference.test.ts` verifies sequential chains (`:10`), parallel fan-out (`:26`), fan-in (`:39`), the canonical "describe → [a,b] → merge" topology (`:56`), Ralph's loop (`:73`), nested scopes (`:132`), the diamond pattern (`:149`), conditional skip (`:94`), and fire-and-forget siblings (`:190`).

### 7. Cross-Stage Data Flow — `s.save` / `s.transcript`

`SessionContext` (`types.ts:290`) extends `WorkflowContext` with provider-specific `client` and `session`, plus:
- `s.save: SaveTranscript` — overloaded interface (`types.ts:243`) accepting Copilot `SessionEvent[]`, OpenCode `SessionPromptResponse`, or a Claude session ID string. Persists a `SavedMessage` envelope `{ provider, data }` (`types.ts:231`).
- `s.transcript(handle)` — returns `{ path, content }` from the saved file. Authors typically embed `prior.path` in the next prompt so the agent reads the file via its native Read tool (cheaper) or inline `prior.content` for direct context.
- `s.getMessages(handle)` — returns the typed native message array.
- `s.sessionDir`, `s.paneId`, `s.sessionId` — workspace-local paths and identifiers.

`SessionHandle<T>` (`types.ts:259`) is what `await ctx.stage(...)` resolves to: `{ name, id, result }` where `result` is the typed return of the stage callback. The review-fix loop pattern in `examples/review-fix-loop/claude/index.ts:62-101` returns `"clean" as const | "needs_fix" as const` from the review stage and branches on `review.result === "clean"` to break the loop — pure TypeScript control flow.

### 8. Provider Adapters

`src/sdk/providers/claude.ts` wraps `@anthropic-ai/claude-agent-sdk`:
- `ClaudeClientWrapper` / `ClaudeSessionWrapper` for visible (tmux pane) Claude sessions.
- `HeadlessClaudeClientWrapper` / `HeadlessClaudeSessionWrapper` for `headless: true` stages.
- `waitForIdle(claudeSessionId, transcriptBeforeCount)` — watches `~/.atomic/claude-stop/<sessionId>` via `fs.watch`, calls `getSessionMessages(sessionId)`, slices new messages, and polls if `_isMidAgentLoop` is true (`tests/sdk/providers/claude-wait-for-idle.test.ts:105, 214, 285`).
- `watchHILMarker(sessionId, onHIL, signal)` — fires `onHIL(true)` when `~/.atomic/claude-hil/<sessionId>` exists, `onHIL(false)` when it disappears, with a `wasHIL` guard preventing duplicate fires (`tests/sdk/providers/claude-watch-hil-marker.test.ts:56, 84, 142`).
- `clearClaudeSession(sessionId)` — writes `~/.atomic/claude-release/<sessionId>` to tell the Stop hook to exit.
- `validateClaudeWorkflow` — regex validator run at registration.

`src/sdk/providers/copilot.ts` wraps `@github/copilot-sdk`:
- `copilotSubprocessEnv` and `mergeCopilotSystemMessage` (consuming `resolveAdditionalInstructionsContent`).
- `wrapCopilotSend` (`executor.ts:940`) — wraps Copilot's fire-and-forget `send()` to await the `session.idle` event.
- `watchCopilotSessionForHIL` (`executor.ts:1057`) — listens to `tool.execution_start` / `tool.execution_complete` for the `ask_user` tool.

`src/sdk/providers/opencode.ts` wraps `@opencode-ai/sdk/v2`:
- `withHeadlessOpencodeEnv` sets `OPENCODE_CLIENT=sdk` so headless stages don't hang on the interactive `question` tool.
- `watchOpencodeStreamForHIL` (`executor.ts:1005`) — consumes the OpenCode SSE event stream, calls `onHIL(true/false)` on `question.asked`/`question.replied`/`question.rejected`.

### 9. Filesystem IPC — Marker Files in `~/.atomic/`

`src/commands/cli/claude-stop-hook.ts:64` defines `claudeHookDirs()` as the single source of truth for six directories under `~/.atomic/`:

| Directory | Producer | Consumer | Purpose |
|---|---|---|---|
| `claude-stop/<id>` | `_claude-stop-hook` writes the marker on every Claude turn end (`claude-stop-hook.ts:261`) | `waitForIdle` watches via `fs.watch` (`providers/claude.ts`) | Turn-completion signal |
| `claude-queue/<id>` | Workflow runtime writes follow-up prompts | `_claude-stop-hook` reads + unlinks, emits `{"decision":"block","reason":<prompt>}` on stdout (`claude-stop-hook.ts:315-318`) | In-session prompt delivery without `tmux send-keys` |
| `claude-release/<id>` | Runtime `clearClaudeSession` | `_claude-stop-hook` exits 0 silently | Session-end signal |
| `claude-hil/<id>` | `_claude-ask-hook enter` writes; `exit` unlinks (`claude-ask-hook.ts:71, 74`) | `watchHILMarker` in `providers/claude.ts` | Human-in-the-loop pulse on TUI |
| `claude-pid/<id>` | Workflow process | `_claude-stop-hook` polls via `process.kill(pid, 0)` for liveness | Detect crashed orchestrator |
| `claude-ready/<id>` | `_claude-session-start-hook` (`claude-session-start-hook.ts:58`) | `waitForServer` in executor | Positive readiness before JSONL exists |

`_claude-stop-hook` runs four concurrent tasks via `Promise.all` (`claude-stop-hook.ts:390-396`): two `fs.watch` runners on `queue` and `release`, a `pollIntervalMs=100ms` fallback for dropped events, and a 5s liveness check against the atomic PID. The `DEFAULT_WAIT_TIMEOUT_MS = 2_147_483_000` (~24 days, `claude-stop-hook.ts:129`) aligns with Claude's hook timeout. Hook exits are always `0` so they don't surface in Claude's transcript.

### 10. Status Persistence

`src/sdk/runtime/status-writer.ts` writes a versioned `WorkflowStatusSnapshot` (`status-writer.ts:38`) with `schemaVersion: 1`. Fields include `workflowRunId`, `tmuxSession`, `workflowName`, `agent`, `prompt`, `overall`, `completionReached`, `fatalError`, `updatedAt`, and a `sessions[]` array.

- `deriveOverallStatus()` (`status-writer.ts:84`) precedence: `fatalError` → `"error"`; any session `status === "error"` → `"error"`; any `status === "awaiting_input"` → `"needs_review"`; `completionReached` → `"completed"`; else `"in_progress"`.
- `writeSnapshot()` (`status-writer.ts:140`) does an atomic rename: `Bun.write(tmpPath, …)` then `rename(tmp, final)` (`status-writer.ts:148-149`). Errors are silently swallowed.
- `readSnapshot()` (`status-writer.ts:160`) is the consumer-side read with a version guard.
- `workflowRunIdFromTmuxName()` (`status-writer.ts:193`) extracts the trailing 8-hex segment from `atomic-wf-<agent>-<name>-<runid>`.

`src/commands/cli/workflow-status.ts:84-114` uses these primitives. `buildReport()` reads the snapshot from `join(sessionsBaseDir, workflowRunId)`; if the snapshot reports `in_progress` but tmux says the session is gone, the report is downgraded to `"error"` (`workflow-status.ts:114`). For single-session queries, a post-mortem fallback reads the snapshot even when the tmux session has terminated (`workflow-status.ts:164-170`).

### 11. Tmux Layer

`src/sdk/runtime/tmux.ts` operates on a dedicated `SOCKET_NAME = "atomic"` (`tmux.ts:20`) — every tmux invocation passes `-L atomic` so workflow sessions never mix with the user's default tmux. `getMuxBinary()` (`tmux.ts:57`) caches the binary lookup; on Windows `psmux`/`pmux` are preferred over `tmux`.

Session names encode metadata: `atomic-wf-<agent>-<name>-<runid>` (workflow) and `atomic-chat-<agent>-<runid>` (chat). `parseSessionName` (`tests/sdk/runtime/tmux.test.ts:361`) tolerates hyphenated workflow names. `parseListSessionsOutput` (`tmux.test.ts:432`) filters psmux-internal targets and reads `ATOMIC_AGENT` from the session env when the name doesn't encode the agent.

`buildKillSessionOnPaneExitHooks` (`tmux.test.ts:509`) generates two tmux hook entries (`pane-exited`, `after-kill-pane`) so each session self-terminates when its main pane exits.

### 12. Configuration Cascade (`src/services/config/`)

The deterministic baseline that surrounds every workflow start:
- `src/services/config/definitions.ts:38` — `AGENT_CONFIG` is a frozen literal mapping each agent to `cmd`, `chat_flags`, `env_vars`, `folder`, `onboarding_files`. This is the single source of truth for default flags (`--allow-dangerously-skip-permissions` for Claude at `definitions.ts:43`, `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` at `:75`, `COPILOT_ALLOW_ALL=true` at `:92`).
- `src/services/config/atomic-config.ts:159` — `readAtomicConfig(projectDir)` merges `~/.atomic/settings.json` (global) under `.atomic/settings.json` (local). `mergeProviderOverrides` (`atomic-config.ts:113`) replaces `chatFlags` entirely but shallow-merges `envVars` with later wins.
- `src/services/config/scm-sync.ts:171` — `syncScmMcpServers(projectRoot)` runs on every chat/workflow startup, derives the enabled MCP set from `config.scm`, and idempotently rewrites `.claude/settings.json`'s `disabledMcpjsonServers` and `.opencode/opencode.json`'s `mcp.<server>.enabled` flags. Errors are swallowed so config bugs never block startup.
- `src/services/config/additional-instructions.ts:138` — `resolveAdditionalInstructionsContent` returns `.atomic/AGENTS.md` (project) or `~/.atomic/AGENTS.md` (global) for injection into agent system prompts.
- `src/services/config/settings.ts:65` — `ensureGlobalAtomicSettings()` is idempotent and runs on every CLI startup (`src/cli.ts:358-361`).

### 13. Bootstrap, Versioning, Locking

- `src/services/system/auto-sync.ts:89-126` — `autoSyncIfStale()` reads `~/.atomic/.synced-version` and compares to `VERSION`. On match (and `hasRequiredMuxBinary()`) it returns immediately; on mismatch it runs four parallel idempotent steps (`ensureTmuxInstalled`, `installGlobalAgents`, `upgradeGlobalToolPackages`, `installGlobalSkills`) and writes the marker only if `results.every(Boolean)`.
- `src/version.ts:6` — `VERSION` is imported directly from `package.json` via Bun's native JSON import, propagated to the CLI banner (`src/cli.ts:25, 50`), the auto-sync guard, and the workflow loader.
- `src/sdk/runtime/version-compat.ts:23-68` — `parseVersion` + `compareVersions` + `satisfiesMinVersion` form a dependency-free semver check evaluated against each workflow's `minSDKVersion`. Failure throws `IncompatibleSDKError` (`src/sdk/errors.ts:47-58`) carrying `{ requiredVersion, currentVersion }`.
- `src/services/system/file-lock.ts:77-114` — `tryAcquireLock` uses `writeFileSync` with `{ flag: "wx" }` for atomic create-exclusive; PID liveness is verified via `process.kill(pid, 0)`; stale locks are removed before retry. `withLock(filePath, fn, options)` wraps acquire/release in a try/finally.
- `install.ps1` / `install.sh` — bootstrap installers; `install.ps1`'s `Invoke-Step` (`lines 114-190`) only advances `$script:StepIndex` on success, so the displayed progress percentage cannot lie.

### 14. Built-in Workflows and Examples

- `src/sdk/workflows/builtin-registry.ts` — `createBuiltinRegistry()` registers `ralph`, `deep-research-codebase`, and `open-claude-design` for all three agents (claude/copilot/opencode).
- `src/sdk/workflows/builtin/deep-research-codebase/claude/index.ts` — Wave 1 (locator + pattern-finder batches) → TS reads files → Wave 2 (analyzer + online-researcher batches) → aggregator. Uses `Promise.allSettled` for fault isolation across batched headless stages.
- `src/sdk/workflows/builtin/ralph/claude/index.ts` — bounded `for (let iteration = 1; iteration <= maxLoops; iteration++)` with planner/orchestrator/three-parallel-headless-discovery/two-parallel-headless-review stages and an early-exit on "patch is correct".
- `examples/parallel-hello-world/claude/index.ts:32-84` — canonical sequential→parallel→fan-in idiom: `await ctx.stage(greet)` → `await Promise.all([ctx.stage(formal), ctx.stage(casual)])` → `await ctx.stage(merge)` reading `formalText.content` and `casualText.content`.
- `examples/review-fix-loop/claude/index.ts:62-101` — verdict-driven iteration via `handle.result`.
- `examples/structured-output-demo/claude/index.ts:45-72` — `outputFormat: { type: "json_schema", schema: LANGUAGE_FACTS_JSON_SCHEMA }` with Zod `safeParse` against `s.session.lastStructuredOutput`. The shared schema in `examples/structured-output-demo/helpers/schema.ts:49` uses `z.toJSONSchema(…, { target: "openapi-3.0" })` to omit the `$schema` draft URL that would otherwise cause the Claude Agent SDK to silently drop structured output.
- `examples/multi-workflow/cli.ts:29` — `createWorkflowCli([hello, goodbye]).run()` shows the array form, equivalent to a `createRegistry().register(...).register(...)` chain.
- `examples/commander-embed/claude/index.ts` — atomic workflows embedded under a parent Commander program via `toCommand(cli, "greet")` and `runCli`.

### 15. Tests Pinning Each Determinism Property

| Property | Test |
|---|---|
| Workflow definitions are immutable post-`compile` | `src/sdk/define-workflow.test.ts` |
| Registry copy-on-write | `tests/sdk/registry.test.ts:38, 44, 110` |
| Composite key format `${agent}/${name}` | `tests/sdk/registry.test.ts:51` |
| Provider validation runs synchronously at register | `tests/sdk/registry.test.ts:152` |
| `ATOMIC_ORCHESTRATOR_MODE=1` routes to `runOrchestrator` | `tests/sdk/workflow-cli.test.ts:406` |
| `ATOMIC_WF_KEY` parsing and registry lookup | `tests/sdk/commander.test.ts:125, 174, 184` |
| Required env vars `ATOMIC_WF_{ID,TMUX,AGENT,CWD}` | `tests/sdk/runtime/executor.test.ts:96, 133` |
| Launcher script source contains exact env var names | `tests/sdk/runtime/executor.test.ts:193` |
| Input precedence dispatcher < run < cli | `tests/sdk/workflow-cli.test.ts:344-400` |
| Sequential / parallel / fan-in / diamond / loop topology | `tests/sdk/runtime/graph-inference.test.ts:10-205` |
| Status machine guards (running ↔ awaiting_input → complete/error) | `tests/sdk/components/orchestrator-panel-store.test.ts:225, 242, 288` |
| `waitForIdle` slicing, mid-loop polling, pre-existing marker race | `tests/sdk/providers/claude-wait-for-idle.test.ts:105, 214, 285` |
| HIL marker race + dedup | `tests/sdk/providers/claude-watch-hil-marker.test.ts:56, 84, 142` |
| Tmux session name parsing with hyphens | `tests/sdk/runtime/tmux.test.ts:361, 365` |
| `parseListSessionsOutput` filters psmux internals | `tests/sdk/runtime/tmux.test.ts:432` |

## Architecture & Patterns

### Determinism Comes From JavaScript Semantics, Not a Scheduler
The runtime imposes no scheduler. Sequential ordering is `await`; parallel ordering is `Promise.all`; fan-in is the resumption after `Promise.all`. `GraphFrontierTracker` is a 50-line state machine that observes spawn/settle events synchronously and reads them as graph edges. There is no DAG declaration anywhere in the workflow author's surface.

### Two-Process Re-Entry via Environment Variables
`executeWorkflow` writes a launcher shell script with `ATOMIC_ORCHESTRATOR_MODE=1` and re-executes the user's *own* entrypoint inside a tmux pane. The same code path that handles `cli.run()` for first-time launches handles re-entry — `handleOrchestratorReEntry` short-circuits as the first call inside `cli.run()`. This pattern is mirrored verbatim in `runCli` so external CLIs can host atomic workflows without modification.

### Sealed Types as Trust Boundaries
`WorkflowDefinition.__brand: "WorkflowDefinition"` (`define-workflow.ts:444`), `Object.freeze` on the inputs array (`define-workflow.ts:432-434`), `RegistrableWorkflow` constraint with `(...args: never[])` to sidestep contravariance (`types.ts`), and frozen `Registry.list()` outputs collectively prevent post-compile mutation. The compile-time generic `InputsOf<I>` propagates the schema into `ctx.inputs` so unknown fields are a type error.

### Filesystem as IPC, Atomic JSON as Status
Atomic deliberately avoids in-memory IPC for cross-process state. Every observable channel is a file under `~/.atomic/`:
- `~/.atomic/sessions/<runId>/{status.json, orchestrator.{sh,ps1}, orchestrator.log}` for runs.
- `~/.atomic/claude-{stop,queue,release,hil,pid,ready}/<sessionId>` for Claude hook coordination.
- `~/.atomic/.synced-version` for tooling sync gating.
- `~/.atomic/AGENTS.md` for global instruction baseline.
- `~/.atomic/settings.json` for global config.
All writes are atomic-rename; all reads tolerate missing files; all hooks exit `0` so failures are silent in agent transcripts.

### Configuration Cascade
Three layers of merge: hardcoded `AGENT_CONFIG` → global `~/.atomic/settings.json` → project `.atomic/settings.json`. `chatFlags` are replaced atomically; `envVars` are shallow-merged with later wins. This is enforced once in `mergeProviderOverrides` and consumed everywhere via `getProviderOverrides`.

### Tmux Socket Isolation
`-L atomic` is used for every tmux call, so workflow/chat sessions live on a dedicated socket invisible to the user's default `tmux ls`. Session names encode `(type, agent, runId)` so any subset can be filtered without out-of-band metadata.

### Headless Stages are First-Class
Headless stages skip frontier tracking (`executor.ts:1549`), don't get tmux windows, and run the agent SDK in-process. They're identical at the API surface — `s.session.query()`, `s.save()`, `s.transcript()` all work — but they don't appear on the panel and don't influence graph topology. `examples/headless-test/opencode/index.ts` stress-tests visible→headless interleaving.

## Code References

### DSL & Registry
- `src/sdk/define-workflow.ts:248` — `defineWorkflow()` factory.
- `src/sdk/define-workflow.ts:109` — `WorkflowBuilder` class.
- `src/sdk/define-workflow.ts:176` — `WorkflowBuilder.compile()` validation + freeze.
- `src/sdk/define-workflow.ts:32` — `RESERVED_INPUT_NAMES`.
- `src/sdk/types.ts:584` — `WorkflowDefinition<A,I>` interface.
- `src/sdk/types.ts:200` — `InputsOf<I>` mapped type.
- `src/sdk/registry.ts:127` — `createRegistry()`.
- `src/sdk/registry.ts:71` — duplicate-key guard.
- `src/sdk/registry.ts:21` — `providerValidators` dispatch table.

### CLI & Re-Entry
- `src/sdk/workflow-cli.ts:50` — `normalizeToRegistry()`.
- `src/sdk/workflow-cli.ts:90` — `resolveAndStart()`.
- `src/sdk/workflow-cli.ts:146` — `buildCliCommand()`.
- `src/sdk/commander.ts:137-158` — `runCli` orchestrator gate.
- `src/sdk/runtime/executor.ts:1939` — `handleOrchestratorReEntry()`.

### Launch & Orchestrator
- `src/sdk/runtime/executor.ts:472` — `executeWorkflow()`.
- `src/sdk/runtime/executor.ts:498-541` — workflow ID generation, base64 inputs, launcher script.
- `src/sdk/runtime/executor.ts:1962` — `runOrchestrator()`.
- `src/sdk/runtime/executor.ts:2083-2095` — `WorkflowContext` construction + abort race.
- `src/sdk/runtime/executor-env.ts:17` — `validateOrchestratorEnv()`.

### Stage & Graph
- `src/sdk/runtime/executor.ts:1512` — `createSessionRunner()`.
- `src/sdk/runtime/executor.ts:1549, 1874, 1899` — headless skip + frontier update.
- `src/sdk/runtime/graph-inference.ts:12-50` — `GraphFrontierTracker`.
- `src/sdk/runtime/executor.ts:1811` — nested per-stage tracker.

### Status & Tmux
- `src/sdk/runtime/status-writer.ts:38` — `WorkflowStatusSnapshot` schema.
- `src/sdk/runtime/status-writer.ts:84` — `deriveOverallStatus()` precedence.
- `src/sdk/runtime/status-writer.ts:140` — atomic `writeSnapshot()`.
- `src/sdk/runtime/status-writer.ts:193` — `workflowRunIdFromTmuxName()`.
- `src/sdk/runtime/tmux.ts:20` — `SOCKET_NAME = "atomic"`.
- `src/sdk/runtime/tmux.ts:57` — `getMuxBinary()` cross-platform resolution.
- `src/commands/cli/workflow-status.ts:84-114` — `buildReport()` snapshot + tmux fallback.

### Providers & Hooks
- `src/sdk/providers/claude.ts` — `ClaudeClientWrapper`, `waitForIdle`, `watchHILMarker`, `clearClaudeSession`.
- `src/sdk/providers/copilot.ts` — `mergeCopilotSystemMessage`.
- `src/sdk/providers/opencode.ts` — `withHeadlessOpencodeEnv`.
- `src/commands/cli/claude-stop-hook.ts:64` — `claudeHookDirs()`.
- `src/commands/cli/claude-stop-hook.ts:202-396` — Stop hook runner with `Promise.all` of 4 tasks.
- `src/commands/cli/claude-ask-hook.ts:47-74` — HIL enter/exit.
- `src/commands/cli/claude-session-start-hook.ts:38-58` — readiness marker.

### Configuration & Bootstrap
- `src/services/config/definitions.ts:38` — `AGENT_CONFIG`.
- `src/services/config/atomic-config.ts:113-164` — provider override merge + `readAtomicConfig`.
- `src/services/config/scm-sync.ts:171` — startup MCP server sync.
- `src/services/config/additional-instructions.ts:123, 138, 231` — `AGENTS.md` resolution + opencode reconciliation.
- `src/services/system/auto-sync.ts:89-126` — `autoSyncIfStale`.
- `src/services/system/file-lock.ts:77, 213` — `tryAcquireLock`, `withLock`.
- `src/version.ts:6` — `VERSION`.
- `src/sdk/runtime/version-compat.ts:23-68` — semver comparator.
- `src/sdk/errors.ts:47-58` — `IncompatibleSDKError`.

### Built-ins & Examples
- `src/sdk/workflows/builtin-registry.ts` — `createBuiltinRegistry()`.
- `src/sdk/workflows/builtin/deep-research-codebase/claude/index.ts` — wave-based parallel batches.
- `src/sdk/workflows/builtin/ralph/claude/index.ts` — bounded loop with parallel reviewers.
- `examples/parallel-hello-world/claude/index.ts:32-84` — sequential → `Promise.all` → fan-in.
- `examples/review-fix-loop/claude/index.ts:62-101` — verdict loop via `handle.result`.
- `examples/structured-output-demo/helpers/schema.ts:49` — Zod → openapi-3.0 JSON Schema.
- `examples/multi-workflow/cli.ts:29` — array-form `createWorkflowCli`.

### Tests (representative)
- `tests/sdk/runtime/graph-inference.test.ts` — frontier tracking topology.
- `tests/sdk/runtime/executor.test.ts:96, 133, 193` — env var validation + launcher source guard.
- `tests/sdk/workflow-cli.test.ts:344-452` — input precedence + orchestrator dispatch.
- `tests/sdk/commander.test.ts:125-206` — `runCli` re-entry semantics.
- `tests/sdk/registry.test.ts:38-152` — immutability + composite key + sync validation.
- `tests/sdk/components/orchestrator-panel-store.test.ts:225-288` — guarded status transitions.
- `tests/sdk/providers/claude-wait-for-idle.test.ts:105, 214, 285` — Stop hook race conditions.
- `tests/sdk/runtime/tmux.test.ts:361-509` — session name parsing + kill hooks.

## Historical Context (from research/)

The historical snapshot stored in the workflow prompt references documents that describe an earlier or proposed model that does not match the current code:
- `research/docs/2026-02-25-graph-execution-engine-technical-documentation.md` documents a `GraphBuilder` / `GraphExecutor` BFS engine with checkpointing — **not present in current `src/sdk/`**.
- `specs/2026-03-23-workflow-sdk-simplification-z3-verification.md` proposes a `defineWorkflow()` DSL with mandatory Z3 formal verification at compile time. The DSL exists; **no Z3 verification, reachability, deadlock, or termination checks** are present in `src/sdk/define-workflow.ts:176-218`. `validateWorkflowInput` only validates input names/types/duplicates.
- `specs/2026-03-23-ralph-workflow-redesign.md` proposes a `WorkflowSessionConductor` with session-per-stage execution. The current Ralph workflow (`src/sdk/workflows/builtin/ralph/claude/index.ts`) is implemented as a normal `defineWorkflow().run(async (ctx) => { for (...) { await ctx.stage(...) } })` against the `executor.ts` + `GraphFrontierTracker` runtime — **no `WorkflowSessionConductor` symbol exists**.
- `specs/2026-03-25-workflow-interrupt-resume-session-preservation.md` references a `preservedSession` field for interrupt/resume across `Ctrl+C`. The live runtime races `definition.run()` against `panel.waitForAbort()` (`executor.ts:2095`) and uses `WorkflowAbortError`; per-session preservation across abort is not visible in the current `executor.ts` or `panel.tsx`.

The takeaway: live findings (this document) describe what exists today; the historical specs describe an earlier/alternative model. The frontier-based JS-control-flow inference design supersedes the BFS GraphExecutor, and Z3 / WorkflowSessionConductor / preservedSession are not present in the current source tree.

## Open Questions

1. **`minSDKVersion` enforcement throw site** — `src/sdk/errors.ts:47-58` defines `IncompatibleSDKError` and `version-compat.ts` defines the predicate, but the throw site in the current source tree was not located by the partition analyzers (Partition 14 notes a compiled SDK bundle reference). It is unclear whether the workflow loader in `defineWorkflow.compile()` or in `registry.register()` is the one that throws.
2. **Interrupt/resume semantics** — The historical spec describes `preservedSession` to keep sessions alive across `Ctrl+C`. The live `runOrchestrator` only races `panel.waitForAbort()` and throws `WorkflowAbortError`. Whether per-stage sessions can be resumed after an abort, and what the user-visible recovery flow is, was not discoverable from the live partition reports.
3. **Schema versioning evolution** — `WorkflowStatusSnapshot.schemaVersion: 1` is hardcoded (`status-writer.ts`). The repo provides no migration code, suggesting older snapshots are simply ignored on reads if they don't match.
4. **Headless graph visibility** — Headless stages skip frontier tracking (`executor.ts:1549`). When a non-headless stage follows a series of headless ones, the next visible stage takes the parent set the headless ones inherited. The semantic implications for `status.json` consumers (which may see stages without parent edges) are not documented.
5. **Free-form `prompt` input** — Free-form workflows synthesize a single optional `prompt` field (`workflow-inputs.ts`). The exact rules that determine whether a workflow is treated as free-form vs. structured (e.g., zero declared inputs) live in `buildInputsPayload()` (`src/commands/cli/workflow-inputs.ts:35`); the precise predicate was not extracted in the partitions.

## Methodology

Generated by the deep-research-codebase workflow with 16 partitions
covering 343 source files (75,338 LOC).
Each partition was investigated by four specialist sub-agents dispatched
directly via the provider SDK's native agent parameter:
codebase-locator, codebase-pattern-finder, codebase-analyzer, and
codebase-online-researcher. A separate research-history pipeline ran
codebase-research-locator → codebase-research-analyzer over the project's
prior research documents.
