# Partition 13 of 16 — Findings

## Scope
`src/completions/` (5 files, 553 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
## Completions Partition (src/completions/) — Workflow Command Surface

The completions directory defines shell-agnostic command surfaces for atomic's workflows. These are code-generated completion scripts that expose the public CLI API, including the `workflow` command hierarchy and its `list`, `session`, and configuration subcommands.

### Implementation

- `src/completions/index.ts` — Module export index; declares SUPPORTED_SHELLS constant and Shell type union
- `src/completions/bash.ts` — Bash completion script with command chain parsing for `workflow list | session` and flags (`-n --name`, `-a --agent`)
- `src/completions/zsh.ts` — Zsh completion script using `_arguments` with state machine for nested subcommand handling
- `src/completions/fish.ts` — Fish completion script with condition helpers (`__atomic_using_cmd`, `__atomic_needs_subcmd_of`) for workflow/session filtering
- `src/completions/powershell.ts` — PowerShell completion using Register-ArgumentCompleter; includes agents list and workflow-specific tip strings

### Configuration

- **Shell targets**: bash, zsh, fish, powershell (const SUPPORTED_SHELLS in index.ts)
- **Agents**: claude, opencode, copilot (shared across all shells)
- **Workflow commands**: `list` (list available workflows), `session` (manage workflow sessions with list/connect/kill)
- **Workflow flags**: `-n/--name` (workflow name), `-a/--agent` (agent filter)

### Integration Points

- `src/commands/cli/completions.ts` — Command handler; maps Shell type to completion script and writes to stdout
- `src/cli.ts` — Imports SUPPORTED_SHELLS type and uses completions module for main program setup

### Notable Clusters

- `src/commands/cli/workflow*.ts` (7 files) — Workflow command implementation, list, inputs, and status (paired with tests)
- `src/completions/` (5 files, 553 LOC) — Shell completion scripts structured by language; each follows its native syntax conventions (bash case statements, zsh _arguments, fish functions, PowerShell scriptblocks)

### Workflow Surface Exposed by Completions

The completion scripts document the deterministic workflow command hierarchy:
1. `atomic workflow [list | session]` — Main workflow commands
2. `atomic workflow list [-a/--agent AGENT]` — List available workflows for a specific agent
3. `atomic workflow session [list | connect | kill] [-a/--agent AGENT]` — Manage active workflow sessions across agents
4. `atomic workflow -n/--name NAME -a/--agent AGENT` — Execute a named workflow on specified agent

This reflects atomic's multi-session workflow model where workflows can run on different agents (claude, opencode, copilot) and sessions are managed independently from chat sessions.

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
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

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Atomic Deterministic Workflows: Completion Patterns

The `src/completions/` directory (5 files, 553 LOC) reflects how atomic's deterministic workflows are exposed through the public command surface. Shell completions mirror the internal architecture: workflows are registered with a fixed schema, spawned via immutable `stage()` calls, and session hierarchies are tracked deterministically.

## Pattern 1: Multi-Shell Completion Registration

**Where:** `src/completions/index.ts:1-7`

**What:** Central export point that registers all supported shell completion scripts as static strings.

```typescript
export { bashCompletionScript } from "./bash.ts";
export { zshCompletionScript } from "./zsh.ts";
export { fishCompletionScript } from "./fish.ts";
export { powershellCompletionScript } from "./powershell.ts";

export const SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
export type Shell = (typeof SUPPORTED_SHELLS)[number];
```

**Key aspects:**
- Exports are static completionScript strings (fully rendered shell code)
- SUPPORTED_SHELLS tuple serves as both the exhaustive list and type guard
- No dynamic generation—deterministic, reproducible completions

## Pattern 2: Stateful Command Chain Parsing (Bash)

**Where:** `src/completions/bash.ts:7-102`

**What:** Bash completion walks command tokens to track depth (cmd1/cmd2/cmd3), dispatches based on cumulative context.

```bash
_atomic_completions() {
    local cur prev words cword
    _init_completion || return

    local commands="init chat workflow session config completions"
    local agents="claude opencode copilot"
    local global_opts="-y --yes --no-banner -v --version -h --help"

    # Walk the words to find the command chain (skip flags and their values)
    local cmd1="" cmd2="" cmd3=""
    local i=1
    while [[ $i -lt $cword ]]; do
        local w="${words[$i]}"
        case "$w" in
            -a|--agent|-n|--name) (( i++ )) ;;  # skip flag value
            -*)                   ;;              # skip other flags
            *)
                if [[ -z "$cmd1" ]]; then cmd1="$w"
                elif [[ -z "$cmd2" ]]; then cmd2="$w"
                elif [[ -z "$cmd3" ]]; then cmd3="$w"
                fi
                ;;
        esac
        (( i++ ))
    done

    case "$cmd1" in
        workflow)
            if [[ -z "$cmd2" ]]; then
                COMPREPLY=( $(compgen -W "list session -n --name -a --agent -h --help" -- "$cur") )
            elif [[ "$cmd2" == "list" ]]; then
                COMPREPLY=( $(compgen -W "-a --agent -h --help" -- "$cur") )
            elif [[ "$cmd2" == "session" ]]; then
                if [[ -z "$cmd3" ]]; then
                    COMPREPLY=( $(compgen -W "list connect kill -h --help" -- "$cur") )
                else
                    COMPREPLY=( $(compgen -W "-a --agent -h --help" -- "$cur") )
                fi
            fi
            ;;
    esac
}

complete -F _atomic_completions atomic
```

**Key aspects:**
- Flag-value skipping ensures clean command token capture
- cmd1/cmd2/cmd3 variables accumulate parsed subcommand depth
- Nested case statements match stateful context
- `workflow session` forms a deterministic three-level hierarchy

**Variations / call-sites:**
- `src/completions/bash.ts:34-40` — flag value completion (`-a|--agent`)
- `src/completions/bash.ts:75-81` — session subcommands (list/connect/kill)

## Pattern 3: Zsh Completion with State Dispatch

**Where:** `src/completions/zsh.ts:9-142`

**What:** Zsh completion uses `_arguments -C` and nested `case "$state"` to dispatch based on parsed subcommand depth.

```zsh
_atomic() {
    local -a agents=('claude' 'opencode' 'copilot')

    _arguments -C \
        '(-y --yes)'{-y,--yes}'[Auto-confirm all prompts]' \
        '--no-banner[Skip ASCII banner display]' \
        '(-v --version)'{-v,--version}'[Show version number]' \
        '(-h --help)'{-h,--help}'[Show help]' \
        '1:command:->cmds' \
        '*::arg:->args'

    case "$state" in
        cmds)
            local -a commands=(
                'init:Interactive setup with agent selection'
                'chat:Start an interactive chat session'
                'workflow:Run a multi-session agent workflow'
                'session:Manage running tmux sessions'
                'config:Manage atomic configuration'
                'completions:Output shell completion script'
            )
            _describe 'command' commands
            ;;
        args)
            case "${words[1]}" in
                workflow)
                    _arguments -C \
                        '(-n --name)'{-n,--name}'[Workflow name]:name:' \
                        '(-a --agent)'{-a,--agent}'[Agent to use]:agent:(claude opencode copilot)' \
                        '(-h --help)'{-h,--help}'[Show help]' \
                        '1:subcommand:->sub' \
                        '*::subarg:->subargs'
                    case "$state" in
                        sub)
                            local -a subs=(
                                'list:List available workflows'
                                'session:Manage running workflow sessions'
                            )
                            _describe 'subcommand' subs
                            ;;
                        subargs)
                            case "${words[1]}" in
                                list)
                                    _arguments \
                                        '(-a --agent)'{-a,--agent}'[Filter by agent]:agent:(claude opencode copilot)' \
                                        '(-h --help)'{-h,--help}'[Show help]'
                                    ;;
                                session) _atomic_session ;;
                            esac
                            ;;
                    esac
                    ;;
            esac
            ;;
    esac
}

_atomic_session() {
    _arguments -C \
        '(-h --help)'{-h,--help}'[Show help]' \
        '1:subcommand:->sub' \
        '*::subarg:->subargs'
    case "$state" in
        sub)
            local -a subs=(
                'list:List running sessions'
                'connect:Attach to a running session'
                'kill:Kill a running session (omit id to kill all)'
            )
            _describe 'subcommand' subs
            ;;
        subargs)
            case "${words[1]}" in
                list|connect|kill)
                    _arguments \
                        '*'{-a,--agent}'[Filter by agent]:agent:(claude opencode copilot)' \
                        '(-h --help)'{-h,--help}'[Show help]'
                    ;;
            esac
            ;;
    esac
}

compdef _atomic atomic
```

**Key aspects:**
- `_arguments -C` enables state machine; `-C` causes re-entry on each arg
- Nested `case "$state"` dispatches: cmds → sub → subargs
- Reusable `_atomic_session()` function handles session management hierarchy
- Double nesting (`sub` → `subargs`) reflects three-level workflow depth

**Variations / call-sites:**
- `src/completions/zsh.ts:116-140` — extracted `_atomic_session()` helper

## Pattern 4: Fish Completion with Helper Functions and Positional Predicates

**Where:** `src/completions/fish.ts:18-130`

**What:** Fish completion defines stateless helper functions that test command-line context positionally, then composes `complete` statements.

```fish
function __atomic_using_cmd
    set -l cmds $argv
    set -l tokens (commandline -opc)
    # Check that the command sequence matches
    set -l idx 2  # start after 'atomic'
    for cmd in $cmds
        if test $idx -gt (count $tokens)
            return 1
        end
        # Skip flags and their values
        while test $idx -le (count $tokens)
            switch $tokens[$idx]
                case '-*'
                    set idx (math $idx + 1)
                    # Skip flag value for known value-flags
                    switch $tokens[(math $idx - 1)]
                        case -a --agent -n --name
                            set idx (math $idx + 1)
                    end
                case '*'
                    break
            end
        end
        if test $idx -gt (count $tokens)
            return 1
        end
        if test "$tokens[$idx]" != "$cmd"
            return 1
        end
        set idx (math $idx + 1)
    end
    return 0
end

function __atomic_needs_subcmd_of
    __atomic_using_cmd $argv
    and not __fish_seen_subcommand_from list connect kill set
end

# Workflow examples:
complete -c atomic -n '__atomic_using_cmd workflow; and not __fish_seen_subcommand_from list session' -s n -l name -d 'Workflow name' -r
complete -c atomic -n '__atomic_using_cmd workflow; and not __fish_seen_subcommand_from list session' -s a -l agent -d 'Agent to use' -r -a "$agents"
complete -c atomic -n '__atomic_using_cmd workflow; and not __fish_seen_subcommand_from list session' -a list -d 'List available workflows'
complete -c atomic -n '__atomic_using_cmd workflow; and not __fish_seen_subcommand_from list session' -a session -d 'Manage running workflow sessions'

complete -c atomic -n '__atomic_using_cmd workflow list' -s a -l agent -d 'Filter by agent' -r -a "$agents"

complete -c atomic -n '__atomic_using_cmd workflow session; and not __fish_seen_subcommand_from list connect kill' -a list -d 'List running sessions'
complete -c atomic -n '__atomic_using_cmd workflow session; and not __fish_seen_subcommand_from list connect kill' -a connect -d 'Attach to a running session'
complete -c atomic -n '__atomic_using_cmd workflow session; and not __fish_seen_subcommand_from list connect kill' -a kill -d 'Kill a running session (omit id to kill all)'
```

**Key aspects:**
- `__atomic_using_cmd` is a pure function: matches command sequence regardless of intervening flags
- `__atomic_needs_subcmd_of` composes: predicate AND negation of terminal states
- Each `complete -c` statement is independent; conditions are composable predicates
- No mutable state; deterministic re-evaluation on each keystroke

**Variations / call-sites:**
- `src/completions/fish.ts:18-54` — stateful command parser
- `src/completions/fish.ts:94-110` — workflow completions hierarchy

## Pattern 5: PowerShell Token Parser with Switch Dispatch

**Where:** `src/completions/powershell.ts:8-171`

**What:** PowerShell completion parses tokens into a `$cmds` array, then uses nested `switch` statements to dispatch based on array depth.

```powershell
Register-ArgumentCompleter -Native -CommandName atomic -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $tokens = $commandAst.ToString().Substring(0, $cursorPosition) -split '\\s+' |
        Where-Object { $_ -ne '' }

    $agents  = @('claude', 'opencode', 'copilot')
    $shells  = @('bash', 'zsh', 'fish', 'powershell')

    # Parse command chain, skipping flags and their values
    $cmds = @()
    $skipNext = $false
    $prevToken = ''
    for ($i = 1; $i -lt $tokens.Count; $i++) {
        $t = $tokens[$i]
        if ($skipNext) { $skipNext = $false; continue }
        if ($t -match '^-') {
            if ($t -match '^(-a|--agent|-n|--name)$') { $skipNext = $true }
            $prevToken = $t
            continue
        }
        $cmds += $t
    }

    $completions = @()

    switch ($cmds.Count) {
        0 {
            # Top-level commands
            $completions = @(
                @{ text = 'workflow';    tip = 'Run a multi-session agent workflow' }
                @{ text = 'session';     tip = 'Manage running tmux sessions' }
            )
        }
        default {
            switch ($cmds[0]) {
                'workflow' {
                    if ($cmds.Count -eq 1) {
                        $completions = @(
                            @{ text = 'list';    tip = 'List available workflows' }
                            @{ text = 'session'; tip = 'Manage running workflow sessions' }
                            @{ text = '-n';      tip = 'Workflow name' }
                            @{ text = '--name';  tip = 'Workflow name' }
                            @{ text = '-a';      tip = 'Agent to use' }
                            @{ text = '--agent'; tip = 'Agent to use' }
                        )
                    } elseif ($cmds[1] -eq 'list') {
                        $completions = @(
                            @{ text = '-a';      tip = 'Filter by agent' }
                            @{ text = '--agent'; tip = 'Filter by agent' }
                        )
                    } elseif ($cmds[1] -eq 'session') {
                        if ($cmds.Count -eq 2) {
                            $completions = @(
                                @{ text = 'list';    tip = 'List running sessions' }
                                @{ text = 'connect'; tip = 'Attach to a running session' }
                                @{ text = 'kill';    tip = 'Kill a running session' }
                            )
                        } else {
                            $completions = @(
                                @{ text = '-a';      tip = 'Filter by agent' }
                                @{ text = '--agent'; tip = 'Filter by agent' }
                            )
                        }
                    }
                }
            }
        }
    }

    $completions | Where-Object { $_.text -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_.text, $_.text, 'ParameterValue', $_.tip)
    }
}
```

**Key aspects:**
- Token parsing builds `$cmds` array: `@('workflow', 'session', ...)`
- Double-nested `switch ($cmds.Count)` / `switch ($cmds[0])` + conditionals on `$cmds[1]`/`$cmds.Count`
- Completions return as custom objects with text + tip (description)
- Filtering against `$wordToComplete` at the end ensures partial matching

**Variations / call-sites:**
- `src/completions/powershell.ts:36-48` — flag value completion logic
- `src/completions/powershell.ts:93-122` — workflow nested dispatch

## Pattern 6: Session Management Subcommand (Reused Across Shells)

**Where:** All shells: `bash:75-81`, `zsh:116-140`, `fish:94-110`, `powershell:123-135`

**What:** Session management (list/connect/kill) appears identically in all shell completion profiles, reflecting a deterministic subcommand hierarchy.

**Bash example** (`src/completions/bash.ts:75-81`):
```bash
session)
    if [[ -z "$cmd2" ]]; then
        COMPREPLY=( $(compgen -W "list connect kill -h --help" -- "$cur") )
    else
        COMPREPLY=( $(compgen -W "-a --agent -h --help" -- "$cur") )
    fi
    ;;
```

**Zsh example** (`src/completions/zsh.ts:116-140`):
```zsh
_atomic_session() {
    _arguments -C \
        '(-h --help)'{-h,--help}'[Show help]' \
        '1:subcommand:->sub' \
        '*::subarg:->subargs'
    case "$state" in
        sub)
            local -a subs=(
                'list:List running sessions'
                'connect:Attach to a running session'
                'kill:Kill a running session (omit id to kill all)'
            )
            _describe 'subcommand' subs
```

**Key aspects:**
- Three deterministic subcommands: `list`, `connect`, `kill`
- Consistent `-a|--agent` filtering across all shells
- Reusable helper (`_atomic_session()` in zsh)
- Reflects immutable session management API

---

## How Deterministic Workflows Are Reflected in Completions

Atomic's workflow system is **deterministic** because:

1. **Registration is Immutable** (`src/sdk/registry.ts`): Workflows are registered via `registry.register(workflow)`, which returns a new Registry. No silent overwrites; each `(agent, name)` pair is unique. The completion system lists these deterministically.

2. **Workflow Structure is Frozen** (`src/sdk/define-workflow.ts:176-219`): `compile()` freezes inputs, validates at registration time, and stores the agent type. Completions reflect this schema precisely: `-n|--name` + `-a|--agent` + declared inputs.

3. **Session Hierarchy is Explicit** (`src/sdk/types.ts:336-342`): `ctx.stage()` creates child sessions with explicit names and options. Completions mirror this with nested subcommands: `workflow` → `list|session` → `list|connect|kill`.

4. **Stateless Parsing** (all shells): Completions parse tokens independently; they contain no process state, no previous commands, no caching. Each keystroke re-evaluates from the full command line. This matches the deterministic re-execution model: workflows re-execute their `.run()` callback with `ATOMIC_ORCHESTRATOR_MODE=1`.

5. **Multi-Agent Support** (all shells): All three agents (`claude`, `opencode`, `copilot`) appear identically in every completion script, enforcing compile-time type narrowing via `.for(agent)` in the workflow builder.

The completions are static, non-parametric string exports—they don't read the registry or filesystem. This ensures they work offline and remain deterministic across installs.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
