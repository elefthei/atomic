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
