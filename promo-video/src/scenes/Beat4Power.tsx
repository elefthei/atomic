import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { LiquidSilk } from "../components/LiquidSilk";
import { FilmGrain } from "../components/FilmGrain";
import {
  OrchestratorChrome,
  OrchestratorNode,
  OrchestratorEdge,
  clamp01,
} from "../components/OrchestratorChrome";
import {
  OrchestratorGridGraph,
  type GridNodeInput,
} from "../components/orchestrator-grid/OrchestratorGridGraph";
import type { SessionStatus } from "../components/orchestrator-grid/layout";
import { colors, fonts } from "../theme";

/**
 * Beat 4 — Long-horizon proof. Three rapid TUI vignettes, hard cuts.
 * Each vignette renders inside the actual Atomic orchestrator chrome
 * (devcontainer header → Orchestrator badge / workflow / agent / counts →
 *  canvas → statusline) so the backdrop matches the product the viewer
 * already saw at second 17.
 *
 * Local frames: 0..299 (10s @ 30fps). Each vignette ~100 frames (action ~70, +30 linger).
 */
export const Beat4Power: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.mochaCrust }}>
      <AbsoluteFill style={{ opacity: 0.55 }}>
        <LiquidSilk pole="cool" rotateSpeed={0.06} blur={130} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at 70% 30%, rgba(116,199,236,0.22) 0%, transparent 55%)",
        }}
      />

      <Sequence from={0} durationInFrames={100}>
        <Vignette label="parallel" copy="Promise.all on ctx.stage — siblings run concurrently">
          <ParallelDAG />
        </Vignette>
      </Sequence>

      <Sequence from={100} durationInFrames={100}>
        <Vignette label="sandboxed" copy="agent runs inside the devcontainer, not your host">
          <SandboxedRun />
        </Vignette>
      </Sequence>

      <Sequence from={200} durationInFrames={100}>
        <Vignette label="deterministic" copy="same await order → same DAG, every run">
          <DeterministicReplay />
        </Vignette>
      </Sequence>

      <FilmGrain opacity={0.18} />
    </AbsoluteFill>
  );
};

const Vignette: React.FC<{ label: string; copy: string; children: React.ReactNode }> = ({
  label,
  copy,
  children,
}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 8], [40, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const opacity = interpolate(frame, [0, 8, 90, 100], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${enter}px)` }}>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 130,
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: 96,
          letterSpacing: "-0.025em",
          color: colors.textOnGradient,
          lineHeight: 1,
          textShadow: "0 4px 24px rgba(20,10,30,0.55)",
        }}
      >
        {label}.
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 250,
          maxWidth: 560,
          fontFamily: fonts.mono,
          fontSize: 22,
          color: colors.textOnGradientDim,
          letterSpacing: "0.04em",
          lineHeight: 1.45,
        }}
      >
        {copy}
      </div>

      <div
        style={{
          position: "absolute",
          right: 50,
          top: 160,
          width: 1020,
          height: 760,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/* =============================================================================
   Vignette 1 — parallel.
   Diamond DAG rendered through the production grid renderer
   (computeLayout + buildConnector / buildMergeConnector ported from
   src/sdk/components/{layout,connectors}.ts). One bar per fan-out, one bar
   per fan-in, junction characters drawn at every corner — same output as
   the real session-graph-panel.
============================================================================= */

const ParallelDAG: React.FC = () => {
  const frame = useCurrentFrame();

  // scan-source: appears, runs, completes.
  const scanAppear = clamp01((frame - 4) / 6);
  const scanRunning = clamp01((frame - 6) / 4);
  const scanComplete = clamp01((frame - 14) / 4);

  // Branch row 1 (analyze-cwe || check-cve): appear after scan completes.
  const b1Appear = clamp01((frame - 16) / 6);
  const b1Running = clamp01((frame - 18) / 4);
  const b1Complete = clamp01((frame - 30) / 4);

  // Branch row 2 (triage-findings || flag-criticals): appear after row 1.
  const b2Appear = clamp01((frame - 32) / 6);
  const b2Running = clamp01((frame - 34) / 4);
  const b2Complete = clamp01((frame - 46) / 4);

  // aggregator: appears after row 2 completes, holds in running through end.
  const aggAppear = clamp01((frame - 48) / 6);
  const aggRunning = clamp01((frame - 50) / 4);

  const stateOf = (running: number, complete: number): SessionStatus =>
    complete > 0.6 ? "complete" : running > 0.3 ? "running" : "pending";

  const scan = stateOf(scanRunning, scanComplete);
  const cwe = stateOf(b1Running, b1Complete);
  const cve = stateOf(b1Running, b1Complete);
  const triage = stateOf(b2Running, b2Complete);
  const flag = stateOf(b2Running, b2Complete);
  const agg: SessionStatus = aggRunning > 0.3 ? "running" : "pending";

  // Edges fade in *after* their parent box has fully appeared and *before*
  // the children boxes appear, so the DAG paints box → edge → box → edge …
  const scanEdgeOut = clamp01((frame - 12) / 4);
  const b1EdgeOut = clamp01((frame - 26) / 4);
  const b2EdgeOut = clamp01((frame - 42) / 4);
  const aggEdgeIn = clamp01((frame - 44) / 4);

  const nodes: GridNodeInput[] = [
    {
      name: "scan-source",
      status: scan,
      parents: [],
      duration: scan === "complete" ? "0:12" : scan === "running" ? liveDuration(frame, 6) : "—",
      appear: scanAppear,
      outgoingEdgeAppear: scanEdgeOut,
    },
    {
      name: "analyze-cwe",
      status: cwe,
      parents: ["scan-source"],
      duration: cwe === "complete" ? "0:14" : cwe === "running" ? liveDuration(frame, 18) : "—",
      appear: b1Appear,
      outgoingEdgeAppear: b1EdgeOut,
    },
    {
      name: "check-cve",
      status: cve,
      parents: ["scan-source"],
      duration: cve === "complete" ? "0:16" : cve === "running" ? liveDuration(frame, 18) : "—",
      appear: b1Appear,
      outgoingEdgeAppear: b1EdgeOut,
    },
    {
      name: "triage-findings",
      status: triage,
      parents: ["analyze-cwe"],
      duration: triage === "complete" ? "0:14" : triage === "running" ? liveDuration(frame, 34) : "—",
      appear: b2Appear,
      outgoingEdgeAppear: b2EdgeOut,
    },
    {
      name: "flag-criticals",
      status: flag,
      parents: ["check-cve"],
      duration: flag === "complete" ? "0:13" : flag === "running" ? liveDuration(frame, 34) : "—",
      appear: b2Appear,
      outgoingEdgeAppear: b2EdgeOut,
    },
    {
      name: "aggregator",
      status: agg,
      parents: ["triage-findings", "flag-criticals"],
      duration: agg === "running" ? liveDuration(frame, 50) : "—",
      appear: aggAppear,
      incomingEdgeAppear: aggEdgeIn,
    },
  ];

  const completeCount = nodes.filter((n) => n.status === "complete").length;
  const runningCount = nodes.filter((n) => n.status === "running").length;
  const pendingCount = nodes.filter((n) => n.status === "pending").length;

  const pulsePhase = (frame % 60) / 60;

  return (
    <OrchestratorChrome
      workflowName="security-scan"
      agent="claude"
      counts={[
        { icon: "✓", value: completeCount, color: colors.green },
        { icon: "●", value: runningCount, color: colors.yellow },
        { icon: "○", value: pendingCount, color: colors.mochaOverlay1 },
      ]}
      statuslineNote={
        runningCount >= 2
          ? { icon: "●", iconColor: colors.yellow, text: `${runningCount} running in parallel` }
          : undefined
      }
    >
      <OrchestratorGridGraph nodes={nodes} pulsePhase={pulsePhase} fontSize={17} />

      {/* Code echo: Promise.all middle slice — top-right, persists through vignette */}
      <CodeAnnotation visible={clamp01((frame - 10) / 8)} />
    </OrchestratorChrome>
  );
};

const CodeAnnotation: React.FC<{ visible: number }> = ({ visible }) => {
  const opacity = visible;
  if (opacity < 0.02) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 24,
        top: 24,
        padding: "12px 16px",
        backgroundColor: "rgba(17,17,27,0.86)",
        border: `1px solid ${colors.mochaSurface1}`,
        borderRadius: 6,
        fontFamily: fonts.mono,
        fontSize: 13,
        lineHeight: 1.6,
        color: colors.mochaSubtext1,
        opacity,
        boxShadow: "0 12px 24px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ color: colors.mochaOverlay1, fontSize: 11, letterSpacing: "0.10em", marginBottom: 6 }}>
        examples/security-scan
      </div>
      <div>
        <span style={{ color: colors.mauve }}>await</span>{" "}
        <span style={{ color: colors.blue }}>Promise.all</span>
        <span style={{ color: colors.mochaOverlay1 }}>([</span>
      </div>
      <div style={{ paddingLeft: 14 }}>
        <span style={{ color: colors.blue }}>ctx.stage</span>
        <span style={{ color: colors.mochaOverlay1 }}>(</span>
        <span style={{ color: colors.green }}>"analyze-cwe"</span>
        <span style={{ color: colors.mochaOverlay1 }}>),</span>
      </div>
      <div style={{ paddingLeft: 14 }}>
        <span style={{ color: colors.blue }}>ctx.stage</span>
        <span style={{ color: colors.mochaOverlay1 }}>(</span>
        <span style={{ color: colors.green }}>"check-cve"</span>
        <span style={{ color: colors.mochaOverlay1 }}>),</span>
      </div>
      <div>
        <span style={{ color: colors.mochaOverlay1 }}>])</span>
      </div>
    </div>
  );
};

const liveDuration = (frame: number, startFrame: number): string => {
  const sec = Math.max(0, Math.floor((frame - startFrame) / 2));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/* =============================================================================
   Vignette 2 — sandboxed.
   The orchestrator the viewer has been watching is itself running inside a
   devcontainer (per README's recommended autonomous-mode setup). Pulse the
   sapphire devcontainer strip and surface the real .devcontainer/devcontainer.json
   one-liner that bundles atomic + bun + tmux + the agent.
============================================================================= */

const SandboxedRun: React.FC = () => {
  const frame = useCurrentFrame();

  // Stages running inside the container.
  const scanAppear = clamp01((frame - 4) / 6);
  const scanRunning = clamp01((frame - 6) / 4);
  const scanComplete = clamp01((frame - 22) / 4);

  const editAppear = clamp01((frame - 22) / 6);
  const editRunning = clamp01((frame - 26) / 4);
  const editComplete = clamp01((frame - 50) / 4);

  const testAppear = clamp01((frame - 48) / 6);
  const testRunning = clamp01((frame - 52) / 4);

  // Devcontainer strip emphasis: pulse early, hold, then ease off.
  const stripPulse = interpolate(frame, [4, 14, 30, 56, 64], [0, 1, 0.55, 0.55, 0.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sidecar slate slides in from right and stays for the whole vignette.
  const slateProgress = interpolate(frame, [12, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Outer glow on the chrome to reinforce isolation.
  const outerGlow = interpolate(frame, [4, 18, 56, 64], [0, 0.7, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const completeCount =
    (scanComplete > 0.6 ? 1 : 0) + (editComplete > 0.6 ? 1 : 0);
  const runningCount =
    (scanRunning > 0.4 && scanComplete < 0.6 ? 1 : 0) +
    (editRunning > 0.4 && editComplete < 0.6 ? 1 : 0) +
    (testRunning > 0.4 ? 1 : 0);

  const cx = 380;
  const pulsePhase = (frame % 60) / 60;

  const scanState: "idle" | "running" | "complete" =
    scanComplete > 0.6 ? "complete" : scanRunning > 0.3 ? "running" : "idle";
  const editState: "idle" | "running" | "complete" =
    editComplete > 0.6 ? "complete" : editRunning > 0.3 ? "running" : "idle";
  const testState: "idle" | "running" =
    testRunning > 0.3 ? "running" : "idle";

  return (
    <OrchestratorChrome
      devcontainerLabel="devcontainer: ubuntu-22.04"
      workflowName="auth-refactor"
      agent="claude"
      counts={[
        { icon: "✓", value: completeCount, color: colors.green },
        { icon: "●", value: runningCount, color: colors.yellow },
        { icon: "○", value: Math.max(0, 3 - completeCount - runningCount), color: colors.mochaOverlay1 },
      ]}
      pulseDevcontainer={stripPulse}
      outerGlow={outerGlow}
      statuslineNote={{ icon: "◆", iconColor: colors.coolSapphire, text: "agent isolated · host fs untouched" }}
    >
      <OrchestratorEdge
        x1={cx}
        y1={120}
        x2={cx}
        y2={228}
        state={scanComplete > 0.6 ? "complete" : "idle"}
        appear={scanAppear}
      />
      <OrchestratorEdge
        x1={cx}
        y1={312}
        x2={cx}
        y2={420}
        state={editComplete > 0.6 ? "complete" : editRunning > 0.3 ? "running" : "idle"}
        appear={editAppear}
      />

      <OrchestratorNode
        cx={cx}
        cy={88}
        title="scan"
        state={scanState}
        appear={scanAppear}
        pulse={pulsePhase}
        duration={scanComplete > 0.6 ? "0:14" : scanRunning > 0.3 ? liveDuration(frame, 6) : "—"}
      />
      <OrchestratorNode
        cx={cx}
        cy={272}
        title="edit"
        state={editState}
        appear={editAppear}
        pulse={pulsePhase + 0.33}
        duration={editComplete > 0.6 ? "0:42" : editRunning > 0.3 ? liveDuration(frame, 26) : "—"}
      />
      <OrchestratorNode
        cx={cx}
        cy={460}
        title="test"
        state={testState}
        appear={testAppear}
        pulse={pulsePhase + 0.66}
        duration={testRunning > 0.3 ? liveDuration(frame, 52) : "—"}
      />

      {/* Sidecar slate: real .devcontainer/devcontainer.json snippet */}
      <DevcontainerSlate progress={slateProgress} />
    </OrchestratorChrome>
  );
};

const DevcontainerSlate: React.FC<{ progress: number }> = ({ progress }) => {
  if (progress < 0.02) return null;
  const x = interpolate(progress, [0, 1], [340, 0]);
  return (
    <div
      style={{
        position: "absolute",
        right: 24,
        top: 24,
        width: 360,
        padding: "14px 16px 16px",
        backgroundColor: "rgba(11,17,27,0.92)",
        border: "1px solid rgba(116,199,236,0.55)",
        borderRadius: 8,
        fontFamily: fonts.mono,
        fontSize: 13,
        color: colors.mochaText,
        opacity: progress,
        transform: `translateX(${x}px)`,
        boxShadow: "0 18px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(116,199,236,0.18)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: colors.coolSapphire,
          marginBottom: 8,
        }}
      >
        .devcontainer/devcontainer.json
      </div>
      <pre
        style={{
          margin: 0,
          fontFamily: fonts.mono,
          fontSize: 12.5,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        <span style={{ color: colors.mochaOverlay1 }}>{`{\n  `}</span>
        <span style={{ color: colors.yellow }}>"image"</span>
        <span style={{ color: colors.mochaOverlay1 }}>: </span>
        <span style={{ color: colors.green }}>"…/devcontainers/rust:latest"</span>
        <span style={{ color: colors.mochaOverlay1 }}>{`,\n  `}</span>
        <span style={{ color: colors.yellow }}>"features"</span>
        <span style={{ color: colors.mochaOverlay1 }}>: {`{\n    `}</span>
        <span style={{ color: colors.green }}>"ghcr.io/flora131/atomic/claude:1"</span>
        <span style={{ color: colors.mochaOverlay1 }}>: {`{}\n  }\n}`}</span>
      </pre>
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px dashed ${colors.mochaSurface1}`,
          fontSize: 11.5,
          letterSpacing: "0.04em",
          color: colors.mochaSubtext0,
          lineHeight: 1.55,
        }}
      >
        bundles: <span style={{ color: colors.coolSapphire }}>atomic</span>{" "}
        · <span style={{ color: colors.coolSapphire }}>bun</span>{" "}
        · <span style={{ color: colors.coolSapphire }}>tmux</span>{" "}
        · <span style={{ color: colors.coolSapphire }}>claude</span>
      </div>
    </div>
  );
};

/* =============================================================================
   Vignette 3 — deterministic.
   Workflow topology is inferred from JS await ordering (`graph-inference.ts`):
   sequential awaits → chains, Promise.all → siblings, post-allSettled → fan-in.
   Same code → same DAG → same topology hash, every run.
   Twin "run #1 / run #2" hash strips drive the point home.
============================================================================= */

const DeterministicReplay: React.FC = () => {
  const frame = useCurrentFrame();

  // Diamond DAG appears in sequence.
  const scoutAppear = clamp01((frame - 6) / 6);
  const scoutRunning = clamp01((frame - 8) / 4);
  const scoutComplete = clamp01((frame - 18) / 4);

  const branchAppear = clamp01((frame - 20) / 6);
  const branchRunning = clamp01((frame - 22) / 4);
  const branchComplete = clamp01((frame - 38) / 4);

  const aggAppear = clamp01((frame - 40) / 6);
  const aggRunning = clamp01((frame - 42) / 4);
  const aggComplete = clamp01((frame - 56) / 4);

  // Run #1 hash settles after first build, run #2 lights up shortly after to match.
  const run1Reveal = clamp01((frame - 56) / 6);
  const run2Reveal = clamp01((frame - 70) / 6);
  const matchPulse = clamp01((frame - 76) / 8);

  const codeAnnotation = clamp01((frame - 12) / 8);

  const pulsePhase = (frame % 60) / 60;

  const stateOf = (running: number, complete: number): SessionStatus =>
    complete > 0.6 ? "complete" : running > 0.3 ? "running" : "pending";

  const scout = stateOf(scoutRunning, scoutComplete);
  const branch = stateOf(branchRunning, branchComplete);
  const agg = stateOf(aggRunning, aggComplete);

  // Edges fade in *after* their parent box has fully appeared and *before*
  // the children boxes appear, so the DAG paints box → edge → box → edge …
  const scoutEdgeOut = clamp01((frame - 14) / 4);
  const branchEdgeOut = clamp01((frame - 30) / 4);
  const aggEdgeIn = clamp01((frame - 36) / 4);

  const nodes: GridNodeInput[] = [
    {
      name: "scout",
      status: scout,
      parents: [],
      duration: scout === "complete" ? "0:08" : scout === "running" ? liveDuration(frame, 8) : "—",
      appear: scoutAppear,
      outgoingEdgeAppear: scoutEdgeOut,
    },
    {
      name: "analyze",
      status: branch,
      parents: ["scout"],
      duration: branch === "complete" ? "0:14" : branch === "running" ? liveDuration(frame, 22) : "—",
      appear: branchAppear,
      outgoingEdgeAppear: branchEdgeOut,
    },
    {
      name: "check",
      status: branch,
      parents: ["scout"],
      duration: branch === "complete" ? "0:13" : branch === "running" ? liveDuration(frame, 22) : "—",
      appear: branchAppear,
      outgoingEdgeAppear: branchEdgeOut,
    },
    {
      name: "aggregate",
      status: agg,
      parents: ["analyze", "check"],
      duration: agg === "complete" ? "0:06" : agg === "running" ? liveDuration(frame, 42) : "—",
      appear: aggAppear,
      incomingEdgeAppear: aggEdgeIn,
    },
  ];

  const completeCount = nodes.filter((n) => n.status === "complete").length;
  const runningCount = nodes.filter((n) => n.status === "running").length;
  const pendingCount = nodes.filter((n) => n.status === "pending").length;

  return (
    <OrchestratorChrome
      workflowName="ship-feature"
      agent="claude"
      counts={[
        { icon: "✓", value: completeCount, color: colors.green },
        { icon: "●", value: runningCount, color: colors.yellow },
        { icon: "○", value: pendingCount, color: colors.mochaOverlay1 },
      ]}
      statuslineNote={
        matchPulse > 0.4
          ? { icon: "◆", iconColor: colors.green, text: "topology hash · stable across runs" }
          : { icon: "◆", iconColor: colors.coolSapphire, text: "graph derived from await order" }
      }
    >
      {/* Diamond DAG: scout → (analyze | check) → aggregate.
          Connections rendered via the production grid renderer (same code path
          as src/sdk/components/{layout,connectors}.ts) so corners, fan-out and
          fan-in junctions match the real TUI character grid. */}
      <OrchestratorGridGraph nodes={nodes} pulsePhase={pulsePhase} fontSize={17} />

      <DeterministicCodeSlate visible={codeAnnotation} />
      <HashMatchStrip run1={run1Reveal} run2={run2Reveal} match={matchPulse} />
    </OrchestratorChrome>
  );
};

const DeterministicCodeSlate: React.FC<{ visible: number }> = ({ visible }) => {
  if (visible < 0.02) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 24,
        top: 24,
        padding: "12px 16px",
        backgroundColor: "rgba(17,17,27,0.86)",
        border: `1px solid ${colors.mochaSurface1}`,
        borderRadius: 6,
        fontFamily: fonts.mono,
        fontSize: 13,
        lineHeight: 1.6,
        color: colors.mochaSubtext1,
        opacity: visible,
        boxShadow: "0 12px 24px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ color: colors.mochaOverlay1, fontSize: 11, letterSpacing: "0.10em", marginBottom: 6 }}>
        run(async (ctx) ⇒
      </div>
      <div>
        <span style={{ color: colors.mauve }}>await</span>{" "}
        <span style={{ color: colors.blue }}>ctx.stage</span>
        <span style={{ color: colors.mochaOverlay1 }}>(</span>
        <span style={{ color: colors.green }}>"scout"</span>
        <span style={{ color: colors.mochaOverlay1 }}>);</span>
      </div>
      <div>
        <span style={{ color: colors.mauve }}>await</span>{" "}
        <span style={{ color: colors.blue }}>Promise.all</span>
        <span style={{ color: colors.mochaOverlay1 }}>([</span>
      </div>
      <div style={{ paddingLeft: 14 }}>
        <span style={{ color: colors.blue }}>ctx.stage</span>
        <span style={{ color: colors.mochaOverlay1 }}>(</span>
        <span style={{ color: colors.green }}>"analyze"</span>
        <span style={{ color: colors.mochaOverlay1 }}>),</span>
      </div>
      <div style={{ paddingLeft: 14 }}>
        <span style={{ color: colors.blue }}>ctx.stage</span>
        <span style={{ color: colors.mochaOverlay1 }}>(</span>
        <span style={{ color: colors.green }}>"check"</span>
        <span style={{ color: colors.mochaOverlay1 }}>),</span>
      </div>
      <div>
        <span style={{ color: colors.mochaOverlay1 }}>]);</span>
      </div>
      <div>
        <span style={{ color: colors.mauve }}>await</span>{" "}
        <span style={{ color: colors.blue }}>ctx.stage</span>
        <span style={{ color: colors.mochaOverlay1 }}>(</span>
        <span style={{ color: colors.green }}>"aggregate"</span>
        <span style={{ color: colors.mochaOverlay1 }}>);</span>
      </div>
    </div>
  );
};

const TOPOLOGY_HASH = "7a3f c1b2 9d04 ef58";

const HashMatchStrip: React.FC<{ run1: number; run2: number; match: number }> = ({
  run1,
  run2,
  match,
}) => {
  if (run1 < 0.02) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 32,
        right: 32,
        bottom: 28,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: fonts.mono,
        fontSize: 13,
        color: colors.mochaSubtext0,
      }}
    >
      <HashChip label="run #1" hash={TOPOLOGY_HASH} reveal={run1} />
      <span
        style={{
          color: match > 0.4 ? colors.green : colors.mochaOverlay0,
          fontSize: 18,
          letterSpacing: "0.05em",
          textShadow: match > 0.4 ? `0 0 12px rgba(166,227,161,${0.4 + match * 0.4})` : undefined,
          opacity: 0.4 + match * 0.6,
          transition: "none",
        }}
      >
        {match > 0.4 ? "≡" : "·"}
      </span>
      <HashChip label="run #2" hash={TOPOLOGY_HASH} reveal={run2} />
      {match > 0.4 ? (
        <span
          style={{
            marginLeft: "auto",
            color: colors.green,
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: match,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>✓</span>
          <span>match</span>
        </span>
      ) : null}
    </div>
  );
};

const HashChip: React.FC<{ label: string; hash: string; reveal: number }> = ({
  label,
  hash,
  reveal,
}) => {
  if (reveal < 0.02) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        backgroundColor: "rgba(17,17,27,0.85)",
        border: `1px solid ${colors.mochaSurface1}`,
        borderRadius: 4,
        opacity: reveal,
      }}
    >
      <span style={{ color: colors.mochaOverlay1, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ color: colors.coolSapphire }}>{hash}</span>
    </span>
  );
};

