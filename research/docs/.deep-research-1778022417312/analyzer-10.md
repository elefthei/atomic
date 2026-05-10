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
