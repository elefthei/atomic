# Partition 5 of 16 — Findings

## Scope
`promo-video/` (22 files, 3,609 LOC)

## Files in Scope
<!-- Source: codebase-locator sub-agent -->
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

## How It Works
<!-- Source: codebase-analyzer sub-agent -->
### Files Analysed

1. `promo-video/src/scenes/Beat3Workflow.tsx` (746 lines) — the primary scene visualizing workflow-as-code and the orchestrator graph
2. `promo-video/src/components/orchestrator-grid/OrchestratorGridGraph.tsx` (292 lines) — character-cell graph renderer
3. `promo-video/src/components/orchestrator-grid/connectors.ts` (148 lines) — fan-out / fan-in connector drawing logic
4. `promo-video/src/components/orchestrator-grid/layout.ts` (205 lines) — DAG layout engine (ported from production)
5. `promo-video/src/PromoVideo.tsx` (31 lines) — top-level Remotion composition; places Beat3 in the overall sequence
6. `promo-video/src/theme.ts` (67 lines) — timing constants and Catppuccin Mocha color palette

---

### Per-File Notes

#### `promo-video/src/scenes/Beat3Workflow.tsx`

**Role**: The scene that is labelled "02 / workflow as code" (`line 242`). It is the third beat in the promotional video (`BEATS.workflow`, frames 330–570 in the full composition per `theme.ts:14`). The scene runs for 8 seconds at 30 fps (240 local frames).

**Two-phase visual narrative**

The scene is split into two sequential panels that share the screen after the split transition:

*Phase 1 — Typed code editor (frames 0–140, local)*

A `TUIFrame` component (`line 181`) labelled `EDITOR` displays a file named `workflows/ship-feature.ts`. The code is typed out character by character using the `TypingTokens` component, at a rate of 2.4 characters per frame (`CHARS_PER_FRAME = 2.4`, `line 124`). The code block typed out (`CODE_LINES`, lines 26–119) represents:

```
import { defineWorkflow } from "atomic-cli";

export default defineWorkflow("ship-feature")
  .stage("planner",      { agent: "claude" })
  .stage("orchestrator", { agent: "claude" })
  .stage("test-runner",  { runs:  "jest"   })
  .stage("review-gate",  { gate:  "human"  })
  .compile();
```

Each call to `.stage()` declares a named pipeline stage. Three key properties are shown: `agent:` (assigns a coding agent), `runs:` (assigns a test runner), and `gate:` (assigns a human approval gate). The final `.compile()` call signals that the declaration is complete and immutable. Together, these visually communicate that a workflow is a static, declared sequence of stages—its structure is fixed at authoring time, not at runtime.

*Transition (frames 140–175, local)*

Around frame 140, the editor pane slides left and scales down to 0.74× (`editorScale`, `line 155`), while the orchestrator graph TUI slides in from the right (`tuiX`, `line 157`). This puts both panes simultaneously on screen, visually connecting the code declaration to its execution graph.

*Phase 2 — Orchestrator graph (frames 175–239, local)*

`OrchestratorGraphTUI` (`line 267`) renders a devcontainer-wrapped TUI panel. Four nodes appear in strict temporal sequence, each gated by a `clamp01` progress value:

| Node | Activation frame | State shown |
|---|---|---|
| `planner-3` | f=175 (`plannerActive`, line 270) | complete (green) |
| `orchestrator-3` | f=182 (`orchActive`, line 271) | complete (green) |
| `test-runner-3` | f=189 (`testActive`, line 272) | complete (green) |
| `review-gate` | f=196 (`gateAppear`, line 273) | idle → HIL (blue) |

The nodes are connected by `Edge` components (`lines 366–368`) that become green (`"rgba(166, 227, 161, 0.55)"`, `connectors.ts line 607`) once both the parent and child node have become active. The sequential activation of each edge—strictly one after another—visualizes the pipeline as progressing in a fixed, deterministic order.

**HIL climax (frames 200–212, local)**

`hilFocus` (`line 274`) interpolates 0→1 over frames 200–212. At `hilFocus > 0.3`, the `review-gate` node transitions from `idle` to `hil` state, gaining a blue glow (`HIL_BLUE_GLOW`, line 259) and changing its status text to `"? awaiting human"`. A mauve dashed loop arc SVG (`lines 371–404`) fades in labelled `"human verdict → re-plan"`, arcing from the `review-gate` node back up to the `planner` node. This arc is the single visual that conveys conditionality: the workflow can loop, but only at a designated, declared gate point—not anywhere arbitrarily.

**Stage trace panel** (`lines 459–532`)

Beneath the graph nodes, a "stage trace · gated" panel fades in at frame 198 (`traceFade`, line 276). It shows three entries in a fixed grid:
- `test-runner-3` — "jest · 142 specs · 0 failed" / `passed`
- `review-gate` — "awaiting sign-off · timeout 5m" / `paused`
- `planner-4` — "queued · blocked by review-gate" / `pending`

The key visual data point: `planner-4` is blocked by `review-gate`. This renders the concept that downstream stages cannot proceed until a gate resolves—the workflow graph imposes a strict dependency order.

**Orchestrator header** (`lines 314–361`)

The TUI header shows `iter 3 / 8` (`line 345`), and a tally row (`line 355–360`) counts nodes by state: green `✓` count increments as `plannerActive`, `orchActive`, `testActive` cross 0.6; the blue `?` count flips to 1 when `hilFocus > 0.4`. This communicates that the system tracks and reports iteration count and node-state counts—both deterministic quantities.

**Node state type system** (`line 265`)

```typescript
type NodeState = "idle" | "complete" | "failed" | "hil";
```

Four exclusive states, each rendered in a distinct color: gray (idle), green (complete), red (failed), blue (hil). The `nodePalette` function (`lines 704–739`) maps each state to a border color and fill—never mixing states. This models the workflow nodes as having mutually exclusive, well-defined states.

---

#### `promo-video/src/components/orchestrator-grid/OrchestratorGridGraph.tsx`

**Role**: A Remotion-specific renderer for the production Atomic graph layout. Its file header (`line 13`) explicitly states: "Layout + connector logic is identical to src/sdk/components/{layout,connectors}.ts; this file only translates the resulting character-cell grid into DOM elements."

The component (`OrchestratorGridGraph`, line 40) accepts `GridNodeInput[]` nodes with `status: SessionStatus` and `appear: number` (0..1 entrance opacity). It calls `computeLayout(sessions)` from `layout.ts` (line 58) to produce pixel-free character-cell positions, then multiplies those by `cellW = fontSize * 0.6` and `cellH = fontSize * 1.2` (lines 46–47) to produce actual pixel positions for DOM elements.

**Status type** (`SessionStatus` from `layout.ts:5`): `"pending" | "running" | "complete" | "error" | "awaiting_input"`. The `nodePalette` function (`lines 234–274`) maps each status to color: green (complete), yellow with pulsing glow (running), red (error), blue with pulsing glow (awaiting_input), gray (pending). The `awaiting_input` state receives the same pulsing glow treatment as `running`, making it visually prominent—it is a live, blocking state, not a terminal one.

**Node box text** (`buildNodeText`, lines 219–232): uses Unicode box-drawing characters (`╭`, `─`, `╮`, `│`, `╰`, `╯`) to render bordered boxes in a character-cell grid. The name is inset in the top border: `╭─── name ───╮`.

---

#### `promo-video/src/components/orchestrator-grid/connectors.ts`

**Role**: Ported "verbatim" from `src/sdk/components/connectors.ts` (production source). Draws the directed edges between nodes in character-cell space.

`buildConnector` (`line 17`): draws fan-out edges from a parent to its children. If there is exactly one child at the same column as the parent, it draws a straight `│` column. For multiple children (fan-out), it draws a horizontal bar row `─` with junction characters (`╰`, `╯`, `├`, `┤`, `┼`, `┴`, `╭`, `╮`, `┬`) that correctly connect the parent trunk to each child branch. The junction-character selection is based on relative column position (`lines 59–73`), so the ASCII topology accurately reflects the branching structure.

`buildMergeConnector` (`line 86`): draws fan-in edges from multiple parents converging into a single child (merge). It draws a horizontal bar at the top of the connector and a vertical trunk `│` descending to the child. Junction characters are applied symmetrically.

Both functions return `ConnectorResult` with `text`, `col`, `row`, `width`, `height`, `color`—purely positional data that the renderer places as `<pre>` elements.

---

#### `promo-video/src/components/orchestrator-grid/layout.ts`

**Role**: Pure DAG layout engine, ported verbatim from production (`line 1–2`). Takes `SessionData[]` and returns `LayoutResult` with pixel-free character-cell positions.

Key constants (`lines 16–19`):
- `NODE_W = 36` cells wide
- `NODE_H = 4` cells tall
- `H_GAP = 6` cells horizontal gap between siblings
- `V_GAP = 3` cells vertical gap between depth levels
- `PAD = 3` cells outer padding

**`computeLayout`** (`line 90`): the core layout algorithm. It:
1. Builds a node map from `SessionData[]`, initializing all nodes with `depth=0, x=0, y=0`.
2. Calls `normalizeParents` (`line 70`): if a node has no declared parents but an `orchestrator` node exists, it is implicitly parented to `orchestrator`. This models the production convention that the orchestrator is the root agent.
3. Computes `depth` recursively per node as `max(parent depths) + 1` using a `depthCache` to avoid recomputation (`lines 123–133`).
4. Computes `rowH`: the height of each depth-row is `NODE_H`, except nodes with `status === "awaiting_input"` which get height `6` (`line 140`)—visually taller to show their blocking nature.
5. Calls `place(n)` to position nodes: leaf nodes advance a shared `cursor` by `NODE_W + H_GAP`; internal nodes center horizontally over their children (`lines 152–163`).
6. Positions merge nodes (multiple parents) at the horizontal average of parent centers (`lines 173–187`).
7. Calls `resolveOverlaps` (`line 48`): for each depth level sorted by x, pushes rightward any node that would overlap its left sibling.
8. Adds `PAD` padding to all x/y coordinates.

The layout is strictly top-down (depth = row), left-to-right (sibling order follows declaration order). There is no cycle-detection; the algorithm assumes a DAG. The resulting layout is fully deterministic for a given input node list and their declared parent relationships.

---

#### `promo-video/src/PromoVideo.tsx`

**Role**: Top-level composition. `Beat3Workflow` occupies the `BEATS.workflow` segment: frames 330–570 (local frames 0–239) per `theme.ts:14`. The sequence is linear: `Beat1Hook` → `Beat2Reveal` → `Beat3Workflow` → `Beat4Power` → `Beat5CTA`. Beat3 is deliberately extended by 30 frames (noted inline in `theme.ts:14` as "extended +30 to hold final HIL state") so the reviewer can absorb the paused `review-gate` graph before the video moves on.

---

### Cross-Cutting Synthesis

Beat3Workflow is a two-act marketing animation that conveys three distinct properties of Atomic's deterministic workflows:

**1. Declaration is the workflow.** The typed-out code in the editor shows that a workflow is expressed as a linear chain of `.stage()` calls, each with a named stage and a single binding (`agent`, `runs`, or `gate`). The `.compile()` terminator visually signals that the structure is sealed at definition time. There is no runtime branching visible in the code; the order of stages is determined by the order of declaration.

**2. Execution follows the graph, node by node, in declared order.** The orchestrator TUI shows nodes appearing strictly left-to-right in time (planner → orchestrator → test-runner → review-gate), each connected by an edge that only turns green after both its parent and child have activated. The stage-trace panel reinforces this: `planner-4` is shown as `pending`, blocked by `review-gate`, which is paused waiting for human input. No stage can run before its declared predecessor resolves.

**3. The only non-deterministic point is the declared gate.** The mauve loop arc labeled "human verdict → re-plan" is the sole element that depicts a non-linear path—and it originates exclusively from the `review-gate` node, the one stage explicitly declared with `gate: "human"`. The arc goes back to the planner (retry/re-plan), and the stage trace shows the permitted responses: `"approve · request changes · abort"`. The HIL state is visually distinguished (blue glow, `?` icon, taller node box) from all others to emphasize it is a deliberate pause point, not an error.

The layout engine (`layout.ts`) and connector logic (`connectors.ts`) are both explicitly ported "verbatim" from production source (`src/sdk/components/`), meaning the graph topology shown in the animation is the same topology the runtime would produce—the visualization is a direct rendering of the same data structures.

---

### Out-of-Partition References

- **`src/sdk/components/layout.ts`** (production, outside promo-video/) — the canonical source from which `promo-video/src/components/orchestrator-grid/layout.ts` is ported. Contains the real runtime layout logic.
- **`src/sdk/components/connectors.ts`** (production, outside promo-video/) — the canonical source for connector drawing, ported into the promo-video renderer.
- **`assets/product-hunt/slides/human-in-the-loop.html`** — the static HTML slide that `Beat3Workflow.tsx:253` says the orchestrator TUI "mirrors." The animated graph is a motion version of that slide.
- **`assets/product-hunt/_shared/tokens.css`** — source of the color/font tokens replicated in `promo-video/src/theme.ts:3`.

## Patterns
<!-- Source: codebase-pattern-finder sub-agent -->
# Pattern Finder 5: Deterministic Workflow Patterns in promo-video/

## Scope Overview
The `promo-video/` directory contains Remotion-based marketing assets (22 files, 3,609 LOC) that visualize Atomic's workflow orchestration model. While not the runtime implementation, it documents deterministic workflow patterns through animation choreography and orchestrator graph visualization.

---

## Patterns Found

#### Pattern 1: Frame-Based Deterministic Animation Sequencing
**Where:** `src/PromoVideo.tsx:10-30`
**What:** Multi-beat video composition with absolute frame timing. Each "beat" (narrative arc) is placed at deterministic positions using Remotion's `Sequence` component, ensuring reproducible playback.

```typescript
export const PromoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#1e1e2e" }}>
      <Sequence from={BEATS.hook.from} durationInFrames={BEATS.hook.durationInFrames}>
        <Beat1Hook />
      </Sequence>
      <Sequence from={BEATS.reveal.from} durationInFrames={BEATS.reveal.durationInFrames}>
        <Beat2Reveal />
      </Sequence>
      <Sequence from={BEATS.workflow.from} durationInFrames={BEATS.workflow.durationInFrames}>
        <Beat3Workflow />
      </Sequence>
      <Sequence from={BEATS.power.from} durationInFrames={BEATS.power.durationInFrames}>
        <Beat4Power />
      </Sequence>
      <Sequence from={BEATS.cta.from} durationInFrames={BEATS.cta.durationInFrames}>
        <Beat5CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
```

**Variations / call-sites:**
- Beat definitions in `src/theme.ts:11-17` define absolute frame windows (e.g., `hook: { from: 0, durationInFrames: 180 }`)
- Each beat is a self-contained component (Beat1Hook, Beat2Reveal, etc.)
- Total video duration is deterministic: `31 * FPS` = 930 frames at 30fps = 31 seconds

---

#### Pattern 2: Frame-Driven Interpolation for Deterministic Motion
**Where:** `src/scenes/Beat3Workflow.tsx:140-177`
**What:** All animations are driven by frame position, using `interpolate()` to map frame ranges to visual properties. This ensures replay-identical motion regardless of rendering speed.

```typescript
export const Beat3Workflow: React.FC = () => {
  const frame = useCurrentFrame();

  // Editor enters
  const editorOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const editorY = interpolate(frame, [0, 18], [40, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  // Around f=140 the editor slides left, TUI slides in from right
  const splitProgress = interpolate(frame, [140, 175], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const editorX = interpolate(splitProgress, [0, 1], [0, -640]);
  const editorScale = interpolate(splitProgress, [0, 1], [1, 0.74]);

  const tuiX = interpolate(splitProgress, [0, 1], [880, 0]);
  const tuiOpacity = interpolate(splitProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
```

**Variations / call-sites:**
- Multiple overlapping interpolations create layered motion (opacity, position, scale)
- Extrapolation modes (`clamp`) ensure boundaries don't produce unexpected values
- All timing is relative to local frame index, enabling scene reuse

---

#### Pattern 3: Workflow Code Visualization with Character-Frame Timing
**Where:** `src/scenes/Beat3Workflow.tsx:26-129`
**What:** Code editor animation that types out a workflow definition deterministically. Each line has pre-computed character offsets, ensuring each line completes typing before the next begins.

```typescript
const CODE_LINES: Array<{ tokens: Token[]; indent?: number }> = [
  {
    tokens: [
      k("import"),
      p(" { "),
      fn("defineWorkflow"),
      p(" } "),
      k("from"),
      t(" "),
      s('"atomic-cli"'),
      p(";"),
    ],
  },
  // ... more lines
];

const tokenLength = (tokens: Token[]): number => tokens.reduce((n, x) => n + x.text.length, 0);

// Pre-compute char offsets so each line types after the previous finishes.
const CHARS_PER_FRAME = 2.4;
const lineStartFrame = (i: number, base: number): number => {
  let c = 0;
  for (let kk = 0; kk < i; kk++) c += tokenLength(CODE_LINES[kk].tokens) + 4;
  return base + c / CHARS_PER_FRAME;
};
```

**Variations / call-sites:**
- Each line rendered with `TypingTokens` component, passing computed `startFrame`
- Syntax highlighting tokens are color-coded using Catppuccin Mocha palette
- The complete workflow definition is deterministic and matches the actual `defineWorkflow()` API

---

#### Pattern 4: Orchestrator Graph Layout Determinism
**Where:** `src/components/orchestrator-grid/layout.ts:90-203`
**What:** DAG layout algorithm that positions workflow stage nodes deterministically. Given a set of sessions with parent-child relationships, produces reproducible character-cell grid coordinates.

```typescript
export function computeLayout(sessions: SessionData[]): LayoutResult {
  const map: Record<string, LayoutNode> = {};
  const roots: LayoutNode[] = [];
  const mergeNodes: LayoutNode[] = [];

  // Build dependency graph
  for (const s of sessions) {
    map[s.name] = {
      name: s.name,
      status: s.status,
      parents: s.parents,
      // ... other fields
      children: [],
      depth: 0,
      x: 0,
      y: 0,
    };
  }

  const effective = normalizeParents(sessions, map);

  // Establish parent-child relationships
  for (const s of sessions) {
    const ep = effective.get(s.name) ?? [];
    if (ep.length > 1) {
      mergeNodes.push(map[s.name]!);
    } else if (ep.length === 1 && map[ep[0]!]) {
      map[ep[0]!]!.children.push(map[s.name]!);
    } else {
      roots.push(map[s.name]!);
    }
  }

  // Resolve depth via recursion (same algorithm as SDK)
  const depthCache = new Map<string, number>();
  function resolveDepth(name: string): number {
    if (depthCache.has(name)) return depthCache.get(name)!;
    depthCache.set(name, 0);
    const ep = effective.get(name) ?? [];
    if (ep.length === 0) return 0;
    const maxParentDepth = Math.max(...ep.map((p) => resolveDepth(p)));
    const depth = maxParentDepth + 1;
    depthCache.set(name, depth);
    return depth;
  }
  for (const s of sessions) {
    map[s.name]!.depth = resolveDepth(s.name);
  }

  // ... overlap resolution and placement
  return { roots, map, rowH, width: maxX + PAD, height: maxY + PAD };
}
```

**Variations / call-sites:**
- Ported directly from `src/sdk/components/layout.ts` (production source of truth)
- Handles single-parent chains, multi-parent merges, and overlapping nodes
- Output coordinates are in character-cell units (scaled by font metrics at render time)

---

#### Pattern 5: Session Status State Machine for Nodes
**Where:** `src/components/OrchestratorChrome.tsx:282-426`
**What:** Node palette logic that maps deterministic session status to visual styling. Each status state has consistent color and glow properties.

```typescript
export type NodeState = "idle" | "running" | "complete" | "failed" | "hil";

const nodePalette = (state: NodeState) => {
  switch (state) {
    case "complete":
      return {
        border: colors.green,
        fill: "transparent",
        title: colors.green,
        duration: colors.mochaOverlay1,
      };
    case "running":
      return {
        border: colors.yellow,
        fill: "rgba(249,226,175,0.04)",
        title: colors.yellow,
        duration: colors.yellow,
      };
    case "failed":
      return {
        border: colors.red,
        fill: FAILED_FILL,
        title: colors.red,
        duration: colors.mochaOverlay1,
      };
    case "hil":
      return {
        border: HIL_BLUE,
        fill: HIL_BLUE_FILL,
        title: HIL_BLUE,
        duration: "rgba(137, 180, 250, 0.85)",
      };
    case "idle":
    default:
      return {
        border: colors.mochaOverlay0,
        fill: "transparent",
        title: colors.mochaSubtext0,
        duration: colors.mochaOverlay1,
      };
  }
};
```

**Variations / call-sites:**
- Also defined in `src/scenes/Beat3Workflow.tsx:704-740` (identical logic)
- `SessionStatus` from layout.ts defines: `"pending" | "running" | "complete" | "error" | "awaiting_input"`
- Visual mapping is 1:1 and deterministic for a given status

---

#### Pattern 6: Animation Timeline Choreography with Local Frame References
**Where:** `src/scenes/Beat3Workflow.tsx:267-275`
**What:** Multi-stage node appearance timeline where each stage activates at specific frames with consistent duration. Creates a choreographed sequence where nodes appear and pulse in order.

```typescript
const OrchestratorGraphTUI: React.FC<{ frame: number }> = ({ frame }) => {
  // Stage activation timeline (frames are local to Beat3).
  // TUI is fully on screen by f=175. Climax HIL transition at f=200..212.
  const plannerActive = clamp01((frame - 175) / 6);
  const orchActive = clamp01((frame - 182) / 6);
  const testActive = clamp01((frame - 189) / 6);
  const gateAppear = clamp01((frame - 196) / 6);
  const hilFocus = clamp01((frame - 200) / 12);

  const traceFade = clamp01((frame - 198) / 14);
```

**Variations / call-sites:**
- Each stage has a deterministic activation frame and ramp duration
- Staggered spacing (7-frame gaps) creates visual hierarchy: planner (175), orchestrator (182), test-runner (189), review-gate (196)
- Human-in-the-loop (HIL) focus climax at frame 200–212 is intentionally extended to allow viewer absorption

---

## Synthesis

The promo-video directory documents Atomic's deterministic workflow model through animation choreography. Key patterns:

1. **Frame-Based Timing**: All motion is absolute frame position, enabling deterministic replay
2. **Interpolation-Driven Animation**: Linear transitions between defined frame ranges ensure predictable state evolution
3. **Pre-Computed Sequences**: Character offsets and layout coordinates are calculated once, then used to drive rendering
4. **Session State Mapping**: Workflow stages have deterministic visual representations based on execution status
5. **DAG Layout Algorithm**: Graph positioning is deterministic given a set of parent-child relationships (ported from SDK source)
6. **Timeline Choreography**: Multi-stage sequences activate at specific frames with consistent durations, creating reproducible visual narratives

These patterns reflect the conceptual architecture of Atomic: workflows defined as code, execution tracked through deterministic session graphs, and human-in-the-loop gates that pause orchestration for human decision points.

## Out-of-Partition References
Look for the **Out-of-Partition References** subsection inside the
"How It Works" section above — that is where the analyzer flagged files
outside this partition that other partitions should examine.
