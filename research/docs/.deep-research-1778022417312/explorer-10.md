# Partition 10 of 16 — Findings

## Scope
`src/lib/` (5 files, 974 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
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

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
# Analyzer 10 — `src/lib/` Utility Layer

## Files Analysed

| File | Size | Role |
|---|---|---|
| `src/lib/spawn.ts` | 21.4 KB | Command execution, PATH management, tool installer |
| `src/lib/merge.ts` | 3.4 KB | Atomic JSON merge / copy for agent configs |
| `src/lib/path-root-guard.ts` | 1.1 KB | Path-traversal guards (lexical + symlink-resolved) |
| `src/lib/common-ignore.ts` | 1.2 KB | Gitignore-style common-junk filter factory |
| `src/lib/spawn.test.ts` | 3.7 KB | Unit tests for PATH and command primitives |

---

## Per-File Notes

### `src/lib/spawn.ts`

**Role.** The single source of truth for spawning subprocesses and for ensuring the runtime environment has every tool the workflow engine depends on (bun, tmux/psmux, Playwright, LiteParse, ast-grep).

**Key exports and their lines.**

| Symbol | Line | What it does |
|---|---|---|
| `SpawnResult` | 18 | Return type: `{ success, details, stdout?, stderr? }` |
| `RunCommandOptions` | 25 | Optional `inherit` flag — streams vs. captures output |
| `runCommand` | 37 | Core async wrapper around `Bun.spawn`. Returns `SpawnResult`, never throws. |
| `prependPath` | 81 | Idempotent PATH prepend (case-insensitive check on Windows). |
| `resolveCommandFromCurrentPath` | 97 | `Bun.which(cmd, { PATH: process.env.PATH })` — explicit PATH injection so runtime mutations are visible. |
| `MuxBinaryName` | 101 | Discriminated union `"tmux" \| "psmux" \| "pmux"` |
| `requiredMuxBinaryCandidatesForPlatform` | 103 | Returns `["psmux","pmux"]` on win32, `["tmux"]` elsewhere. |
| `isMuxBinaryRequiredForPlatform` | 109 | Membership check in the candidates list. |
| `hasRequiredMuxBinary` | 116 | Scans PATH for any required candidate. |
| `prependBunInstallPaths` | 155 | Adds `~/.bun/bin`, `$BUN_INSTALL/bin`, Scoop/WinGet shims to PATH. |
| `upgradeGlobalPackages` | 405 | Runs a single `bun install -g --trust <pkgs>@latest`. Guards against concurrent global linker races by batching all packages. |
| `ensureTmuxInstalled` | 434 | Idempotent installer: checks `hasRequiredMuxBinary()` first; tries winget → scoop → choco → cargo → direct GitHub release on Windows; brew → apt/dnf/yum/pacman/zypper/apk on Unix. |
| `ensureBunInstalled` | 549 | Idempotent installer: checks `Bun.which("bun")` first; tries winget/scoop/PS install script on Windows; curl install script then brew on Unix. |
| `ToolingStep` / `collectFailures` | 657, 662 | Step pipeline abstraction: each step is `{ label, fn }`. `collectFailures` collects rejection messages from a `Promise.allSettled` result for the update UI. |
| `EnsureOptions.quiet` | 390 | When `true`, subprocess output is captured (not inherited) so a spinner UI owns the terminal; failures are re-thrown as messages. |

**Control flow of `runCommand` (lines 37–76).**

1. If `inherit` is set, `Bun.spawn` with `stdout:"inherit"`, `stderr:"inherit"`. Awaits `proc.exited`. Returns `{ success: exitCode===0, details:"" }`.
2. Otherwise, `Bun.spawn` with `stdout:"pipe"`, `stderr:"pipe"`. Collects stderr, stdout, and exit code via `Promise.all`. Returns trimmed streams; `details` is stderr if non-empty, else stdout.
3. Any thrown exception is caught and returned as `{ success:false, details: errorMessage }`.

**PATH idempotency (lines 81–91).**

`prependPath` splits `process.env.PATH` on the delimiter (`;` win32, `:` unix), performs a case-insensitive match on Windows or exact match on Unix, and only prepends when the directory is absent. This guarantees deterministic PATH order across multiple invocations in the same process.

**Windows PATH refresh pattern (lines 189–217).**

`refreshWindowsPathFromRegistry` queries the registry via PowerShell for User+Machine PATH, merges each entry through `prependPath`, then callers re-run `prependWindowsMuxInstallPaths` after the refresh. The double-prepend pattern (`prependWindowsMuxInstallPaths → refresh → prependWindowsMuxInstallPaths`) ensures newly installed binary dirs land at the front even if the registry was stale on entry.

**psmux GitHub release installer (lines 276–367).**

When no package manager is available on Windows, `installPsmuxFromGitHubRelease`:
1. Fetches `https://api.github.com/repos/psmux/psmux/releases/latest`.
2. Selects the asset matching the arch suffix from `psmuxReleaseAssetSuffix`.
3. Downloads to `mkdtempSync(join(tmpdir(),"atomic-psmux-"))`.
4. Extracts with PowerShell `Expand-Archive`.
5. Copies `psmux.exe`, `pmux.exe`, `tmux.exe` into `~/.atomic/bin`.
6. Calls `persistWindowsUserPath` to write the directory into the User registry PATH.
7. Always cleans up the temp dir in `finally`.

---

### `src/lib/merge.ts`

**Role.** Provides the canonical merge-or-copy pattern for propagating agent configuration JSON files (MCP server registries, settings) from Atomic's bundled templates into live user configs without destroying user-made edits.

**Exports.**

| Symbol | Line | What it does |
|---|---|---|
| `mergeJsonFile` | 32 | Reads src+dest in parallel (`Promise.all`), strips `excludeKeys` from src, spreads dest then src (src wins on top-level scalar keys), then individually merges every key in `SERVER_MAP_KEYS` as `{ ...dst, ...src }` so both sides' server registries are preserved. Writes with `JSON.stringify(…, null, 2) + "\n"`. |
| `syncJsonFile` | 82 | Single entry-point. Ensures dest parent dir exists; branches on `merge && destExists`. If merging, delegates to `mergeJsonFile`. If copying fresh with `excludeKeys`, strips keys from src before writing. Otherwise does a straight `copyFile`. |

**`SERVER_MAP_KEYS` (line 11).** `["mcpServers", "servers", "lspServers"]` — the named-object maps in Claude Code, Copilot, and OpenCode config schemas where user-added entries must survive an Atomic config push.

**Merge semantics.**

```
mergedConfig = { ...destConfig, ...srcConfig }           // src wins on scalars
mergedConfig[key] = { ...dst[key], ...src[key] }         // both sides preserved on server maps
```

The `excludeKeys` parameter (defaulting to `[]`) allows callers to prevent specific top-level keys (e.g., version-locked fields) from being overwritten in the destination.

**Short-circuit (line 37–39).** If `resolve(srcPath) === resolve(destPath)` (same file after canonicalization), `mergeJsonFile` returns immediately.

---

### `src/lib/path-root-guard.ts`

**Role.** Enforces that file-copy and config-sync operations never traverse out of their declared root directory. Two guard levels are provided.

**Exports.**

| Symbol | Line | What it does |
|---|---|---|
| `isPathWithinRoot` | 9 | Lexical check. Calls `resolve()` on both paths, then `relative(root, target)`. Returns `true` if relative path is `""` or does not start with `..` and is not absolute. |
| `assertPathWithinRoot` | 13 | Calls `isPathWithinRoot`; throws `"${label} escapes allowed root: ${candidatePath}"` on violation. |
| `assertRealPathWithinRoot` | 23 | Async. Calls `realpath()` on both paths (resolves symlinks), then applies `isSubPath`. Throws on violation; returns the canonicalized candidate path on success. Used specifically for symlink dereferencing inside `copyDir`. |

**`isSubPath` (line 4–7).** Pure function: `rel === ""` handles identity; `!rel.startsWith("..") && !isAbsolute(rel)` handles sub-paths without relying on OS.

---

### `src/lib/common-ignore.ts`

**Role.** Provides a pre-configured `Ignore` instance (from the `ignore` npm package) that filters out OS junk, dependency dirs, lockfiles, and build artifacts during agent config copy operations.

**Export.**

| Symbol | Line | What it does |
|---|---|---|
| `createCommonIgnoreFilter` | 44 | Returns `ignore().add(COMMON_IGNORE_PATTERNS)`. |

**`COMMON_IGNORE_PATTERNS` (line 19–36).** Readonly array covering:
- macOS: `.DS_Store`, `__MACOSX/`, `._*`
- Windows: `Thumbs.db`
- Dependencies: `node_modules/`
- Lockfiles: `bun.lock`
- Logs: `*.log`

**Usage pattern.** Callers pass the returned `Ignore` instance as the `ignoreFilter` field of `CopyOptions` in `src/services/system/copy.ts`. The `shouldExclude` function at `copy.ts:169` evaluates `ignoreFilter?.ignores(normalizedPath)` before checking the explicit `exclude` list, giving the common patterns priority.

---

### `src/lib/spawn.test.ts`

**Role.** Bun test suite verifying PATH mutation primitives and command stream behavior.

**Tests (lines 29–108).**

- Line 29: Writes a real executable to a temp dir, prepends it to PATH, then asserts `resolveCommandFromCurrentPath` finds it.
- Line 45: Asserts `requiredMuxBinaryCandidatesForPlatform("win32")` returns `["psmux","pmux"]` and `isMuxBinaryRequiredForPlatform` reports correctly.
- Line 55: Same for `"linux"` and `"darwin"` → `["tmux"]`.
- Line 63: `psmuxReleaseAssetSuffix` maps x64/ia32/arm64 to correct zip suffixes; unsupported arch (`"arm"`) returns `null`.
- Line 70: `hasRequiredMuxBinary` returns `true` only on non-win32 when a `tmux` executable is on PATH.
- Line 81: `prependPath` called twice with the same dir produces exactly one entry.
- Line 92: `runCommand` keeps stdout and stderr in separate fields; `details` is populated from stderr when present.

---

## Cross-Cutting Synthesis

The four `src/lib/` modules collectively enforce three determinism invariants across workflow execution:

**1. Idempotent environment bootstrapping (`spawn.ts`).** Every `ensure*` installer begins with a presence check (`hasRequiredMuxBinary`, `Bun.which`) and returns immediately if the tool already exists. `prependPath` deduplicates PATH entries on every call. The combined effect is that the workflow engine can call these helpers on every startup without side-effects when the environment is already correct. `upgradeGlobalPackages` serializes all global bun installs into one `bun install -g` invocation to prevent concurrent-linker races.

**2. Non-destructive config propagation (`merge.ts`, `common-ignore.ts`).** `syncJsonFile` is the single entry-point for pushing Atomic's bundled agent configs into user directories. It always reads the destination first and merges at the server-map level, so user-added MCP servers survive repeated syncs. `createCommonIgnoreFilter` ensures `node_modules/`, lockfiles, and OS metadata are never included in a copy sweep, keeping config operations reproducible regardless of source directory state.

**3. Filesystem isolation (`path-root-guard.ts`).** All directory traversal in `copy.ts` enforces `assertPathWithinRoot` (lexical) and `assertRealPathWithinRoot` (symlink-resolved) at every entry. This prevents path-traversal attacks from malformed source trees and ensures copy operations stay within declared boundaries, making the file propagation step deterministic in scope.

Together these modules remove environmental non-determinism (missing tools, duplicate PATH entries), config non-determinism (destructive overwrites), and filesystem non-determinism (symlink escapes) from the workflow setup path.

---

## Out-of-Partition References

The following files outside `src/lib/` are direct consumers that wire these utilities into the workflow runtime:

| File | Import from lib | Purpose |
|---|---|---|
| `src/sdk/runtime/tmux.ts:10` | `requiredMuxBinaryCandidatesForPlatform` | `getMuxBinary()` iterates the platform-specific candidates list to locate and cache the mux binary used by all tmux session/pane operations. |
| `src/services/system/auto-sync.ts:36` | Multiple spawn exports | Orchestrates the update pipeline using `ToolingStep` / `collectFailures` and calls `ensureTmuxInstalled`, `upgradeBun`, `upgradeGlobalToolPackages`. |
| `src/commands/cli/chat/index.ts:46` | `ensureTmuxInstalled` | Pre-flight check before starting a chat session. |
| `src/services/system/copy.ts:14` | `assertPathWithinRoot`, `assertRealPathWithinRoot`, `isPathWithinRoot` | Guards every source/dest path in `copyDirInternal` and in `copySymlinkAsFile`; `isPathWithinRoot` also powers the `isPathSafe` helper exported from copy.ts. |
| `src/services/system/agents.ts:28` | `createCommonIgnoreFilter` | Passes the filter as `ignoreFilter` in `CopyOptions` when copying agent config directories. |
| `src/services/system/skills.ts:11` | `createCommonIgnoreFilter` | Same pattern for the skills copy operation. |
| `src/services/config/atomic-global-config.ts:6,7` | `syncJsonFile`, `createCommonIgnoreFilter` | Drives global config sync (Claude, OpenCode, Copilot settings files) using the merge-or-copy pattern with common-ignore filtering. |
| `src/commands/cli/init/onboarding.ts:5` | `syncJsonFile` | Drives per-project onboarding config sync. |

The partition notes reference `src/sdk/runtime/executor.ts` and `src/sdk/runtime/status-writer.ts` as significant runtime files. Neither directly imports from `src/lib/`; they interact with the lib layer transitively through `src/sdk/runtime/tmux.ts` (which uses `spawn.ts`) and through `src/services/system/` (which uses all four lib modules).

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Deterministic Workflows in Atomic — Partition 10 (`src/lib/`)

## Overview

Atomic's deterministic workflow system ensures reproducible execution across re-entries and distributed execution environments. The `src/lib/` partition contains foundational utilities that support determinism through path safety, configuration merging, and command spawning.

---

## Pattern Examples

### Pattern 1: Deterministic Run Identity Generation
**Where:** `src/sdk/runtime/executor.ts:174-176`
**What:** Generates an 8-character hex session ID from `crypto.randomUUID()` to uniquely identify workflow runs.

```typescript
function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}
```

**How it enables determinism:**
- Each workflow run gets a unique, stable ID (`workflowRunId`)
- The ID is embedded in the tmux session name: `atomic-wf-${agent}-${definition.name}-${workflowRunId}`
- The ID becomes the directory name for storing session artifacts: `~/.atomic/sessions/<workflowRunId>/`
- All subsequent state writes reference this stable root, making output reproducible across re-entry

**Call-sites:**
- `src/sdk/runtime/executor.ts:498` — Generates `workflowRunId` at workflow start
- `src/sdk/runtime/executor.ts:667` — Generates `sessionId` for each session spawn
- `src/commands/cli/chat/index.ts` — Same pattern for chat sessions

---

### Pattern 2: Environment Variable Determinism (Re-entry Protocol)
**Where:** `src/sdk/runtime/executor.ts:503-541`
**What:** Writes launcher script with `ATOMIC_ORCHESTRATOR_MODE=1` and required env vars so re-executed entrypoint can detect orchestrator context.

```typescript
// Launcher script template (shell version)
[
  "#!/bin/bash",
  `cd "${escBash(projectRoot)}"`,
  `export ATOMIC_WF_ID="${escBash(workflowRunId)}"`,
  `export ATOMIC_WF_TMUX="${escBash(tmuxSessionName)}"`,
  `export ATOMIC_WF_AGENT="${escBash(agent)}"`,
  `export ATOMIC_WF_INPUTS="${escBash(inputsB64)}"`,
  `export ATOMIC_ORCHESTRATOR_MODE="1"`,
  `export ATOMIC_WF_KEY="${escBash(workflowKey)}"`,
  `export ATOMIC_WF_CWD="${escBash(projectRoot)}"`,
  `bun run "${escBash(entrypointFile)}" 2>"${escBash(logPath)}"`,
].join("\n");
```

**How it enables determinism:**
- When the orchestrator pane re-executes the user's entrypoint file, it passes the same `ATOMIC_WF_ID` (the workflow run ID)
- The entrypoint detects `ATOMIC_ORCHESTRATOR_MODE === "1"` and calls `runOrchestrator(definition)` instead of user code
- Inputs are base64-encoded JSON so multiline values survive shell escaping without transformation
- All sessions spawned in the same workflow run see the same `ATOMIC_WF_ID`, creating a stable execution context

**Related validation:**
- `src/sdk/runtime/executor-env.ts:17-45` — Validates required orchestrator env vars on re-entry

---

### Pattern 3: Session Directory Hierarchy Determinism
**Where:** `src/sdk/runtime/executor.ts:500-501, 1068-1070`
**What:** Organizes session outputs into stable directory trees keyed by workflow run ID and session identity.

```typescript
// Root directory for the workflow run
const sessionsBaseDir = join(getSessionsBaseDir(), workflowRunId);
await ensureDir(sessionsBaseDir);

// Per-session directory (name + sessionId for uniqueness)
const sessionDirName = `${name}-${sessionId}`;
const sessionDir = join(shared.sessionsBaseDir, sessionDirName);
await ensureDir(sessionDir);

// Session outputs write to fixed paths
const messagesPath = join(sessionDir, "messages.json");
const inboxPath = join(sessionDir, "inbox.md");
const metadataPath = join(sessionDir, "metadata.json");
```

**How it enables determinism:**
- Same `workflowRunId` → same session directory path on every run
- Session ID is generated once per spawn (from `generateId()`)
- All outputs (messages, metadata, transcripts) write to predictable paths
- Multiple runs with different inputs can coexist without clobbering: `~/.atomic/sessions/<wfId>/<sessionName>-<sessionId>/`
- Readers of session artifacts always know where to look

**Transcript storage:**
- `inbox.md` — Readable markdown transcript of user/agent interaction
- `messages.json` — Structured message history (JSON JSONL format)
- `metadata.json` — Session metadata (timestamps, agent type, etc.)

---

### Pattern 4: Workflow Status Snapshot (Immutable Audit Trail)
**Where:** `src/sdk/runtime/status-writer.ts:99-127`
**What:** Builds a versioned snapshot of workflow state and writes it atomically to disk.

```typescript
export function buildSnapshot(
  input: StatusWriterInputs,
  now: () => Date = () => new Date(),
): WorkflowStatusSnapshot {
  return {
    schemaVersion: 1,
    workflowRunId: input.workflowRunId,
    tmuxSession: input.tmuxSession,
    workflowName: input.workflowName,
    agent: input.agent,
    prompt: input.prompt,
    overall: deriveOverallStatus({
      sessions: input.sessions,
      completionReached: input.completionReached,
      fatalError: input.fatalError,
    }),
    completionReached: input.completionReached,
    fatalError: input.fatalError,
    updatedAt: now().toISOString(),
    sessions: input.sessions.map((s) => ({
      name: s.name,
      status: s.status,
      parents: [...s.parents],
      ...(s.error !== undefined ? { error: s.error } : {}),
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    })),
  };
}
```

**How it enables determinism:**
- Every state change writes a fresh snapshot to `~/.atomic/sessions/<workflowRunId>/status.json`
- Snapshot is atomic: write to `.tmp-<pid>` then rename (readers never see partial JSON)
- Schema version field allows future readers to stay backward-compatible
- Out-of-process consumers (e.g., `atomic workflow status`) read snapshots instead of IPC-ing into the orchestrator
- Snapshots create an immutable audit trail of the workflow's execution path
- `updatedAt` is ISO-8601 formatted for human readability and sorting

**State precedence (deterministic rollup):**
- Error (highest priority)
- Needs review (awaiting human input)
- Completed (banner reached, no errors)
- In progress (default)

---

### Pattern 5: JSON File Merge Without Clobbering
**Where:** `src/lib/merge.ts:32-65`
**What:** Merges source JSON into destination, preserving destination keys while selectively adding/updating source keys.

```typescript
export async function mergeJsonFile(
  srcPath: string,
  destPath: string,
  excludeKeys: readonly string[] = [],
): Promise<void> {
  if (resolve(srcPath) === resolve(destPath)) {
    return;
  }

  const [rawSrcConfig, destConfig] = await Promise.all([
    Bun.file(srcPath).json() as Promise<McpConfig>,
    Bun.file(destPath).json() as Promise<McpConfig>,
  ]);

  const srcConfig = stripKeys(rawSrcConfig, excludeKeys);

  // Top-level merge: destination wins by default
  const mergedConfig: McpConfig = {
    ...destConfig,
    ...srcConfig,
  };

  // Server maps merged individually to preserve user's entries
  for (const key of SERVER_MAP_KEYS) {
    const dst = destConfig[key] as Record<string, unknown> | undefined;
    const src = srcConfig[key] as Record<string, unknown> | undefined;
    if (dst || src) {
      mergedConfig[key] = { ...dst, ...src };
    }
  }

  await Bun.write(destPath, JSON.stringify(mergedConfig, null, 2) + "\n");
}
```

**How it enables determinism:**
- CLI-managed config updates don't overwrite user customizations
- Server maps (MCP servers, LSP servers) are merged entry-by-entry
- Excluded keys are stripped before merging, so they never propagate
- Used by global/local config sync to avoid destroying user settings
- Result is always normalized JSON with consistent formatting

---

### Pattern 6: Root Path Safety Validation
**Where:** `src/lib/path-root-guard.ts:9-21, 23-37`
**What:** Ensures paths stay within a boundary; prevents traversal attacks.

```typescript
export function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  return isSubPath(resolve(rootPath), resolve(candidatePath));
}

export async function assertRealPathWithinRoot(
  rootPath: string,
  candidatePath: string,
  label: string,
): Promise<string> {
  const [resolvedRootPath, resolvedCandidatePath] = await Promise.all([
    realpath(rootPath),
    realpath(candidatePath),
  ]);

  if (!isSubPath(resolvedRootPath, resolvedCandidatePath)) {
    throw new Error(`${label} resolves outside allowed root: ${candidatePath}`);
  }

  return resolvedCandidatePath;
}
```

**How it enables determinism:**
- Session directories are guaranteed to live under `~/.atomic/sessions/<workflowRunId>/`
- Symlink resolution prevents directory traversal from escaping the session root
- Async `realpath()` resolves actual paths before validation
- Safe to write outputs from untrusted workflows without risk of clobbering system files
- Deterministic because the same workflow run always validates within the same root

---

### Pattern 7: Cross-Platform Command Spawning
**Where:** `src/lib/spawn.ts:37-76, 81-91`
**What:** Async wrapper around `Bun.spawn` that collects stdout/stderr separately and handles platform differences.

```typescript
export async function runCommand(cmd: string[], options?: RunCommandOptions): Promise<SpawnResult> {
  try {
    if (options?.inherit) {
      const proc = Bun.spawn({
        cmd,
        stdout: "inherit",
        stderr: "inherit",
        env: process.env,
      });
      const exitCode = await proc.exited;
      return { success: exitCode === 0, details: "" };
    }

    const proc = Bun.spawn({
      cmd,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    const [stderr, stdout, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    const trimmedStdout = stdout.trim();
    const trimmedStderr = stderr.trim();
    return {
      success: exitCode === 0,
      details: trimmedStderr.length > 0 ? trimmedStderr : trimmedStdout,
      stdout: trimmedStdout,
      stderr: trimmedStderr,
    };
  } catch (error) {
    return {
      success: false,
      details: error instanceof Error ? error.message : String(error),
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

export function prependPath(directory: string): void {
  const pathDelimiter = process.platform === "win32" ? ";" : ":";
  const currentPath = process.env.PATH ?? "";
  const entries = currentPath.split(pathDelimiter);
  const alreadyPresent = process.platform === "win32"
    ? entries.some((entry) => entry.toLowerCase() === directory.toLowerCase())
    : entries.includes(directory);
  if (!alreadyPresent) {
    process.env.PATH = directory + pathDelimiter + currentPath;
  }
}
```

**How it enables determinism:**
- Consistent error handling across platforms (WIN32/Unix delimiter differences)
- Never returns thrown exceptions; always wraps in SpawnResult struct
- Keeps stdout and stderr separate, so callers see exactly what happened
- Return structure is deterministic: `{ success, details, stdout?, stderr? }`
- Used by ensureTmuxInstalled, upgradeBun, etc. to ensure repeatable setup

**Test examples:**
- `src/lib/spawn.test.ts:92-108` — Verifies stdout/stderr separation
- `src/lib/spawn.test.ts:81-90` — Ensures no duplicate PATH entries
- `src/lib/spawn.test.ts:29-43` — Tests command resolution from modified PATH

---

### Pattern 8: Common Ignore Filter (Deterministic File Copying)
**Where:** `src/lib/common-ignore.ts:19-46`
**What:** Pre-loads gitignore patterns so agent config copy operations skip known noise.

```typescript
const COMMON_IGNORE_PATTERNS: readonly string[] = [
  // macOS
  ".DS_Store",
  "__MACOSX/",
  "._*",

  // Windows
  "Thumbs.db",

  // Dependencies
  "node_modules/",

  // Lockfiles
  "bun.lock",

  // Logs
  "*.log",
];

export function createCommonIgnoreFilter(): Ignore {
  return ignore().add(COMMON_IGNORE_PATTERNS);
}
```

**How it enables determinism:**
- Config copy operations never include OS artifacts (`.DS_Store`, `Thumbs.db`)
- `node_modules/` and lockfiles are consistently excluded
- Agent-specific excludes only need domain-specific entries
- Same ignore filter on every run → same copied config
- Used by `syncJsonFile()` to ensure reproducible global/local config sync

---

## Synthesis: How Atomic Ensures Determinism

**Identity anchoring:**
- Every workflow run receives a cryptographically random but stable ID via `generateId()`
- This ID becomes the root of all session state: `~/.atomic/sessions/<workflowRunId>/`
- Re-entry is detected via `ATOMIC_ORCHESTRATOR_MODE=1` env var, so the same workflow can be re-executed with the same ID

**State immutability:**
- Status snapshots are written atomically (write-then-rename) with schema versioning
- Session transcripts (messages.json, inbox.md) are appended to, not replaced
- Path safety validation prevents outputs from escaping the session directory

**Reproducible configuration:**
- JSON merges preserve user customizations while updating CLI-managed sections
- Common ignore patterns ensure the same files are always copied
- Environment variables for inputs (base64-encoded JSON) survive shell escaping intact

**Deterministic spawning:**
- Platform-aware command execution with consistent error handling
- PATH manipulation is idempotent (no duplicate entries)
- Cross-platform differences (Windows semicolon vs. Unix colon) are handled internally

Together, these patterns create a system where the same workflow, run multiple times or across different machines, produces reproducible output artifacts and state that can be read, replayed, or resumed at any point.

## External References
<!-- Source: codebase-online-researcher sub-agent -->
# Online Research: How Atomic's Deterministic Workflows Work (src/lib/)

**Decision: no external research applicable.**

## Justification

The five files in `src/lib/` are purely internal utility modules. None of them contain or expose the "deterministic workflow" abstraction itself; they are low-level helpers that *support* whatever higher-level workflow engine exists elsewhere in the codebase. The question of how deterministic workflows work is answered entirely by reading the source, not by consulting external library docs.

### What each file actually does

| File | Role |
|---|---|
| `spawn.ts` | Thin async wrapper around `Bun.spawn`. Provides `runCommand` (pipe or inherit stdout/stderr), PATH-mutation helpers (`prependPath`, `prependPathIfDirectory`), platform-aware mux-binary detection, and step-failure collection (`collectFailures`). Also contains the installers for tmux/psmux, bun, and global npm tool packages. |
| `spawn.test.ts` | Unit tests for the PATH helpers and `runCommand` in `spawn.ts`. Verifies dedup of PATH entries, stream separation (stdout vs stderr kept separate), platform-specific mux-binary requirements, and psmux asset naming. |
| `merge.ts` | JSON config merge/sync utilities. `mergeJsonFile` performs a shallow spread merge of two JSON files, with special-case deep-merge for named-object maps (`mcpServers`, `servers`, `lspServers`). `syncJsonFile` wraps it with a copy-or-merge policy and optional key exclusion. Used when onboarding a project or syncing global agent configs. |
| `common-ignore.ts` | Factory for an `ignore`-package filter pre-loaded with common noise patterns (`.DS_Store`, `node_modules/`, `bun.lock`, `*.log`, etc.). Returned `Ignore` instances are passed as `ignoreFilter` in file-copy operations so agent-specific exclude lists stay focused. |
| `path-root-guard.ts` | Path-traversal safety utilities. `isPathWithinRoot` / `assertPathWithinRoot` use `node:path.relative` to confirm a candidate path does not escape a root directory. `assertRealPathWithinRoot` additionally resolves symlinks via `node:fs/promises.realpath` before the check, closing the symlink-escape attack surface. |

### Why external research is not needed

- **`Bun.spawn`**: The usage here is trivially `{ cmd, stdout: "pipe"/"inherit", stderr: "pipe"/"inherit", env: process.env }`. There is nothing version-specific or semantically subtle — the code reads exit codes and drains streams in the obvious way. The test file confirms the expected behavior directly.
- **`ignore` npm package**: It is used only to call `ignore().add(patterns)` and receive an `Ignore` filter object. No edge-case gitignore semantics are exercised; the patterns list is straightforward. Consulting the `ignore` docs would add no insight.
- **`node:crypto`**: Not referenced at all in `src/lib/`. The scope note was speculative; crypto does not appear in any of the five files.

### What "deterministic workflows" would actually require

The `src/lib/` files are infrastructure primitives (process spawning, config merging, path safety, noise filtering). The determinism of Atomic's workflows — i.e. the ordered, reproducible execution of agent steps — is implemented by the workflow engine that *calls* these utilities, not by the utilities themselves. That engine lives outside `src/lib/` (likely in `src/services/` or a dedicated workflow module) and is not covered by this scope.

**Conclusion**: The question "how does Atomic's deterministic workflow work?" is not answered by `src/lib/` alone. These files provide the building blocks (spawn a process safely, merge a config file, guard path traversal, filter noise) that the workflow engine relies on. No external library documentation fetch is needed or useful here.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
