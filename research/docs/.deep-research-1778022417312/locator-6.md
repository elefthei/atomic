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
