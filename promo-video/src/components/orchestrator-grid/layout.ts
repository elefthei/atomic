// Ported verbatim from src/sdk/components/layout.ts (production source of truth).
// Pure positioning logic for the Atomic orchestrator graph. Outputs character-cell
// coordinates that the Remotion renderer multiplies by a cell metric to draw.

export type SessionStatus = "pending" | "running" | "complete" | "error" | "awaiting_input";

export interface SessionData {
  name: string;
  status: SessionStatus;
  parents: string[];
  error?: string;
  startedAt: number | null;
  endedAt: number | null;
}

export const NODE_W = 36;
export const NODE_H = 4;
export const H_GAP = 6;
export const V_GAP = 3;
export const PAD = 3;

export interface LayoutNode {
  name: string;
  status: SessionStatus;
  parents: string[];
  error?: string;
  startedAt: number | null;
  endedAt: number | null;
  children: LayoutNode[];
  depth: number;
  x: number;
  y: number;
}

export interface LayoutResult {
  roots: LayoutNode[];
  map: Record<string, LayoutNode>;
  rowH: Record<number, number>;
  width: number;
  height: number;
}

function shiftSubtree(n: LayoutNode, dx: number): void {
  n.x += dx;
  for (const c of n.children) shiftSubtree(c, dx);
}

function resolveOverlaps(map: Record<string, LayoutNode>): void {
  const byDepth: Record<number, LayoutNode[]> = {};
  for (const n of Object.values(map)) {
    (byDepth[n.depth] ??= []).push(n);
  }

  const depths = Object.keys(byDepth).map(Number).sort((a, b) => a - b);
  for (const d of depths) {
    const nodes = byDepth[d]!;
    if (nodes.length < 2) continue;
    nodes.sort((a, b) => a.x - b.x);
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1]!;
      const curr = nodes[i]!;
      const minX = prev.x + NODE_W + H_GAP;
      if (curr.x < minX) {
        shiftSubtree(curr, minX - curr.x);
      }
    }
  }
}

function normalizeParents(
  sessions: SessionData[],
  map: Record<string, LayoutNode>,
): Map<string, string[]> {
  const hasOrchestrator = "orchestrator" in map;
  const effective = new Map<string, string[]>();

  for (const s of sessions) {
    const valid = [...new Set(s.parents)].filter((p) => p in map);
    if (valid.length > 0) {
      effective.set(s.name, valid);
    } else if (hasOrchestrator && s.name !== "orchestrator") {
      effective.set(s.name, ["orchestrator"]);
    } else {
      effective.set(s.name, []);
    }
  }
  return effective;
}

export function computeLayout(sessions: SessionData[]): LayoutResult {
  const map: Record<string, LayoutNode> = {};
  const roots: LayoutNode[] = [];
  const mergeNodes: LayoutNode[] = [];

  for (const s of sessions) {
    map[s.name] = {
      name: s.name,
      status: s.status,
      parents: s.parents,
      error: s.error,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      children: [],
      depth: 0,
      x: 0,
      y: 0,
    };
  }

  const effective = normalizeParents(sessions, map);

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

  const rowH: Record<number, number> = {};
  for (const n of Object.values(map)) {
    const nodeHeight = n.status === "awaiting_input" ? 6 : NODE_H;
    rowH[n.depth] = Math.max(rowH[n.depth] ?? 0, nodeHeight);
  }

  function yAt(d: number): number {
    let y = 0;
    for (let i = 0; i < d; i++) y += (rowH[i] ?? NODE_H) + V_GAP;
    return y;
  }

  let cursor = 0;

  function place(n: LayoutNode) {
    if (n.children.length === 0) {
      n.x = cursor;
      n.y = yAt(n.depth);
      cursor += NODE_W + H_GAP;
    } else {
      for (const c of n.children) place(c);
      const first = n.children[0]!;
      const last = n.children[n.children.length - 1]!;
      n.x = Math.round((first.x + last.x) / 2);
      n.y = yAt(n.depth);
    }
  }

  let firstRoot = true;
  for (const r of roots) {
    if (!firstRoot) cursor += H_GAP;
    place(r);
    firstRoot = false;
  }

  for (const m of mergeNodes) {
    const ep = effective.get(m.name) ?? [];
    const parentCenters = ep.map((p) => (map[p]?.x ?? 0) + Math.floor(NODE_W / 2));
    const avgCenter = Math.round(parentCenters.reduce((a, b) => a + b, 0) / parentCenters.length);

    if (m.children.length > 0) {
      place(m);
      const currentCenter = m.x + Math.floor(NODE_W / 2);
      const dx = avgCenter - currentCenter;
      shiftSubtree(m, dx);
    } else {
      m.x = avgCenter - Math.floor(NODE_W / 2);
      m.y = yAt(m.depth);
    }
  }

  resolveOverlaps(map);

  for (const n of Object.values(map)) {
    n.x += PAD;
    n.y += PAD;
  }

  let maxX = 0;
  let maxY = 0;
  for (const n of Object.values(map)) {
    maxX = Math.max(maxX, n.x + NODE_W);
    maxY = Math.max(maxY, n.y + NODE_H);
  }

  return { roots, map, rowH, width: maxX + PAD, height: maxY + PAD };
}
