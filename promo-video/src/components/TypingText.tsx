import React from "react";
import { useCurrentFrame } from "remotion";

/**
 * Char-by-char typewriter. Reveals N chars based on (frame - startFrame) * charsPerFrame.
 * Optional blinking cursor at the trailing edge.
 */
export const TypingText: React.FC<{
  text: string;
  startFrame: number;
  charsPerFrame?: number;
  cursor?: boolean;
  cursorChar?: string;
  style?: React.CSSProperties;
  className?: string;
}> = ({
  text,
  startFrame,
  charsPerFrame = 0.5,
  cursor = true,
  cursorChar = "▍",
  style,
  className,
}) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - startFrame);
  const visibleCount = Math.min(text.length, Math.floor(elapsed * charsPerFrame));
  const visible = text.slice(0, visibleCount);
  const done = visibleCount >= text.length;
  const showCursor = cursor && (done ? Math.floor(frame / 15) % 2 === 0 : true);

  return (
    <span style={{ whiteSpace: "pre-wrap", ...style }} className={className}>
      {visible}
      {showCursor ? <span style={{ opacity: 0.85 }}>{cursorChar}</span> : null}
    </span>
  );
};
