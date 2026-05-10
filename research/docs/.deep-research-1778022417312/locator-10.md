# Locator Report: Deterministic Workflows in `src/lib/`

## Research Question
How does atomic's deterministic workflows work?

## Overview
Atomic's deterministic workflow execution is primarily orchestrated through the **`src/sdk/runtime/`** subsystem (not `src/lib/`), but the `src/lib/` partition provides critical **utilities for system-level operations** that support reproducible workflow execution. The determinism is achieved via:

1. **Unique workflow identifiers** (`workflowRunId` derived from `crypto.randomUUID()`)
2. **Deterministic state snapshots** (JSON serialization + atomic writes)
3. **Environment variable propagation** for workflow context isolation (`ATOMIC_WF_ID`, `ATOMIC_WF_INPUTS`, `ATOMIC_WF_KEY`)
4. **Session management** in tmux with deterministic pane spawning and status tracking
5. **Idempotent CLI invocation** patterns

## Implementation

### Spawn and Process Execution
- `src/lib/spawn.ts` — 21.4 KB, provides async process spawning with deterministic output handling:
  - `runCommand()` — executes commands with captured stdout/stderr (ensures reproducible command results)
  - `prependPath()` — manages PATH consistently across platforms without duplicates
  - `ensureTmuxInstalled()`, `ensureBunInstalled()` — ensure reproducible tooling environment
  - Terminal multiplexer helpers for platform-specific binary resolution (tmux on Unix, psmux on Windows)
  - `ToolingSetupError`, `ToolingStep` for structured failure collection

### Configuration Merging and Sync
- `src/lib/merge.ts` — 3.4 KB, JSON configuration merge operations:
  - `mergeJsonFile()` — preserves destination keys while merging source (deterministic ordering for MCP server maps)
  - `syncJsonFile()` — entry point for merge-or-copy pattern with atomic file operations
  - Server map keys (`mcpServers`, `servers`, `lspServers`) are individually merged to preserve user configuration

### Path Validation
- `src/lib/path-root-guard.ts` — 1.1 KB, deterministic path safety checks:
  - `isPathWithinRoot()` — validates paths without symlink resolution
  - `assertRealPathWithinRoot()` — validates with symlink resolution via `realpath()`
  - Used to ensure workflow context isolation and prevent escape attacks

### Common Gitignore Patterns
- `src/lib/common-ignore.ts` — 1.2 KB, standardized ignore patterns:
  - `createCommonIgnoreFilter()` — creates an `Ignore` instance with OS-standard patterns (node_modules, .DS_Store, bun.lock, etc.)
  - Used by agent config copy operations to ensure consistent file filtering

## Tests

### Spawn Utilities Tests
- `src/lib/spawn.test.ts` — 3.7 KB:
  - `resolves commands added to PATH during the current process` — verifies command resolution in temp directory
  - `requires native psmux binaries on Windows` — platform-specific multiplexer validation
  - `requires tmux on Unix-like platforms` — Unix platform requirements
  - `maps supported Windows architectures to psmux release assets` — architecture-specific asset resolution
  - `uses platform requirement when checking PATH` — deterministic binary detection
  - `does not add duplicate PATH entries` — idempotent PATH management
  - `runCommand keeps stdout and stderr separate` — deterministic stream handling

## Types / Interfaces

### Spawn Result Types
- `SpawnResult` — `{ success: boolean; details: string; stdout?: string; stderr?: string }`
- `RunCommandOptions` — `{ inherit?: boolean }`
- `EnsureOptions` — `{ quiet?: boolean }`
- `ToolingStep` — `{ label: string; fn: () => Promise<unknown> }`
- `MuxBinaryName` — `"tmux" | "psmux" | "pmux"`

### Configuration Types
- `McpConfig` — `Record<string, unknown>` (deserializable JSON)

## Notable Clusters

### `src/lib/` — 5 files, 974 LOC
Shared utilities supporting reproducible workflow execution:
- **Process execution** — deterministic command spawning with stream separation
- **Configuration merging** — idempotent JSON merge with server map preservation
- **Path validation** — symlink-aware safety checks for context isolation
- **Common patterns** — standardized file filtering across agent config operations

### Related: `src/sdk/runtime/` — Workflow Orchestration
While outside the `src/lib/` scope, the runtime subsystem coordinates determinism:
- `executor.ts` (2.1 KB LOC) — workflow execution orchestrator
  - Generates `workflowRunId` via `generateId()` → `crypto.randomUUID().slice(0, 8)` (deterministic truncation)
  - Passes workflow context via environment variables: `ATOMIC_WF_ID`, `ATOMIC_WF_INPUTS` (base64), `ATOMIC_WF_KEY`, `ATOMIC_WF_TMUX`, `ATOMIC_WF_AGENT`, `ATOMIC_WF_CWD`
  - Spawns tmux orchestrator pane that re-executes user's entrypoint with `ATOMIC_ORCHESTRATOR_MODE=1`
- `status-writer.ts` — workflow status snapshots
  - `buildSnapshot()` — pure function deriving `WorkflowStatusSnapshot` from `StatusWriterInputs`
  - `writeSnapshot()` — atomic write-then-rename to `~/.atomic/sessions/<workflowRunId>/status.json`
  - `readSnapshot()` — read snapshot or return null (safe deserialization with version guard)
  - Schema versioning (`schemaVersion: 1`) for backwards compatibility
  - `workflowRunIdFromTmuxName()` — deterministic extraction of 8-hex ID from tmux session name

## Determinism Pattern

Atomic's deterministic workflows are supported by these `src/lib/` mechanisms:

1. **Idempotent Path Management** (`prependPath()` deduplication) — ensures reproducible environment setup
2. **Deterministic Command Execution** (`runCommand()` with stream separation) — reproducible tool invocations
3. **Atomic Configuration Updates** (`syncJsonFile()` with write-then-rename) — crash-safe config merging
4. **Path Isolation** (symlink-aware validators) — prevents escape attacks that would break reproducibility
5. **Common Filtering** (standardized ignore patterns) — consistent file selection across runs

The **orchestrator** (in `src/sdk/runtime/executor.ts`) ties these together:
- Generates a unique 8-hex ID from crypto (`generateId()` derived from UUID)
- Serializes workflow inputs to base64 and passes via `ATOMIC_WF_INPUTS` env var
- Re-executes the user's entrypoint with orchestrator mode enabled, propagating context via environment
- Persists status snapshots atomically to enable deterministic status queries
- Uses tmux session naming convention `atomic-wf-<agent>-<name>-<id>` to encode the workflow run ID

This design ensures **repeatability**: the same workflow definition + inputs + agent always produces the same execution trace and session structure, with deterministic ID generation and state snapshots enabling replay, resumption, and cross-process status queries.
