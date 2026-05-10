// Ported verbatim from src/sdk/components/connectors.ts (production source of truth).
// The only divergence: the `theme` parameter is replaced with a single `borderColor`
// string since the promo doesn't carry a full GraphTheme. Junction-character logic
// and layout semantics are unchanged.

import { NODE_W, NODE_H, type LayoutNode } from "./layout";

export interface ConnectorResult {
  text: string;
  col: number;
  row: number;
  width: number;
  height: number;
  color: string;
}

export function buildConnector(
  parent: LayoutNode,
  rowH: Record<number, number>,
  borderColor: string,
): ConnectorResult | null {
  if (parent.children.length === 0) return null;

  const pcx = parent.x + Math.floor(NODE_W / 2);
  const parentBottom = parent.y + (rowH[parent.depth] ?? NODE_H);
  const firstChildRow = Math.min(...parent.children.map((c: LayoutNode) => c.y));
  const numRows = firstChildRow - parentBottom;
  if (numRows < 1) return null;

  const childCxs = parent.children.map((c: LayoutNode) => c.x + Math.floor(NODE_W / 2));
  const isStraight = parent.children.length === 1 && childCxs[0] === pcx;

  if (isStraight) {
    const text = Array(numRows).fill("│").join("\n");
    return {
      text,
      col: pcx,
      row: parentBottom,
      width: 1,
      height: numRows,
      color: borderColor,
    };
  }

  const allCols = [pcx, ...childCxs];
  const minCol = Math.min(...allCols);
  const maxCol = Math.max(...allCols);
  const width = maxCol - minCol + 1;
  const toL = (c: number) => c - minCol;

  const barRow = numRows - 1;
  const grid: string[][] = Array.from({ length: numRows }, () => Array(width).fill(" "));

  for (let r = 0; r < barRow; r++) grid[r]![toL(pcx)] = "│";

  for (let c = 0; c < width; c++) grid[barRow]![c] = "─";

  const childAtParent = childCxs.includes(pcx);
  const pl = toL(pcx);
  if (pcx === minCol) {
    grid[barRow]![pl] = childAtParent ? "├" : "╰";
  } else if (pcx === maxCol) {
    grid[barRow]![pl] = childAtParent ? "┤" : "╯";
  } else {
    grid[barRow]![pl] = childAtParent ? "┼" : "┴";
  }

  for (const cx of childCxs) {
    if (cx === pcx) continue;
    const cl = toL(cx);
    if (cx === minCol) grid[barRow]![cl] = "╭";
    else if (cx === maxCol) grid[barRow]![cl] = "╮";
    else grid[barRow]![cl] = "┬";
  }

  return {
    text: grid.map((row) => row.join("")).join("\n"),
    col: minCol,
    row: parentBottom,
    width,
    height: numRows,
    color: borderColor,
  };
}

export function buildMergeConnector(
  child: LayoutNode,
  rowH: Record<number, number>,
  allNodes: Record<string, LayoutNode>,
  borderColor: string,
): ConnectorResult | null {
  if (child.parents.length < 2) return null;

  const parentNodes = child.parents
    .map((p) => allNodes[p])
    .filter((n): n is LayoutNode => n != null);
  if (parentNodes.length < 2) return null;

  const parentCxs = parentNodes.map((p) => p.x + Math.floor(NODE_W / 2));
  const childCx = child.x + Math.floor(NODE_W / 2);

  const parentBottom = Math.max(
    ...parentNodes.map((p) => p.y + (rowH[p.depth] ?? NODE_H)),
  );
  const childTop = child.y;
  const numRows = childTop - parentBottom;
  if (numRows < 1) return null;

  const allCols = [...parentCxs, childCx];
  const minCol = Math.min(...allCols);
  const maxCol = Math.max(...allCols);
  const width = maxCol - minCol + 1;
  const toL = (c: number) => c - minCol;

  const grid: string[][] = Array.from({ length: numRows }, () => Array(width).fill(" "));

  const barRow = 0;
  for (let c = 0; c < width; c++) grid[barRow]![c] = "─";

  for (let r = barRow + 1; r < numRows; r++) grid[r]![toL(childCx)] = "│";

  const parentSet = new Set(parentCxs);
  for (const cx of allCols) {
    const cl = toL(cx);
    const hasUp = parentSet.has(cx);
    const hasDown = cx === childCx;
    const isLeft = cx === minCol;
    const isRight = cx === maxCol;

    if (hasUp && hasDown) {
      grid[barRow]![cl] = isLeft ? "├" : isRight ? "┤" : "┼";
    } else if (hasUp) {
      grid[barRow]![cl] = isLeft ? "╰" : isRight ? "╯" : "┴";
    } else if (hasDown) {
      grid[barRow]![cl] = isLeft ? "╭" : isRight ? "╮" : "┬";
    }
  }

  return {
    text: grid.map((row) => row.join("")).join("\n"),
    col: minCol,
    row: parentBottom,
    width,
    height: numRows,
    color: borderColor,
  };
}
