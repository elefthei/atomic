import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

/**
 * Animated film grain via SVG fractal noise. Reseeds every frame for live grain.
 */
export const FilmGrain: React.FC<{ opacity?: number }> = ({
  opacity = 0.18,
}) => {
  const frame = useCurrentFrame();
  const seed = (frame % 12) + 1;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id={`grain-${seed}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed={seed}
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};
