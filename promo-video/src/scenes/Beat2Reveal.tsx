import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LiquidSilk } from "../components/LiquidSilk";
import { FilmGrain } from "../components/FilmGrain";
import { AtomicLogo } from "../components/AtomicLogo";
import { TypingText } from "../components/TypingText";
import { colors, fonts } from "../theme";

/**
 * Beat 2 — The pivot. Warm wipes diagonally to cool, atomic logo resolves,
 * tagline types out as a JetBrains Mono cursor underline.
 * Local frames: 0..149 (5s @ 30fps)
 */
export const Beat2Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Diagonal wipe progress 0..1 across f=0..30
  const wipe = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Logo spring entry around f=25
  const logoScale = spring({
    frame: frame - 25,
    fps,
    config: { damping: 14, mass: 0.9, stiffness: 110 },
  });
  const logoOpacity = interpolate(frame, [22, 50], [0, 1], { extrapolateRight: "clamp" });

  // Tagline types out from f=70
  const taglineOpacity = interpolate(frame, [60, 75], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.mochaBase }}>
      {/* Cool layer underneath */}
      <LiquidSilk pole="cool" rotateSpeed={0.05} blur={100} />

      {/* Warm layer on top, revealed by an inverse diagonal clip */}
      <AbsoluteFill
        style={{
          clipPath: `polygon(
            0% 0%,
            ${100 - wipe * 140}% 0%,
            ${-40 + (1 - wipe) * 140}% 100%,
            0% 100%
          )`,
        }}
      >
        <LiquidSilk pole="warm" rotateSpeed={0.08} blur={110} />
      </AbsoluteFill>

      {/* Sweep line at the wipe edge */}
      <AbsoluteFill
        style={{
          opacity: wipe > 0 && wipe < 1 ? 0.9 : 0,
          background: `linear-gradient(105deg,
            transparent ${wipe * 100 - 1.5}%,
            rgba(255,255,255,0.55) ${wipe * 100}%,
            rgba(116,199,236,0.4) ${wipe * 100 + 1.5}%,
            transparent ${wipe * 100 + 4}%)`,
          mixBlendMode: "screen",
        }}
      />

      {/* Centerpiece logo */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 36,
        }}
      >
        <div
          style={{
            transform: `scale(${0.6 + logoScale * 0.4})`,
            opacity: logoOpacity,
          }}
        >
          <AtomicLogo size={780} />
        </div>

        {/* Tagline as a mono caption */}
        <div
          style={{
            opacity: taglineOpacity,
            fontFamily: fonts.mono,
            fontSize: 26,
            letterSpacing: "0.08em",
            color: colors.textOnGradient,
            textTransform: "lowercase",
            textShadow: "0 2px 14px rgba(20,10,30,0.5)",
          }}
        >
          <TypingText
            text="turn coding agents into reliable engineering workflows"
            startFrame={70}
            charsPerFrame={0.8}
            cursorChar="_"
          />
        </div>
      </AbsoluteFill>

      <FilmGrain opacity={0.18} />
    </AbsoluteFill>
  );
};
