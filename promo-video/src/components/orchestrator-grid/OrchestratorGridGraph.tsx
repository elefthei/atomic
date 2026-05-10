import React from "react";
import { colors, fonts } from "../../theme";
import {
  computeLayout,
  NODE_W,
  NODE_H,
  type LayoutNode,
  type SessionData,
  type SessionStatus,
} from "./layout";
import { buildConnector, buildMergeConnector, type ConnectorResult } from "./connectors";

/**
 * Remotion-friendly renderer for the production Atomic graph layout.
 * Layout + connector logic is identical to src/sdk/components/{layout,connectors}.ts;
 * this file only translates the resulting character-cell grid into DOM elements
 * (a <pre> per connector, a <pre> + overlaid duration per node).
 */

export type GridNodeInput = {
  name: string;
  status: SessionStatus;
  parents: string[];
  /** Pre-formatted duration shown inside the box, e.g. "0:14" or "—". */
  duration: string;
  /** 0..1 entrance opacity for this specific node. */
  appear: number;
  /**
   * 0..1 entrance opacity for the fan-out connector drawn below this node.
   * Lets edges animate in *after* the parent box has fully appeared.
   * Defaults to `appear`.
   */
  outgoingEdgeAppear?: number;
  /**
   * 0..1 entrance opacity for the fan-in (merge) connector drawn above this
   * node when it has multiple parents. Lets the merge animate in just before
   * the box. Defaults to `appear`.
   */
  incomingEdgeAppear?: number;
};

type Props = {
  nodes: GridNodeInput[];
  /** 0..1, drives the running-state border pulse. */
  pulsePhase: number;
  /** Cell-grid font size in px. Defaults to 18. */
  fontSize?: number;
};

const BORDER_DIM = colors.mochaOverlay0;

export const OrchestratorGridGraph: React.FC<Props> = ({
  nodes,
  pulsePhase,
  fontSize = 18,
}) => {
  // JetBrains Mono advance width is ~0.6 em.
  const cellW = fontSize * 0.6;
  const cellH = fontSize * 1.2;

  const sessions: SessionData[] = nodes.map((n) => ({
    name: n.name,
    status: n.status,
    parents: n.parents,
    startedAt: null,
    endedAt: null,
  }));
  const inputByName = new Map(nodes.map((n) => [n.name, n]));

  const layout = computeLayout(sessions);
  const allNodes = Object.values(layout.map);

  type Drawn = { conn: ConnectorResult; appear: number };
  const drawn: Drawn[] = [];
  for (const n of allNodes) {
    const input = inputByName.get(n.name);
    const fanOut = buildConnector(n, layout.rowH, BORDER_DIM);
    if (fanOut) {
      drawn.push({ conn: fanOut, appear: input?.outgoingEdgeAppear ?? input?.appear ?? 1 });
    }
    if (n.parents.length > 1) {
      const fanIn = buildMergeConnector(n, layout.rowH, layout.map, BORDER_DIM);
      if (fanIn) {
        drawn.push({ conn: fanIn, appear: input?.incomingEdgeAppear ?? input?.appear ?? 1 });
      }
    }
  }

  const pxW = layout.width * cellW;
  const pxH = layout.height * cellH;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: pxW,
        height: pxH,
        transform: `translate(-${pxW / 2}px, -${pxH / 2}px)`,
        fontFamily: fonts.mono,
        fontSize,
        lineHeight: `${cellH}px`,
        fontVariantLigatures: "none",
      }}
    >
      {drawn.map((d, i) => (
        <ConnectorText key={`e${i}`} conn={d.conn} appear={d.appear} cellW={cellW} cellH={cellH} fontSize={fontSize} />
      ))}
      {allNodes.map((n) => {
        const input = inputByName.get(n.name);
        if (!input) return null;
        const displayH = layout.rowH[n.depth] ?? NODE_H;
        return (
          <NodeBox
            key={n.name}
            node={n}
            displayH={displayH}
            duration={input.duration}
            appear={input.appear}
            pulsePhase={pulsePhase}
            cellW={cellW}
            cellH={cellH}
            fontSize={fontSize}
          />
        );
      })}
    </div>
  );
};

const ConnectorText: React.FC<{
  conn: ConnectorResult;
  appear: number;
  cellW: number;
  cellH: number;
  fontSize: number;
}> = ({ conn, appear, cellW, cellH, fontSize }) => (
  <pre
    style={{
      position: "absolute",
      left: conn.col * cellW,
      top: conn.row * cellH,
      width: conn.width * cellW,
      height: conn.height * cellH,
      margin: 0,
      padding: 0,
      fontFamily: fonts.mono,
      fontSize,
      lineHeight: `${cellH}px`,
      color: conn.color,
      opacity: appear,
      whiteSpace: "pre",
      pointerEvents: "none",
    }}
  >
    {conn.text}
  </pre>
);

const NodeBox: React.FC<{
  node: LayoutNode;
  displayH: number;
  duration: string;
  appear: number;
  pulsePhase: number;
  cellW: number;
  cellH: number;
  fontSize: number;
}> = ({ node, displayH, duration, appear, pulsePhase, cellW, cellH, fontSize }) => {
  const palette = nodePalette(node.status, pulsePhase);
  const text = buildNodeText(node.name, displayH);

  const left = node.x * cellW;
  const top = node.y * cellH;
  const width = NODE_W * cellW;
  const height = displayH * cellH;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        opacity: appear,
        transform: `scale(${0.96 + appear * 0.04})`,
        transformOrigin: "center center",
      }}
    >
      <pre
        style={{
          position: "absolute",
          inset: 0,
          margin: 0,
          padding: 0,
          fontFamily: fonts.mono,
          fontSize,
          lineHeight: `${cellH}px`,
          color: palette.border,
          whiteSpace: "pre",
          pointerEvents: "none",
          textShadow: palette.glow,
        }}
      >
        {text}
      </pre>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: cellH * Math.floor(displayH / 2),
          height: cellH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.mono,
          fontSize,
          lineHeight: `${cellH}px`,
          color: palette.duration,
          pointerEvents: "none",
        }}
      >
        {duration}
      </div>
    </div>
  );
};

function buildNodeText(name: string, displayH: number): string {
  const inner = NODE_W - 2;
  const titlePadded = ` ${name} `;
  const dashPad = Math.max(0, inner - titlePadded.length);
  const lp = Math.floor(dashPad / 2);
  const rp = dashPad - lp;
  const top = "╭" + "─".repeat(lp) + titlePadded + "─".repeat(rp) + "╮";
  const bottom = "╰" + "─".repeat(inner) + "╯";
  const blank = "│" + " ".repeat(inner) + "│";
  const lines: string[] = [top];
  for (let i = 0; i < displayH - 2; i++) lines.push(blank);
  lines.push(bottom);
  return lines.join("\n");
}

function nodePalette(status: SessionStatus, pulsePhase: number): {
  border: string;
  duration: string;
  glow: string | undefined;
} {
  const pulseMod = (Math.sin(pulsePhase * Math.PI * 2 - Math.PI / 2) + 1) / 2;

  switch (status) {
    case "complete":
      return {
        border: colors.green,
        duration: colors.green,
        glow: undefined,
      };
    case "running":
      return {
        border: mix(BORDER_DIM, colors.yellow, 0.35 + pulseMod * 0.65),
        duration: colors.yellow,
        glow: `0 0 ${4 + pulseMod * 12}px rgba(249,226,175,${0.18 + pulseMod * 0.3})`,
      };
    case "error":
      return {
        border: colors.red,
        duration: colors.red,
        glow: undefined,
      };
    case "awaiting_input":
      return {
        border: mix(BORDER_DIM, colors.blue, 0.35 + pulseMod * 0.65),
        duration: colors.blue,
        glow: `0 0 ${4 + pulseMod * 12}px rgba(137,180,250,${0.18 + pulseMod * 0.3})`,
      };
    case "pending":
    default:
      return {
        border: BORDER_DIM,
        duration: colors.mochaSubtext0,
        glow: undefined,
      };
  }
}

function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return b;
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
