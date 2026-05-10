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
