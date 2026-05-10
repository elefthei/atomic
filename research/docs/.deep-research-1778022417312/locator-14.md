## File Locations for Deterministic Workflows — Partition 14

### Implementation
- `install.ps1` — Windows bootstrap installer that deterministically installs bun runtime and @bastani/atomic package. Uses Invoke-Step pattern with background PowerShell jobs and spinner UI to execute installation steps with progress tracking, ensuring reliable step-by-step workflow execution.
- `src/version.ts` — Single-line VERSION export from package.json used for compatibility checks and version-gating in workflows. Feeds version-based logic that enforces deterministic behavior based on release versions.

### Documentation
- `install.ps1` (lines 1-6) — Comments document that installer silently syncs tooling deps and bundled skills on first launch via `src/services/system/auto-sync.ts`, indicating structured deterministic initialization workflows.
- `install.ps1` (line 13) — Usage documentation shows deterministic installation flow via one-liner: `irm https://raw.githubusercontent.com/flora131/atomic/main/install.ps1 | iex`.

## Notes

The `install.ps1` file (436 LOC) implements deterministic workflow patterns through:
1. **Step-based execution** — Invoke-Step function (lines 114-190) runs each action as a background job with spinner animation, advancing step counter only on success.
2. **Progress tracking** — StepIndex and StepTotal variables maintain deterministic workflow state across step boundaries.
3. **Failure handling** — Non-TTY fallback (lines 125-141) and TTY-based spinning (lines 143-190) ensure deterministic output and error surfacing regardless of environment.
4. **Version-aware installation** — Hard-coded PACKAGE variable (@bastani/atomic@latest) at line 17 determines which version is installed, directly linking to `src/version.ts` semantics.

The `src/version.ts` file (7 LOC) serves as a single source of truth for version constants used in compatibility checks and version-gating within deterministic workflows. It imports from package.json at build time, ensuring version determinism across CLI invocations.
