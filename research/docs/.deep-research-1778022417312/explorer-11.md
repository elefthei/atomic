# Partition 11 of 16 — Findings

## Scope
`assets/` (5 files, 567 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
# Partition 11 Locator Report: `assets/` Directory

## Research Question
How does atomic's deterministic workflows work?

## Scope
`assets/` — Visual/media assets and marketing presentation materials (5 files based on architectural orientation, 567 LOC across HTML/CSS/TypeScript generation)

## Findings

### Documentation
- `assets/product-hunt/design-philosophy.md` — Design philosophy document explaining the Product Hunt campaign's visual language, color palette (warm-to-cool cartography), and slide map. Contains references to workflow concept ("warm pole signals uncontrolled execution, cool pole signals orchestration").

### Examples / Fixtures
- `assets/product-hunt/slides/03-workflow-as-code.html` — Product Hunt slide demonstrating workflow-as-code concept. Contains visual mock of TypeScript workflow definition with `defineWorkflow()`, `ctx.stage()`, parallel execution, and review gates. Shows sample code structure with stages: review → parallel audits (security-audit, ci-checks) → human-approval.
- `assets/product-hunt/slides/04-architecture-diagram.html` — Architecture diagram slide showing workflow orchestration structure, agent coordination, and system topology (configuration → workflow → stages → agents → output).
- `assets/product-hunt/generate-product-hunt-assets.ts` — Playwright/Chromium-based slide renderer. Converts 8 HTML slides to PNG assets at 1270×760 pixels. Lists slide order and naming convention.

### Notable Clusters
- `assets/product-hunt/slides/` — 13 files total. Contains HTML mockups of Product Hunt presentation slides demonstrating workflow features, architecture, safety (devcontainer), multi-agent workflows, and skill creators.
- `assets/product-hunt/_shared/` — 8 files total. Shared CSS, fonts, design tokens, and TUI chrome (terminal UI styling) used across all slides.
- `assets/palette/` — 150+ PNG files. Color palette circles for Catppuccin themes (frappe, latte, macchiato, mocha) in both ANSI and semantic variants.

## Assessment

Partition 11 contains **marketing/presentation layer documentation only**. No workflow implementation code lives here. The assets demonstrate workflow concepts visually (slide 03 shows `defineWorkflow()`, parallel execution, review gates; slide 04 shows architecture topology) but do not contain the actual runtime implementation. The TUI state demonstrations in HTML are visual mockups, not executable code.

**Deterministic workflow logic resides in other partitions** (likely `src/` for implementation, `.agents/` for workflow skill definitions, and `.claude/`/configuration for agent setup).

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
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

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Pattern Finder Partition 11: Deterministic Workflows in Atomic

**Partition Scope**: `assets/` — marketing/product-hunt materials (images, HTML slides, configs)

**Finding**: The `assets/` partition contains no workflow implementation code. However, it does reference and visualize deterministic workflow patterns through Product Hunt marketing collateral, specifically in slide 03 and design philosophy documentation. These are visual/conceptual demonstrations of the workflow feature, not implementation patterns.

---

## Pattern Examples: Workflow Conceptualization & Visualization

### Pattern 1: TypeScript Workflow Definition (Conceptual Slide Example)
**Found in**: `assets/product-hunt/slides/03-workflow-as-code.html:248-274`
**What:** Visual demonstration of a deterministic workflow-as-code pattern using TypeScript DSL with named stages, branching logic, and parallel execution guards.

```typescript
import { defineWorkflow } from '@atomic/workflow';

export default defineWorkflow({
  name: 'pr-review',
  description: '.devcontainer/claude.json',
})
  .run(async (ctx) => {
  // stage 1: review the diff
  const review = await ctx.stage('review', {
    agent: 'claude-code',
    prompt: 'Review diff for security, perf, clarity.',
  });

  // stage 2: parallel audits if findings exist
  if (review.findings.length > 0) {
    await Promise.all([
      ctx.stage('security-audit', { agent: 'opencode' }),
      ctx.stage('ci-checks', { agent: 'copilot-cli' }),
    ]);
  }

  // stage 3: require human sign-off
  await ctx.stage('human-approval', {
    require: 'maintainer',
  });
})
  .compile();
```

**Key aspects**:
- Named workflow: `defineWorkflow()` with name and description
- Sequential stages: `ctx.stage()` API for defining atomic execution steps
- Conditional branching: `if (review.findings.length > 0)` guards parallel execution
- Parallel execution: `Promise.all()` for concurrent stage runs
- Agent specification: each stage names its agent provider (claude-code, opencode, copilot-cli)
- Human gates: explicit approval stages with role requirements
- Compilation: `.compile()` finalizes the workflow definition

**Variations / call-sites**: 
- Referred to throughout slides 03, 05, 07, and documentation
- Visual TUI graph representation in slide 03 (lines 281–431)

---

### Pattern 2: Deterministic Multi-Agent Workflow Graph Visualization
**Found in**: `assets/product-hunt/slides/03-workflow-as-code.html:281-431` (TUI component)
**What:** HTML/CSS visual representation of a deterministic workflow execution state showing stage DAG (directed acyclic graph) with completion status, timing, and agent assignments.

```html
<!-- TUI multi-agent state visualization -->
<div class="tui" style="width:100%;height:340px;">
  <!-- Header bar: GRAPH mode, workflow running -->
  <div class="tui__header">
    <div class="tui__header-badge tui__header-badge--graph">GRAPH</div>
    <span class="tui__header-session">pr-review · workflow</span>
    <div class="tui__header-counts">
      <span class="tui__count"><span class="tui-green">✓</span><span class="tui-dim"> 3</span></span>
      <span class="tui__count"><span class="tui-blue">↵</span><span class="tui-dim"> 1</span></span>
      <span class="tui__count"><span class="tui-dim">○ 0</span></span>
    </div>
  </div>

  <!-- Stage nodes with connections -->
  <!-- Stage 1: review (done) -->
  <div class="tui__node tui__node--done" style="width:110px;">
    <div class="tui__node-title">review</div>
    <div class="tui__node-duration tui__node-duration--done">0:42</div>
    <div class="tui__node-hint tui-dim">claude-code</div>
  </div>

  <!-- Fan-out: parallel stages -->
  <!-- Stage 2a: security-audit (done) -->
  <div class="tui__node tui__node--done" style="width:110px;min-height:54px;">
    <div class="tui__node-title">security-audit</div>
    <div class="tui__node-duration tui__node-duration--done">
      <span class="tui-green">✓</span> 0:58
    </div>
    <div class="tui__node-hint tui-dim">opencode</div>
  </div>

  <!-- Stage 3: human-approval (awaiting gate) -->
  <div class="tui__node tui__node--awaiting tui__node--focused" style="width:110px;">
    <div class="tui__node-title">human-approval</div>
    <div class="tui__node-duration tui__node-duration--awaiting">↵ awaiting</div>
    <div class="tui__node-hint tui-dim">maintainer</div>
  </div>
</div>
```

**Key aspects**:
- Graph view mode shows DAG structure with sequential and parallel stage layout
- Status indicators: green checkmarks (✓) for complete, blue arrow (↵) for awaiting, empty circles for pending
- Timing information: each stage shows duration (0:42, 0:58, 1:03)
- Agent assignment visibility: each node displays which agent executed it
- Vertical connectors: lines represent dependencies and fan-out/fan-in relationships
- Live focus state: current stage (human-approval) highlighted with focused class

**Variations / call-sites**:
- TUI states shown across slides 03, 05, 06
- HTML/CSS component library in `assets/product-hunt/_shared/tui.css`
- Reused demo template in `assets/product-hunt/_shared/tui-demo.html`

---

### Pattern 3: Workflow Design Philosophy & Semantics
**Found in**: `assets/product-hunt/design-philosophy.md:3, 11`
**What:** Conceptual framing that workflows transition from "chaos of unstructured agent runs" to "discipline of orchestrated workflows", using color semantics to signal execution state and containment.

From the design document:
```
Atomic's Product Hunt gallery walks viewers from the chaos of unstructured 
agent runs to the discipline of orchestrated workflows. The visual journey 
moves warm to cool: maroon and red signal friction at the start, sapphire 
and teal carry orchestration through the middle, and a single cream slide 
breaks the rhythm with light.

Color carries trust the same way the in-product TUI does. Warm pole — maroon, 
red, peach — signals risk and uncontrolled execution (Before, Host machine). 
Cool pole — sapphire, sky, blue, teal — signals orchestration and containment 
(After, Devcontainer boundary, Atomic workflow).
```

**Key aspects**:
- Warm palette (maroon/red/peach) = uncontrolled, risky execution
- Cool palette (sapphire/sky/blue/teal) = orchestrated, contained execution
- Mauve = human judgment as the bridge between the two poles
- Visual journey represents the transformation workflow systems provide
- Devcontainer boundary = sandboxed, deterministic execution environment

---

### Pattern 4: Workflow Encoding in TypeScript Configuration
**Found in**: `assets/product-hunt/slides/03-workflow-as-code.html:434-442`
**What:** List showing what the workflow-as-code file encodes (requirements captured in Product Hunt narrative).

```html
<!-- "What the file encodes" list -->
<ul class="encodes-list">
  <li><span class="arrow">→</span><span>steps as <code>ctx.stage()</code></span></li>
  <li><span class="arrow">→</span><span>branching with <code>if/else</code></span></li>
  <li><span class="arrow">→</span><span>parallel agent sessions</span></li>
  <li><span class="arrow">→</span><span>review gates</span></li>
  <li><span class="arrow">→</span><span>devcontainer config</span></li>
</ul>
```

**Key aspects**:
- Steps as first-class API: `ctx.stage()` method
- Deterministic branching: `if/else` conditions control execution flow
- Parallelism: multiple agents can run concurrently within constraints
- Human gates: explicit approval steps block automatic progression
- Environment isolation: workflows run inside devcontainers for reproducibility

---

## Summary

Partition 11 (assets/) contains **visual and conceptual demonstrations** of deterministic workflows, not implementation source. The key patterns illustrated are:

1. **Workflow-as-Code DSL** using TypeScript with `defineWorkflow()`, `ctx.stage()`, and `.compile()`
2. **DAG execution model** shown as TUI graph nodes with status, timing, and agent metadata
3. **Determinism semantics** encoded through visual design (warm=chaos, cool=orchestrated)
4. **Multi-agent orchestration** with branching, parallel execution, and human approval gates

These represent the **user-facing abstraction** and **marketing narrative** for deterministic workflows in Atomic. The actual implementation code (TypeScript SDK, stage runtime, execution engine) lives in other partitions.

---

**Note**: This partition is intentionally visual/conceptual per the architectural orientation briefing. No workflow execution code was expected here.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
