### Files Analysed

- `assets/product-hunt/generate-product-hunt-assets.ts`
- `assets/product-hunt/slides/01-hero.html`
- `assets/product-hunt/slides/02-before-after.html`
- `assets/product-hunt/slides/03-workflow-as-code.html`
- `assets/product-hunt/slides/04-architecture-diagram.html`
- `assets/product-hunt/slides/05-use-case-carousel.html`
- `assets/product-hunt/slides/06-safety-devcontainer.html`

---

### Per-File Notes

#### `assets/product-hunt/generate-product-hunt-assets.ts`

- **Role:** Playwright/Chromium pipeline that batch-renders all 8 HTML slide files to 1270×760 PNG assets for the Product Hunt campaign.
- **Key symbols:**
  - `SlideConfig` type (`generate-product-hunt-assets.ts:24`) — `{ html: string; png: string }` pairing for each slide.
  - `slides` array (`generate-product-hunt-assets.ts:29–38`) — enumerates the deterministic ordering of 8 slides by filename: `01-hero.html`, `02-before-after.html`, `03-workflow-as-code.html`, `04-architecture-diagram.html`, `05-use-case-carousel.html`, `06-safety-devcontainer.html`, `07-workflow-skill-creator.html`, `08-cta.html`.
  - `verifySlideFiles()` (`generate-product-hunt-assets.ts:40–47`) — synchronous pre-flight that throws if any slide HTML is missing.
  - `renderSlides()` (`generate-product-hunt-assets.ts:49–84`) — launches a headless Chromium context at `1270×760` with `deviceScaleFactor: 2`, iterates `slides` array in order, navigates to each `file://` URL via `page.goto(..., { waitUntil: 'networkidle' })`, awaits `document.fonts.ready`, then calls `page.screenshot()` with a fixed clip rect.
- **Control flow:** `verifySlideFiles()` → `chromium.launch()` → `browser.newContext()` → for-loop over `slides` → `page.goto()` → `document.fonts.ready` → `page.screenshot()` → `browser.close()`.
- **Data flow:** Input is `SLIDES_DIR` (`assets/product-hunt/slides/`). Output PNGs are written to `OUT_DIR` (same as `assets/product-hunt/`). No external state; every run is fully reproducible given the same HTML source.
- **Dependencies:** `playwright` (chromium), `node:fs` (existsSync, mkdirSync), `node:path` (join), `node:url` (pathToFileURL, import.meta.url).

---

#### `assets/product-hunt/slides/03-workflow-as-code.html`

- **Role:** Product Hunt marketing slide that renders a static visual mock of the `defineWorkflow` DSL alongside a TUI GRAPH-mode state panel, showing how the workflow API expresses stage ordering.
- **Key symbols (visual mock code, not executable):**
  - Import of `defineWorkflow` from `'@atomic/workflow'` displayed at `code-pane__body` line 1.
  - `.run(async (ctx) => { ... })` callback (`code-pane__body` lines 7–26): sequential stage declaration via `ctx.stage('review', { agent: 'claude-code', prompt: '...' })` at line 9, conditional fan-out with `Promise.all([ctx.stage('security-audit', { agent: 'opencode' }), ctx.stage('ci-checks', { agent: 'copilot-cli' })])` at lines 16–19, and human gate `ctx.stage('human-approval', { require: 'maintainer' })` at line 23.
  - `.compile()` call at line 27 — the terminal step that materializes the plan.
  - TUI sidebar (`tui__workflow-list`) lists four stages: `review` (✓ done), `security-audit` (✓ done), `ci-checks` (✓ done), `human-approval` (↵ awaiting) — `03-workflow-as-code.html:310–325`.
  - TUI graph shows node topology: `review → [security-audit ∥ ci-checks] → human-approval` — `03-workflow-as-code.html:346–403`.
  - Node state CSS: `tui__node--done` (green), `tui__node--awaiting` (blue), matching what the comment says maps to `src/sdk/components/node-card.tsx` — `03-workflow-as-code.html:153–158`.
- **Control flow:** Static HTML; no JavaScript execution. The TUI panel on the right mirrors the expected runtime output of the workflow defined in the code panel on the left.
- **Data flow:** No data flow; all state is hardcoded in HTML markup. The "encodes-list" at `03-workflow-as-code.html:434–442` names the five workflow primitives the file visually demonstrates: `ctx.stage()`, `if/else` branching, parallel agent sessions, review gates, devcontainer config.
- **Dependencies:** `../_shared/fonts.css`, `../_shared/tokens.css`, `../_shared/components.css`, `../_shared/tui.css`.

---

#### `assets/product-hunt/slides/04-architecture-diagram.html`

- **Role:** Excalidraw-style architecture diagram slide showing the four-box data flow topology that Atomic workflows operate within.
- **Key symbols:**
  - SVG `viewBox="0 0 1150 440"` sketch diagram at `04-architecture-diagram.html:178`.
  - Four labeled regions in the SVG: **your repo** (`.claude`, `.opencode`, `.github`, `.agents/skills`, `.devcontainer`, `.mcp.json`) → **your workflow file** (numbered steps 1–4: plan, edit, review & test, open PR, plus "add as many as you need") → **agent** (Claude Code, OpenCode, Copilot CLI, with note "swap any time — same workflow") → **output** (a PR, a report, a merge, a ping).
  - Three edge labels: `reads` (repo → workflow), `runs on` (workflow → agent), `ships` (agent → output) — `04-architecture-diagram.html:319–328`.
  - Step list at `04-architecture-diagram.html:266–278`: steps 1–4 demonstrate that workflow steps are an ordered, open-ended sequence authored once.
- **Control flow:** Static SVG; no executable logic.
- **Data flow:** The diagram depicts the conceptual data path: repo configs feed the workflow definition; the workflow runs sequentially on a chosen agent; the agent ships an output. The "swap any time — same workflow" note at `04-architecture-diagram.html:297–298` is the architectural claim that the workflow definition is agent-agnostic.
- **Dependencies:** `../_shared/fonts.css`, `../_shared/tokens.css`, `../_shared/components.css`.

---

#### `assets/product-hunt/slides/02-before-after.html`

- **Role:** Diptych slide contrasting manual ad-hoc agent prompting ("Before") with Atomic's ordered stage execution and live attach ("After").
- **Key symbols:**
  - "Before" panel — `.prompt-log` div at `02-before-after.html:445–497` shows a chat-style sequence of manual prompts to `claude` (scan, run tests, lint-fix, rerun) with unclear state and a `…still going? unclear` pending reply.
  - "After" panel — `.obs-stream` div at `02-before-after.html:550–591` shows a live tool-call stream from a `test` stage agent (Bash → Read → Edit → Bash → result).
  - `.obs-stages` strip at `02-before-after.html:594–614` shows four named stages in sequence: `scan` (✓), `test` (● running), `lint` (○), `review` (○) — a linear, ordered stage chain.
  - Stage glyph comment: `<!-- Stage strip — glyphs from src/sdk/components/status-helpers.ts:25 -->` at `02-before-after.html:593`.
  - `.obs-statusline` at `02-before-after.html:617–625` mirrors `src/sdk/components/attached-statusline.tsx` (per inline comment), showing the `CLAUDE` badge and `ctrl+b d detach` hint.
  - Outcome receipt `.outcome` at `02-before-after.html:634–668`: shows "3:42 · 4 stages" summary with all four stages completing in order: scan → test → lint → review → PR #482 opened.
- **Control flow:** Static HTML; illustrates that the ordered stage chain (scan → test → lint → review) runs hands-off to completion.
- **Data flow:** No live data; the visual establishes that Atomic's workflow runs a fixed sequence of stages and surfaces real-time tool-call streams per stage when attached.
- **Dependencies:** `../_shared/fonts.css`, `../_shared/tokens.css`, `../_shared/components.css`.

---

#### `assets/product-hunt/slides/05-use-case-carousel.html`

- **Role:** Catalog slide listing two built-in workflows and two user-authored workflows, each with their stage chains rendered as inline mono sequences.
- **Key symbols:**
  - `ralph` entry at `05-use-case-carousel.html:325–339`: stage chain `plan ▸ orchestrate ▸ review ×2 ↻ until clean` — shows that a built-in workflow encodes a loop (`↻`) and a multiplied parallel step (`×2`).
  - `deep-research-codebase` entry at `05-use-case-carousel.html:345–364`: stage chain `scout ▸ locate ∥ pattern ▸ analyze ∥ research ▸ aggregate` — shows fan-out (∥) at two points in the sequence.
  - User workflow "PR UX Review" at `05-use-case-carousel.html:379–394`: `scan diff ▸ run review ▸ file notes`.
  - User workflow "Prod Alert Triage" at `05-use-case-carousel.html:396–412`: `inspect logs ▸ propose fix ▸ hand off`.
  - Bottom caption at `05-use-case-carousel.html:418–420`: "Define once. Run with Claude Code, OpenCode, or GitHub Copilot CLI."
  - `.stages__par` CSS class at `05-use-case-carousel.html:252–255` colors parallel markers (∥, ×2) in mauve (`var(--bridge-mauve)`), and `.stages__loop` at `05-use-case-carousel.html:247–250` colors loop markers in cool-sapphire.
- **Control flow:** Static HTML.
- **Data flow:** Visually encodes that workflows are described as named, ordered stages with optional parallelism (∥) and loop (↻) constructs written once and run across any provider.
- **Dependencies:** `../_shared/fonts.css`, `../_shared/tokens.css`, `../_shared/components.css`, `../_shared/tui.css`.

---

#### `assets/product-hunt/slides/06-safety-devcontainer.html`

- **Role:** Devcontainer isolation slide demonstrating that Atomic workflows run agent sessions inside an isolated container boundary, not directly on the host filesystem.
- **Key symbols:**
  - `.host-pane__body` at `06-safety-devcontainer.html:530–548`: shows host-mode terminal output with a `warn running on host filesystem` line and an `error log-analyst wrote /var/log/atomic` line — the "before isolation" state.
  - `.dev-panel-header` at `06-safety-devcontainer.html:595–602`: `devcontainer: ubuntu-22.04 · isolated · no network · ephemeral fs` with `● host fs untouched` guarantee.
  - `.atui` graph inside the devcontainer at `06-safety-devcontainer.html:612–718`: Orchestrator node (running) → two child nodes: `log-analyst` (running, focused) and `metric-collector` (HIL — `? waiting for response`).
  - `.atui__node--hil` CSS variant at `06-safety-devcontainer.html:366–379`: border-color `var(--mocha-blue)`, background `oklch(60% 0.18 240 / 0.07)` — represents a stage paused waiting for a human response.
  - `.atui__edge--hil` at `06-safety-devcontainer.html:381–383`: blue edge color marks the branch to the HIL node.
  - Comments reference real component files: `src/sdk/components/header.tsx`, `src/sdk/components/session-graph-panel.tsx`, `src/sdk/components/node-card.tsx`, `src/sdk/components/statusline.tsx` — `06-safety-devcontainer.html:607–610`.
  - Statusbar at `06-safety-devcontainer.html:693–717` shows GRAPH mode with `attach`, `stages`, and `ctrl+b d detach` keybindings.
- **Control flow:** Static HTML. The two-panel diagram (host | isolate arrow | devcontainer) visually encodes the isolation boundary that wraps every workflow run.
- **Data flow:** No live data. Demonstrates that workflow agent sessions are contained within a devcontainer, so file system access is scoped to the ephemeral container rather than the host.
- **Dependencies:** `../_shared/fonts.css`, `../_shared/tokens.css`, `../_shared/components.css`, `../_shared/tui.css`.

---

#### `assets/product-hunt/slides/01-hero.html`

- **Role:** Hero slide rendering a complete `ralph` workflow run (perf-regression-hunt) in the Atomic GRAPH TUI, with a GitHub-style checks panel showing automated exit criteria.
- **Key symbols:**
  - `.atui__header` session label at `01-hero.html:452`: `perf-regression-hunt-ralph · claude · 3:18 · ralph 2/5` — shows the `ralph` built-in is iteration-based (`2/5`).
  - Status counters at `01-hero.html:453–457`: ✓5, ●1, ?1, ✗0 — counts across node states.
  - Seven nodes across four rows at `01-hero.html:508–562`: `deep-research` (complete, row 1) → `orchestrator-1` and `planner-1` (complete, row 2) → `reviewer-1a` and `reviewer-1b` (complete, row 3, parallel) → `orchestrator-2` (running, row 4) + `planner-2` (HIL, `? waiting for response`, row 4).
  - `.atui__node--hil.atui__node--focused` at `01-hero.html:555–561`: the HIL gate node is the currently focused element, keybinding `↵ respond` shown in statusbar.
  - Statusbar text at `01-hero.html:568–569`: `ralph 2/5 · awaiting human response on planner-2`.
  - `.checks-panel` at `01-hero.html:592–636`: GitHub-style checks listing `exit criteria` (VERIFIED — ralph converged at iter 3/5 · early exit), `typecheck`, `bun test`, `lint`, `ci/build` — all passing, PR #412 ready to merge.
  - `exit criteria` check row at `01-hero.html:599–604`: shows `ralph converged at iter 3/5 · early exit`, demonstrating that the built-in `ralph` workflow has a loop with a deterministic exit condition.
- **Control flow:** Static HTML. The graph shows how `ralph` executes: a top-level deep-research stage fans into an iterating orchestrator → planner → parallel reviewers pattern, with each iteration potentially pausing at a HIL gate before looping.
- **Data flow:** No live data. Inline CSS pixel-coordinates position each node and edge, reconstructing the exact layout that `src/sdk/components/session-graph-panel.tsx` would render at runtime.
- **Dependencies:** `../_shared/fonts.css`, `../_shared/tokens.css`, `../_shared/components.css`, `../_shared/tui.css`.

---

### Cross-Cutting Synthesis

The `assets/` partition contains no workflow runtime implementation code. All seven files are static marketing assets (HTML slides and a Playwright rendering script). Together they form a visual documentation layer that illustrates the conceptual model of Atomic's deterministic workflow system.

The slides converge on a consistent vocabulary: a workflow is defined once via `defineWorkflow({ name, description }).run(async (ctx) => { ... }).compile()` (slide 03); stages are declared as `ctx.stage(name, { agent, prompt })` and can be sequential, conditional, or parallel via `Promise.all` (slide 03); the compiled workflow runs identically on any of three provider agents — Claude Code, OpenCode, Copilot CLI — without modification (slides 04, 05); each run executes inside an isolated devcontainer boundary rather than the host filesystem (slide 06); built-in workflows like `ralph` add loop (`↻`) and parallel (`×N`) constructs on top of the basic stage chain (slides 01, 05).

The rendering pipeline in `generate-product-hunt-assets.ts` is itself deterministic: it iterates an ordered `SlideConfig` array, renders each HTML file to a fixed-size PNG via a headless Chromium context, and writes outputs to a predictable path.

Real implementation symbols surface only in HTML comments: `src/sdk/components/status-helpers.ts:25`, `src/sdk/components/attached-statusline.tsx`, `src/sdk/components/header.tsx`, `src/sdk/components/session-graph-panel.tsx`, `src/sdk/components/node-card.tsx`, `src/sdk/components/statusline.tsx`.

---

### Out-of-Partition References

- `src/sdk/components/status-helpers.ts` — referenced in `02-before-after.html:593`; the file that defines stage status glyphs (✓ ● ○) used in the TUI stage strip.
- `src/sdk/components/attached-statusline.tsx` — referenced in `02-before-after.html:616`; the React component that renders the CLAUDE/OPENCODE badge and detach keybinding in attached mode.
- `src/sdk/components/session-graph-panel.tsx` — referenced in `06-safety-devcontainer.html:608`; the React component that renders the node-and-edge GRAPH canvas the HTML slides mock in CSS.
- `src/sdk/components/node-card.tsx` — referenced in `03-workflow-as-code.html:153` and `06-safety-devcontainer.html:609`; the React component for individual stage nodes; comment notes that `awaiting` maps to `theme.info → theme.accent → Blue`.
- `src/sdk/components/header.tsx` — referenced in `06-safety-devcontainer.html:607`; renders the Orchestrator badge, session name, and status counters in the TUI header bar.
- `src/sdk/components/statusline.tsx` — referenced in `06-safety-devcontainer.html:610`; renders the GRAPH statusbar with GRAPH badge and keyboard hint row.
- `@atomic/workflow` — import shown in `03-workflow-as-code.html` code mock (line 1 of mock code); the public DSL package exporting `defineWorkflow`.
