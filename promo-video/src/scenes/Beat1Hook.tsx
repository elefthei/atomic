import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { LiquidSilk } from "../components/LiquidSilk";
import { FilmGrain } from "../components/FilmGrain";
import { TUIFrame } from "../components/TUIFrame";
import { TypingText } from "../components/TypingText";
import { colors, fonts } from "../theme";

const BRANCHES: Array<{
  status: string;
  detail: string;
  files: Array<{ name: string; ok: boolean }>;
}> = [
  {
    status: "▰▰▱▱▱  research          running",
    detail: "scanning auth/* … 14 files",
    files: [
      { name: "src/auth/login.ts", ok: true },
      { name: "src/auth/session.ts", ok: true },
      { name: "src/auth/token.ts", ok: false },
      { name: "src/auth/oauth.ts", ok: true },
      { name: "src/auth/guard.ts", ok: false },
    ],
  },
  {
    status: "▰▰▰▱▱  refactor (a)      stalled",
    detail: "diff conflict @ session.ts:87",
    files: [
      { name: "  + extract createSession", ok: true },
      { name: "  + rotate refresh token", ok: true },
      { name: "  ✗ merge conflict here", ok: false },
      { name: "  ⏸  awaiting resolution", ok: false },
      { name: "  ⏸  diff stuck @ 4 of 7", ok: false },
    ],
  },
  {
    status: "▰▰▰▰▱  refactor (b)      retrying",
    detail: "rolled back · attempt 3 of 5",
    files: [
      { name: "  ↺ revert commit a8c1f3", ok: false },
      { name: "  ↺ regen token logic", ok: false },
      { name: "  ↻ retry test:auth", ok: false },
      { name: "  ↻ retry test:oauth", ok: false },
      { name: "  ⚠ 12 files diverging", ok: false },
    ],
  },
];

/**
 * Beat 1 — The problem. A single agent run that diverges into contradicting branches.
 * Warm silk, screen-shake on each contradiction, exit shatter.
 * Local frames: 0..179 (6s @ 30fps)
 */
export const Beat1Hook: React.FC = () => {
  const frame = useCurrentFrame();

  // Headline + number marker fade-in
  const headerOpacity = interpolate(frame, [10, 35], [0, 1], { extrapolateRight: "clamp" });

  // TUI rises into frame
  const tuiY = interpolate(frame, [10, 50], [80, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const tuiOpacity = interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" });

  // Branch panes appear one by one between f=80..130
  const branchAppear = (i: number) => {
    const start = 80 + i * 14;
    return {
      opacity: interpolate(frame, [start, start + 12], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
      y: interpolate(frame, [start, start + 14], [16, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }),
    };
  };

  // Screen-shake intensifies near the end
  const shakeIntensity = interpolate(frame, [110, 165], [0, 12], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const shakeX = (random(`sx-${Math.floor(frame / 2)}`) - 0.5) * 2 * shakeIntensity;
  const shakeY = (random(`sy-${Math.floor(frame / 2)}`) - 0.5) * 2 * shakeIntensity;

  // Exit shatter — scale + opacity collapse
  const exitProgress = interpolate(frame, [160, 180], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const exitScale = 1 - exitProgress * 0.08;
  const exitOpacity = 1 - exitProgress;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.mochaBase }}>
      <LiquidSilk pole="warm" rotateSpeed={0.08} blur={110} />

      <AbsoluteFill
        style={{
          padding: "80px 120px",
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${exitScale})`,
          opacity: exitOpacity,
        }}
      >
        {/* Top-left headline */}
        <div style={{ opacity: headerOpacity }}>
          <h1
            style={{
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: 76,
              letterSpacing: "-0.025em",
              lineHeight: 1.04,
              color: colors.textOnGradient,
              margin: 0,
              maxWidth: 1500,
            }}
          >
            Long-running agents drift on complex, ambiguous tasks.
          </h1>
        </div>

        {/* Stack of TUI panes — original at top, 3 diverging branches below */}
        <div
          style={{
            position: "absolute",
            inset: "360px 120px 80px 120px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            transform: `translateY(${tuiY}px)`,
            opacity: tuiOpacity,
          }}
        >
          {/* Original prompt pane */}
          <TUIFrame
            badge="CLAUDE"
            badgeColor={colors.yellow}
            session="auth-refactor · run #4117"
            counts={[
              { label: "stage", value: "1/3", color: colors.mochaSubtext0 },
              { label: "elapsed", value: "00:42:18", color: colors.mochaSubtext0 },
            ]}
            height={120}
          >
            <div style={{ color: colors.mochaSubtext0 }}>
              <span style={{ color: colors.green }}>$</span>{" "}
              <TypingText
                text='claude "refactor the auth flow end-to-end"'
                startFrame={48}
                charsPerFrame={1.2}
                cursorChar="▍"
                style={{ color: colors.mochaText }}
              />
            </div>
          </TUIFrame>

          {/* Diverging branches */}
          <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
            {BRANCHES.map((branch, i) => {
              const a = branchAppear(i);
              const isStalled = branch.status.includes("stalled");
              const isRetrying = branch.status.includes("retrying");
              const accent = isStalled ? colors.red : isRetrying ? colors.peach : colors.yellow;
              const flicker = isRetrying
                ? 0.7 + random(`f-${i}-${Math.floor(frame / 4)}`) * 0.3
                : 1;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    opacity: a.opacity * flicker,
                    transform: `translateY(${a.y}px)`,
                  }}
                >
                  <TUIFrame
                    badge={`AGENT ${i + 1}`}
                    badgeColor={accent}
                    session={`branch-${String.fromCharCode(97 + i)}`}
                    counts={[
                      {
                        label: "•",
                        value: branch.status.split("  ").pop() ?? "",
                        color: accent,
                      },
                    ]}
                    height="100%"
                  >
                    <div style={{ color: accent, fontWeight: 600, fontSize: 15 }}>
                      {branch.status}
                    </div>
                    <div style={{ color: colors.mochaSubtext0, marginTop: 8, fontSize: 14 }}>
                      {branch.detail}
                    </div>
                    <div style={{ marginTop: 16, fontSize: 13, lineHeight: 1.7 }}>
                      {branch.files.map((f, k) => (
                        <div
                          key={k}
                          style={{
                            color: f.ok ? colors.mochaSubtext0 : accent,
                            opacity: 0.92,
                          }}
                        >
                          {f.ok ? "✓" : "✗"} {f.name}
                        </div>
                      ))}
                    </div>
                  </TUIFrame>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      <FilmGrain opacity={0.22} />
    </AbsoluteFill>
  );
};
