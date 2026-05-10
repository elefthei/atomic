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
