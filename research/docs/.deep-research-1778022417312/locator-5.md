# promo-video/ — Remotion Video Assets

## Scope Summary
**22 source files, ~3,609 LOC** — Remotion-based promotional video assets for Atomic product launch. Contains React/TypeScript components for animated TUI visualization and beat-driven video narrative.

## Implementation

**Entry Points:**
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/index.tsx` — Remotion entry
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/Root.tsx` — Root composition wrapper
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/PromoVideo.tsx` — Main video structure (5 sequential beats)

**Scene Components (Beat Narrative):**
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/scenes/Beat1Hook.tsx` — Opening hook
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/scenes/Beat2Reveal.tsx` — Product reveal
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/scenes/Beat3Workflow.tsx` — Deterministic workflow visualization (primary demo)
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/scenes/Beat4Power.tsx` — Product capabilities
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/scenes/Beat5CTA.tsx` — Call-to-action

**Visual Components:**
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/AtomicLogo.tsx` — Logo rendering
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/BubbleWord.tsx` — Animated text bubble
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/FilmGrain.tsx` — Film grain overlay effect
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/LiquidSilk.tsx` — Liquid silk gradient animation
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/TUIFrame.tsx` — Terminal UI chrome wrapper
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/TypingText.tsx` — Typing animation for text
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/TypingTokens.tsx` — Syntax-colored token typing (code editor)
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/OrchestratorChrome.tsx` — Orchestrator UI shell

**Orchestrator Graph Components (Workflow Visualization):**
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/orchestrator-grid/OrchestratorGridGraph.tsx` — Stage node graph rendering
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/orchestrator-grid/connectors.ts` — Edge and connection line logic
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/components/orchestrator-grid/layout.ts` — Node positioning and layout

**Styling & Configuration:**
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/theme.ts` — Catppuccin Mocha color palette, font definitions, beat timing constants
- `/Users/norinlavaee/atomic-product-hunt/promo-video/src/loadFonts.ts` — Google Fonts loader

## Configuration

- `/Users/norinlavaee/atomic-product-hunt/promo-video/package.json` — Remotion 4.0.392, React 19, build scripts (studio, render, render:fast, still)
- `/Users/norinlavaee/atomic-product-hunt/promo-video/remotion.config.ts` — Remotion CLI configuration
- `/Users/norinlavaee/atomic-product-hunt/promo-video/tsconfig.json` — TypeScript configuration (React JSX, ES2020 target)
- `/Users/norinlavaee/atomic-product-hunt/promo-video/.claude/settings.json` — Claude Code agent configuration

---

## Workflow Determinism Relevance

**Beat3Workflow.tsx** (740 LOC) contains the primary deterministic workflow visualization. Key elements demonstrating workflow semantics:

- **Code Editor Pane**: Displays TypeScript workflow definition with stages chaining pattern:
  ```
  export default defineWorkflow("ship-feature")
    .stage("planner",      { agent: "claude" })
    .stage("orchestrator", { agent: "claude" })
    .stage("test-runner",  { runs:  "jest"   })
    .stage("review-gate",  { gate:  "human"  })
    .compile();
  ```

- **Orchestrator Graph Visualization**: Renders deterministic execution states:
  - Stage nodes activate in sequence (planner → orchestrator → test-runner → review-gate)
  - Each node transitions through state progression: idle → complete → (optional) human-in-the-loop (HIL)
  - Edges between nodes represent data/control flow dependencies
  - Loop arc from review-gate back to planner represents human verdict → re-plan feedback cycle
  - Status display shows: completion count, pending stages, awaiting-human count, failed count

- **Determinism Markers**:
  - Frame-based timing ensures reproducible animation (CHARS_PER_FRAME = 2.4)
  - lineStartFrame() function pre-computes character offsets for sequential line typing
  - Stage activation timeline (plannerActive, orchActive, testActive, gateAppear, hilFocus) demonstrates ordered execution
  - clamp01() utility ensures bounded, deterministic progress values

This is **marketing/demo content only** and does NOT contain workflow execution logic, scheduling, or actual determinism implementation. It is a visual illustration of what deterministic workflows look like in practice.
