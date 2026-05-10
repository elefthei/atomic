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
