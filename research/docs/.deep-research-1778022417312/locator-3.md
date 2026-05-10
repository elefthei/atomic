# Deterministic Workflows: Test File Locations
## Research Question: How does Atomic's deterministic workflows work?
## Partition: `tests/` directory (36 files, ~8,682 LOC)

### Implementation
Tests directly exercising workflow definition, registration, and deterministic execution:

- `tests/sdk/workflow-cli.test.ts` (630 LOC) — Registry-based multi-workflow CLI factory; tests `createWorkflowCli()`, input precedence, environment variable binding for orchestrator re-entry (`ATOMIC_ORCHESTRATOR_MODE`, `ATOMIC_WF_KEY`)
- `tests/sdk/registry.test.ts` (227 LOC) — Immutable chainable workflow registry; tests registration, lookup by `<agent>/<name>` key, validation on register, type-level generics
- `tests/sdk/commander.test.ts` (246 LOC) — Commander adapter; tests `toCommand(cli)` and `runCli()` with orchestrator re-entry path, cli array handling, ATOMIC_ORCHESTRATOR_MODE environment variable flow
- `tests/sdk/runtime/executor.test.ts` (210 LOC) — WorkflowRunOptions shape validation, launcher script env vars (ATOMIC_ORCHESTRATOR_MODE, ATOMIC_WF_KEY vs removed ATOMIC_WF_FILE), runOrchestrator signature verification

### Runtime Execution & Graph Inference
Tests covering deterministic stage sequencing and dependency resolution:

- `tests/sdk/runtime/graph-inference.test.ts` (205 LOC) — GraphFrontierTracker; tests sequential chains (`onSpawn()` / `onSettle()`), parallel fan-out, fan-in with shared parents, nested scopes, diamond patterns, conditional skips, fire-and-forget stages
- `tests/sdk/runtime/tmux.test.ts` (1000+ LOC) — Tmux session/window/pane management, session environment variables, literal text/special key sending, capture/kill operations, session name parsing
- `tests/sdk/runtime/attached-footer.test.ts` — Output footer attachment
- `tests/sdk/runtime/cc-debounce.test.ts` — Debouncing logic
- `tests/sdk/runtime/version-compat.test.ts` — SDK version compatibility checks

### Orchestration & State Management
Tests for workflow execution state tracking and UI panel coordination:

- `tests/sdk/components/orchestrator-panel-store.test.ts` (150+ LOC) — PanelStore; tests workflow metadata (name, agent, prompt), session creation with parent tracking, session lifecycle (`startSession`, `completeSession`, `sessionError`), version increments for state changes
- `tests/sdk/components/orchestrator-panel.test.tsx` (150+ LOC) — OrchestratorPanel lifecycle; tests showWorkflowInfo, session start/success/error/awaiting-input/resumed, showCompletion, showFatalError, waitForExit promise
- `tests/sdk/components/session-graph-panel.test.tsx` (100+ LOC) — SessionGraphPanel rendering; tests node name rendering, workflow completion state, session duration display, parent dependency visualization
- `tests/sdk/components/workflow-picker-panel.test.tsx` (400+ LOC) — WorkflowPickerPanel; tests fuzzy matching, field validation, registry filtering by agent, input resolution, theme building

### Management Commands
Tests for session and status subcommands:

- `tests/sdk/management-commands.test.ts` (84 LOC) — Tests `addSessionSubcommand()` (list/connect/kill), `addStatusSubcommand()` (format option), command option exposure (agent filters)

### Utilities & Components
- `tests/sdk/components/graph-theme.test.ts` — Graph visualization theming
- `tests/sdk/components/orchestrator-panel-contexts.test.tsx` — Context providers for orchestrator panel
- `tests/sdk/components/layout.test.ts` — Layout calculations
- `tests/sdk/components/connectors.test.ts` — Visual connectors between nodes
- `tests/sdk/components/status-helpers.test.ts` — Status display helpers
- `tests/sdk/components/color-utils.test.ts` — Color manipulation
- `tests/sdk/providers/claude-wait-for-idle.test.ts` — Claude provider idle detection
- `tests/sdk/providers/claude-watch-hil-marker.test.ts` — Claude HIL marker watching

### Configuration & System
- `tests/services/config/scm-sync.test.ts` — Source control manager synchronization
- `tests/services/system/detect.test.ts` — System detection
- `tests/services/system/copy.test.ts` — File operations
- `tests/lib/common-ignore.test.ts` — Ignore pattern handling
- `tests/lib/merge.test.ts` — Merge operations
- `tests/lib/path-root-guard.test.ts` — Path validation

### CLI Integration
- `tests/commands/cli/footer.test.ts` — CLI footer rendering

### Notable Clusters

**Workflow Execution Determinism** (`tests/sdk/runtime/`):
- Graph inference drives deterministic parent-child relationships between stages
- Environment variables (`ATOMIC_WF_*`) enable orchestrator re-entry into launcher script
- Registry maintains `<agent>/<name>` keys for lookup determinism across multiple CLI invocations
- Orchestrator mode flag (`ATOMIC_ORCHESTRATOR_MODE=1`) gates re-entry vs normal CLI flow

**State Synchronization** (`tests/sdk/components/`):
- PanelStore manages single source of truth for workflow/session state with version increments
- OrchestratorPanel renders from store subscriptions (listener pattern)
- SessionGraphPanel derives visual layout from parent dependency arrays
- WorkflowPickerPanel filters registry by agent to present only relevant workflows

**Entry Point Coordination**:
- `createWorkflowCli(registry)` builds the primary entry point
- `toCommand(cli)` adapts to Commander for CLI integration
- `runCli([clis], cliFn)` handles orchestrator re-entry detection transparently

## Summary

Atomic's deterministic workflows operate through three key mechanisms tested extensively in `tests/`:

1. **Registry-based Dispatch** — Immutable workflow registry indexed by `<agent>/<name>` ensures consistent lookup across all execution contexts
2. **Graph Inference** — GraphFrontierTracker infers deterministic dependency graphs from stage spawn/settle calls, supporting sequential chains, parallel fans, and nested scopes
3. **Orchestrator Re-entry Pattern** — Environment variables (`ATOMIC_ORCHESTRATOR_MODE`, `ATOMIC_WF_KEY`, `ATOMIC_WF_ID`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`, `ATOMIC_WF_INPUTS`) enable workflows to be spawned as child processes while maintaining state visibility and execution determinism through the parent orchestrator
