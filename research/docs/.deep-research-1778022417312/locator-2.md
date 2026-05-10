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

