import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

type Pole = "warm" | "cool" | "warm-anchor" | "cream";

const stops = {
  warm: `conic-gradient(
    from 200deg at 45% 55%,
    oklch(58% 0.22 15)   0deg,
    oklch(70% 0.22 35)   60deg,
    oklch(64% 0.20 5)    140deg,
    oklch(60% 0.18 350)  220deg,
    oklch(58% 0.22 15)   360deg
  )`,
  cool: `conic-gradient(
    from 180deg at 55% 45%,
    oklch(60% 0.20 240) 0deg,
    oklch(64% 0.18 215) 80deg,
    oklch(68% 0.14 195) 160deg,
    oklch(62% 0.16 260) 240deg,
    oklch(60% 0.20 240) 360deg
  )`,
  "warm-anchor": `conic-gradient(
    from 215deg at 35% 50%,
    oklch(58% 0.22 15)   0deg,
    oklch(70% 0.18 45)   55deg,
    oklch(62% 0.16 320) 130deg,
    oklch(60% 0.20 240) 200deg,
    oklch(64% 0.18 215) 260deg,
    oklch(58% 0.22 15)  360deg
  )`,
  cream: `radial-gradient(ellipse 80% 90% at 60% 40%,
    oklch(96% 0.02 70) 0%,
    oklch(92% 0.04 60) 50%,
    oklch(80% 0.08 240) 100%)`,
};

/**
 * Full-bleed silky gradient backdrop with film grain.
 * `rotate` slowly drifts the conic field for a living feel.
 */
export const LiquidSilk: React.FC<{
  pole: Pole;
  rotateSpeed?: number; // degrees per frame
  blur?: number;
}> = ({ pole, rotateSpeed = 0.06, blur = 90 }) => {
  const frame = useCurrentFrame();
  const rot = frame * rotateSpeed;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: pole === "cream" ? "#f4ede4" : "#1e1e2e",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          inset: -200,
          background: stops[pole],
          filter: `blur(${blur}px) saturate(1.15)`,
          opacity: 0.92,
          transform: `rotate(${rot}deg) scale(1.4)`,
          transformOrigin: "center",
        }}
      />
      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            pole === "cream"
              ? "radial-gradient(ellipse 70% 70% at 50% 55%, transparent 0%, rgba(244,237,228,0.5) 100%)"
              : "radial-gradient(ellipse 80% 80% at 50% 55%, transparent 0%, rgba(17,17,27,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
