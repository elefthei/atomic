import React from "react";
import { colors, fonts } from "../theme";

/**
 * Atomic TUI window chrome — header bar with badge + session name + counts,
 * dark mocha body, mono font. Mirrors `_shared/tui.css` essentials.
 */
export const TUIFrame: React.FC<{
  badge: string;
  badgeColor?: string;
  session: string;
  counts?: Array<{ label: string; value: string | number; color?: string }>;
  width?: number | string;
  height?: number | string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({
  badge,
  badgeColor = colors.blue,
  session,
  counts = [],
  width = "100%",
  height = "100%",
  children,
  style,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        height,
        backgroundColor: colors.mochaBase,
        border: `1px solid ${colors.mochaOverlay0}`,
        borderRadius: 10,
        overflow: "hidden",
        fontFamily: fonts.mono,
        fontSize: 16,
        lineHeight: 1.55,
        color: colors.mochaText,
        boxShadow:
          "0 30px 60px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          flexShrink: 0,
          backgroundColor: colors.mochaSurface0,
          paddingRight: 12,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            height: "100%",
            backgroundColor: badgeColor,
            color: colors.mochaSurface0,
          }}
        >
          {badge}
        </span>
        <span style={{ marginLeft: 12, color: colors.mochaText }}>{session}</span>
        <span
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 16,
            fontSize: 13,
            fontWeight: 500,
            color: colors.mochaSubtext0,
          }}
        >
          {counts.map((c, i) => (
            <span key={i} style={{ color: c.color ?? colors.mochaSubtext0 }}>
              {c.label} {c.value}
            </span>
          ))}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          padding: "16px 20px",
          backgroundColor: colors.mochaBase,
        }}
      >
        {children}
      </div>
    </div>
  );
};
