import React from "react";
import { fonts } from "../theme";

/**
 * Inflated chrome-like word effect — same recipe as the Product Hunt slides.
 * Layered text-shadows build the bubble; `mix-blend-mode: overlay` adds a specular highlight.
 * Solid fill — no gradient text.
 */
export const BubbleWord: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  shadow?: string;
  highlight?: string;
}> = ({
  children,
  size = 96,
  color = "#fab387",
  shadow = "rgba(20,10,30,0.55)",
  highlight = "rgba(255,255,255,0.35)",
}) => {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color,
        textShadow: [
          `0 1px 0 ${highlight}`,
          `0 -1px 0 ${shadow}`,
          `0 6px 12px ${shadow}`,
          `0 14px 32px ${shadow}`,
          `0 24px 56px ${shadow}`,
        ].join(", "),
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          color: "rgba(255,255,255,0.55)",
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      >
        {children}
      </span>
    </span>
  );
};
