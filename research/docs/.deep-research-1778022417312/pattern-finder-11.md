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
