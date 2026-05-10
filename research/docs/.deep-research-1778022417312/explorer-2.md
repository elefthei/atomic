# Partition 2 of 16 — Findings

## Scope
`.agents/` (78 files, 20,763 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Atomic Deterministic Workflows: File Locator Report

## Overview

Atomic's deterministic workflows are orchestrated through TypeScript workflow definitions that use the `defineWorkflow().run().compile()` builder API. Determinism emerges from:

1. **Explicit control flow** — Workflows use native TypeScript (`await`, `Promise.all()`, loops, conditionals) to declaratively control execution order
2. **State and data flow** — Inter-session data passes through explicit `s.save()` → `s.transcript()` / `s.getMessages()` boundaries
3. **Deterministic computation** — Plain TypeScript code (parsing, validation, file I/O) runs outside agent sessions for reproducible results
4. **Graph topology inference** — The runtime auto-derives parent-child edges from `await`/`Promise.all` patterns, making execution order visible and auditable

All documentation is in `.agents/skills/workflow-creator/` — a read-only skill package containing reference documentation and patterns.

---

## Implementation

The workflow SDK and runtime are NOT in the `.agents/` partition. This partition contains **documentation only**:

- `.agents/skills/workflow-creator/SKILL.md` — Complete workflow authoring guide covering API shape, composition roots, and orchestration patterns
- `.agents/skills/workflow-creator/references/` — 11 reference files documenting every aspect of workflow design

---

## Documentation

### Core References (Determinism-Relevant)

#### State and Data Flow
**Path:** `.agents/skills/workflow-creator/references/state-and-data-flow.md`

Documents how state flows between sessions and where deterministic computation lives:
- `s.save()` / `s.transcript()` / `s.getMessages()` handoff patterns
- Completion rule: reads only from completed sessions (ensures ordering)
- File-based persistence for cross-run state
- Data compression at session boundaries to prevent context degradation
- Linear pipeline, fan-in, and accumulation patterns

#### Control Flow
**Path:** `.agents/skills/workflow-creator/references/control-flow.md`

Details deterministic orchestration via native TypeScript:
- Conditional branching (inter-session vs. intra-session)
- Bounded loops with visible graph nodes
- Review/fix loop patterns with consecutive clean-pass detection
- Graph topology auto-inference from `await`/`Promise.all`
- Headless (background) stages and their transparency to graph topology
- Nested sub-sessions and iterative chains

#### Computation and Validation
**Path:** `.agents/skills/workflow-creator/references/computation-and-validation.md`

Covers deterministic, non-LLM operations:
- Inline computation patterns (parsing, validation without agent sessions)
- Response parsing per SDK (Claude, Copilot, OpenCode)
- JSON parsing with layered fallback (direct parse → last fenced block → balanced object)
- Zod validation schemas
- File I/O and API calls
- Data transforms between sessions
- Quality gates using LLM-as-judge

#### Failure Modes
**Path:** `.agents/skills/workflow-creator/references/failure-modes.md`

Catalogs 22 silent and loud failure patterns where determinism breaks:
- **Silent failures** — Wrong output without exceptions (F1–F9, F13–F16, F20–F22)
  - F1: Copilot empty terminating assistant message (affects tool-calling stages)
  - F2: Copilot subagent messages in stream (parentToolCallId pollution)
  - F3: OpenCode non-text parts (`[object Object]` in output)
  - F4: Claude SessionMessage extraction without `extractAssistantText()`
  - F5: Fresh session wipes prior context (Copilot, OpenCode)
  - F6: Planner prompts missing trailing commentary (empty handoffs)
  - F7: Continued sessions accumulate state (lost-in-middle)
  - F8: Fenced-block parsers with model prose before/after
  - F9: `s.save()` wrong shape per SDK
  - F13: Forgetting `await` on `ctx.stage()`
  - F14: Using pending SessionHandle before completion
  - F15: Headless stage errors invisible in graph
  - F16: Claude importing SDK `query()` inside non-headless stage
  - F20: Orchestrator re-entry env var corruption
  - F21: `entry` mismatch when bundled
  - F22: `ctx.stage()` with no LLM query spawns idle pane
- **Loud failures** — Exceptions (F10–F12, F17–F19)
  - F10: Copilot `sendAndWait` default 60s timeout (use `send`)
  - F11: Provider-level resume swaps agents
  - F12: Parallel siblings reading each other's transcripts
  - F17: Duplicate registration throws
  - F18: Input flag-name collision
  - F19: Reserved flag input names

Each failure includes root cause, affected SDKs, wrong-vs-right code patterns, and detection strategies.

#### Agent Sessions
**Path:** `.agents/skills/workflow-creator/references/agent-sessions.md`

Documents session lifecycle and API per SDK:
- Claude: `s.session.query(prompt)` interface
- Copilot: `s.session.send({ prompt })` with idle-wait wrapping
- OpenCode: `s.client.session.prompt({ sessionID, parts })` interface
- Session lifecycle controls what context is available
- Headless mode mechanics (no tmux window, same callback interface)
- Per-SDK idle handling and timeout tuning

#### Getting Started
**Path:** `.agents/skills/workflow-creator/references/getting-started.md`

Quick-start examples and API reference:
- Per-agent skeleton workflows (Claude, Copilot, OpenCode)
- `SessionContext` field reference (s.client, s.session, s.save(), s.inputs, s.sessionDir, s.sessionId, s.paneId)
- SDK exports and helper imports
- Minimal three-line composition-root pattern

#### Workflow Inputs
**Path:** `.agents/skills/workflow-creator/references/workflow-inputs.md`

Deterministic input schema declaration:
- `WorkflowInput[]` schema syntax
- Field types: `string`, `text`, `number`, `boolean`, `enum`, `file`
- Validation rules (required, validation functions)
- CLI flag vs. positional argument semantics
- Interactive picker behavior
- Built-in protection rules

#### Registry and Validation
**Path:** `.agents/skills/workflow-creator/references/registry-and-validation.md`

Multi-workflow composition and registration:
- `createRegistry()` / `createWorkflowCli()` semantics
- Key scheme and validate-on-register rules
- Reserved flag names (`session`, `status`)
- Same-name collision detection
- `minSDKVersion` gating

#### Session Config
**Path:** `.agents/skills/workflow-creator/references/session-config.md`

Per-session deterministic configuration:
- Model selection (via `clientOpts` / `sessionOpts`)
- Tool permissions per SDK
- Hooks (setup, cleanup)
- Structured output schemas per provider

#### User Input
**Path:** `.agents/skills/workflow-creator/references/user-input.md`

Mid-workflow user prompts (distinct from workflow inputs):
- SDK-specific user input APIs
- Prompt collection during execution (not at invocation)
- Validation and re-prompt patterns

#### Running Workflows
**Path:** `.agents/skills/workflow-creator/references/running-workflows.md`

Operational aspects (invocation, monitoring, teardown):
- Three invocation paths (user app, examples, builtins)
- Direct run semantics (requires `-n` + `-a`)
- Picker behavior in TTY
- Input discovery (`atomic workflow inputs <name>`)
- Status monitoring and `needs_review` state
- Session teardown with `atomic session kill -y`

### Top-Level Skill Document

**Path:** `.agents/skills/workflow-creator/SKILL.md`

Master reference integrating all patterns:
- Workflow definition as information flow problem
- Composition root patterns (single, multi-workflow, registry)
- Concept-to-code mapping table
- Design advisory skills matrix
- Structural rules (hard constraints)
- Authoring process (5-step recipe)
- Reference file load triggers (when to pull which doc)

---

## Key Architectural Patterns

### Determinism Guarantee

Workflows provide determinism at **three levels**:

1. **Control flow** — Execution order is declared via `await` and `Promise.all`, making parent-child dependencies explicit. The runtime infers graph topology from this, ensuring reproducibility (same TypeScript code → same execution tree).

2. **Data flow** — State passes through explicit session boundaries via `s.save()` → `s.transcript(handle)` / `s.getMessages(handle)`. Reads cannot happen before a session completes (completion rule), preventing race conditions.

3. **Computation** — Pure TypeScript (parsing, validation, file I/O) runs outside agent sessions, making results deterministic and auditable.

### Session Lifecycle Determinism

Copilot and OpenCode spawn **fresh sessions** per `ctx.stage()` call (Copilot F5 failure mode), while Claude reuses tmux panes. This difference is documented in `agent-sessions.md`.

### Graph Topology

Runtime auto-infers from control flow:
- Sequential `await`: `a → b` edge
- `Promise.all([a, b])`: both branch from parent
- Headless stages: transparent to topology (tracked by background counter, don't update frontier)

---

## Quality Assurance Patterns

### Deterministic Quality Gates

From `computation-and-validation.md`:
- JSON parsing with 3-layer fallback (handles model prose before/after fenced blocks)
- Zod validation schemas
- LLM-as-judge review sessions paired with deterministic scoring

### Pre-Ship Checklist

From `failure-modes.md`:
- Completion rule: no reads before session completion
- SDK-specific save shapes (sessionId vs. SessionEvent[] vs. { info, parts })
- Per-SDK response extraction (extractAssistantText vs. getAssistantText vs. extractResponseText)
- Parallel sibling isolation (F12: siblings cannot read each other)
- Empty-pane avoidance (F22: every stage must have an LLM call)

---

## Notable Pattern Clusters

### Multi-Turn Intra-Session vs. Inter-Session

**Intra-session (one stage, multiple turns):**
- Agent sees full prior context (lost-in-middle applies)
- Deterministic state via closure variables
- Single visible graph node

**Inter-session (separate stages):**
- Each stage is fresh (Copilot/OpenCode) or tmux-paned (Claude)
- Explicit transcript handoff via `s.save()` / `s.transcript()`
- Visible graph nodes per stage (full execution history)

From `control-flow.md`: "Prefer inter-session control flow when you want the workflow graph to reflect what actually happened at runtime."

### Context Flow at Boundaries

From `state-and-data-flow.md`:
- Transcript compression (prevent downstream context degradation)
- File-based coordination (filesystem as coordination layer)
- Handle-based lookups (preserve type info, survive renames)

---

## Summary

All determinism mechanics in Atomic workflows are documented in `.agents/skills/workflow-creator/`. The documentation is:

- **Organized by design concern** (control flow, state flow, computation, error patterns, session lifecycle)
- **SDK-agnostic where possible** (state-and-data-flow, control-flow apply to Claude, Copilot, OpenCode)
- **SDK-specific where necessary** (agent-sessions, failure-modes catalogue per-provider quirks)
- **Failure-centric** (failure-modes.md is the longest reference for operability)
- **Pattern-rich** (11 reference docs + 1 master guide = complete workflow design language)

Determinism emerges from: **(1) explicit TypeScript control flow, (2) session-boundary state passing, (3) deterministic computation outside sessions, and (4) graph topology inference from code structure.**

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
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

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Atomic Deterministic Workflows: Pattern Analysis

## Overview

Atomic's deterministic workflows architecture is built on three core principles:
1. **Separation of concerns** between LLM calls and pure computation
2. **Explicit state management** through saved transcripts and handle-based lookups
3. **Validation at boundaries** to catch silent failures before they propagate downstream

This document catalogs the concrete patterns that implement determinism across the Atomic SDK.

---

## Pattern 1: Deterministic Computation Isolation

**Where:** `.agents/skills/workflow-creator/SKILL.md:460-461`

**What:** Pure TypeScript (parsing, validation, transforms) must live either at the workflow `.run()` level (outside stages) or bundled within the same stage callback as its corresponding LLM call. Never create a dedicated stage with only deterministic code.

```typescript
// ✓ CORRECT — deterministic work paired with LLM call in same callback
const plan = await ctx.stage({ name: "plan" }, {}, {}, async (s) => {
  const messages = await s.session.query("Produce a step-by-step plan.");
  const text = extractAssistantText(messages, 0);  // deterministic parse
  const parsed = parsePlan(text);                  // deterministic validation
  s.save(s.sessionId);
  return parsed;
});

// ✓ CORRECT — deterministic work at orchestration level (no stage needed)
const plannedFiles = plan.result.files.filter(f => f.endsWith(".ts"));
const startedAt = Date.now();

// ✗ WRONG — standalone stage with no LLM call spawns empty idle pane
await ctx.stage({ name: "write-report" }, {}, {}, async (s) => {
  await fs.writeFile("report.md", buildReport(plan.result)); // no LLM!
});
```

**Variations / call-sites:**
- **Computation-and-validation.md:5-30** shows inline computation with parsed validation
- **SKILL.md:460-461** defines the concept-to-code mapping
- **failure-modes.md:F22** documents the empty-pane anti-pattern (1037-1095)

---

## Pattern 2: Handle-Based State Passing with Completion Rules

**Where:** `.agents/skills/workflow-creator/SKILL.md:439` and `state-and-data-flow.md:5-51`

**What:** Data flows between sessions exclusively through `s.save()` (write) and `s.transcript(handle) / s.getMessages(handle)` (read). The critical invariant: you can only read from a `SessionHandle` **after** its callback has returned and saves have flushed.

```typescript
// Step 1: Store a session handle (save automatically at end of callback)
const researchHandle = await ctx.stage(
  { name: "research" },
  {},
  {},
  async (s) => {
    await s.session.query("Research the topic.");
    s.save(s.sessionId);  // Session ID is the save token
  }
);

// Step 2: After Step 1 completes, read its transcript via handle
await ctx.stage(
  { name: "synthesize" },
  {},
  {},
  async (s) => {
    const research = await s.transcript(researchHandle);
    // research = { path: string, content: string }
    
    // Use rendered text in a prompt
    await s.session.query(`Synthesize this research:\n${research.content}`);
    
    // Or reference the file path for Claude file triggers
    await s.session.query(`Read ${research.path} and summarize findings.`);
    
    s.save(s.sessionId);
  }
);
```

**Violations that break determinism:**
- Reading a handle before its stage completes → throws (loud)
- Reading from sibling stages in a `Promise.all()` group → throws (loud)
- Forgetting `await` on a `ctx.stage()` call → stage runs in background, next code reads undefined (silent, R13)

**Variations / call-sites:**
- **state-and-data-flow.md:7-51** shows transcript vs raw message retrieval
- **state-and-data-flow.md:83-97** shows return values via `handle.result`
- **control-flow.md:21-50** shows inter-session branching with return values

---

## Pattern 3: Response Text Extraction with SDK-Specific Helpers

**Where:** `.agents/skills/workflow-creator/references/computation-and-validation.md:33-71`

**What:** Each SDK returns responses in a different format. Extract text deterministically using SDK-specific helpers before parsing or validation.

```typescript
// CLAUDE
import { extractAssistantText } from "@bastani/atomic/workflows";
const result = await s.session.query("...");
const text = extractAssistantText(result, 0);  // SessionMessage[] → string

// COPILOT (Failure Mode F1 / F2: must concatenate ALL assistant messages, skip empty ones)
function getAssistantText(messages: SessionEvent[]): string {
  return messages
    .filter(
      (m): m is Extract<SessionEvent, { type: "assistant.message" }> =>
        m.type === "assistant.message" && !m.data.parentToolCallId  // F2: no subagent messages
    )
    .map((m) => m.data.content)
    .filter((c) => c.length > 0)  // F1: skip empty terminator events
    .join("\n\n");
}
const messages = await s.session.getMessages();
const text = getAssistantText(messages);

// OPENCODE (Failure Mode F3: filter for text parts only)
function extractResponseText(
  parts: Array<{ type: string; [key: string]: unknown }>
): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: string; text: string }).text)
    .join("\n");
}
const text = extractResponseText(result.data!.parts);
```

**Why this matters for determinism:**
- Wrong extraction → downstream stages receive garbage text → silent propagation
- Direct parse without extraction (e.g., `JSON.parse(result.output)`) → TypeError (loud, but preventable)
- Empty extraction on non-empty response → silent failure, successor thinks there was no output

**Variations / call-sites:**
- **failure-modes.md:F1 (60-117)** – Copilot's empty terminator trap
- **failure-modes.md:F2 (120-150)** – Copilot subagent message filtering
- **failure-modes.md:F3 (153-184)** – OpenCode non-text parts
- **failure-modes.md:F4 (187-229)** – Claude SessionMessage[] type

---

## Pattern 4: Layered JSON Parsing with Fallback

**Where:** `.agents/skills/workflow-creator/references/computation-and-validation.md:74-104`

**What:** LLM responses containing JSON may have prose before/after the actual JSON block. Use a three-layer fallback strategy: direct parse → last fenced block → last balanced object.

```typescript
import { z } from "zod";

// Layer 1: Direct JSON parse (handles cases where model outputs pure JSON)
function parseJsonResponse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try fenced block fallback
  }

  // Layer 2: Extract LAST fenced block (prose may quote examples before)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/g);
  if (fenceMatch?.length) {
    const lastBlock = fenceMatch[fenceMatch.length - 1];
    const jsonMatch = lastBlock.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Try balanced-object fallback
      }
    }
  }

  // Layer 3: Extract last balanced object from text
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (start === -1) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.substring(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          start = -1;
        }
      }
    }
  }

  return null;
}

// Usage with Zod validation
const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "error"]),
  blockedBy: z.array(z.string()).optional(),
});

const parsed = parseJsonResponse(responseText);
const result = TaskSchema.array().safeParse(parsed?.tasks);
if (!result.success) {
  console.error("Validation failed:", result.error.issues);
  // Optionally: ask agent to fix and retry
}
```

**Why this is deterministic:**
- Single parse point avoids partial or duplicated parsing
- Layered fallback handles model variation without throwing
- Zod provides predictable validation output
- Silent failures (bad JSON) are caught before downstream use

**Variations / call-sites:**
- **failure-modes.md:F8 (415-470)** – fenced-block parser anti-patterns
- **state-and-data-flow.md:212-228** – shared response parser helpers in `helpers/parsers.ts`

---

## Pattern 5: Validation Gates Before Branching

**Where:** `.agents/skills/workflow-creator/references/control-flow.md:12-79`

**What:** Use deterministic validation to branch orchestration logic. Parse and validate LLM output in the same stage, then use the validated result to drive conditional `.run()`-level branching.

```typescript
import { extractAssistantText } from "@bastani/atomic/workflows";

.run(async (ctx) => {
  // Step 1: Classify and validate in one session
  const triage = await ctx.stage(
    { name: "triage" },
    {},
    {},
    async (s) => {
      const result = await s.session.query(
        `Classify this as "bug", "feature", or "question": ${(s.inputs.prompt ?? "")}`
      );
      s.save(s.sessionId);
      
      // Deterministic: extract, parse, validate
      const text = extractAssistantText(result, 0).toLowerCase();
      return text.trim();  // Return validated classification
    }
  );

  const classification = triage.result;  // Now type-safe and validated

  // Step 2: Branch at orchestration level (each path is visible in graph)
  if (classification.includes("bug")) {
    await ctx.stage({ name: "fix-bug" }, {}, {}, async (s) => {
      await s.session.query("Diagnose and fix the bug described above.");
      s.save(s.sessionId);
    });
  } else if (classification.includes("feature")) {
    await ctx.stage({ name: "implement-feature" }, {}, {}, async (s) => {
      await s.session.query("Design and implement the feature described above.");
      s.save(s.sessionId);
    });
  } else {
    await ctx.stage({ name: "answer-question" }, {}, {}, async (s) => {
      await s.session.query("Research and answer the question above.");
      s.save(s.sessionId);
    });
  }
})
```

**Determinism properties:**
- Validation happens once, not replayed across branches
- Return value is immutable (string, not LLM output)
- Branching logic is pure TS at orchestration level (no hidden sessions)
- Graph accurately reflects which paths ran

**Variations / call-sites:**
- **control-flow.md:53-79** shows intra-session branching (single continued session)
- **computation-and-validation.md:12-30** shows validate-and-fix pattern within a single stage

---

## Pattern 6: Quality Gates with LLM-as-Judge

**Where:** `.agents/skills/workflow-creator/references/computation-and-validation.md:167-201`

**What:** After an LLM produces output, spawn a deterministic quality-check session that reads the transcript and scores it. Use parsed scores to decide whether to retry or accept.

```typescript
.run(async (ctx) => {
  const impl = await ctx.stage(
    { name: "implement" },
    {},
    {},
    async (s) => {
      await s.session.query((s.inputs.prompt ?? ""));
      s.save(s.sessionId);
    }
  );

  // Quality gate: read prior transcript and judge it
  await ctx.stage(
    { name: "quality-gate" },
    {},
    {},
    async (s) => {
      const implTranscript = await s.transcript(impl);
      
      const result = await s.session.query(
        `You are a code quality judge. Score this implementation 1-5 for:
- **Correctness**: Does it solve the stated problem?
- **Completeness**: Are edge cases handled?
- **Style**: Does it follow project conventions?

## Implementation to judge
${implTranscript.content}

Respond with JSON: { "correctness": N, "completeness": N, "style": N, "pass": boolean, "issues": [...] }`
      );

      // Deterministic: extract, parse, and validate
      const scores = parseJsonResponse(extractAssistantText(result, 0));
      
      // Deterministic decision
      if (!scores.pass) {
        await s.session.query(
          `Fix these quality issues:\n${scores.issues.join("\n")}`
        );
      }

      s.save(s.sessionId);
    }
  );
})
```

**Why deterministic:**
- Quality criteria are explicit (not implicit in a follow-up prompt)
- Parsing is deterministic (JSON structure predefined)
- Retry decision uses parsed output, not string pattern-matching
- Result is reproducible across runs (same input → same parsed scores → same decision)

**Variations / call-sites:**
- **SKILL.md:206** references `evaluation` and `advanced-evaluation` skills
- Pattern matches the "Review loops or quality checkpoints" design advisory

---

## Pattern 7: State Accumulation with Bounded Loops

**Where:** `.agents/skills/workflow-creator/references/failure-modes.md:F7 (356-411)`

**What:** When running multiple iterations of a query (review/fix loops), prevent context degradation by explicitly compacting or resetting between iterations. Save state deterministically across loop cycles.

```typescript
.run(async (ctx) => {
  const MAX_ITERATIONS = 5;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const iteration = await ctx.stage(
      { name: `refine-${i}` },
      {},
      {},
      async (s) => {
        const result = await s.session.query(`Iteration ${i}: Improve the implementation.`);
        s.save(s.sessionId);
        return extractAssistantText(result, 0);
      }
    );

    // Deterministic: check parsed output
    if (iteration.result.includes("LGTM") || iteration.result.includes("no issues")) {
      // Exit loop deterministically based on LLM signal
      break;
    }
  }
})
```

**Alternative: within-session with compaction (prevents lost-in-middle):**

```typescript
await ctx.stage({ name: "review-loop" }, {}, {}, async (s) => {
  const MAX_TURNS_BEFORE_COMPACT = 10;
  let turnsSinceCompact = 0;

  for (let i = 0; i < 20; i++) {
    if (turnsSinceCompact >= MAX_TURNS_BEFORE_COMPACT) {
      await s.session.query("/compact");  // Deterministic: summarize history
      turnsSinceCompact = 0;
    }
    await s.session.query(buildReviewPrompt());
    turnsSinceCompact += 1;
  }
});
```

**Determinism properties:**
- Loop bound is explicit (`MAX_ITERATIONS`), not inferred from model output
- Exit condition is deterministic (parsed string check or explicit counter)
- State is preserved either via transcript or compaction
- Context window growth is bounded

**Variations / call-sites:**
- **control-flow.md:82-106** shows bounded inter-session loops
- **failure-modes.md:F7 (356-411)** explains lost-in-middle in detail

---

## Pattern 8: Data Handoff Between Fresh Sessions (Copilot/OpenCode)

**Where:** `.agents/skills/workflow-creator/references/failure-modes.md:F5 (232-298)`

**What:** Copilot and OpenCode spawn fresh sessions with no prior context. Explicit handoff is required: extract output from session A, pass it in the prompt to session B.

```typescript
// ✗ WRONG — orchestrator is a fresh session with no knowledge of planner
await ctx.stage({ name: "planner" }, {}, {}, async (s) => {
  await s.session.send({ prompt: buildPlannerPrompt((s.inputs.prompt ?? "")) });
  s.save(await s.session.getMessages());
});

await ctx.stage({ name: "orchestrator" }, {}, {}, async (s) => {
  // Fresh session, no context. Will say "I don't see a task list"
  await s.session.send({ prompt: buildOrchestratorPrompt() });
  s.save(await s.session.getMessages());
});

// ✓ CORRECT — explicit handoff via return value
const plannerHandle = await ctx.stage(
  { name: "planner" },
  {},
  { agent: "planner" },
  async (s) => {
    await s.session.send({ prompt: buildPlannerPrompt((s.inputs.prompt ?? "")) });
    const messages = await s.session.getMessages();
    s.save(messages);
    return getAssistantText(messages);  // Extract and return
  }
);

await ctx.stage(
  { name: "orchestrator" },
  {},
  { agent: "orchestrator" },
  async (s) => {
    // Fresh session, but planner output is in the prompt
    await s.session.send({
      prompt: buildOrchestratorPrompt((s.inputs.prompt ?? ""), {
        plannerNotes: plannerHandle.result,  // Use return value
      }),
    });
    s.save(await s.session.getMessages());
  }
);
```

**Determinism properties:**
- Handoff is explicit (in the prompt), not implicit (in session memory)
- Return value is extracted deterministically (using F1/F2/F3 helpers)
- Orchestrator always receives the exact same input for the same planner output
- Reproducible across runs (unlike session-based implicit context)

**Variations / call-sites:**
- **failure-modes.md:F5 (232-298)** explains fresh-session trap in detail
- **agent-sessions.md** (referenced at F5 §"Full write-up") covers session lifecycle

---

## Summary: Determinism Enforcement

Atomic's deterministic workflows are deterministic because:

1. **LLM calls and pure computation are separated** (Pattern 1) — makes validation testable
2. **State flows through explicit handles and transcripts** (Pattern 2) — no implicit context
3. **Response text extraction is SDK-specific and deterministic** (Pattern 3) — standardizes text access
4. **Parsing uses layered fallbacks** (Pattern 4) — handles model variation without throwing
5. **Validation gates drive branching** (Pattern 5) — decisions are based on parsed data, not string matching
6. **Quality checks are explicit** (Pattern 6) — deterministic evaluation before accepting output
7. **Loops have bounds and compaction** (Pattern 7) — no context drift across iterations
8. **Session handoffs are explicit** (Pattern 8) — no dependency on implicit session memory (Copilot/OpenCode)

The key architectural principle: **every decision that affects downstream behavior is computed deterministically from parsed, validated LLM output — never from raw text patterns or implicit session state.**

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
