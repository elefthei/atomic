# Partition 15 of 16 — Findings

## Scope
`src/cli.ts/` (1 files, 397 LOC), `src/theme/` (2 files, 203 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Partition 15: CLI Bootstrap and Theme (`src/cli.ts` + `src/theme/`)

## How Atomic's Deterministic Workflows Work

### The Architecture at a Glance

Atomic's deterministic workflows operate through a **three-tier system**:

1. **CLI Dispatch Layer** (`src/cli.ts`) — Entry point that wires the workflow command into the binary
2. **Workflow Framework** (`src/sdk/workflow-cli.ts`, `src/sdk/define-workflow.ts`) — Defines how workflows are built and executed
3. **Runtime Orchestration** (`src/sdk/runtime/executor.ts`, `src/sdk/commander.ts`) — Executes workflows deterministically via tmux

### Implementation

#### CLI Bootstrap (`src/cli.ts`, 397 LOC)

The main CLI file creates a Commander.js program with workflow as a first-class command. Key integration points:

- **Workflow Command Wiring** (line 29): `import { workflowCommand } from "./commands/cli/workflow.ts"`
- **Orchestrator Re-entry Detection** (lines 338-341): Checks for `ATOMIC_ORCHESTRATOR_MODE` environment variable to determine if this process is a spawned sub-agent or the main CLI
- **Main Execution Flow** (lines 343-386):
  - Imports `createWorkflowCli` from `src/sdk/workflow-cli.ts` to instantiate the workflow dispatcher
  - Imports `createBuiltinRegistry` from `src/sdk/workflows/builtin-registry.ts` to load all registered workflows
  - Calls `runCli()` (imported from `src/sdk/commander.ts`) which handles transparent orchestrator re-entry
  - The `runCli` function checks `ATOMIC_ORCHESTRATOR_MODE=1` flag; if set, it resolves the workflow from the registry and runs it via `runOrchestrator()`, **skipping bootstrap and argv parsing entirely**

#### Workflow Command Definition (`src/commands/cli/workflow.ts`)

- Thin delegation that calls `createWorkflowCli(createBuiltinRegistry())`
- Wrapped with `toCommand()` to integrate into the parent CLI
- Supports `-n/--name` (workflow name), `-a/--agent` (agent backend), `-d` (detached mode)

#### Subcommands Attached to Workflow Command (lines 169-229 in `src/cli.ts`):

1. **`atomic workflow list`** — Lists available workflows from the builtin registry
2. **`atomic workflow inputs <name> -a <agent>`** — Exposes the declared input schema (JSON) so orchestrating agents can build valid invocations without reading source
3. **`atomic workflow status [id]`** — Returns workflow status (in_progress | error | completed | needs_review) as JSON
4. **`atomic workflow session`** — Session management (list, connect, kill) via `addSessionSubcommand()`

#### Deterministic Execution Flow

When a workflow runs (e.g., `atomic workflow -n ralph -a claude "fix bug"`):

1. `main()` in `cli.ts` calls `runCli([builtinCli], async () => { ... })`
2. `runCli()` checks `process.env.ATOMIC_ORCHESTRATOR_MODE`
   - **Not set**: Runs the callback (normal CLI mode) → `program.parseAsync()` parses args
   - **Set to "1"**: Extracts workflow key from `ATOMIC_WF_KEY` environment variable (format: `<agent>/<name>`), resolves the workflow from the registry, calls `runOrchestrator(def)` instead
3. The workflow definition includes:
   - A `defineWorkflow()` call that declares inputs (schema validation)
   - A `.run()` callback with control flow (for loops, conditional branching)
   - Stages spawned via `ctx.stage()` which create tmux panes and agent sessions
   - Determinism: stages execute sequentially by default; `Promise.all()` enables parallel execution (e.g., three parallel reviewers in ralph)
4. Each stage:
   - Spawns an agent CLI (claude, copilot, or opencode) in a tmux pane
   - Calls `s.session.query()` with a deterministic prompt
   - Collects the response via session transcripts
   - Can enforce structured output via JSON schemas
5. Orchestrator re-entry: When detached (`-d` flag), the parent process spawns sub-processes with `ATOMIC_ORCHESTRATOR_MODE=1`, passing the workflow key. Sub-processes skip CLI bootstrap and jump directly to `runOrchestrator()`, making them invisible to users while feeding results back to the graph.

### Types / Interfaces

**Theme**:
- `PaletteKey` — Union of color palette names: "text" | "dim" | "accent" | "success" | "error" | "warning" | "mauve" | "info"
- `PaintOptions` — Optional `bold` flag for text styling
- `Paint` — Function signature `(key: PaletteKey, text: string, opts?: PaintOptions) => string`

**Workflow CLI** (imported from `src/sdk/types.ts`):
- `AgentKey` — Union of agent types: "claude" | "copilot" | "opencode"
- `WorkflowDefinition` — Describes a workflow: name, description, inputs array, execution callback
- `WorkflowContext` — Passed to `.run()` callback; includes `inputs` and `stage()` method
- `SessionContext` — Passed to stage callback; includes `session` (for `.query()`), `save()` method, `sessionId`

### Configuration

- **Global Atomic Settings** (`~/.atomic/settings.json`): Bootstrapped on every invocation via `ensureGlobalAtomicSettings()` (line 358)
- **Agent Config** (`src/services/config/index.ts`): `AGENT_CONFIG` object defines available agents and their paths
- **CLI Options** (lines 55-57):
  - `-y, --yes` — Auto-confirm all prompts (non-interactive)
  - `--no-banner` — Skip ASCII logo display
- **Builtin Workflow Registry** (`src/sdk/workflows/builtin-registry.ts`): Registers three workflows (ralph, deep-research-codebase, open-claude-design) for three agents (claude, copilot, opencode)

### Theme Files

#### `/src/theme/colors.ts` (91 LOC)

- **ANSI Color Codes**: Standard ANSI codes for bold, dim, reset, red, green, yellow, blue
- **NO_COLORS Fallback**: When `NO_COLOR` env var is set or color detection fails
- **Catppuccin Mocha Palette**: RGB triplets for text, dim, accent, success, error, warning, mauve, info
- **Truecolor Detection**: `supportsTrueColor()` → uses 24-bit SGR codes; fallback to 8-color ANSI; fallback to plain text
- **`createPainter()`**: Factory function that returns a `Paint` function adapting to terminal capabilities

#### `/src/theme/logo.ts` (112 LOC)

- **ATOMIC_BLOCK_LOGO**: ASCII art (3 lines)
- **GRADIENT_DARK / GRADIENT_LIGHT**: Catppuccin hex color gradients (9 colors each)
- **GRADIENT_256**: 256-color approximation for legacy terminals
- **Color Interpolation Functions**:
  - `colorizeLineTrueColor()` — Per-character truecolor gradient rendering
  - `colorizeLine256()` — Per-character 256-color gradient rendering
- **`displayBlockBanner()`**: Renders the logo with gradient, respecting `COLORFGBG` env var for light/dark detection

### Examples / Fixtures

**Built-in Workflows** (from `src/sdk/workflows/builtin-registry.ts`):

1. **Ralph** (`src/sdk/workflows/builtin/ralph/`):
   - Implements a **plan → orchestrate → review loop**
   - For each iteration:
     - Planner stage (interactive, visible tmux pane)
     - Orchestrator stage (interactive, visible tmux pane)
     - Three parallel headless infrastructure discovery stages (codebase-locator, codebase-analyzer, codebase-pattern-finder)
     - Two parallel headless review stages with JSON schema enforcement
   - Iteration termination: When `max_loops` reached OR both reviewers return "patch is correct"
   - Available for claude, copilot, opencode

2. **Deep-Research-Codebase** (`src/sdk/workflows/builtin/deep-research-codebase/`):
   - Structured codebase analysis workflow
   - Available for claude, copilot, opencode

3. **Open-Claude-Design** (`src/sdk/workflows/builtin/open-claude-design/`):
   - Figma design opening and processing workflow
   - Available for claude, copilot, opencode

**Workflow Definition Pattern** (from ralph/claude/index.ts):

```typescript
export default defineWorkflow({
  name: "ralph",
  description: "Plan → orchestrate → review loop with bounded iteration",
  inputs: [
    { name: "prompt", type: "text", required: true, description: "task prompt" },
    { name: "max_loops", type: "integer", description: "...", default: 10 }
  ]
})
  .for("claude")
  .run(async (ctx) => {
    for (let iteration = 1; iteration <= maxLoops; iteration++) {
      await ctx.stage({ name: `planner-${iteration}` }, {}, {}, async (s) => {
        await s.session.query(prompt);
        s.save(s.sessionId);
      });
      // ... more stages
    }
  });
```

### Notable Clusters

**Workflow SDK Integration Points** (scattered across `src/sdk/`):

- `define-workflow.ts` — Implements the `defineWorkflow()` builder pattern and `.for()` / `.run()` fluent API
- `workflow-cli.ts` — `createWorkflowCli()` factory that parses `-n/--name` and `-a/--agent`, opens interactive picker in TTY mode
- `registry.ts` — `createRegistry()` factory for registering workflows, queried by `createWorkflowCli()`
- `commander.ts` — `runCli()` and `toCommand()` utilities for integrating workflows into Commander.js CLIs
- `runtime/executor.ts` — `runOrchestrator()` executes a workflow definition end-to-end, spawning tmux panes and agent sessions
- `runtime/tmux.ts` — Low-level tmux bindings (create session/window/pane, capture pane, send commands, kill sessions)
- `providers/claude.ts`, `providers/copilot.ts`, `providers/opencode.ts` — Agent-specific session wrappers and query methods

**CLI Command Modules** (under `src/commands/cli/`):

- `chat.ts` — Interactive chat with a single agent
- `workflow.ts` — Workflow dispatcher (thin wrapper around `createWorkflowCli()`)
- `workflow-list.ts` — Lists workflows from the builtin registry
- `workflow-inputs.ts` — Exposes workflow input schemas
- `workflow-status.ts` — Query running workflow status
- `config.ts` — Configuration management (telemetry, SCM)
- `footer.tsx` — Renders the attached-mode footer in agent windows
- `claude-stop-hook.ts`, `claude-session-start-hook.ts`, `claude-ask-hook.ts` — Claude Code hooks for idle detection and human-in-the-loop markers

**Determinism Enforcement Mechanisms**:

- **Session Transcripts**: Each `ctx.stage()` collects all messages in a tmux session via JSONL file watching
- **Schema Validation**: Stages can declare `outputFormat: { type: "json_schema", schema: {...} }` to enforce structured responses
- **Control Flow in TypeScript**: `for` loops, `Promise.all()`, conditional branching control workflow progression
- **Status Files**: `writeSnapshot()` writes workflow status to `~/.atomic/sessions/<id>/status.json` for queries
- **Idle Detection**: Claude SDK emits `session_state_changed` events; wrapped sessions watch for idle and completion events

---

## Summary

Atomic achieves deterministic workflows by:

1. **CLI-driven dispatch**: The main CLI (`src/cli.ts`) integrates a workflow command that loads a registry of workflow definitions
2. **Environment-based re-entry**: The `ATOMIC_ORCHESTRATOR_MODE` env var enables orchestrator re-entry, allowing sub-processes to resume workflows without CLI bootstrap
3. **TypeScript control flow**: Workflows define execution logic in TypeScript (for loops, conditionals, parallel stages) which is executed deterministically at runtime
4. **Tmux-based session management**: Each stage spawns a tmux pane with an agent CLI; the runtime watches session files (JSONL transcripts) to detect completion
5. **Schema enforcement**: Stages can enforce JSON schemas for structured outputs, enabling reliable multi-stage pipelines
6. **Graph visualization**: All stages appear in a TUI graph (via `OrchestratorPanel` in `runtime/executor.ts`), giving users real-time visibility into workflow progress

The workflow system is **framework-agnostic at the SDK level** — `WorkflowCli` has no direct Commander dependency, so workflows can be embedded in any CLI (not just Atomic's main CLI). This makes the framework reusable for user-defined workflows and external tool integrations.

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
# Analyzer 15 — `src/cli.ts` + `src/theme/`

## Files Analysed

| File | LOC | Role |
|---|---|---|
| `src/cli.ts` | 397 | Main Commander.js program; workflow command surface; orchestrator re-entry gate |
| `src/commands/cli/workflow.ts` | 16 | Thin delegation shim that exports `workflowCommand` |
| `src/sdk/workflow-cli.ts` | 409 | Factory for `WorkflowCli`; orchestrator re-entry; `resolveAndStart`; `buildCliCommand`; picker |
| `src/sdk/commander.ts` | 161 | `toCommand` adapter; `runCli` bootstrap with orchestrator re-entry detection |
| `src/theme/colors.ts` | 91 | ANSI codes; NO_COLOR fallback; Catppuccin Mocha palette; `createPainter()` |
| `src/theme/logo.ts` | 112 | Block ASCII art; gradient colorization; `displayBlockBanner()` |
| `src/services/system/detect.ts` | 162 | Terminal capability detection: `supportsColor`, `supportsTrueColor`, `supports256Color` |

---

## Per-File Notes

### `src/cli.ts`

**Role.** The outermost Commander.js program for the `atomic` binary. It declares every user-facing command surface and contains `main()`, which is the process entry point when `import.meta.main` is true (`src/cli.ts:395-397`).

**`createProgram()` — lines 46-329.**

Constructs the root `Command` named `"atomic"` with:
- Global options `-y/--yes` and `--no-banner` (`src/cli.ts:56-57`).
- Error output wired through `COLORS.red` / `COLORS.reset` (`src/cli.ts:60-67`).
- `enablePositionalOptions()` (`src/cli.ts:53`) so subcommand flags are not absorbed by the parent.

**`chat` command — lines 73-131.**

Registered as `isDefault: true` (`src/cli.ts:74`). Validates the `-a/--agent` option against `AGENT_CONFIG` keys (`src/cli.ts:96-116`), collects pass-through args from `cmd.args` (`src/cli.ts:119`), and delegates to `./commands/cli/chat.ts` via a dynamic import (`src/cli.ts:121`). Session subcommands are attached via `addSessionSubcommand(chatCmd, "chat")` at `src/cli.ts:131`.

**`workflow` command — lines 133-229.**

The base `Command` object (`workflowCommand`) is imported from `./commands/cli/workflow.ts` at `src/cli.ts:29`. The CLI attaches `.description()`, `.enablePositionalOptions()`, and help text on top of it (`src/cli.ts:145-165`) before adding it to the program (`src/cli.ts:167`).

Four subcommands are stacked under `workflowCommand`:

| Subcommand | Lines | Handler module (dynamic import) |
|---|---|---|
| `list` | 172-184 | `./commands/cli/workflow-list.ts` |
| `inputs <name>` | 186-205 | `./commands/cli/workflow-inputs.ts` |
| `status [session_id]` | 207-226 | `./commands/cli/workflow-status.ts` |
| `session list/connect` | 229 | `./sdk/management-commands.ts` via `addSessionSubcommand` |

**Internal hidden commands — lines 251-298.**

Four hidden commands serve as internal IPC hooks invoked by the tmux runtime:
- `_footer` — renders the attached-mode footer pane (`src/cli.ts:252`).
- `_claude-stop-hook` — writes an idle-detection marker file (`src/cli.ts:266`).
- `_claude-session-start-hook` — writes a ready-marker file (`src/cli.ts:275`).
- `_claude-ask-hook <mode>` — writes/removes the human-in-the-loop marker (`src/cli.ts:285`); validates `mode` is `"enter"` or `"exit"` before delegating.

**`main()` — lines 343-392.**

The orchestrator re-entry pivot. Its logic:

1. Imports `createWorkflowCli` from `./sdk/workflow-cli.ts`, `runCli` from `./sdk/commander.ts`, and `createBuiltinRegistry` from `./sdk/workflows/builtin-registry.ts` (`src/cli.ts:345-349`).
2. Constructs a `builtinCli` by passing the builtin registry to `createWorkflowCli` (`src/cli.ts:351`).
3. Calls `runCli([builtinCli], async () => { ... })` (`src/cli.ts:353`). Inside the callback:
   - Calls `ensureGlobalAtomicSettings()` every invocation (`src/cli.ts:358-361`).
   - Detects "info commands" (`--version`, `--help`, `completions`, internal hooks) and skips `autoSyncIfStale()` for them (`src/cli.ts:366-383`).
   - Finally calls `program.parseAsync()` (`src/cli.ts:385`).

If `ATOMIC_ORCHESTRATOR_MODE=1` is set, `runCli` never invokes the callback — the workflow is dispatched directly (`src/sdk/commander.ts:137-158`).

---

### `src/commands/cli/workflow.ts`

**Role.** A six-line delegation shim (`src/commands/cli/workflow.ts:1-16`).

- Calls `createWorkflowCli(createBuiltinRegistry())` to produce a `WorkflowCli` bound to all builtin workflows.
- Passes that into `toCommand(cli, "workflow")` from `./sdk/commander.ts` to produce a Commander `Command`.
- Exports that `Command` as `workflowCommand`, which `src/cli.ts:29` imports directly.

This is the only place both `createWorkflowCli` and `toCommand` are combined for the main binary.

---

### `src/sdk/workflow-cli.ts`

**Role.** Framework-agnostic workflow CLI factory — the implementation layer behind both the standalone `cli.run()` path and the Commander adapter. Deterministic workflow dispatch lives here.

**`normalizeToRegistry()` — lines 50-73.**

Accepts a single `WorkflowDefinition`, an array, or an existing `Registry`. Detects the shape structurally: a `register` method means `Registry`, an array triggers loop-registration into a fresh `createRegistry()`, otherwise treats the value as a single workflow.

**`resolveAndStart()` — lines 90-136.**

The core dispatch function. Steps:
1. Calls `registry.resolve(name, agent)` (`src/sdk/workflow-cli.ts:102`); throws a descriptive error listing available agents if not found.
2. Merges inputs with precedence: `dispatcherInputs` < `runInputs` < `cliInputs` (`src/sdk/workflow-cli.ts:117-121`).
3. If the definition declares any `inputs`, calls `validateAndResolve(merged, def.inputs)` to type-check and apply defaults (`src/sdk/workflow-cli.ts:123-126`).
4. Calls `executeWorkflow({ definition, agent, inputs, entrypointFile, workflowKey, detach })` (`src/sdk/workflow-cli.ts:128-135`). The `workflowKey` is formatted as `"<agent>/<name>"` — this is the exact value stored in `ATOMIC_WF_KEY` for orchestrator re-entry.

**`buildCliCommand()` — lines 146-228.**

Builds the Commander `Command` for `cli.run()` and for `toCommand()`. It:
- Registers `-n/--name` with an inline validator against all known workflow names (`src/sdk/workflow-cli.ts:167-174`).
- Registers `-a/--agent` with an inline validator against `VALID_AGENTS` (`src/sdk/workflow-cli.ts:176-183`).
- Iterates `unionInputs` (a `Map<string, WorkflowInput>`) and registers a `--<name> <value>` flag for each declared input across the whole registry (`src/sdk/workflow-cli.ts:185-190`).
- In `.action()`, collects all flag values into `cliInputs`, joins positional args as `inputs.prompt` when the resolved workflow declares no inputs (`src/sdk/workflow-cli.ts:199-224`).

**`runPicker()` — lines 237-258.**

Interactive path: creates a `WorkflowPickerPanel`, awaits a selection, then calls `resolveAndStart()` with the selected workflow name and picker-collected inputs.

**`createWorkflowCli()` — lines 307-409.**

Public factory with three overloads (single workflow, array, registry). The returned `WorkflowCli` object exposes:
- `registry`, `entry`, `defaults` properties.
- `run(runOpts?)` method (`src/sdk/workflow-cli.ts:337-405`):
  - First checks `handleOrchestratorReEntry()` (`src/sdk/workflow-cli.ts:338`) — if the process was re-spawned by the orchestrator this returns `true` and `run()` returns immediately without parsing argv.
  - With `argv: false` — programmatic dispatch without Commander (`src/sdk/workflow-cli.ts:344-358`).
  - Otherwise builds a `Command` via `buildCliCommand`, optionally adds management commands (`addManagementCommands`) (`src/sdk/workflow-cli.ts:397-400`), runs optional `extend(cmd)` callback, then `cmd.parseAsync()`.

---

### `src/sdk/commander.ts`

**Role.** The Commander adapter layer and the `runCli` orchestrator gate. Imports from `src/sdk/workflow-cli.ts` (`buildCliCommand`, `resolveAndStart`, `runPicker`) plus `runOrchestrator` from `src/sdk/runtime/executor.ts`.

**`toCommand()` — lines 47-91.**

Extracts `registry`, `entry`, and `defaults` from the `WorkflowCli`. Calls `buildInputUnion(registry.list())` (`src/sdk/commander.ts:55`) to compute the cross-registry flag union. Calls `buildCliCommand` with an `onAction` closure that:
- Runs the interactive picker when agent is given without a name in a TTY (`src/sdk/commander.ts:65-66`).
- Falls back to `cmd.help()` if either name or agent is missing (`src/sdk/commander.ts:70-73`).
- Otherwise calls `resolveAndStart()` (`src/sdk/commander.ts:75-86`).

Returns the raw Commander `Command` for embedding in a parent program.

**`runCli()` — lines 133-161.**

The orchestrator re-entry gate used by `main()` in `src/cli.ts`. Detection logic:

```
if (process.env.ATOMIC_ORCHESTRATOR_MODE === "1") {
  const key = process.env.ATOMIC_WF_KEY ?? "";          // format: "<agent>/<name>"
  // parse agent and name from key
  // iterate provided WorkflowCli(s), call registry.resolve(name, agent)
  // on first match: await runOrchestrator(def); return
  // if no match: throw
}
await cliFn();   // normal CLI path — calls program.parseAsync()
```

`src/sdk/commander.ts:137-160`. The `ATOMIC_WF_KEY` format `"<agent>/<name>"` is split at the first `/` to recover `agent` and `name`. `runOrchestrator` in `src/sdk/runtime/executor.ts` then drives the workflow steps deterministically.

---

### `src/theme/colors.ts`

**Role.** Provides all ANSI color primitives and the shared Catppuccin Mocha palette used by every CLI command in the codebase.

**`COLORS` — line 27.**

A conditional export: if `supportsColor()` (checks `NO_COLOR` env var at `src/services/system/detect.ts:101-107`) returns `true`, exports `ANSI_CODES`; otherwise exports `NO_COLORS` (all empty strings). Used directly by `src/cli.ts` for error output at lines 62-66.

**`PALETTE` — lines 39-48.**

Maps eight semantic keys (`text`, `dim`, `accent`, `success`, `error`, `warning`, `mauve`, `info`) to RGB triples from the Catppuccin Mocha palette (hex values noted inline). These values also appear in `src/sdk/runtime/theme.ts` (noted in the source comment at `src/theme/colors.ts:35`).

**`createPainter()` — lines 64-91.**

Returns a `Paint` function with three capability tiers:
1. **Truecolor** (`supportsTrueColor()` true): emits `\x1b[1;38;2;R;G;Bm` (bold) or `\x1b[38;2;R;G;Bm` (normal) using `PALETTE[key]` RGB values.
2. **Basic ANSI** (`supportsColor()` true): maps each palette key to a basic ANSI code (e.g., `accent` → `\x1b[34m`).
3. **No color**: returns `text` unchanged.

---

### `src/theme/logo.ts`

**Role.** Provides the three-row block ASCII art logo and per-character gradient colorization for the banner displayed at CLI startup.

**`ATOMIC_BLOCK_LOGO` — lines 13-17.**

A `string[]` of three rows using Unicode block characters (`█`, `▀`, `▄`).

**Gradient arrays — lines 20-32.**

- `GRADIENT_DARK` (9 hex stops): dark-background palette from Catppuccin pink → sky → teal.
- `GRADIENT_LIGHT` (9 hex stops): light-background variant.
- `GRADIENT_256` (9 xterm-256 codes): fallback approximation.

**`colorizeLineTrueColor()` — lines 63-76.**

Iterates each character in a line. Skips spaces. For non-space characters, computes `t = i / (len-1)` as a position fraction, calls `interpolateHex()` which performs linear interpolation between the two bounding gradient stops, and emits `\x1b[38;2;R;G;Bm<ch>`. Resets with `\x1b[0m` at the end.

**`colorizeLine256()` — lines 78-91.**

Same character-iteration loop, but uses `interpolate256()` which does nearest-neighbour (floor) lookup into `GRADIENT_256` and emits `\x1b[38;5;<code>m<ch>`.

**`displayBlockBanner()` — lines 94-112.**

Entry point for banner rendering. Reads `COLORFGBG` env var: if it does not start with `"0;"`, assumes dark background (`src/theme/logo.ts:95`). Selects the rendering path:
- Truecolor → `colorizeLineTrueColor(line, GRADIENT_DARK | GRADIENT_LIGHT)`.
- 256-color + color → `colorizeLine256(line, GRADIENT_256)`.
- Otherwise → raw line with two-space indent.
Wraps output in blank `console.log()` calls for vertical padding.

---

### `src/services/system/detect.ts`

**Role.** Terminal capability predicates consumed by both theme modules.

**`supportsColor()` — lines 101-107.** Returns `false` if `NO_COLOR` is set in the environment (any value); otherwise `true`.

**`supportsTrueColor()` — lines 116-148.** Layered heuristic:
1. Guards on `supportsColor()`.
2. `COLORTERM=truecolor|24bit` → `true`.
3. `TERM_PROGRAM=Apple_Terminal` → `false`.
4. Known terminals in `TERM_PROGRAM` (iterm.app, hyper, wezterm, alacritty, kitty, ghostty) → `true`.
5. `TERM` contains `24bit` or `direct` → `true`.
6. Default → `false`.

**`supports256Color()` — lines 158-161.** Returns `true` if `TERM` contains `"256color"` or if `supportsTrueColor()` is `true`.

---

## Cross-Cutting Synthesis

`src/cli.ts` is a pure command-surface layer: it declares the Commander program, stacks subcommands, and calls `runCli()`. It contributes nothing to deterministic workflow mechanics directly — those live entirely in `src/sdk/`. The critical seam is `main()` at `src/cli.ts:343-392`: it hands a `builtinCli` (a `WorkflowCli` wrapping the builtin registry) to `runCli`, which acts as the orchestrator re-entry gate. When `ATOMIC_ORCHESTRATOR_MODE=1`, `runCli` (`src/sdk/commander.ts:137`) bypasses the entire Commander parse path and calls `runOrchestrator(def)` directly with the already-resolved `WorkflowDefinition` — the workflow runs without any user-facing argv parsing. When the env var is absent, `runCli` calls the bootstrap callback, which eventually reaches `program.parseAsync()`, triggering the Commander command tree. The `workflowCommand` exported from `src/commands/cli/workflow.ts` is the Commander surface for `atomic workflow`; it is built by `toCommand(createWorkflowCli(createBuiltinRegistry()), "workflow")`, which wires the same `resolveAndStart → executeWorkflow` dispatch chain used by the orchestrator re-entry path. Theme modules (`src/theme/colors.ts`, `src/theme/logo.ts`) are pure presentation utilities; they affect only what is displayed to the user and play no role in workflow dispatch or sequencing. Their shared dependency on `src/services/system/detect.ts` provides a single source of truth for terminal capability, ensuring consistent color-tier selection across ANSI error output, Catppuccin palette painting, and gradient banner rendering.

---

## Out-of-Partition References

The following symbols are referenced by this partition but defined outside it:

| Symbol / module | Defined in (out-of-partition) | Used at |
|---|---|---|
| `createBuiltinRegistry()` | `src/sdk/workflows/builtin-registry.ts` | `src/cli.ts:347`, `src/commands/cli/workflow.ts:11` |
| `runOrchestrator(def)` | `src/sdk/runtime/executor.ts` | `src/sdk/commander.ts:36,152` |
| `executeWorkflow(...)` | `src/sdk/runtime/executor.ts` | `src/sdk/workflow-cli.ts:29,128` |
| `handleOrchestratorReEntry()` | `src/sdk/runtime/executor.ts` | `src/sdk/workflow-cli.ts:31,338` |
| `WorkflowPickerPanel` | `src/sdk/components/workflow-picker-panel.tsx` | `src/sdk/workflow-cli.ts:32,244` |
| `createRegistry()` | `src/sdk/registry.ts` | `src/sdk/workflow-cli.ts:35,62,70` |
| `validateAndResolve()`, `buildInputUnion()`, `toCamelCase()` | `src/sdk/worker-shared.ts` | `src/sdk/workflow-cli.ts:36-38` |
| `addSessionSubcommand()` / `addManagementCommands()` | `src/sdk/management-commands.ts` | `src/cli.ts:30,131,229,232`, `src/sdk/workflow-cli.ts:399` |
| `workflowListCommand` | `src/commands/cli/workflow-list.ts` | `src/cli.ts:177` |
| `workflowInputsCommand` | `src/commands/cli/workflow-inputs.ts` | `src/cli.ts:199` |
| `workflowStatusCommand` | `src/commands/cli/workflow-status.ts` | `src/cli.ts:221` |
| `chatCommand` | `src/commands/cli/chat.ts` | `src/cli.ts:121` |
| `footerCommand` | `src/commands/cli/footer.tsx` | `src/cli.ts:258` |
| `claudeStopHookCommand` | `src/commands/cli/claude-stop-hook.ts` | `src/cli.ts:271` |
| `claudeSessionStartHookCommand` | `src/commands/cli/claude-session-start-hook.ts` | `src/cli.ts:281` |
| `claudeAskHookCommand` | `src/commands/cli/claude-ask-hook.ts` | `src/cli.ts:296` |
| `ensureGlobalAtomicSettings()` | `src/services/config/settings.ts` | `src/cli.ts:358` |
| `autoSyncIfStale()` | `src/services/system/auto-sync.ts` | `src/cli.ts:380` |
| `AGENT_CONFIG`, `AgentKey` | `src/services/config/index.ts` | `src/cli.ts:27` |
| `SUPPORTED_SHELLS`, `Shell` | `src/completions/index.ts` | `src/cli.ts:28` |
| `VERSION` | `src/version.ts` | `src/cli.ts:25` |
| `WorkflowCli`, `WorkflowDefinition`, `AgentType` (types) | `src/sdk/types.ts` | `src/sdk/workflow-cli.ts:19-28`, `src/sdk/commander.ts:24-29` |

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Pattern Finder 15: Deterministic Workflows Architecture

## Patterns Found

#### Pattern: Workflow Definition Builder with Type-Safe Inputs

**Where:** `src/sdk/define-workflow.ts:109-220`

**What:** Chainable fluent API that enforces workflow structure: declaration → agent narrowing → execution → compilation into sealed definition.

```typescript
export class WorkflowBuilder<
  A extends AgentType = AgentType,
  I extends AnyInputs = AnyInputs,
> {
  private readonly options: WorkflowOptions<I>;
  private runFn: ((ctx: WorkflowContext<A, I>) => Promise<void>) | null = null;
  private agentValue: AgentType | null = null;

  for<B extends AgentType>(agent: B): WorkflowBuilder<B, I> {
    const next = new WorkflowBuilder<B, I>(this.options as WorkflowOptions<I>);
    next.agentValue = agent;
    next.runFn = this.runFn as ((ctx: WorkflowContext<B, I>) => Promise<void>) | null;
    return next;
  }

  run(fn: (ctx: WorkflowContext<A, I>) => Promise<void>): this {
    if (this.runFn) {
      throw new Error("run() can only be called once per workflow.");
    }
    this.runFn = fn;
    return this;
  }

  compile(): WorkflowDefinition<A, I> {
    // Freeze inputs and validate against schema, throw on duplicates
    const inputs = Object.freeze(
      declaredInputs.map((i) => Object.freeze({ ...i })),
    ) as unknown as I;

    return {
      __brand: "WorkflowDefinition" as const,
      name: this.options.name,
      agent: this.agentValue,
      inputs,
      run: runFn,
    };
  }
}
```

**Determinism aspects:** Workflow definition is immutable after `.compile()`. Inputs are frozen. No runtime state modifications allowed after declaration.

#### Pattern: Immutable Registry with Type-Accumulating Generics

**Where:** `src/sdk/registry.ts:63-111`

**What:** Read-only registry that accumulates workflow definitions with type-safe keying (`${agent}/${name}`); registration is immutable—returns new registry, original unchanged.

```typescript
class RegistryImpl<T extends Record<string, WorkflowDefinition>> {
  private readonly map: ReadonlyMap<string, WorkflowDefinition>;

  register<W extends RegistrableWorkflow>(
    wf: W,
  ): Registry<T & Record<`${W["agent"]}/${W["name"]}`, W>> {
    const key = `${wf.agent}/${wf.name}`;

    if (this.map.has(key)) {
      throw new Error(
        `[atomic] Duplicate workflow registration: "${key}" is already registered.`,
      );
    }

    validateAtRegistration(wf);

    const next = new Map(this.map);
    next.set(key, wf);
    return new RegistryImpl<T & Record<`${W["agent"]}/${W["name"]}`, W>>(next) as Registry<
      T & Record<`${W["agent"]}/${W["name"]}`, W>
    >;
  }

  resolve(name: string, agent: AgentType): WorkflowDefinition | undefined {
    return this.map.get(`${agent}/${name}`);
  }
}
```

**Determinism aspects:** Duplicate keys throw at registration time. Each `.register()` call produces an immutable snapshot. Lookups are pure; no side effects.

#### Pattern: Orchestrator Re-Entry via Environment Variables

**Where:** `src/sdk/commander.ts:137-158`

**What:** Framework-transparent dispatch: on fresh CLI invocation runs bootstrap + parse; when `ATOMIC_ORCHESTRATOR_MODE=1` is set, skips CLI parsing and directly invokes workflow executor.

```typescript
export async function runCli(
  target: WorkflowCli | ReadonlyArray<WorkflowCli>,
  cliFn: () => void | Promise<void>,
): Promise<void> {
  if (process.env.ATOMIC_ORCHESTRATOR_MODE === "1") {
    const key = process.env.ATOMIC_WF_KEY ?? "";
    const slashIdx = key.indexOf("/");
    if (slashIdx < 0) {
      throw new Error(
        `ATOMIC_ORCHESTRATOR_MODE=1 but ATOMIC_WF_KEY "${key}" is malformed`,
      );
    }
    const agent = key.slice(0, slashIdx) as AgentType;
    const name = key.slice(slashIdx + 1);

    const clis = Array.isArray(target) ? target : [target];
    for (const cli of clis) {
      const def = cli.registry.resolve(name, agent);
      if (def) {
        await runOrchestrator(def);
        return;
      }
    }
    throw new Error(`ATOMIC_WF_KEY "${key}" not found`);
  }

  await cliFn();
}
```

**Determinism aspects:** Workflow resolution is deterministic—`${agent}/${name}` uniquely identifies a compiled definition. Re-entry is transparent to parent CLI; no explicit guards needed.

#### Pattern: Declarative Input Schema with Compile-Time Validation

**Where:** `src/sdk/define-workflow.ts:48-103`

**What:** Validation runs at workflow definition time (not runtime), enforcing reserved names, type consistency, enum exhaustiveness, and integer bounds.

```typescript
function validateWorkflowInput(input: WorkflowInput, workflowName: string): void {
  if (!input.name || input.name.trim() === "") {
    throw new Error(`Workflow "${workflowName}" has an input with an empty name.`);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input.name)) {
    throw new Error(`input "${input.name}" has an invalid name`);
  }
  if ((RESERVED_INPUT_NAMES as readonly string[]).includes(input.name)) {
    throw new Error(`input name "${input.name}" is reserved by the worker CLI`);
  }
  if (input.type === "enum") {
    if (!Array.isArray(input.values) || input.values.length === 0) {
      throw new Error(`enum input "${input.name}" declares no values`);
    }
    if (input.default !== undefined && !input.values.includes(input.default)) {
      throw new Error(`default "${input.default}" not in declared values`);
    }
  }
}
```

**Determinism aspects:** Input schema is frozen and validated at compile time. Malformed schemas throw during workflow definition, not during execution.

#### Pattern: Multi-Stage Workflow with Deterministic Control Flow

**Where:** `src/sdk/workflows/builtin/ralph/claude/index.ts:89-243`

**What:** Workflow runs are orchestrated entirely via TypeScript control flow (for loops, Promise.all, conditionals); stages spawn agent sessions and return typed results that feed into deterministic iteration logic.

```typescript
export default defineWorkflow({
  name: "ralph",
  inputs: [
    { name: "prompt", type: "text", required: true },
    { name: "max_loops", type: "integer", default: DEFAULT_MAX_LOOPS },
  ],
})
  .for("claude")
  .run(async (ctx) => {
    const maxLoops = ctx.inputs.max_loops ?? DEFAULT_MAX_LOOPS;
    let reviewReport = "";

    for (let iteration = 1; iteration <= maxLoops; iteration++) {
      await ctx.stage({ name: `planner-${iteration}` }, {}, {}, async (s) => {
        await s.session.query(buildPlannerPrompt(prompt, { iteration, reviewReport }));
        s.save(s.sessionId);
      });

      const [locatorResult, analyzerResult, patternResult] = await Promise.all([
        ctx.stage({ name: `infra-locate-${iteration}`, headless: true }, {}, {}, 
          async (s) => { /* parallel stage */ }),
        ctx.stage({ name: `infra-analyze-${iteration}`, headless: true }, {}, {}, 
          async (s) => { /* parallel stage */ }),
        ctx.stage({ name: `infra-patterns-${iteration}`, headless: true }, {}, {}, 
          async (s) => { /* parallel stage */ }),
      ]);

      const [reviewA, reviewB] = await Promise.all([
        runReviewer(`reviewer-${iteration}-a`),
        runReviewer(`reviewer-${iteration}-b`),
      ]);

      const merged = mergeReviewResults(reviewA.result, reviewB.result);
      if (!hasActionableFindings(parsed, reviewRaw)) break;
      reviewReport = formatReviewForReplan(parsed, reviewRaw);
    }
  })
  .compile();
```

**Determinism aspects:** Loop terminates on explicit conditions (`max_loops` or actionable findings). Parallel stages use Promise.all (deterministic ordering). Each iteration feeds previous results (reviewReport) into next planner invocation.

#### Pattern: Built-in Registry with Static Imports

**Where:** `src/sdk/workflows/builtin-registry.ts:1-23`

**What:** Central registry factory statically imports all built-in workflows by agent variant and chainably registers them in a single factory function.

```typescript
import { createRegistry } from "../registry";

import ralphClaude from "./builtin/ralph/claude";
import ralphCopilot from "./builtin/ralph/copilot";
import ralphOpencode from "./builtin/ralph/opencode";

import drcClaude from "./builtin/deep-research-codebase/claude";
import drcCopilot from "./builtin/deep-research-codebase/copilot";
import drcOpencode from "./builtin/deep-research-codebase/opencode";

export function createBuiltinRegistry() {
  return createRegistry()
    .register(ralphClaude).register(ralphCopilot).register(ralphOpencode)
    .register(drcClaude).register(drcCopilot).register(drcOpencode)
    .register(ocdClaude).register(ocdCopilot).register(ocdOpencode);
}
```

**Determinism aspects:** All workflows are known at build time. Registry is created once at startup in `main()` and immutable thereafter.

#### Pattern: CLI Bootstrap with Orchestrator Transparency

**Where:** `src/cli.ts:343-386`

**What:** Main entry point uses `runCli()` wrapper that detects orchestrator re-entry via env vars and routes to executor, bypassing normal CLI parsing entirely.

```typescript
async function main(): Promise<void> {
  try {
    const { createWorkflowCli } = await import("./sdk/workflow-cli.ts");
    const { runCli } = await import("./sdk/commander.ts");
    const { createBuiltinRegistry } = await import("./sdk/workflows/builtin-registry.ts");

    const builtinCli = createWorkflowCli(createBuiltinRegistry());

    await runCli([builtinCli], async () => {
      const { ensureGlobalAtomicSettings } = await import(
        "./services/config/settings.ts"
      );
      await ensureGlobalAtomicSettings();

      const argv = process.argv.slice(2);
      const isInfoCommand = argv.includes("--version") || argv.includes("--help");

      if (!isInfoCommand) {
        const { autoSyncIfStale } = await import(
          "./services/system/auto-sync.ts"
        );
        await autoSyncIfStale();
      }

      await program.parseAsync();
    });
  } catch (error) {
    console.error(`${COLORS.red}Error: ${error.message}${COLORS.reset}`);
    process.exit(1);
  }
}
```

**Determinism aspects:** Re-entry check happens before bootstrap. Same entrypoint file is executed twice—once for CLI, once for orchestrator—but `ATOMIC_ORCHESTRATOR_MODE` env var deterministically routes to correct branch.

---

## How Determinism Works

**1. Definition-Time Seal:** Workflows are defined once via `defineWorkflow()...compile()` chain. The result is a `WorkflowDefinition` with frozen inputs and a sealed `run` callback. No mutations after compilation.

**2. Registry Immutability:** Each `.register()` call returns a new registry. Duplicate keys throw at registration. Lookups by `${agent}/${name}` are pure functions.

**3. Orchestrator Re-Entry:** The process is spawned twice—first as CLI, then as orchestrator. Environment variables (`ATOMIC_ORCHESTRATOR_MODE=1`, `ATOMIC_WF_KEY=agent/name`) deterministically signal which path to take. The same user file is re-executed both times; `runCli()` transparently detects re-entry and skips normal bootstrap.

**4. Control Flow as Orchestration:** Workflows use native TypeScript—for loops (bounded iteration), Promise.all (parallel stages), conditionals (termination), variable accumulators (feedthrough). All deterministic and debuggable. No hidden async state machines.

**5. Input Coercion:** Workflow inputs are declared in a schema, validated at compile time, and parsed from CLI flags or environment variables (base64-encoded JSON) at runtime. Coercion rules are deterministic (enum → string, integer → number, rest → string).

**6. Session Isolation:** Each `ctx.stage()` call spawns a named tmux pane running the agent CLI. The pane ID is deterministically derived from the stage name. All session data (transcripts, results) is persisted to `~/.atomic/sessions/{id}/` before the stage callback returns.

**7. Headless vs. Attached:** Stages can be `headless: true` for programmatic results (JSON schema validation, no TUI) or attached (default) for interactive tmux panes. Both produce deterministic outputs for the orchestrator to consume.

The architecture ensures that a given workflow definition + inputs + current codebase state + agent implementation will always produce the same sequence of agent invocations and decisions, making workflows reproducible and debuggable.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
