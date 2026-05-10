import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LiquidSilk } from "../components/LiquidSilk";
import { FilmGrain } from "../components/FilmGrain";
import { AtomicLogo } from "../components/AtomicLogo";
import { TypingText } from "../components/TypingText";
import { colors, fonts } from "../theme";

/**
 * Beat 5 — CTA bookend. Warm conic returns, atomic logo enters,
 * install command types out alongside the workflow-creator pitch.
 * Local frames: 0..149 (5s @ 30fps)
 */
export const Beat5CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo enters with a spring
  const logoSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 16, mass: 0.9, stiffness: 100 },
  });
  const logoOpacity = interpolate(frame, [8, 30], [0, 1], { extrapolateRight: "clamp" });

  // Tagline + install fade in staggered
  const taglineOpacity = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: "clamp" });
  const installOpacity = interpolate(frame, [60, 80], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.mochaBase }}>
      <LiquidSilk pole="warm-anchor" rotateSpeed={0.05} blur={120} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 80,
          padding: "0 140px",
        }}
      >
        {/* Left: logo */}
        <div
          style={{
            transform: `scale(${0.7 + logoSpring * 0.3})`,
            opacity: logoOpacity,
            flexShrink: 0,
          }}
        >
          <AtomicLogo size={620} />
        </div>

        {/* Right: tagline + install */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 700 }}>
          <div style={{ opacity: taglineOpacity }}>
            <div
              style={{
                fontFamily: fonts.display,
                fontWeight: 700,
                fontSize: 56,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: colors.textOnGradient,
                textShadow: "0 4px 24px rgba(20,10,30,0.55)",
              }}
            >
              Describe your workflow in natural language. Atomic&rsquo;s workflow creator skill encodes it in minutes.
            </div>
          </div>

          <div
            style={{
              opacity: installOpacity,
              fontFamily: fonts.mono,
              fontSize: 28,
              padding: "18px 26px",
              backgroundColor: "rgba(17,17,27,0.72)",
              border: `1px solid ${colors.mochaOverlay0}`,
              borderRadius: 10,
              color: colors.mochaText,
              boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
              maxWidth: 680,
            }}
          >
            <span style={{ color: colors.green }}>$</span>{" "}
            <TypingText
              text="bun add -g @bastani/atomic"
              startFrame={70}
              charsPerFrame={1.0}
              cursorChar="▍"
            />
          </div>

          <div
            style={{
              opacity: installOpacity,
              fontFamily: fonts.mono,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: colors.textOnGradient,
              textTransform: "uppercase",
              textShadow: "0 2px 12px rgba(20,10,30,0.5)",
            }}
          >
            macOS · Linux · Windows
          </div>

          <div
            style={{
              opacity: installOpacity,
              fontFamily: fonts.mono,
              fontSize: 26,
              fontWeight: 600,
              color: colors.textOnGradient,
              letterSpacing: "0.02em",
              textShadow: "0 2px 12px rgba(20,10,30,0.5)",
            }}
          >
            github.com/flora131/atomic
          </div>
        </div>
      </AbsoluteFill>

      <FilmGrain opacity={0.18} />
    </AbsoluteFill>
  );
};
