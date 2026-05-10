import React from "react";
import { Img, staticFile } from "remotion";

/**
 * The Atomic brand mark. Image carries its own dark backdrop and circuit accents,
 * so we frame it as a self-contained card that floats over the silk gradient.
 */
export const AtomicLogo: React.FC<{
  size?: number;
  rounded?: number;
  glow?: boolean;
  style?: React.CSSProperties;
}> = ({ size = 760, rounded = 28, glow = true, style }) => {
  return (
    <div
      style={{
        width: size,
        height: (size * 1536) / 2752,
        borderRadius: rounded,
        overflow: "hidden",
        boxShadow: glow
          ? "0 0 0 1px rgba(255,255,255,0.06), 0 30px 80px rgba(20,10,30,0.55), 0 0 120px rgba(116,199,236,0.25)"
          : "none",
        ...style,
      }}
    >
      <Img
        src={staticFile("atomic-logo.png")}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
};
