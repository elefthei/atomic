# Partition 6 of 16 — Findings

## Scope
`src/services/` (18 files, 3,117 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# File Locator: Deterministic Workflows in `src/services/`

## Implementation

- `src/services/config/definitions.ts` — Agent configuration definitions (Claude, OpenCode, Copilot) with hardcoded `env_vars` and `chat_flags` for deterministic spawning
- `src/services/config/atomic-config.ts` — Reads/writes `.atomic/settings.json` config with provider overrides for `envVars` and `chatFlags`; implements merge semantics with global + local precedence (line 159-165)
- `src/services/config/scm-sync.ts` — SCM-driven MCP server enable/disable state sync that runs on every `atomic chat` / `atomic workflow` startup (line 171)
- `src/services/config/settings.ts` — Persists user settings (model selection, telemetry, SCM provider) in `~/.atomic/settings.json`; resolved per-session
- `src/services/config/additional-instructions.ts` — Seeds and resolves `.atomic/AGENTS.md` instructions (global fallback or project-local) for every agent invocation
- `src/services/system/agents.ts` — Syncs bundled agent configurations from package into provider-native global roots (`~/.claude`, `~/.opencode`, `~/.copilot`)
- `src/services/system/auto-sync.ts` — Lazy first-run sync handler that runs on CLI startup; writes version marker to `~/.atomic/.synced-version` for deterministic tooling setup
- `src/services/system/detect.ts` — Detects system environment (platform, color support, terminal type) for consistent agent spawning behavior
- `src/services/system/file-lock.ts` — File-based locking mechanism (line 66-77) with process tracking for concurrent workflow execution safety
- `src/services/system/copy.ts` — File and directory copying utilities with ignore filters used by agent sync operations

## Types / Interfaces

- `src/services/config/definitions.ts:5-33` — `AgentConfig` interface defining `env_vars: Record<string, string>` and `chat_flags: string[]` for each agent
- `src/services/config/definitions.ts:110-113` — `ProviderOverrides` interface for user-level `envVars` and `chatFlags` overrides
- `src/services/config/atomic-config.ts:30-37` — `AtomicConfig` interface with `scm` provider selection and `providers` overrides map
- `src/services/system/file-lock.ts:18-44` — `LockInfo` and `LockResult` interfaces for concurrent access control

## Configuration

- `src/services/config/settings-schema.ts` — References JSON schema URL for `.atomic/settings.json` validation
- `.atomic/settings.json` (local) and `~/.atomic/settings.json` (global) — Primary config files storing model selection, SCM provider, and provider-specific flags/env vars
- `.atomic/AGENTS.md` (local) or `~/.atomic/AGENTS.md` (global) — Markdown file containing additional instructions seeded to every agent spawn
- `~/.atomic/.synced-version` — Version marker used to detect fresh installs/upgrades and trigger lazy setup of global tooling

## Notable Clusters

- `src/services/config/` — 9 files managing layered configuration resolution (definitions, atomic-config, settings, scm-sync, additional-instructions, config-path, settings-schema)
- `src/services/system/` — 9 files implementing system-level determinism: agent syncing (agents.ts, auto-sync.ts), environment detection (detect.ts), locking (file-lock.ts), and auth (auth.ts, auth.test.ts)

## Key Determinism Mechanisms

1. **Config Layering** (atomic-config.ts:159-165): Global + local settings merge with local precedence; consistent across sessions
2. **Environment Variables** (definitions.ts:12-13, atomic-config.ts:204-210): Hardcoded per-agent defaults merged with user overrides at spawn time
3. **Provider Overrides** (atomic-config.ts:113-136): ChatFlags replace entirely (deterministic override); envVars merge with later values winning
4. **Version-based Sync** (auto-sync.ts:89-119): Version marker (`~/.atomic/.synced-version`) gates one-time global setup on fresh installs/upgrades
5. **SCM-driven State** (scm-sync.ts:171-185): Reads atomic config on startup, synchronizes MCP server enable/disable state across agent configs
6. **File Locking** (file-lock.ts:77-114): Process-based locking with stale-lock detection prevents concurrent write collisions in multi-workflow scenarios
7. **Instructions Path Resolution** (additional-instructions.ts:123-140): Project-local or global `.atomic/AGENTS.md` resolved once and injected into every agent invocation

---

**Summary**: `src/services/` houses the determinism layer: configuration resolution (atomic-config, settings, definitions), agent templating (agents, auto-sync), and system-level consistency checks (file-lock, detect). Environment variables and chat flags are layered (hardcoded → user overrides), SCM state is synchronized at startup, and version markers gate idempotent global setup. File locking and additional instructions ensure consistent behavior across concurrent and sequential workflow executions.

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
### Files Analysed

- `src/services/config/definitions.ts`
- `src/services/config/atomic-config.ts`
- `src/services/config/scm-sync.ts`
- `src/services/config/additional-instructions.ts`
- `src/services/config/settings.ts`
- `src/services/system/agents.ts`
- `src/services/system/auto-sync.ts`
- `src/services/system/file-lock.ts`

---

### Per-File Notes

#### `src/services/config/definitions.ts`

- **Role:** Declares the static, hardcoded `AgentConfig` records and the `ProviderOverrides` interface that together define the deterministic spawning contract for each agent.
- **Key symbols:**
  - `AgentConfig` interface (`definitions.ts:5`) — fields: `cmd`, `chat_flags: string[]`, `env_vars: Record<string,string>`, `folder`, `onboarding_files`
  - `ProviderOverrides` interface (`definitions.ts:110`) — `chatFlags?: string[]`, `envVars?: Record<string,string>`
  - `AGENT_CONFIG` constant (`definitions.ts:38`) — concrete records for `claude`, `opencode`, `copilot`
  - `getAgentConfig(key)` (`definitions.ts:119`) — point-lookup into the constant map
  - `isValidAgent(key)` (`definitions.ts:115`) — runtime narrowing guard
- **Control flow:** No async logic. `AGENT_CONFIG` is a module-level constant evaluated once. `getAgentConfig` is a pure lookup with no branching.
- **Data flow:**
  - In: nothing at runtime (static literal)
  - Out: `AgentConfig` structs consumed by callers that spawn agents (e.g., `--allow-dangerously-skip-permissions` for claude at `definitions.ts:43`, `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` for opencode at `definitions.ts:75`, `COPILOT_ALLOW_ALL=true` for copilot at `definitions.ts:92`)
- **Dependencies:** None (pure types + literals)

---

#### `src/services/config/atomic-config.ts`

- **Role:** Reads, merges, and persists the two-tier (global + local) Atomic project config, and exposes `getProviderOverrides` for callers that need per-agent `chatFlags`/`envVars` at spawn time.
- **Key symbols:**
  - `AtomicConfig` interface (`atomic-config.ts:30`) — `version`, `scm: ScmProvider`, `providers: Partial<Record<AgentKey, ProviderOverrides>>`
  - `readAtomicConfig(projectDir)` (`atomic-config.ts:159`) — merges global then local; local wins
  - `saveAtomicConfig(projectDir, updates)` (`atomic-config.ts:170`) — writes only to local `.atomic/settings.json`
  - `getProviderOverrides(agentKey, projectDir)` (`atomic-config.ts:204`) — extracts a single agent's overrides for use at spawn
  - `mergeProviderOverrides(base, over)` (`atomic-config.ts:113`) — `chatFlags` fully replaced by `over`; `envVars` shallow-merged with `over` winning on conflict
  - `mergeConfigs(...configs)` (`atomic-config.ts:138`) — iterates config list left-to-right so later wins
- **Control flow:**
  - `readAtomicConfig`: reads `getLocalSettingsPath(projectDir)` then `getGlobalSettingsPath()` in parallel via sequential awaits; passes both through `pickAtomicConfig` → `mergeConfigs(globalConfig, localConfig)` at `atomic-config.ts:163-164`.
  - `getGlobalSettingsPath` honors `process.env.ATOMIC_SETTINGS_HOME ?? homedir()` at `atomic-config.ts:42-43`, enabling test redirection.
  - `saveAtomicConfig` reads existing local file, merges updates, stamps `version: 1`, and writes back (`atomic-config.ts:180-193`).
- **Data flow:**
  - In: `projectDir` string, JSON from disk
  - Out: `AtomicConfig | null` containing deterministic `scm` and `providers` overrides consumed by `syncScmMcpServers` and spawn helpers
- **Dependencies:** `./index.ts` (re-exports `AgentKey`, `ProviderOverrides`), `./settings-schema.ts` (schema URL), `../system/copy.ts` (`ensureDir`)

---

#### `src/services/config/scm-sync.ts`

- **Role:** Applies the user's `scm` selection from Atomic config to the on-disk agent config files (`.claude/settings.json`, `.opencode/opencode.json`) and synthesizes per-invocation Copilot CLI flags, ensuring MCP server enable/disable state is consistent on every startup.
- **Key symbols:**
  - `syncScmMcpServers(projectRoot)` (`scm-sync.ts:171`) — main entry; reads config, derives enabled server set, fans out to Claude + OpenCode sync in parallel
  - `syncClaudeSettings(projectRoot, enabled)` (`scm-sync.ts:97`) — rewrites `disabledMcpjsonServers` in `.claude/settings.json`
  - `syncOpencodeSettings(projectRoot, enabled)` (`scm-sync.ts:130`) — flips `mcp.<server>.enabled` booleans in `.opencode/opencode.json`
  - `copilotScmDisableFlags(scm)` (`scm-sync.ts:53`) — pure function; returns `--disable-mcp-server <name>` flag pairs for Copilot CLI invocation
  - `getCopilotScmDisableFlags(projectRoot)` (`scm-sync.ts:65`) — async wrapper that reads config then delegates to `copilotScmDisableFlags`
  - `enabledServersFor(scm)` (`scm-sync.ts:26`) — maps `ScmProvider` to the `Set<ScmMcpServer>` of servers that should be on
  - `COPILOT_DISABLE_BY_SCM` (`scm-sync.ts:39`) — static map of provider → servers to disable in Copilot CLI
- **Control flow:**
  - `syncScmMcpServers` wraps both sync operations in `try/catch` at `scm-sync.ts:171-184` — errors are swallowed so startup is never blocked.
  - `syncClaudeSettings` filters out all SCM server names from existing `disabledMcpjsonServers`, then appends those not in `enabled` set (`scm-sync.ts:113-117`). Skips write if arrays are equal (`scm-sync.ts:119`).
  - `syncOpencodeSettings` iterates `SCM_MCP_SERVERS`, finds each server object in `mcp`, sets `enabled` boolean, and writes only if `changed` (`scm-sync.ts:144-157`).
- **Data flow:**
  - In: `projectRoot` string → reads `AtomicConfig.scm` from `readAtomicConfig`
  - Out: mutated `.claude/settings.json` and `.opencode/opencode.json` on disk; `string[]` of Copilot flags
- **Dependencies:** `../system/copy.ts` (`pathExists`), `./atomic-config.ts` (`readAtomicConfig`, `ScmProvider`)

---

#### `src/services/config/additional-instructions.ts`

- **Role:** Seeds, resolves, and reconciles the `AGENTS.md` instruction file that is appended to every agent spawn, providing a consistent system-level prompt across all three providers.
- **Key symbols:**
  - `ADDITIONAL_INSTRUCTIONS` constant (`additional-instructions.ts:29`) — markdown string seeded to `~/.atomic/AGENTS.md` on first install
  - `resolveAdditionalInstructionsPath(projectRoot)` (`additional-instructions.ts:123`) — synchronous; returns project-local `.atomic/AGENTS.md` if it exists, else global path, else `undefined`
  - `resolveAdditionalInstructionsContent(projectRoot)` (`additional-instructions.ts:138`) — async; reads resolved path's text for SDK callers needing raw string injection
  - `seedGlobalAdditionalInstructions()` (`additional-instructions.ts:157`) — writes `~/.atomic/AGENTS.md` only if missing; called on every CLI start via `auto-sync.ts:95`
  - `reconcileOpencodeInstructions(projectRoot)` (`additional-instructions.ts:231`) — ensures resolved path appears in `.opencode/opencode.json`'s `instructions` array without duplicating or clobbering user entries
  - `buildAtomicOwnedMatcher(projectRoot)` (`additional-instructions.ts:172`) — builds a predicate matching only the two known Atomic-managed paths, used to surgically strip stale entries before re-injection
  - `sameInstructionMultiset(a, b)` (`additional-instructions.ts:191`) — order-independent array equality to avoid mtime-noisy rewrites
- **Control flow:**
  - `resolveAdditionalInstructionsPath` uses synchronous `existsSync` at `additional-instructions.ts:127` (intentional, called on hot path)
  - `reconcileOpencodeInstructions` reads JSON, strips atomic-owned entries, appends resolved path, compares with `sameInstructionMultiset`, and writes only if changed (`additional-instructions.ts:247-272`)
  - `homeRoot()` at `additional-instructions.ts:98` honors `process.env.ATOMIC_SETTINGS_HOME` for test isolation
- **Data flow:**
  - In: `projectRoot` string, on-disk `.opencode/opencode.json`
  - Out: written `~/.atomic/AGENTS.md` (seed), mutated `opencode.json` instructions array, resolved file path string or content string for callers
- **Dependencies:** `node:path`, `node:os`, `node:fs`, `node:fs/promises`

---

#### `src/services/config/settings.ts`

- **Role:** Persists and retrieves user-level global settings (`telemetryEnabled`, `scm`, `providers`) in `~/.atomic/settings.json`, with `ensureGlobalAtomicSettings` called at CLI startup to bootstrap the file.
- **Key symbols:**
  - `ensureGlobalAtomicSettings()` (`settings.ts:65`) — idempotent; creates `~/.atomic/settings.json` with `version: 1` if absent
  - `setScmProvider(scm)` (`settings.ts:95`) — writes SCM provider choice to global settings; consumed by `syncScmMcpServers` on subsequent startups
  - `setTelemetryEnabled(enabled)` (`settings.ts:78`) — writes telemetry flag
  - `globalSettingsPath()` (`settings.ts:34`) — honors `process.env.ATOMIC_SETTINGS_HOME ?? homedir()`
  - `AtomicSettings` interface (`settings.ts:20`) — mirrors `AtomicConfig` but lives in the global file layer
- **Control flow:**
  - Each setter reads existing settings via `loadSettingsFile`, mutates the field, then calls `writeGlobalSettings` which stamps `$schema` before writing
  - `ensureGlobalAtomicSettings` is best-effort; errors are `console.warn`'d at `settings.ts:72`, never thrown
- **Data flow:**
  - In: user choice (scm provider string, boolean)
  - Out: persisted `~/.atomic/settings.json` read on next startup by `readAtomicConfig`
- **Dependencies:** `./settings-schema.ts`, `../system/copy.ts`, `../../sdk/errors.ts`, `./definitions.ts`, `./atomic-config.ts`

---

#### `src/services/system/agents.ts`

- **Role:** Copies bundled agent definition files from the installed package directory into provider-native global config roots (`~/.claude`, `~/.opencode`, `~/.copilot`), establishing a deterministic baseline tooling state.
- **Key symbols:**
  - `installGlobalAgents()` (`agents.ts:62`) — iterates `AGENT_DIR_PAIRS`, copies each source dir to destination; also renames and copies `.github/lsp.json` → `~/.copilot/lsp-config.json`
  - `AGENT_DIR_PAIRS` (`agents.ts:51`) — static array mapping `.claude/agents` → `~/.claude/agents`, `.opencode/agents` → `~/.opencode/agents`, `.github/agents` → `~/.copilot/agents`
  - `packageRoot()` (`agents.ts:35`) — resolves three levels up from `import.meta.dir`
  - `homeRoot()` (`agents.ts:40`) — `process.env.ATOMIC_SETTINGS_HOME ?? homedir()`
- **Control flow:**
  - If ALL source directories are missing, throws an aggregated warning error at `agents.ts:82-84`; partial misses are non-fatal
  - `copyDir` is called with `createCommonIgnoreFilter()` to skip OS/editor noise files
- **Data flow:**
  - In: package filesystem layout
  - Out: files written to `~` global config directories; called by `auto-sync.ts` as one of its sequential steps
- **Dependencies:** `./copy.ts` (`copyDir`, `copyFile`, `ensureDir`, `pathExists`), `../../lib/common-ignore.ts`

---

#### `src/services/system/auto-sync.ts`

- **Role:** Lazy first-run and upgrade sync handler that runs on every CLI startup, comparing a version marker file against the bundled `VERSION` constant to decide whether to re-run global setup steps.
- **Key symbols:**
  - `autoSyncIfStale()` (`auto-sync.ts:89`) — main entry; reads `~/.atomic/.synced-version`, compares to `VERSION`, runs steps conditionally
  - `markSynced()` (`auto-sync.ts:60`) — writes current `VERSION` to the marker file; only called when all steps succeed
  - `isInstalledPackage()` (`auto-sync.ts:52`) — checks `import.meta.dir.includes("node_modules")` to skip sync in dev checkout
  - `silentStep(fn)` (`auto-sync.ts:71`) — wraps any async step, returns boolean success, swallows errors
  - `syncMarkerPath()` (`auto-sync.ts:42`) — `(ATOMIC_SETTINGS_HOME ?? homedir()) + "/.atomic/.synced-version"`
- **Control flow:**
  - `seedGlobalAdditionalInstructions` runs unconditionally outside the `isInstalledPackage` gate (`auto-sync.ts:95`) — even dev checkouts get the seed
  - After the gate, if `stored === VERSION && hasRequiredMuxBinary()` at `auto-sync.ts:105`, exits immediately (no-op)
  - If versions match but mux is missing, only `ensureTmuxInstalled` runs (`auto-sync.ts:107-108`)
  - If versions differ, all four steps run in parallel via `Promise.all` (`auto-sync.ts:119`): tmux install, agent sync, global tool package upgrade, global skills install
  - `markSynced()` called at `auto-sync.ts:123` only when `results.every(Boolean)`
- **Data flow:**
  - In: `VERSION` from `../../version.ts`, marker file from disk
  - Out: marker file updated on success; side effects via `installGlobalAgents`, `upgradeGlobalToolPackages`, `installGlobalSkills`, `seedGlobalAdditionalInstructions`
- **Dependencies:** `../../version.ts`, `../../lib/spawn.ts`, `./agents.ts`, `./skills.ts`, `../config/additional-instructions.ts`

---

#### `src/services/system/file-lock.ts`

- **Role:** Provides a process-aware file-based locking mechanism (`.lock` suffix files containing PID and metadata) for protecting concurrent writes to shared workflow state files.
- **Key symbols:**
  - `tryAcquireLock(filePath, sessionId?)` (`file-lock.ts:77`) — synchronous; checks for `.lock` file, validates holder PID via `process.kill(pid, 0)`, removes stale lock, writes new lock with `{ flag: "wx" }` to prevent races
  - `acquireLock(filePath, options)` (`file-lock.ts:143`) — async; retries `tryAcquireLock` every `LOCK_RETRY_INTERVAL_MS` (100ms) until `timeoutMs` (default 30s)
  - `releaseLock(filePath, options?)` (`file-lock.ts:174`) — reads lock to verify `holder.pid === process.pid` before unlinking, unless `force: true`
  - `withLock(filePath, fn, options)` (`file-lock.ts:213`) — acquire → execute fn → release in finally block
  - `cleanupStaleLocks(directory)` (`file-lock.ts:258`) — scans directory for `*.lock` files and removes those whose PID is dead
  - `LockInfo` interface (`file-lock.ts:22`) — `{ pid, sessionId?, acquiredAt, hostname? }`
  - `LockResult` interface (`file-lock.ts:35`) — `{ acquired, lockPath, error?, holder? }`
  - `isProcessAlive(pid)` (`file-lock.ts:241`) — sends `signal 0` via `process.kill`
- **Control flow:**
  - `tryAcquireLock` uses `writeFileSync` with `{ flag: "wx" }` at `file-lock.ts:124` for atomic create-exclusive semantics
  - Stale lock detection: if lock file exists and `isProcessAlive(holder.pid)` is false at `file-lock.ts:87`, the stale lock is removed before proceeding
- **Data flow:**
  - In: `filePath` string, optional `sessionId`
  - Out: `LockResult` struct; side effect is a `.lock` file on disk tracking ownership
- **Dependencies:** `node:fs`, `node:path`, `./copy.ts` (`ensureDirSync`)

---

### Cross-Cutting Synthesis

Atomic's deterministic workflow execution in `src/services/` operates through a three-phase sequence that fires on every `atomic chat` / `atomic workflow` startup.

**Phase 1 — Bootstrap (auto-sync.ts):** `autoSyncIfStale` compares `VERSION` against `~/.atomic/.synced-version`. On a mismatch it runs four idempotent setup steps in parallel: mux install, bundled agent copy (`agents.ts:installGlobalAgents`), global tool package upgrade, and global skills sync. The marker is written only on full success, guaranteeing retries on partial failure. `seedGlobalAdditionalInstructions` runs on every start regardless of version match.

**Phase 2 — Config resolution (atomic-config.ts + settings.ts):** `readAtomicConfig` merges global `~/.atomic/settings.json` with project-local `.atomic/settings.json`, with local winning. For each agent, `getProviderOverrides` extracts `chatFlags` (replacement) and `envVars` (additive merge) that layer on top of `definitions.ts`'s hardcoded `AGENT_CONFIG` defaults.

**Phase 3 — State sync (scm-sync.ts + additional-instructions.ts):** `syncScmMcpServers` writes deterministic MCP server enable/disable state into `.claude/settings.json` and `.opencode/opencode.json` based on the resolved `scm` field. `reconcileOpencodeInstructions` ensures the correct `AGENTS.md` path is wired into OpenCode's `instructions` array. Both operations are idempotent and skip writes when state is already correct.

**Concurrency safety** is provided by `file-lock.ts`'s PID-aware lock files with stale-lock cleanup, protecting shared files during concurrent workflow sessions.

---

### Out-of-Partition References

- `src/version.ts` — exports `VERSION` constant consumed by `auto-sync.ts:105` for version-marker comparison
- `src/lib/spawn.ts` — exports `hasRequiredMuxBinary`, `ensureTmuxInstalled`, `upgradeGlobalToolPackages` called by `auto-sync.ts`
- `src/lib/common-ignore.ts` — exports `createCommonIgnoreFilter` used by `agents.ts:76` when copying agent dirs
- `src/services/system/skills.ts` — exports `installGlobalSkills` called as a sync step in `auto-sync.ts:113`
- `src/sdk/errors.ts` — exports `errorMessage` used in `settings.ts:16` for safe error string extraction
- `src/services/config/settings-schema.ts` — exports `SETTINGS_SCHEMA_URL` stamped into every written settings file

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Deterministic Workflows in Atomic — src/services/ Patterns

## Overview
Atomic's deterministic workflows are powered by a configuration cascade system that ensures predictable, repeatable execution. The `src/services/` partition implements three key patterns: environment-aware path resolution, hierarchical config merging, and version-based state synchronization.

---

## Patterns Found

#### Pattern 1: Environment-Aware Home Directory Resolution
**Where:** `src/services/config/atomic-config.ts:41-44`
**What:** Resolves global settings path with `ATOMIC_SETTINGS_HOME` override for testability, ensuring deterministic path resolution across environments.

```typescript
function getGlobalSettingsPath(): string {
  const home = process.env.ATOMIC_SETTINGS_HOME ?? homedir();
  return join(home, SETTINGS_DIR, SETTINGS_FILENAME);
}
```

**Variations / call-sites:**
- `src/services/config/settings.ts:34-37` — mirrors this pattern for settings file paths
- `src/services/system/skills.ts:24-26` — used for skill discovery paths
- `src/services/system/agents.ts:40-42` — used for agent config directories
- `src/services/config/additional-instructions.ts:97-99` — resolves AGENTS.md global seed

**Key aspect:** The fallback to `homedir()` ensures deterministic behavior when the environment variable is unset, while allowing tests to redirect via `ATOMIC_SETTINGS_HOME`.

---

#### Pattern 2: Hierarchical Config Merging with Local Override Precedence
**Where:** `src/services/config/atomic-config.ts:138-164`
**What:** Implements a three-stage merge pipeline: read global config, read local config, merge with local taking precedence. Ensures deterministic resolution order.

```typescript
function mergeConfigs(...configs: Array<AtomicConfig | null>): AtomicConfig | null {
  const merged: AtomicConfig = {};
  for (const config of configs) {
    if (!config) continue;
    if (config.version !== undefined) merged.version = config.version;
    if (config.scm !== undefined) merged.scm = config.scm;

    if (config.providers) {
      if (!merged.providers) merged.providers = {};
      for (const [key, overrides] of Object.entries(config.providers)) {
        const agentKey = key as AgentKey;
        merged.providers[agentKey] = mergeProviderOverrides(merged.providers[agentKey], overrides);
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

export async function readAtomicConfig(projectDir: string): Promise<AtomicConfig | null> {
  const localConfig = pickAtomicConfig(await readJsonFile(getLocalSettingsPath(projectDir)));
  const globalConfig = pickAtomicConfig(await readJsonFile(getGlobalSettingsPath()));

  // global < local settings
  return mergeConfigs(globalConfig, localConfig);
}
```

**Variations / call-sites:**
- `src/services/config/scm-sync.ts:173` — used to resolve SCM provider selection
- `src/services/config/scm-sync.ts:69` — used to compute Copilot disable flags

**Key aspect:** The merge order (global then local) is deterministic; the comment `// global < local settings` documents precedence explicitly.

---

#### Pattern 3: Provider Override Merging with Conflict Resolution
**Where:** `src/services/config/atomic-config.ts:113-136`
**What:** Merges per-provider overrides with deterministic conflict resolution: chatFlags replace entirely, envVars merge with later values winning.

```typescript
function mergeProviderOverrides(
  base: ProviderOverrides | undefined,
  over: ProviderOverrides | undefined,
): ProviderOverrides | undefined {
  if (!base && !over) return undefined;
  if (!base) return over;
  if (!over) return base;

  const result: ProviderOverrides = {};

  // chatFlags: later replaces earlier entirely
  if (over.chatFlags !== undefined) {
    result.chatFlags = over.chatFlags;
  } else if (base.chatFlags !== undefined) {
    result.chatFlags = base.chatFlags;
  }

  // envVars: merged, later wins on conflict
  if (base.envVars || over.envVars) {
    result.envVars = { ...base.envVars, ...over.envVars };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
```

**Key aspect:** Different merge semantics per field: chatFlags are replaced atomically, envVars are merged. This determinism is documented inline.

---

#### Pattern 4: Version-Based State Marker Synchronization
**Where:** `src/services/system/auto-sync.ts:41-126`
**What:** Compares bundled `VERSION` constant against `~/.atomic/.synced-version` marker file; on mismatch, runs idempotent setup steps in parallel, writes marker only on all-succeed.

```typescript
function syncMarkerPath(): string {
  const home = process.env.ATOMIC_SETTINGS_HOME ?? homedir();
  return join(home, ".atomic", ".synced-version");
}

export async function autoSyncIfStale(): Promise<void> {
  await silentStep(seedGlobalAdditionalInstructions);

  if (!isInstalledPackage()) return;

  let stored = "";
  const marker = Bun.file(syncMarkerPath());
  if (await marker.exists()) {
    stored = (await marker.text()).trim();
  }

  if (stored === VERSION && hasRequiredMuxBinary()) return;

  const steps = stored === VERSION
    ? [silentStep(() => ensureTmuxInstalled({ quiet: true }))]
    : [
        silentStep(() => ensureTmuxInstalled({ quiet: true })),
        silentStep(installGlobalAgents),
        silentStep(upgradeGlobalToolPackages),
        silentStep(installGlobalSkills),
      ];

  const results = await Promise.all(steps);
  const allOk = results.every(Boolean);

  if (allOk) {
    await markSynced();
  }
}

export async function markSynced(): Promise<void> {
  try {
    await Bun.write(syncMarkerPath(), VERSION);
  } catch {
    // Swallow — see docstring.
  }
}
```

**Key aspect:** Deterministic branching: if marker matches VERSION, skip full setup. If not, run all idempotent steps. Marker only written when all steps succeed, ensuring retry-safe state.

---

#### Pattern 5: Source-Control-Driven Config Synchronization
**Where:** `src/services/config/scm-sync.ts:25-74, 171-185`
**What:** Maps `scm` config value to deterministic enable/disable rules for MCP servers. Pure function `enabledServersFor()` plus idempotent `syncScmMcpServers()` orchestrator.

```typescript
function enabledServersFor(scm: ScmProvider): Set<ScmMcpServer> {
  if (scm === "github") return new Set(["github"]);
  if (scm === "azure-devops") return new Set(["azure-devops"]);
  return new Set();
}

const COPILOT_DISABLE_BY_SCM: Record<ScmProvider, readonly string[]> = {
  github: ["github", "azure-devops"],
  "azure-devops": ["github", "github-mcp-server"],
  sapling: ["github", "azure-devops", "github-mcp-server"],
};

export function copilotScmDisableFlags(scm: ScmProvider | undefined): string[] {
  if (!scm) return [];
  const names = COPILOT_DISABLE_BY_SCM[scm] ?? [];
  const flags: string[] = [];
  for (const name of names) flags.push("--disable-mcp-server", name);
  return flags;
}

export async function syncScmMcpServers(projectRoot: string): Promise<void> {
  try {
    const config = await readAtomicConfig(projectRoot);
    const scm = config?.scm;
    if (!scm) return;

    const enabled = enabledServersFor(scm);
    await Promise.all([
      syncClaudeSettings(projectRoot, enabled),
      syncOpencodeSettings(projectRoot, enabled),
    ]);
  } catch {
    // Best-effort: never block startup on a config write failure.
  }
}
```

**Variations / call-sites:**
- `src/services/config/scm-sync.ts:65-74` — wrapper that reads config then calls pure function
- Deterministic flag generation ensures same scm value always produces same CLI flags

**Key aspect:** Pure mapping function plus side-effect orchestrator. Errors swallowed so malformed configs don't block workflow startup.

---

#### Pattern 6: Type-Safe JSON Parsing with Validation
**Where:** `src/services/config/atomic-config.ts:50-106`
**What:** Three-stage JSON validation: parse, type-check, extract typed fields. Ensures only well-typed configs propagate.

```typescript
async function readJsonFile(path: string): Promise<JsonRecord | null> {
  try {
    return await Bun.file(path).json() as JsonRecord;
  } catch {
    return null;
  }
}

function pickAtomicConfig(record: JsonRecord | null): AtomicConfig | null {
  if (!record) return null;

  const config: AtomicConfig = {};
  const version = record.version;

  if (typeof version === "number") config.version = version;
  if (isScmProvider(record.scm)) config.scm = record.scm;

  const providers = pickProviders(record.providers);
  if (providers) config.providers = providers;

  return Object.keys(config).length > 0 ? config : null;
}

function pickProviders(raw: unknown): Partial<Record<AgentKey, ProviderOverrides>> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const result: Partial<Record<AgentKey, ProviderOverrides>> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!VALID_AGENT_KEYS.has(key)) continue;
    const overrides = pickProviderOverrides(value);
    if (overrides) result[key as AgentKey] = overrides;
  }

  return Object.keys(result).length > 0 ? result : null;
}
```

**Key aspect:** Invalid fields silently drop; only well-formed entries contribute to final config. Determinism ensured by validating before use.

---

#### Pattern 7: Deterministic Agent Configuration Schema
**Where:** `src/services/config/definitions.ts:38-100`
**What:** Hard-coded agent config schema with deterministic field order and fixed environment variables. Every workflow invocation reads the same constants.

```typescript
export const AGENT_CONFIG: Record<AgentKey, AgentConfig> = {
  claude: {
    name: "Claude Code",
    cmd: "claude",
    chat_flags: [
      "--allow-dangerously-skip-permissions",
      "--dangerously-skip-permissions",
    ],
    env_vars: {},
    folder: ".claude",
    install_url: "https://code.claude.com/docs/en/setup",
    exclude: [],
    onboarding_files: [
      {
        source: ".mcp.json",
        destination: ".mcp.json",
        merge: true,
      },
      // ... more files
    ],
  },
  opencode: {
    name: "OpenCode",
    cmd: "opencode",
    chat_flags: [],
    env_vars: { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
    folder: ".opencode",
    // ...
  },
  copilot: {
    name: "GitHub Copilot CLI",
    cmd: "copilot",
    chat_flags: ["--add-dir", ".", "--yolo", "--experimental"],
    env_vars: {
      COPILOT_ALLOW_ALL: "true",
    },
    // ...
  },
};
```

**Variations / call-sites:**
- `src/services/config/definitions.ts:115-125` — getter functions `getAgentConfig()`, `getAgentKeys()`
- All agent spawning code reads from this schema

**Key aspect:** Single source of truth for agent configuration. Determinism guaranteed by bundled constants.

---

## Summary

Atomic's deterministic workflows are implemented through seven interconnected patterns in `src/services/`:

1. **Environment-aware path resolution** ensures the same config location is found across dev/test/prod
2. **Hierarchical config merging** with explicit precedence (`global < local`) guarantees consistent override behavior
3. **Provider override merging** with documented conflict resolution (replace vs. merge) prevents ambiguity
4. **Version-based synchronization** with marker files ensures idempotent state updates across restarts
5. **Source-control-driven sync** maps SCM selections to deterministic MCP server enable/disable rules
6. **Type-safe validation** silently drops invalid fields, preventing malformed configs from propagating
7. **Hard-coded agent schemas** provide a single source of truth for environment variables and command flags

All patterns emphasize explicit ordering, documented precedence, idempotent operations, and graceful error handling (swallowing errors to prevent startup blocks). Together they ensure workflows execute with the same inputs and outputs across invocations.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
