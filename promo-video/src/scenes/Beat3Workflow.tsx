import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { LiquidSilk } from "../components/LiquidSilk";
import { FilmGrain } from "../components/FilmGrain";
import { TUIFrame } from "../components/TUIFrame";
import { TypingTokens, type Token } from "../components/TypingTokens";
import { colors, fonts } from "../theme";

// Catppuccin Mocha syntax palette
const SYN = {
  keyword: colors.mauve, // import, export, default, from
  fn: colors.blue, // defineWorkflow, stage, compile
  string: colors.green, // "..."
  key: colors.yellow, // object keys: agent, gate
  punct: colors.mochaOverlay1, // braces, parens, dots, commas, semicolons
  text: colors.mochaText,
} as const;

const k = (text: string): Token => ({ text, color: SYN.keyword });
const fn = (text: string): Token => ({ text, color: SYN.fn });
const s = (text: string): Token => ({ text, color: SYN.string });
const key = (text: string): Token => ({ text, color: SYN.key });
const p = (text: string): Token => ({ text, color: SYN.punct });
const t = (text: string): Token => ({ text, color: SYN.text });

const CODE_LINES: Array<{ tokens: Token[]; indent?: number }> = [
  // import { defineWorkflow } from "@bastani/atomic/workflows";
  {
    tokens: [
      k("import"),
      p(" { "),
      fn("defineWorkflow"),
      p(" } "),
      k("from"),
      t(" "),
      s('"@bastani/atomic/workflows"'),
      p(";"),
    ],
  },
  { tokens: [] },
  // export default defineWorkflow({ name: "ship-feature" })
  {
    tokens: [
      k("export"),
      t(" "),
      k("default"),
      t(" "),
      fn("defineWorkflow"),
      p("({ "),
      key("name"),
      p(": "),
      s('"ship-feature"'),
      p(" })"),
    ],
  },
  // .for("claude")
  {
    indent: 2,
    tokens: [p("."), fn("for"), p("("), s('"claude"'), p(")")],
  },
  // .run(async (ctx) => {
  {
    indent: 2,
    tokens: [
      p("."),
      fn("run"),
      p("("),
      k("async"),
      p(" ("),
      t("ctx"),
      p(") => {"),
    ],
  },
  // await ctx.stage({ name: "planner" },     {}, {}, plan);
  {
    indent: 4,
    tokens: [
      k("await"),
      t(" ctx"),
      p("."),
      fn("stage"),
      p("({ "),
      key("name"),
      p(": "),
      s('"planner"'),
      p(" },     {}, {}, "),
      fn("plan"),
      p(");"),
    ],
  },
  // await ctx.stage({ name: "build" },       {}, {}, build);
  {
    indent: 4,
    tokens: [
      k("await"),
      t(" ctx"),
      p("."),
      fn("stage"),
      p("({ "),
      key("name"),
      p(": "),
      s('"build"'),
      p(" },       {}, {}, "),
      fn("build"),
      p(");"),
    ],
  },
  // await ctx.stage({ name: "test" },        {}, {}, test);
  {
    indent: 4,
    tokens: [
      k("await"),
      t(" ctx"),
      p("."),
      fn("stage"),
      p("({ "),
      key("name"),
      p(": "),
      s('"test"'),
      p(" },        {}, {}, "),
      fn("test"),
      p(");"),
    ],
  },
  // await ctx.stage({ name: "review" },      {}, {}, review);
  {
    indent: 4,
    tokens: [
      k("await"),
      t(" ctx"),
      p("."),
      fn("stage"),
      p("({ "),
      key("name"),
      p(": "),
      s('"review"'),
      p(" },      {}, {}, "),
      fn("review"),
      p(");"),
    ],
  },
  // })
  { indent: 2, tokens: [p("})")] },
  // .compile();
  { indent: 2, tokens: [p("."), fn("compile"), p("();")] },
];

const tokenLength = (tokens: Token[]): number => tokens.reduce((n, x) => n + x.text.length, 0);

// Pre-compute char offsets so each line types after the previous finishes.
const CHARS_PER_FRAME = 4;
const lineStartFrame = (i: number, base: number): number => {
  let c = 0;
  for (let kk = 0; kk < i; kk++) c += tokenLength(CODE_LINES[kk].tokens) + 4;
  return base + c / CHARS_PER_FRAME;
};

/**
 * Beat 3 — Product reveal. Code editor types out a workflow definition,
 * then slides left as the orchestrator graph TUI animates in: nodes
 * complete in sequence (all green) and the final review-gate snaps into
 * the blue HIL "awaiting human" state for sign-off before merge.
 * Local frames: 0..269 (9s @ 30fps) — animation completes by f≈212, final
 * HIL state holds for ~58 extra frames so viewers can absorb the graph.
 */
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

  // Cursor follows the line currently being typed; lands on the last line once done.
  const activeLineIndex = (() => {
    for (let i = 0; i < CODE_LINES.length; i++) {
      const start = lineStartFrame(i, 22);
      const end = start + tokenLength(CODE_LINES[i].tokens) / CHARS_PER_FRAME;
      if (frame < end) return i;
    }
    return CODE_LINES.length - 1;
  })();

  return (
    <AbsoluteFill style={{ backgroundColor: colors.mochaCrust }}>
      {/* Cool right-edge silk over deep mocha */}
      <AbsoluteFill style={{ opacity: 0.6 }}>
        <LiquidSilk pole="cool" rotateSpeed={0.04} blur={120} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 30% 50%, #11111b 0%, transparent 60%)" }} />

      {/* Editor pane */}
      <div
        style={{
          position: "absolute",
          top: 130,
          left: 160,
          width: 1200,
          height: 760,
          opacity: editorOpacity,
          transform: `translate(${editorX}px, ${editorY}px) scale(${editorScale})`,
          transformOrigin: "left center",
        }}
      >
        <TUIFrame
          badge="EDITOR"
          badgeColor={colors.blue}
          session="workflows/ship-feature.ts"
          counts={[{ label: "•", value: "typescript", color: colors.coolSky }]}
          height="100%"
        >
          <div style={{ fontSize: 22, lineHeight: 1.65 }}>
            {CODE_LINES.map((line, i) => {
              const start = lineStartFrame(i, 22);
              const indent = " ".repeat(line.indent ?? 0);
              return (
                <div key={i} style={{ minHeight: 30 }}>
                  <span style={{ color: colors.mochaOverlay0, marginRight: 18, userSelect: "none" }}>
                    {String(i + 1).padStart(2, " ")}
                  </span>
                  {indent}
                  <TypingTokens
                    tokens={line.tokens}
                    startFrame={start}
                    charsPerFrame={CHARS_PER_FRAME}
                    cursor={i === activeLineIndex}
                    cursorChar="▍"
                    defaultColor={SYN.text}
                  />
                </div>
              );
            })}
          </div>
        </TUIFrame>
      </div>

      {/* Orchestrator graph TUI on the right */}
      <div
        style={{
          position: "absolute",
          top: 110,
          right: 80,
          width: 880,
          height: 820,
          opacity: tuiOpacity,
          transform: `translateX(${tuiX}px)`,
        }}
      >
        <OrchestratorGraphTUI frame={frame} />
      </div>

      <FilmGrain opacity={0.16} />
    </AbsoluteFill>
  );
};

/* =============================================================================
   Orchestrator graph TUI — full devcontainer-wrapped graph view that mirrors
   assets/product-hunt/slides/human-in-the-loop.html. Climaxes at f=200..210
   with the review-gate transitioning into the blue HIL focused state.
============================================================================= */

const SAPPHIRE_BORDER = "rgba(116, 199, 236, 0.80)";
const SAPPHIRE_BORDER_DIM = "rgba(116, 199, 236, 0.18)";
const HIL_BLUE = colors.blue;
const HIL_BLUE_GLOW = "rgba(137, 180, 250, 0.45)";
const HIL_BLUE_FILL = "rgba(137, 180, 250, 0.07)";
const HIL_BLUE_FILL_FOCUSED = "rgba(137, 180, 250, 0.16)";
const FAILED_FILL = "rgba(243, 139, 168, 0.08)";
const LOOP_MAUVE = "rgba(203, 166, 247, 0.92)";

type NodeState = "idle" | "complete" | "failed" | "hil";

const OrchestratorGraphTUI: React.FC<{ frame: number }> = ({ frame }) => {
  // Stage activation timeline (frames are local to Beat3).
  // TUI is fully on screen by f=175. Climax HIL transition at f=200..212.
  const plannerActive = clamp01((frame - 175) / 6);
  const orchActive = clamp01((frame - 182) / 6);
  const testActive = clamp01((frame - 189) / 6);
  const gateAppear = clamp01((frame - 196) / 6);
  const hilFocus = clamp01((frame - 200) / 12);

  const traceFade = clamp01((frame - 198) / 14);

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
        boxShadow: `0 0 0 1px ${SAPPHIRE_BORDER_DIM}, 0 24px 60px rgba(8,8,16,0.55)`,
      }}
    >
      {/* Devcontainer header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          padding: "0 14px",
          backgroundColor: "rgba(20, 28, 38, 0.92)",
          borderBottom: `1px solid ${SAPPHIRE_BORDER_DIM}`,
          fontSize: 13,
          letterSpacing: "0.04em",
          color: colors.coolSapphire,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        devcontainer: ubuntu-22.04
      </div>

      {/* Atomic TUI header */}
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
          atomic-prod-pipeline
          <span style={{ color: colors.mochaOverlay1 }}> · claude</span>
        </span>
        <span style={{ marginLeft: 18, color: colors.mochaOverlay1, fontSize: 13, letterSpacing: "0.04em" }}>
          iter <strong style={{ color: colors.yellow, fontWeight: 600 }}>3</strong> / 8
        </span>
        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 14,
            fontSize: 13,
            color: colors.mochaOverlay1,
          }}
        >
          <Tally color={colors.green} icon="✓" value={countComplete(plannerActive, orchActive, testActive)} />
          <Tally color={colors.yellow} icon="●" value={0} />
          <Tally color={HIL_BLUE} icon="?" value={hilFocus > 0.4 ? 1 : 0} />
          <Tally color={colors.mochaOverlay1} icon="○" value={hilFocus > 0.4 ? 1 : 0} />
          <Tally color={colors.red} icon="✗" value={0} />
        </span>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", backgroundColor: colors.mochaBase }}>
        {/* Trunk edges between nodes — each grows in sync with the downstream node it connects */}
        <Edge
          top={108}
          height={84}
          state={plannerActive > 0.6 && orchActive > 0 ? "complete" : "idle"}
          appear={orchActive}
        />
        <Edge
          top={248}
          height={84}
          state={orchActive > 0.6 && testActive > 0 ? "complete" : "idle"}
          appear={testActive}
        />
        <Edge
          top={388}
          height={84}
          state={testActive > 0.6 && gateAppear > 0 ? "complete" : "idle"}
          appear={gateAppear}
        />

        {/* Loop arc — mauve dashed, fades in with HIL focus */}
        <svg
          width="220"
          height="560"
          viewBox="0 0 220 560"
          style={{
            position: "absolute",
            right: 32,
            top: 14,
            pointerEvents: "none",
            opacity: hilFocus * 0.95,
          }}
        >
          <defs>
            <marker
              id="loopArrowMauve"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={LOOP_MAUVE} />
            </marker>
          </defs>
          <path
            d="M 14 550 C 200 550, 210 355, 210 295 C 210 151, 200 72, 14 72"
            fill="none"
            stroke={LOOP_MAUVE}
            strokeWidth="1.6"
            strokeDasharray="4 4"
            markerEnd="url(#loopArrowMauve)"
          />
        </svg>

        {/* Loop label */}
        <div
          style={{
            position: "absolute",
            right: 18,
            top: 299,
            fontSize: 11,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: LOOP_MAUVE,
            background: colors.mochaBase,
            padding: "1px 6px",
            opacity: hilFocus,
          }}
        >
          human verdict → re-plan
        </div>

        {/* Nodes */}
        <Node
          top={80}
          title="planner-3"
          status="✓ complete"
          duration="1:42"
          state="complete"
          appear={plannerActive}
        />
        <Node
          top={220}
          title="orchestrator-3"
          status="✓ complete"
          duration="4:06"
          state="complete"
          appear={orchActive}
        />
        <Node
          top={360}
          title="test-runner-3"
          status="✓ all specs passed"
          duration="0:38"
          state="complete"
          appear={testActive}
        />
        <Node
          top={500}
          title="review-gate"
          status={hilFocus > 0.3 ? "? awaiting human" : "○ pending"}
          duration={hilFocus > 0.3 ? "0:22" : "—"}
          state={hilFocus > 0.3 ? "hil" : "idle"}
          appear={gateAppear}
          focused={hilFocus}
        />

        {/* Stage trace */}
        <div
          style={{
            position: "absolute",
            left: 32,
            right: 32,
            top: 590,
            fontSize: 12,
            lineHeight: 1.55,
            color: colors.mochaSubtext0,
            opacity: traceFade,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: colors.mochaOverlay1,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: 11,
              marginBottom: 8,
            }}
          >
            <span style={{ flex: "0 0 16px", height: 1, background: colors.mochaOverlay0 }} />
            <span>stage trace · gated</span>
            <span style={{ flex: 1, height: 1, background: colors.mochaOverlay0 }} />
            <span style={{ color: colors.mochaOverlay0 }}>3 entries</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "16px 1fr auto auto",
              columnGap: 12,
              rowGap: 2,
            }}
          >
            <span style={{ color: colors.green }}>✓</span>
            <span style={{ color: colors.mochaText }}>test-runner-3</span>
            <span style={{ color: colors.mochaOverlay1 }}>jest · 142 specs · 0 failed</span>
            <span style={{ color: colors.green }}>passed</span>

            <span style={{ color: HIL_BLUE }}>?</span>
            <span style={{ color: colors.mochaText }}>review-gate</span>
            <span style={{ color: colors.mochaOverlay1 }}>awaiting sign-off · timeout 5m</span>
            <span style={{ color: HIL_BLUE }}>paused</span>

            <span style={{ color: colors.mochaOverlay1 }}>○</span>
            <span style={{ color: colors.mochaText }}>planner-4</span>
            <span style={{ color: colors.mochaOverlay1 }}>queued · blocked by review-gate</span>
            <span style={{ color: colors.mochaOverlay1 }}>pending</span>
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: `1px dashed ${colors.mochaOverlay0}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 11,
              color: colors.mochaOverlay1,
            }}
          >
            <span style={{ color: LOOP_MAUVE }}>◆</span>
            <span style={{ color: colors.mochaSubtext0 }}>human prompt</span>
            <span>policy: sign-off required before merge</span>
            <span style={{ color: colors.mochaOverlay0 }}>·</span>
            <span style={{ color: LOOP_MAUVE }}>"approve · request changes · abort"</span>
          </div>
        </div>
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
        <span
          style={{
            marginLeft: 12,
            color: colors.mochaOverlay1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ color: HIL_BLUE }}>?</span>
          <span>{hilFocus > 0.4 ? "1 awaiting human" : "—"}</span>
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", color: colors.mochaSubtext0 }}>
          <Hint k="↑↓←→" label="navigate" />
          <Hint k="↵" label="respond" />
          <Hint k="/" label="stages" />
          <Hint k="ctrl+b d" label="detach" />
        </span>
      </div>
    </div>
  );
};

const Tally: React.FC<{ color: string; icon: string; value: number }> = ({ color, icon, value }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    <span style={{ color }}>{icon}</span>
    <span style={{ color: colors.mochaOverlay1 }}>{value}</span>
  </span>
);

const Hint: React.FC<{ k: string; label: string }> = ({ k, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
    <span style={{ color: colors.mochaOverlay0, padding: "0 8px" }}>·</span>
    <span style={{ color: colors.mochaText, letterSpacing: k.length > 1 ? "0.08em" : undefined }}>{k}</span>
    <span style={{ color: colors.mochaSubtext0 }}>{label}</span>
  </span>
);

const Edge: React.FC<{
  top: number;
  height: number;
  state: "idle" | "complete" | "failed";
  appear: number;
}> = ({ top, height, state, appear }) => {
  const bg =
    state === "complete"
      ? "rgba(166, 227, 161, 0.55)"
      : state === "failed"
        ? "rgba(243, 139, 168, 0.70)"
        : colors.mochaOverlay0;
  return (
    <div
      style={{
        position: "absolute",
        left: "calc(50% - 0.5px)",
        top,
        width: 1.5,
        height,
        backgroundColor: bg,
        opacity: appear,
        transform: `scaleY(${appear})`,
        transformOrigin: "top center",
      }}
    />
  );
};

const Node: React.FC<{
  top: number;
  title: string;
  status: string;
  duration: string;
  state: NodeState;
  appear: number;
  focused?: number;
}> = ({ top, title, status, duration, state, appear, focused = 0 }) => {
  const palette = nodePalette(state);
  const focusBoost = focused; // 0..1
  const borderColor =
    state === "hil" && focusBoost > 0.3 ? "rgba(166, 207, 250, 1)" : palette.border;
  const fill =
    state === "hil" && focusBoost > 0.3
      ? HIL_BLUE_FILL_FOCUSED
      : palette.fill;
  const glow =
    state === "hil" && focusBoost > 0.3
      ? `0 0 0 1.5px ${HIL_BLUE_GLOW}, 0 0 28px ${HIL_BLUE_GLOW}`
      : "none";

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top,
        width: 200,
        height: 64,
        marginLeft: -100,
        marginTop: -32,
        borderRadius: 8,
        border: `1.2px solid ${borderColor}`,
        backgroundColor: fill,
        display: "flex",
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontSize: 13, color: palette.status, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {status}
        </span>
        <span style={{ fontSize: 12, color: palette.duration }}>{duration}</span>
      </div>
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
        status: colors.green,
        duration: colors.mochaOverlay1,
      };
    case "failed":
      return {
        border: colors.red,
        fill: FAILED_FILL,
        title: colors.red,
        status: colors.red,
        duration: colors.mochaOverlay1,
      };
    case "hil":
      return {
        border: HIL_BLUE,
        fill: HIL_BLUE_FILL,
        title: HIL_BLUE,
        status: HIL_BLUE,
        duration: "rgba(137, 180, 250, 0.85)",
      };
    case "idle":
    default:
      return {
        border: colors.mochaOverlay0,
        fill: "transparent",
        title: colors.mochaSubtext0,
        status: colors.mochaSubtext0,
        duration: colors.mochaOverlay1,
      };
  }
};

const countComplete = (...progresses: number[]): number =>
  progresses.reduce((n, p) => n + (p > 0.6 ? 1 : 0), 0);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
