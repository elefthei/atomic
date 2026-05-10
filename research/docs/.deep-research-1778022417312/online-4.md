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
