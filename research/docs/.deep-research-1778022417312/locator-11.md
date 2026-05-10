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
