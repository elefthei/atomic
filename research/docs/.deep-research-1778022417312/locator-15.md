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
