import React from "react";
import { colors, fonts } from "../theme";

/**
 * Reusable Atomic orchestrator TUI chrome — matches the design rendered
 * at second 17 of the promo video and the real product (`src/sdk/components/`):
 * devcontainer outer header → Atomic header (badge / workflow / agent / counts)
 * → canvas slot → statusline. Borrow visuals 1:1 from Beat3Workflow's
 * OrchestratorGraphTUI so all uses stay coherent.
 */

const SAPPHIRE_BORDER = "rgba(116, 199, 236, 0.80)";
const SAPPHIRE_BORDER_DIM = "rgba(116, 199, 236, 0.18)";
const SAPPHIRE_GLOW = "rgba(116, 199, 236, 0.55)";
export const HIL_BLUE = colors.blue;
export const HIL_BLUE_GLOW = "rgba(137, 180, 250, 0.45)";
export const HIL_BLUE_FILL = "rgba(137, 180, 250, 0.07)";
export const HIL_BLUE_FILL_FOCUSED = "rgba(137, 180, 250, 0.16)";
export const FAILED_FILL = "rgba(243, 139, 168, 0.08)";

export type CountBadge = { icon: string; value: number; color: string };
export type StatusHint = { k: string; label: string };

type ChromeProps = {
  devcontainerLabel?: string;
  workflowName: string;
  agent?: string;
  iter?: { current: number; total: number };
  counts?: CountBadge[];
  hints?: StatusHint[];
  /** Optional left-of-hints note, e.g. "1 awaiting human". */
  statuslineNote?: { icon?: string; iconColor?: string; text: string };
  /** 0..1 — pulses the sapphire devcontainer strip when emphasized. */
  pulseDevcontainer?: number;
  /** 0..1 — pulses the `ctrl+b d` chip in the statusline when emphasized. */
  pulseDetachHint?: number;
  /** 0..1 — extra outer sapphire glow (for sandbox emphasis). */
  outerGlow?: number;
  children: React.ReactNode;
};

const DEFAULT_HINTS: StatusHint[] = [
  { k: "↑↓←→", label: "navigate" },
  { k: "↵", label: "attach" },
  { k: "/", label: "stages" },
  { k: "ctrl+b d", label: "detach" },
  { k: "q", label: "quit" },
];

export const OrchestratorChrome: React.FC<ChromeProps> = ({
  devcontainerLabel = "devcontainer: ubuntu-22.04",
  workflowName,
  agent,
  iter,
  counts = [],
  hints = DEFAULT_HINTS,
  statuslineNote,
  pulseDevcontainer = 0,
  pulseDetachHint = 0,
  outerGlow = 0,
  children,
}) => {
  const baseShadow = `0 0 0 1px ${SAPPHIRE_BORDER_DIM}, 0 24px 60px rgba(8,8,16,0.55)`;
  const glowShadow = outerGlow > 0 ? `, 0 0 0 ${1 + outerGlow * 2}px ${SAPPHIRE_GLOW}, 0 0 ${20 + outerGlow * 60}px ${SAPPHIRE_GLOW}` : "";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: colors.mochaBase,
        border: `1.5px solid ${SAPPHIRE_BORDER}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: fonts.mono,
        fontVariantNumeric: "tabular-nums",
        boxShadow: baseShadow + glowShadow,
      }}
    >
      {/* Devcontainer header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          padding: "0 14px",
          backgroundColor: pulseDevcontainer > 0
            ? `rgba(20, 28, 38, ${0.92 + pulseDevcontainer * 0.06})`
            : "rgba(20, 28, 38, 0.92)",
          borderBottom: `1px solid ${SAPPHIRE_BORDER_DIM}`,
          fontSize: 13,
          letterSpacing: "0.04em",
          color: colors.coolSapphire,
          fontWeight: 700,
          flexShrink: 0,
          boxShadow: pulseDevcontainer > 0
            ? `inset 0 0 0 1px rgba(116,199,236,${0.25 + pulseDevcontainer * 0.55}), inset 0 -1px 0 0 rgba(116,199,236,${0.35 + pulseDevcontainer * 0.55})`
            : undefined,
          textShadow: pulseDevcontainer > 0.4 ? `0 0 8px ${SAPPHIRE_GLOW}` : undefined,
        }}
      >
        <span>{devcontainerLabel}</span>
        {pulseDevcontainer > 0.2 ? (
          <span
            style={{
              marginLeft: 12,
              padding: "1px 8px",
              fontSize: 11,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: colors.coolSapphire,
              border: `1px solid ${SAPPHIRE_BORDER}`,
              borderRadius: 3,
              opacity: pulseDevcontainer,
            }}
          >
            isolated
          </span>
        ) : null}
      </div>

      {/* Atomic orchestrator header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          backgroundColor: colors.mochaSurface0,
          flexShrink: 0,
          paddingRight: 14,
          fontSize: 14,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "100%",
            padding: "0 12px",
            backgroundColor: HIL_BLUE,
            color: colors.mochaSurface0,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          Orchestrator
        </span>
        <span style={{ marginLeft: 12, color: colors.mochaText, fontWeight: 500 }}>
          {workflowName}
          {agent ? <span style={{ color: colors.mochaOverlay1 }}> · {agent}</span> : null}
        </span>
        {iter ? (
          <span style={{ marginLeft: 18, color: colors.mochaOverlay1, fontSize: 13, letterSpacing: "0.04em" }}>
            iter <strong style={{ color: colors.yellow, fontWeight: 600 }}>{iter.current}</strong> / {iter.total}
          </span>
        ) : null}
        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 14,
            fontSize: 13,
            color: colors.mochaOverlay1,
          }}
        >
          {counts.map((c, i) => (
            <Tally key={i} color={c.color} icon={c.icon} value={c.value} />
          ))}
        </span>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", backgroundColor: colors.mochaBase }}>
        {children}
      </div>

      {/* Statusbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 28,
          backgroundColor: colors.mochaSurface0,
          flexShrink: 0,
          fontSize: 12,
          paddingRight: 14,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "100%",
            padding: "0 12px",
            backgroundColor: HIL_BLUE,
            color: colors.mochaSurface0,
            fontWeight: 700,
            letterSpacing: "0.02em",
            fontSize: 13,
          }}
        >
          GRAPH
        </span>
        {statuslineNote ? (
          <span
            style={{
              marginLeft: 12,
              color: colors.mochaOverlay1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {statuslineNote.icon ? (
              <span style={{ color: statuslineNote.iconColor ?? colors.mochaOverlay1 }}>{statuslineNote.icon}</span>
            ) : null}
            <span>{statuslineNote.text}</span>
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", color: colors.mochaSubtext0 }}>
          {hints.map((h, i) => {
            const isDetach = h.k === "ctrl+b d";
            const pulseStrength = isDetach ? pulseDetachHint : 0;
            return (
              <Hint
                key={i}
                k={h.k}
                label={h.label}
                pulseStrength={pulseStrength}
              />
            );
          })}
        </span>
      </div>
    </div>
  );
};

/* =============================================================================
   Primitives
============================================================================= */

const Tally: React.FC<{ color: string; icon: string; value: number }> = ({ color, icon, value }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    <span style={{ color }}>{icon}</span>
    <span style={{ color: colors.mochaOverlay1 }}>{value}</span>
  </span>
);

const Hint: React.FC<{ k: string; label: string; pulseStrength?: number }> = ({ k, label, pulseStrength = 0 }) => {
  const highlight = pulseStrength > 0;
  const keyColor = highlight ? colors.yellow : colors.mochaText;
  const labelColor = highlight ? colors.yellow : colors.mochaSubtext0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ color: colors.mochaOverlay0, padding: "0 8px" }}>·</span>
      <span
        style={{
          color: keyColor,
          letterSpacing: k.length > 1 ? "0.08em" : undefined,
          textShadow: highlight ? `0 0 8px rgba(249,226,175,${0.4 + pulseStrength * 0.5})` : undefined,
          padding: highlight ? "0 4px" : undefined,
          borderRadius: highlight ? 3 : undefined,
          backgroundColor: highlight ? `rgba(249,226,175,${0.05 + pulseStrength * 0.1})` : undefined,
        }}
      >
        {k}
      </span>
      <span style={{ color: labelColor }}>{label}</span>
    </span>
  );
};

/* =============================================================================
   OrchestratorNode — matches real product node-card.tsx semantics:
   bordered box, name in border title, duration centered, status-colored border,
   pulse for running / awaiting_input.
============================================================================= */

export type NodeState = "idle" | "running" | "complete" | "failed" | "hil";

export const OrchestratorNode: React.FC<{
  /** Pixel position of the node center. */
  cx: number;
  cy: number;
  width?: number;
  height?: number;
  title: string;
  duration?: string;
  state: NodeState;
  /** 0..1 entrance opacity / scale. */
  appear: number;
  /** Optional pulse phase (0..1) for running / awaiting_input ripple. */
  pulse?: number;
  /** When awaiting_input, render the "waiting for response" sub-text. */
  awaitingPrompt?: boolean;
  focused?: number;
}> = ({
  cx,
  cy,
  width = 200,
  height = 64,
  title,
  duration,
  state,
  appear,
  pulse = 0,
  awaitingPrompt = false,
  focused = 0,
}) => {
  const palette = nodePalette(state);
  // Pulse modulation for running / hil borders.
  const pulseMod = (Math.sin(pulse * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  let borderColor: string = palette.border;
  let glow: string = "none";
  if (state === "running") {
    borderColor = mix(colors.mochaOverlay0, colors.yellow, 0.35 + pulseMod * 0.65);
    glow = `0 0 ${4 + pulseMod * 18}px rgba(249,226,175,${0.18 + pulseMod * 0.30})`;
  } else if (state === "hil") {
    borderColor = focused > 0.3 ? "rgba(166, 207, 250, 1)" : mix(colors.mochaOverlay0, HIL_BLUE, 0.3 + pulseMod * 0.65);
    glow = focused > 0.3
      ? `0 0 0 1.5px ${HIL_BLUE_GLOW}, 0 0 28px ${HIL_BLUE_GLOW}`
      : `0 0 ${4 + pulseMod * 18}px rgba(137,180,250,${0.18 + pulseMod * 0.3})`;
  }

  const fill =
    state === "hil" && focused > 0.3
      ? HIL_BLUE_FILL_FOCUSED
      : palette.fill;

  const showDuration = duration ?? (state === "complete" || state === "failed" || state === "running" ? "—" : "—");
  const dh = awaitingPrompt ? height + 32 : height;

  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        width,
        height: dh,
        marginLeft: -width / 2,
        marginTop: -dh / 2,
        borderRadius: 8,
        border: `1.2px solid ${borderColor}`,
        backgroundColor: fill,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: appear,
        transform: `scale(${0.92 + appear * 0.08})`,
        boxShadow: glow,
        transition: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: -10,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "0 8px",
          background: colors.mochaBase,
          fontSize: 12,
          fontWeight: 600,
          color: palette.title,
          whiteSpace: "nowrap",
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 14, color: palette.duration, lineHeight: 1.2 }}>{showDuration}</span>
      {awaitingPrompt ? (
        <>
          <span style={{ fontSize: 12, color: HIL_BLUE, marginTop: 4 }}>waiting for response</span>
          <span style={{ fontSize: 11, color: colors.mochaOverlay1 }}>↵ enter to respond</span>
        </>
      ) : null}
    </div>
  );
};

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

/* =============================================================================
   SVG edge between two node anchors. Used for DAG fanout / merge.
============================================================================= */

export const OrchestratorEdge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state: "idle" | "running" | "complete" | "failed";
  appear: number;
  /** Optional intermediate waypoints for orthogonal Manhattan routing.
   *  One waypoint → L-elbow. Two waypoints → Z-shape. Empty/omitted →
   *  straight line from (x1,y1) to (x2,y2). */
  corners?: Array<{ x: number; y: number }>;
}> = ({ x1, y1, x2, y2, state, appear, corners }) => {
  const stroke =
    state === "complete"
      ? "rgba(166, 227, 161, 0.65)"
      : state === "running"
        ? "rgba(249,226,175,0.75)"
        : state === "failed"
          ? "rgba(243, 139, 168, 0.70)"
          : colors.mochaOverlay0;

  // Straight, L, or Z connector — DAG edges in the real product are unbent
  // polylines with 90° turns at each corner.
  const segments =
    corners && corners.length > 0
      ? corners.map((c) => `L ${c.x} ${c.y}`).join(" ") + ` L ${x2} ${y2}`
      : `L ${x2} ${y2}`;
  const path = `M ${x1} ${y1} ${segments}`;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: appear,
      }}
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={state === "idle" ? "3 4" : undefined}
      />
    </svg>
  );
};

/* =============================================================================
   helpers
============================================================================= */

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const mix = (a: string, b: string, t: number): string => {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return b;
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
};

const parseHex = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
};
