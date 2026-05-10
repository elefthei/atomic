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
