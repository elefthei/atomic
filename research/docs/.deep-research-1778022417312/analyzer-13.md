## Analysis: Shell Completions — Partition 13

### Files Analysed

1. `src/completions/index.ts` (7 LOC)
2. `src/completions/bash.ts` (102 LOC)
3. `src/completions/zsh.ts` (143 LOC)
4. `src/completions/fish.ts` (130 LOC)
5. `src/completions/powershell.ts` (171 LOC)

---

### Per-File Notes

#### `src/completions/index.ts`

- **Role:** Barrel export for all four shell completion scripts plus the shared shell type vocabulary.
- **Key symbols:**
  - `SUPPORTED_SHELLS` (`src/completions/index.ts:6`) — `as const` tuple `["bash", "zsh", "fish", "powershell"]`; used as the authoritative enum of valid completion targets throughout the CLI.
  - `Shell` (`src/completions/index.ts:7`) — TypeScript union type derived from `SUPPORTED_SHELLS` via `typeof … [number]`.
- **Control flow:** No runtime logic; purely re-exports named exports from the four sibling modules.
- **Data flow:** Consumers import `{ SUPPORTED_SHELLS, Shell, bashCompletionScript, … }` from this module. The `completions` CLI subcommand uses `SUPPORTED_SHELLS` to validate the user-supplied shell argument.
- **Dependencies:** `./bash.ts`, `./zsh.ts`, `./fish.ts`, `./powershell.ts` (all local).

---

#### `src/completions/bash.ts`

- **Role:** Emits a bash completion script as a string constant. Installed via `eval "$(atomic completions bash)"`.
- **Key symbols:**
  - `bashCompletionScript` (`src/completions/bash.ts:6`) — single exported template-literal string containing the entire `_atomic_completions` bash function and the `complete -F _atomic_completions atomic` registration line (`src/completions/bash.ts:101`).
- **Control flow:** The embedded shell function `_atomic_completions` walks `$words` at runtime (lines 17–31) to build a three-level command chain (`$cmd1`, `$cmd2`, `$cmd3`), skipping flag tokens and their values (`-a/--agent`, `-n/--name`). It then dispatches on `$cmd1` (lines 47–98) to fill `COMPREPLY`. The `workflow` branch (lines 62–74) offers `list | session` as second-level tokens, `-n/--name` and `-a/--agent` as flags, and `list | connect | kill` as `workflow session` third-level tokens.
- **Data flow:** The fixed strings `commands`, `agents`, and `global_opts` (lines 11–13) are the only runtime data. No process substitution or dynamic queries are performed; all completions are statically encoded.
- **Dependencies:** Bash built-ins only (`_init_completion`, `compgen`, `complete`). No TypeScript runtime involvement after the script is emitted.

---

#### `src/completions/zsh.ts`

- **Role:** Emits a zsh completion script using the `_arguments`/state-machine pattern. Installed via `eval "$(atomic completions zsh)"`.
- **Key symbols:**
  - `zshCompletionScript` (`src/completions/zsh.ts:6`) — string constant containing `_atomic()` and the helper `_atomic_session()`.
  - `_atomic_session` (`src/completions/zsh.ts:116–140`) — shared helper used for `chat session`, `workflow session`, and top-level `session`; offers `list | connect | kill` plus `-a/--agent`.
- **Control flow:** `_atomic()` calls `_arguments -C` to enter state routing (`->cmds` / `->args`). The `cmds` branch (`src/completions/zsh.ts:21–31`) describes all six top-level subcommands with descriptions. The `args` branch (`src/completions/zsh.ts:33–111`) switches on `${words[1]}` and recursively calls `_arguments -C` for `workflow` (`src/completions/zsh.ts:58–82`) — exposing `-n/--name`, `-a/--agent`, and sub-states `list` (with its own `-a/--agent`) and `session` (delegated to `_atomic_session`).
- **Data flow:** The `agents` array (`src/completions/zsh.ts:10`) is declared once and referenced inline as `:(claude opencode copilot)` in every `_arguments` spec. All completion data is static.
- **Dependencies:** Zsh completion system built-ins (`_arguments`, `_describe`, `compdef`).

---

#### `src/completions/fish.ts`

- **Role:** Emits a fish shell completion script using `complete` declarations. Installed via `atomic completions fish | source` or saved to `~/.config/fish/completions/atomic.fish`.
- **Key symbols:**
  - `fishCompletionScript` (`src/completions/fish.ts:7`) — string constant.
  - `__atomic_no_subcommand` (`src/completions/fish.ts:18–20`) — fish function; returns true when none of the six top-level subcommands has been seen yet. Used as the `-n` condition for global-option completions.
  - `__atomic_using_cmd` (`src/completions/fish.ts:22–54`) — fish function; takes a sequence of command tokens as `$argv`, then walks `(commandline -opc)` starting at index 2, skipping `-*` flags and their values for `-a/--agent/-n/--name`, to verify that the parse position matches the expected command chain. Returns 0 (true) only if the entire token sequence is matched in order.
  - `__atomic_needs_subcmd_of` (`src/completions/fish.ts:56–59`) — thin wrapper; calls `__atomic_using_cmd` then checks that none of `list connect kill set` has been seen yet.
- **Control flow:** Each `complete` declaration specifies a `-n` (condition) predicate, a completion value (`-a`), and an optional description. The `workflow` block (`src/completions/fish.ts:96–110`) wires up `-n/--name` (`-r` = required argument), `-a/--agent`, and the `list`/`session` sub-commands with their own `list | connect | kill` level, each filtered by `__atomic_using_cmd workflow session [list|connect|kill]`.
- **Data flow:** The fish-level variable `$agents` (`src/completions/fish.ts:13`) holds the static agent list; referenced via interpolation in `-r -a "$agents"` arguments.
- **Dependencies:** Fish built-ins (`complete`, `__fish_seen_subcommand_from`, `commandline`).

---

#### `src/completions/powershell.ts`

- **Role:** Emits a PowerShell completion script using `Register-ArgumentCompleter`. Cross-platform (Windows and PowerShell 7+). Installed via `atomic completions powershell | Invoke-Expression`.
- **Key symbols:**
  - `powershellCompletionScript` (`src/completions/powershell.ts:7`) — string constant containing a single `Register-ArgumentCompleter` block.
  - `$cmds` array (`src/completions/powershell.ts:19–30`) — built by iterating `$tokens` (the tokenized command-line up to cursor), skipping flag tokens and consuming values for `-a/--agent/-n/--name` via `$skipNext`.
  - `$completions` array (`src/completions/powershell.ts:49–165`) — filled by a `switch ($cmds.Count)` / nested `switch ($cmds[0])` structure.
- **Control flow:** At depth 0 (no commands), emits all six top-level subcommand completions with `tip` descriptions (`src/completions/powershell.ts:54–62`). For `workflow` at depth 1 (`$cmds.Count -eq 1`), emits `list`, `session`, `-n/--name`, `-a/--agent` (`src/completions/powershell.ts:94–102`). For `workflow list` it emits `-a/--agent`; for `workflow session` at depth 2 it emits `list | connect | kill`; at depth 3+ it emits `-a/--agent`. Final output (`src/completions/powershell.ts:167–169`) filters `$completions` by `$wordToComplete*` and instantiates `CompletionResult` objects.
- **Data flow:** Static `$agents` (`src/completions/powershell.ts:14`) and `$shells` (`src/completions/powershell.ts:15`) arrays; all other completion data is inline string literals with `tip` tooltip strings.
- **Dependencies:** PowerShell `System.Management.Automation.CompletionResult` class; no TypeScript runtime involvement post-emission.

---

### Cross-Cutting Synthesis

The `src/completions/` module is a pure static-code-generation layer: all five files together produce embedded shell scripts that are emitted as strings at runtime when the user runs `atomic completions <shell>`. None of the completion scripts perform live queries against the registry or workflow list — all command names, subcommand names, and flag names are hard-coded string literals that mirror the public CLI surface. The workflow command surface exposed across all four shells is identical: `atomic workflow [list | session]` with `-n/--name` (workflow name) and `-a/--agent` (one of `claude | opencode | copilot`) as options, and `workflow session [list | connect | kill]` as the deepest reachable depth. This static snapshot tells us that the CLI's deterministic workflow dispatch tree is fixed at three levels (command → subcommand → action), and that `--name` is the mechanism by which a specific named workflow is selected rather than discovered dynamically. The `SUPPORTED_SHELLS` constant in `index.ts:6` is the single source of truth that both the completion scripts and the `completions` CLI command use to validate the shell argument.

---

### Out-of-Partition References

- `src/sdk/workflow-cli.ts` — The runtime counterpart; parses `-n/--name` and `-a/--agent` that the completions advertise, and routes into `executeWorkflow` / `handleOrchestratorReEntry`.
- `src/sdk/commander.ts` — Registers the `completions` subcommand under the main `atomic` Commander program, using `SUPPORTED_SHELLS` from this partition to validate user input.
- `src/sdk/registry.ts` — Provides the actual workflow registry (`list`, `resolve`) that `workflow list` queries at runtime; completions do not call it.
- `src/sdk/runtime/executor.ts` — `executeWorkflow` / `handleOrchestratorReEntry`; the deterministic execution engine that `workflow --name NAME --agent AGENT` ultimately invokes.
- `src/sdk/types.ts` — `AgentType` union and `WorkflowDefinition` interface; the canonical definitions of `claude | opencode | copilot` that completions statically encode.
