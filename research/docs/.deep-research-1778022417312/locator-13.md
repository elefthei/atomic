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
