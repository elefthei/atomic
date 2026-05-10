#### @anthropic-ai/claude-agent-sdk (^0.2.119)
**Docs:** https://code.claude.com/docs/en/agent-sdk/overview, https://code.claude.com/docs/en/agent-sdk/typescript
**Relevant behaviour:**
- `query(prompt, options)` — streams `SessionMessage[]` from a headless Claude Code subprocess. Used in `HeadlessClaudeSessionWrapper.query()` to drive fully unattended (headless) Claude stages in deterministic workflows; the function accepts a plain `string` or an `AsyncIterable<SDKUserMessage>` for multi-turn streaming. Options thread through abort-controllers, allowed-tool lists, and `pathToClaudeCodeExecutable` so the runtime can point at the local `claude` binary.
- `getSessionMessages(sessionId, { dir, includeSystemMessages })` — reads the JSONL transcript for a completed session and returns `SessionMessage[]`. The interactive Claude path (`ClaudeSessionWrapper`) calls this inside `waitForIdle()` after the Stop hook fires (to slice new messages since the last known count) and again in the final teardown to build the saved transcript. The headless path (`HeadlessClaudeSessionWrapper`) calls it at the end of every `query()` call to return native messages to workflow authors via `s.getMessages()`.
- `SessionMessage` type — the union of `{ type: "user" | "assistant"; message: unknown; uuid: string; session_id: string }` objects surfaced in `ctx.getMessages()` and rendered by `renderClaudeTranscript()`.
- `SDKUserMessage` / `Options` — the parameter types that `HeadlessClaudeSessionWrapper.query()` and `mergeSystemPromptAppend()` expose directly, so workflow authors writing headless Claude stages get the full SDK surface without re-wrapping.

**Where used:**
- `src/sdk/providers/claude.ts:20–26` — imports `getSessionMessages`, `query as sdkQuery`, `SessionMessage`, `SDKUserMessage`, `Options`; these drive all Claude transcript retrieval and headless prompt delivery in the executor.

---

#### @github/copilot-sdk (^0.3.0)
**Docs:** https://github.com/github/copilot-sdk (local mirror at `docs/copilot-cli/sdk.md`)
**Relevant behaviour:**
- `CopilotClient({ cliUrl })` — connects to an already-running `copilot --ui-server --port <N>` process. Atomic spawns the server in a tmux pane, then uses `new CopilotClient({ cliUrl: serverUrl })` for liveness probing (`waitForServer`) and for workflow `s.client`.
- `client.start()` / `client.stop()` — lifecycle methods called by the executor around each stage.
- `client.createSession(config)` — creates a Copilot chat session. `config.onPermissionRequest` is set to `approveAll` by default; `systemMessage` is merged with atomic-managed additional-instructions via `mergeCopilotSystemMessage`.
- `session.send({ prompt })` — delivers a prompt to the session. Workflow authors call this inside `ctx.stage()` callbacks.
- `session.on("assistant.message" | "session.idle", handler)` — event-driven transcript collection. `renderCopilotTranscript()` in `executor.ts` walks these events to build Markdown output for downstream stages.
- `SessionEvent` — the union type stored as `{ provider: "copilot"; data: SessionEvent }` in `SavedMessage`, written to disk by `s.save()` and re-read by `ctx.getMessages()`.
- `CopilotClientOptions`, `CopilotSession`, `SessionConfig` — re-exported from `types.ts` and consumed by `ClientOptionsMap` / `SessionOptionsMap` / `ClientMap` / `SessionMap` to make `ctx.stage()` type-safe per agent.

**Where used:**
- `src/sdk/types.ts:7–17` — imports `SessionEvent`, `CopilotClient`, `CopilotClientOptions`, `CopilotSession`, `SessionConfig as CopilotSessionConfig` to build the provider type maps.
- `src/sdk/providers/copilot.ts:8` — imports `SessionConfig` for `mergeCopilotSystemMessage`.
- `src/sdk/runtime/executor.ts:45,358–363` — imports `SessionEvent` for `SavedMessage`; dynamically imports `CopilotClient` to probe server liveness.

---

#### @opencode-ai/sdk (^1.14.24, sub-path `/v2`)
**Docs:** https://opencode.ai/docs/server (local mirror at `docs/opencode/sdk.md`)
**Relevant behaviour:**
- `createOpencode({ port: 0 })` — spawns an embedded OpenCode server on a random port and returns `{ client, server }`. Used in headless OpenCode stages (`headless: true` in `ctx.stage()`). The `port: 0` convention lets the OS assign a free port, matching atomic's `getRandomPort()` pattern for pane-based stages.
- `client.session.create(opts)` — creates an OpenCode session given `{ parentID?, title?, workspaceID? }`. The result's `.id` becomes `s.sessionId`.
- `SessionPromptResponse` type — the object returned by `client.session.prompt()` (shape `{ info, parts }`). Stored as `{ provider: "opencode"; data: SessionPromptResponse }` in `SavedMessage` and consumed by `renderOpencodeTranscript()`.
- `OpencodeClient` / `Session as OpencodeSession` — the client and session types that flow into `ClientMap["opencode"]` and `SessionMap["opencode"]`, giving workflow authors `s.client` and `s.session` typed for OpenCode inside a stage callback.
- `OPENCODE_CLIENT=sdk` env override (`withHeadlessOpencodeEnv`) — set around `createOpencode()` to suppress the interactive `question` tool so headless stages don't hang waiting for a human answer.

**Where used:**
- `src/sdk/types.ts:21` — imports `OpencodeClient`, `Session as OpencodeSession`, `SessionPromptResponse` to build the provider type maps.
- `src/sdk/runtime/executor.ts:46,1386` — imports `SessionPromptResponse` type; dynamically imports `createOpencode` from `@opencode-ai/sdk/v2` inside headless OpenCode stage branches.
- `src/sdk/providers/opencode.ts` — `withHeadlessOpencodeEnv` wraps every `createOpencode()` call to set the `OPENCODE_CLIENT=sdk` override.

---

The three external SDK libraries are all central to understanding how Atomic's deterministic workflows operate. `@anthropic-ai/claude-agent-sdk` drives transcript retrieval and headless Claude prompt delivery; `@github/copilot-sdk` provides the typed client/session model and event stream that Copilot stages depend on; `@opencode-ai/sdk` supplies the embedded-server API used in headless OpenCode stages. Their types are re-exported from `src/sdk/types.ts` to form the generic `ctx.stage()` interface, and their clients/sessions are auto-created and torn down by the executor so workflow authors only author pure async TypeScript orchestration logic.
