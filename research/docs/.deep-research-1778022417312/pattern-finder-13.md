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

