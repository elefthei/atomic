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
