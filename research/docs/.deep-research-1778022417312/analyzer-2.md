### Files Analysed

- `.agents/skills/workflow-creator/SKILL.md`
- `.agents/skills/workflow-creator/references/state-and-data-flow.md`
- `.agents/skills/workflow-creator/references/control-flow.md`
- `.agents/skills/workflow-creator/references/computation-and-validation.md`
- `.agents/skills/workflow-creator/references/failure-modes.md`
- `.agents/skills/workflow-creator/references/getting-started.md`
- `.agents/skills/workflow-creator/references/workflow-inputs.md`
- `.agents/skills/workflow-creator/references/agent-sessions.md`

---

### Per-File Notes

#### `.agents/skills/workflow-creator/SKILL.md`

- **Role:** Master guide and authoring reference for the `defineWorkflow().run().compile()` API. Establishes structural rules, concept-to-code mapping, and the boundary between deterministic code and LLM sessions.
- **Key sections:**
  - Structural Rules (hard constraints): `SKILL.md:433–443`
  - Concept-to-Code Mapping table: `SKILL.md:449–463`
  - "When to use a stage vs. plain TypeScript" with annotated code: `SKILL.md:466–503`
  - Information Flow Is a First-Class Design Concern: `SKILL.md:164–183`
- **Control flow / determinism guidance:**
  - Rule 9 (`SKILL.md:443`): "Every `ctx.stage()` must contain at least one LLM interaction." Stages with no LLM call are forbidden. All pure deterministic code (file I/O, git commands, HTTP calls, parsing, validation) belongs in `.run()` outside any stage.
  - The concept-to-code mapping explicitly labels: "Pure deterministic computation (no LLM call): Plain TypeScript at the top level of `.run()`. **Never** a standalone stage." (`SKILL.md:460`)
  - "Deterministic work tied to an LLM call: Inside the same stage callback, before/after the query." (`SKILL.md:461`)
  - Graph topology is auto-inferred from `await`/`Promise.all` patterns; no explicit dependency declarations (`SKILL.md:440`).
  - Unique session names enforced per run; the runtime prevents name collisions (`SKILL.md:438`).
  - `transcript()` and `getMessages()` only access completed sessions — ordering is enforced by the completion registry (`SKILL.md:439`).
- **Data flow guidance:**
  - Workflows receive user data exclusively through `ctx.inputs`/`s.inputs`, declared as `WorkflowInput[]` (`SKILL.md:330–335`).
  - TypeScript compile-time error if an undeclared input field is accessed.
  - Data between sessions flows via `s.save()` → `s.transcript(handle)` / `s.getMessages(handle)`.
- **Dependencies referenced:** `references/getting-started.md`, `references/control-flow.md`, `references/state-and-data-flow.md`, `references/failure-modes.md`, `references/agent-sessions.md`, `references/computation-and-validation.md`, `references/workflow-inputs.md`, `references/session-config.md`

---

#### `.agents/skills/workflow-creator/references/state-and-data-flow.md`

- **Role:** Canonical reference for how data is passed between sessions, within sessions, and via the filesystem. Defines the completion rule that underlies deterministic ordering.
- **Key sections:**
  - Completion rule: `state-and-data-flow.md:7`
  - Per-SDK save patterns: `state-and-data-flow.md:11–22`
  - `s.transcript(handle)` returns `{ path, content }`: `state-and-data-flow.md:26–50`
  - Returning values from session callbacks via `.result`: `state-and-data-flow.md:85–97`
  - File-based persistence with `s.sessionDir`: `state-and-data-flow.md:144–176`
  - Context-aware transcript compression: `state-and-data-flow.md:309–337`
- **Control flow / determinism guidance:**
  - The completion rule (`state-and-data-flow.md:7`): "`transcript()` and `getMessages()` can only access data from sessions whose callbacks have already returned (i.e., sessions in the `completedRegistry`)." This is the central determinism invariant — forward-only data flow is enforced at runtime.
  - "In a `Promise.all()` group, sibling sessions cannot read each other's output — only sessions that completed before the group started are available." (`state-and-data-flow.md:7–8`)
  - Session callbacks can return a value (`state-and-data-flow.md:85–97`) via `handle.result`, available only after `await`.
- **Data flow guidance:**
  - Linear pipeline: `Session A → s.save() → Session B reads via s.transcript(handleA)` (`state-and-data-flow.md:243–245`)
  - Fan-in (multiple prior sessions): all completed upstream handles can be read in a merge session (`state-and-data-flow.md:249–278`)
  - Accumulating state: each session can read all prior completed steps via their handles (`state-and-data-flow.md:282–305`)
  - Compression boundary: compress transcript content before injecting into downstream prompts to prevent context overflow (`state-and-data-flow.md:309–337`)
  - File-based coordination as an alternative for large artifacts (`state-and-data-flow.md:339–356`)
- **Dependencies referenced:** `failure-modes.md` §F8 (for `parseReviewResult` layered fallback), `context-compression` skill, `context-degradation` skill, `filesystem-context` skill

---

#### `.agents/skills/workflow-creator/references/control-flow.md`

- **Role:** Documents all orchestration patterns — conditional branching, bounded loops, review/fix loops, parallel execution, graph topology inference, headless stages, multi-turn conversations, and error handling.
- **Key sections:**
  - Two levels of control flow (intra-session vs. inter-session): `control-flow.md:6–9`
  - Graph topology auto-inference from `await`/`Promise.all`: `control-flow.md:228–305`
  - Headless stage transparency to graph topology: `control-flow.md:308–354`
  - Review/fix loop with consecutive clean-pass detection: `control-flow.md:132–175`
  - Combining patterns (typed handles + transcript handoff): `control-flow.md:434–470`
- **Control flow / determinism guidance:**
  - The runtime automatically infers graph topology from JavaScript control flow: sequential `await` produces a parent-child chain; `Promise.all([...])` creates sibling branches from the same parent; a stage after `Promise.all` receives all parallel stages as parents (`control-flow.md:228–275`).
  - No explicit dependency declarations exist or are supported (`control-flow.md:229`).
  - Headless stages (`{ headless: true }`) are transparent to graph topology — they don't consume or update the execution frontier (`control-flow.md:308–312`). The next visible stage chains from the last visible stage.
  - Bounded loops with `for`/`while` create a naturally serialized chain because each `await` follows the previous (`control-flow.md:286–304`).
  - Review/fix termination is determined by `consecutiveClean` counter reaching `CLEAN_THRESHOLD` (`control-flow.md:155–157`), not by any nondeterministic mechanism.
  - Early termination via `break` inside loops is plain TypeScript evaluated deterministically in `.run()` (`control-flow.md:100–104`).
- **Data flow guidance:**
  - `SessionHandle<T>.result` carries typed return values; `s.transcript(handle)` retrieves prior session transcripts — both only valid after the producing `await` resolves (`control-flow.md:434–470`).
  - Intra-session control flow: TypeScript `if`/`else` directly on extracted assistant text drives branching within a single session (`control-flow.md:60–79`).
- **Dependencies referenced:** `extractAssistantText` from `@bastani/atomic/workflows`, `failure-modes.md` §F1 (Copilot `getAssistantText`), `state-and-data-flow.md`

---

#### `.agents/skills/workflow-creator/references/computation-and-validation.md`

- **Role:** Documents how deterministic computation — parsing, validation, file I/O, API calls, data transforms, quality gates — is expressed in workflows. Establishes the explicit demarcation between LLM-driven and TypeScript-driven logic.
- **Key sections:**
  - Inline computation in session callbacks (parse → validate → query): `computation-and-validation.md:8–31`
  - Per-SDK response parsing helpers: `computation-and-validation.md:33–73`
  - JSON parsing with layered fallback: `computation-and-validation.md:76–83`
  - Zod validation pattern: `computation-and-validation.md:86–104`
  - Data transforms between sessions: `computation-and-validation.md:144–165`
  - Quality Gate with LLM-as-Judge: `computation-and-validation.md:168–201`
- **Control flow / determinism guidance:**
  - Opening line (`computation-and-validation.md:3`): "Deterministic computation — validation, data transforms, file I/O, API calls — is written as plain TypeScript inside `.run()` or session callbacks. No LLM session is needed."
  - Parse-then-branch: deterministic TypeScript reads prior session output, validates it, and conditionally invokes an LLM only when needed (`computation-and-validation.md:14–29`).
  - Quality gates inject deterministic scores (`scores.pass`) from an LLM judge's parsed JSON to drive conditional fix prompts (`computation-and-validation.md:190–199`).
  - Handle-based lookups (`s.getMessages(plannerHandle)`) preferred over string names to preserve type information (`computation-and-validation.md:9–11`).
- **Data flow guidance:**
  - `s.getMessages(handle)` returns `SavedMessage[]` typed per provider; deterministic code then maps/filters/sorts before passing to LLM (`computation-and-validation.md:145–165`).
  - JSON fallback parser: direct parse → last fenced block (not first) → last balanced object (`computation-and-validation.md:76–83`).
- **Dependencies referenced:** `failure-modes.md` §F8 (layered JSON fallback), `failure-modes.md` §F1/F2/F3/F4 (per-SDK extraction), `src/sdk/workflows/builtin/ralph/helpers/prompts.ts` (canonical parser implementation), `evaluation` skill, `advanced-evaluation` skill

---

#### `.agents/skills/workflow-creator/references/failure-modes.md`

- **Role:** Catalogue of 22 named failure modes (F1–F22), both silent and loud. Establishes the design checklist that must be satisfied before shipping a multi-session workflow. Directly relevant to determinism because most failures are caused by violating ordering or completion invariants.
- **Key sections:**
  - Silent vs. loud failure taxonomy: `failure-modes.md:18–25`
  - F5 (Fresh session wipes prior stage context): `failure-modes.md:232–298`
  - F12 (Parallel siblings read each other's transcripts — throws): `failure-modes.md:562–595`
  - F13 (Forgetting to `await` `ctx.stage()`): `failure-modes.md:601–648`
  - F14 (Using a pending `SessionHandle` before completion): `failure-modes.md:651–700`
  - F22 (Stage with no LLM query): `failure-modes.md:1030–1115`
  - Design checklist: `failure-modes.md:895–915`
  - F20 (Orchestrator re-entry env var corruption): `failure-modes.md:970–990`
- **Control flow / determinism guidance:**
  - F12 (`failure-modes.md:567–570`): The `completedRegistry` enforces forward-only data flow. `s.transcript()` only exposes sessions whose callbacks have returned and saves have flushed; parallel siblings that try to read each other throw.
  - F13 (`failure-modes.md:608–614`): Without `await`, a session is spawned but `.run()` continues immediately; the session's save never reaches the `completedRegistry` before downstream code reads it — producing empty results or silent failures, not a thrown exception.
  - F14 (`failure-modes.md:659–664`): `SessionHandle.result` is only populated after the producing promise resolves. Accessing it before `await` returns `undefined`.
  - F22 (`failure-modes.md:1033–1048`): A stage with only TypeScript (no LLM call) still spawns a pane and session; the rule is enforced by convention/design checklist, not a runtime throw.
  - F20 (`failure-modes.md:975–990`): `ATOMIC_ORCHESTRATOR_MODE` and `ATOMIC_WF_KEY` are set exclusively by the runtime; user code must not touch them, ensuring deterministic orchestrator re-entry.
- **Data flow guidance:**
  - F9 (`failure-modes.md:477–513`): Each SDK has a strict contract for what `s.save()` accepts — Claude: session ID; Copilot: `SessionEvent[]`; OpenCode: `{ info, parts }` object. Wrong shapes produce empty `content` downstream.
  - F8 (`failure-modes.md:419–464`): The canonical JSON parser extracts the LAST fenced block, not the first, to avoid picking up prose examples.
- **Dependencies referenced:** `agent-sessions.md` §"Critical pitfall", `context-degradation` skill, `context-compression` skill, `context-optimization` skill

---

#### `.agents/skills/workflow-creator/references/getting-started.md`

- **Role:** Quick-start examples for all three SDKs, composition root patterns, `run()` invocation modes, `SessionContext` field reference, and SDK exports. Establishes the baseline API surface from which deterministic workflows are built.
- **Key sections:**
  - `run()` options (CLI, argv array, programmatic): `getting-started.md:29–47`
  - Per-SDK quick-start examples (Claude/Copilot/OpenCode): `getting-started.md:102–232`
  - Native TypeScript control flow: `getting-started.md:239–260`
  - `SessionContext` reference table: `getting-started.md:340–353`
  - Builtin reference implementations (`ralph`, `deep-research-codebase`): `getting-started.md:362–367`
- **Control flow / determinism guidance:**
  - The runtime manages the full session lifecycle automatically; callback return marks completion, throws mark errors (`getting-started.md:99`).
  - `argv: false` skips all CLI parsing and uses supplied values as-is (`getting-started.md:43–46`) — deterministic programmatic invocation.
  - Three `argv` modes: parse `process.argv` (default), parse supplied array (tests), skip entirely (`argv: false`) (`getting-started.md:29–47`).
- **Data flow guidance:**
  - `SessionContext` fields: `transcript(ref)` returns `{ path, content }`; `getMessages(ref)` returns `SavedMessage[]`; `save` persists output; `stage(opts, clientOpts, sessionOpts, fn)` spawns a nested sub-session (`getting-started.md:344–352`).
  - `SessionHandle<T>` carries `{ name, id, result }` (`getting-started.md:308`).
- **Dependencies referenced:** `control-flow.md`, `agent-sessions.md`, `failure-modes.md`, `registry-and-validation.md`

---

#### `.agents/skills/workflow-creator/references/workflow-inputs.md`

- **Role:** Documents the `WorkflowInput` schema, input precedence chain, CLI flag union and conflict rules, reserved flag names, and picker mechanics. Governs how deterministic input values reach workflow code.
- **Key sections:**
  - Input precedence chain (CLI flags > `cli.run({ inputs })` > `defineWorkflow` defaults): `workflow-inputs.md:18–30`
  - `WorkflowInput` interface definition: `workflow-inputs.md:143–160`
  - Runtime validation at invocation time (before any tmux session): `workflow-inputs.md:190–204`
  - Reserved flag names: `workflow-inputs.md:255–269`
  - CLI flag union conflict rule (same name, different type throws): `workflow-inputs.md:238–249`
- **Control flow / determinism guidance:**
  - Validation runs before any workflow code: required fields, enum values, and unknown flags are all rejected before `.run()` is ever called (`workflow-inputs.md:190–204`). This guarantees `.run()` never receives a malformed inputs object.
  - Compile-time error if an undeclared field is accessed via `ctx.inputs` (`workflow-inputs.md:340–354`).
  - `defineWorkflow` builder validates the schema immediately at call time; authoring mistakes (invalid names, enum without values, duplicate names) surface before any registry registration (`workflow-inputs.md:177–190`).
- **Data flow guidance:**
  - `ctx.inputs.<name>` and `s.inputs.<name>` resolve to the same value from within any stage callback (`workflow-inputs.md:125–133`).
  - `argv: false` makes `inputs` the top-of-chain value, bypassing CLI flag parsing (`workflow-inputs.md:28–30`).
- **Dependencies referenced:** `SKILL.md` §"Invocation surfaces", `registry-and-validation.md`

---

#### `.agents/skills/workflow-creator/references/agent-sessions.md`

- **Role:** Documents per-SDK session lifecycle, the critical context-isolation pitfall, multi-turn conversation patterns, subagent delegation, headless mode, and context engineering guidance. Directly explains why deterministic context handoff is required between Copilot/OpenCode sessions.
- **Key sections:**
  - Session lifecycle states table (Fresh / Continued / Resumed / Closed): `agent-sessions.md:346–360`
  - Critical pitfall — fresh session wipes prior context: `agent-sessions.md:337–340`
  - Three reliable ways to carry context across session boundaries: `agent-sessions.md:384–430`
  - Compaction and clearing for context overflow: `agent-sessions.md:442–460`
  - Claude: `s.session.query()` returns `SessionMessage[]`, idle detection via Stop hook: `agent-sessions.md:76–79`
  - Copilot: runtime wraps `s.session.send()` to block until `session.idle` with no timeout: `agent-sessions.md:310–315`
  - OpenCode headless: runtime uses `createOpencode({ port: 0 })` in-process: `agent-sessions.md:888`
- **Control flow / determinism guidance:**
  - Every new `ctx.stage()` call is a `Fresh` session for Copilot and OpenCode — deterministic context handoff (via explicit prompt injection, shared files, or same-stage multi-turn) is mandatory to prevent silent context loss (`agent-sessions.md:337–340`, `agent-sessions.md:384–430`).
  - Claude's session model is different: context accumulates within the same tmux pane across multiple `s.session.query()` calls inside one stage (`agent-sessions.md:5`).
  - Copilot's `s.session.send()` wrapper blocks until `session.idle` with no timeout, making it deterministically synchronous for workflow purposes (`agent-sessions.md:310–315`).
  - Provider-level resume/fork APIs are described as "advanced escape hatches, not the normal stage-to-stage handoff path" (`agent-sessions.md:428`).
- **Data flow guidance:**
  - Explicit prompt handoff: capture prior session output via `handle.result` or `s.transcript(handle)`, inject into next session's first prompt (`agent-sessions.md:395–418`).
  - External shared state: write results to task list, files on disk, or git working tree; next session reads from there (`agent-sessions.md:420–426`).
  - Keep related turns inside the same stage callback to preserve live conversation history (`agent-sessions.md:428–430`).
- **Dependencies referenced:** `failure-modes.md` §F5, `failure-modes.md` §F10, `failure-modes.md` §F16, `context-fundamentals` skill, `multi-agent-patterns` skill, `context-compression` skill, `context-degradation` skill, `filesystem-context` skill, `memory-systems` skill, `context-optimization` skill

---

### Cross-Cutting Synthesis

Atomic's deterministic workflow mechanics are built on three interlocking invariants enforced across the runtime, the type system, and authoring conventions.

**Completion-ordered data access.** The `completedRegistry` tracks sessions whose callbacks have returned and whose `s.save()` calls have flushed. `s.transcript()` and `s.getMessages()` only expose sessions in this registry. This means data flow is strictly forward — later sessions can read earlier sessions' output, but parallel siblings cannot read each other's (F12, `state-and-data-flow.md:7`). Dropping an `await` breaks this ordering silently (F13).

**Graph topology is derived, not declared.** The runtime auto-infers parent-child edges from JavaScript `await` and `Promise.all()` patterns (`control-flow.md:228–275`). Sequential `await` chains stages; `Promise.all([...])` fans out from a shared parent; headless stages are transparent to this inference and don't shift the execution frontier (`control-flow.md:308–312`). Users never declare dependencies explicitly.

**Deterministic code is kept outside stages.** Structural Rule 9 (`SKILL.md:443`) and F22 (`failure-modes.md:1033`) prohibit stages with no LLM call. All pure TypeScript (validation, parsing, file I/O) lives either in `.run()` between stages or bundled inside a stage callback adjacent to the LLM call it serves (`computation-and-validation.md:3`). Input validation runs before `.run()` even starts (`workflow-inputs.md:190–204`). Together, these rules mean that the execution graph, its ordering, and all data handoffs are deterministic — only the LLM responses themselves are nondeterministic.

---

### Out-of-Partition References

- `src/sdk/workflows/builtin/ralph/` — Production reference implementation: iterative plan → orchestrate → review → debug loop with canonical helpers (`prompts.ts`, parsers, git). Mentioned in `SKILL.md:585`, `getting-started.md:364`, `computation-and-validation.md:82`.
- `src/sdk/workflows/builtin/deep-research-codebase/` — Production reference: scout → parallel headless explorer fan-out → aggregator. Demonstrates LOC-based heuristic partitioning. Mentioned in `SKILL.md:586`, `getting-started.md:365`.
- `src/sdk/runtime/executor.ts` — Runtime file containing `wrapCopilotSend`, which installs the blocking `send()` wrapper per Copilot stage. Mentioned in `failure-modes.md:533`, `agent-sessions.md:314`.
- `examples/<name>/` — Minimal runnable user-app examples (hello-world, parallel-hello-world, headless-test, etc.). Mentioned in `SKILL.md:588–593`.
- `@bastani/atomic/workflows` — Workflow authoring package exporting `defineWorkflow`, `createWorkflowCli`, `createRegistry`, `extractAssistantText`, and type aliases. Referenced throughout all files.
- `@bastani/atomic/workflows/commander` — Commander adapter subpath exporting `toCommand` and `runCli` for embedding under a parent Commander CLI. Referenced in `SKILL.md:369–380`, `getting-started.md:63–67`.
- `@anthropic-ai/claude-agent-sdk` — Native Claude Agent SDK. Its `SessionMessage[]` type is the return type of `s.session.query()` for Claude stages. Referenced in `agent-sessions.md:28`, `computation-and-validation.md:39`.
- `@github/copilot-sdk` — Native Copilot SDK. Its `SessionEvent[]` is what `s.session.getMessages()` returns. Referenced throughout `agent-sessions.md`.
- `@opencode-ai/sdk/v2` — Native OpenCode SDK. Its `SessionPromptResponse` is what `s.client.session.prompt()` returns. Referenced throughout `agent-sessions.md`.
