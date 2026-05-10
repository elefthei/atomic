import React from "react";
import { useCurrentFrame } from "remotion";

export type Token = { text: string; color?: string; italic?: boolean };

/**
 * Char-by-char typewriter that preserves per-token coloring (syntax highlighting).
 * Reveals N chars across the token sequence based on (frame - startFrame) * charsPerFrame.
 */
export const TypingTokens: React.FC<{
  tokens: Token[];
  startFrame: number;
  charsPerFrame?: number;
  cursor?: boolean;
  cursorChar?: string;
  defaultColor?: string;
  style?: React.CSSProperties;
}> = ({
  tokens,
  startFrame,
  charsPerFrame = 0.5,
  cursor = true,
  cursorChar = "▍",
  defaultColor,
  style,
}) => {
  const frame = useCurrentFrame();
  const total = tokens.reduce((n, t) => n + t.text.length, 0);
  const elapsed = Math.max(0, frame - startFrame);
  const visibleCount = Math.min(total, Math.floor(elapsed * charsPerFrame));
  const done = visibleCount >= total;
  const showCursor = cursor && (done ? Math.floor(frame / 15) % 2 === 0 : true);

  let remaining = visibleCount;
  const rendered: React.ReactNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (remaining <= 0) break;
    const t = tokens[i];
    const slice = t.text.slice(0, Math.min(remaining, t.text.length));
    remaining -= slice.length;
    rendered.push(
      <span
        key={i}
        style={{
          color: t.color ?? defaultColor,
          fontStyle: t.italic ? "italic" : undefined,
        }}
      >
        {slice}
      </span>,
    );
  }

  return (
    <span style={{ whiteSpace: "pre-wrap", ...style }}>
      {rendered}
      {showCursor ? <span style={{ opacity: 0.85 }}>{cursorChar}</span> : null}
    </span>
  );
};
