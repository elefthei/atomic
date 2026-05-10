/**
 * Atomic promo video theme — ported from assets/product-hunt/_shared/tokens.css.
 * Single source of truth for colors, fonts, and motion constants.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 38 * FPS; // 1140 frames

export const BEATS = {
  hook: { from: 0, durationInFrames: 6 * FPS }, // 0-180
  reveal: { from: 6 * FPS, durationInFrames: 6 * FPS }, // 180-360 (+1s logo dwell)
  workflow: { from: 12 * FPS, durationInFrames: 9 * FPS }, // 360-630
  power: { from: 21 * FPS, durationInFrames: 10 * FPS }, // 630-930
  cta: { from: 31 * FPS, durationInFrames: 7 * FPS }, // 930-1140 (+2s CTA dwell)
} as const;

export const colors = {
  // Catppuccin Mocha base
  mochaBase: "#1e1e2e",
  mochaMantle: "#181825",
  mochaCrust: "#11111b",
  mochaSurface0: "#313244",
  mochaSurface1: "#45475a",
  mochaSurface2: "#585b70",
  mochaOverlay0: "#6c7086",
  mochaOverlay1: "#7f849c",
  mochaText: "#cdd6f4",
  mochaSubtext0: "#a6adc8",
  mochaSubtext1: "#bac2de",

  // Accents
  blue: "#89b4fa",
  sky: "#89dceb",
  teal: "#94e2d5",
  green: "#a6e3a1",
  red: "#f38ba8",
  yellow: "#f9e2af",
  mauve: "#cba6f7",
  peach: "#fab387",
  pink: "#f5c2e7",
  maroon: "#eba0ac",
  sapphire: "#74c7ec",
  lavender: "#b4befe",

  // Poles
  warmMaroon: "#eba0ac",
  warmRed: "#f38ba8",
  warmPeach: "#fab387",
  coolSapphire: "#74c7ec",
  coolSky: "#89dceb",
  coolBlue: "#89b4fa",
  coolTeal: "#94e2d5",
  bridgeMauve: "#cba6f7",

  cream: "#f4ede4",
  textOnGradient: "oklch(94% 0.02 60)",
  textOnGradientDim: "oklch(86% 0.02 60)",
} as const;

export const fonts = {
  display: `'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif`,
  body: `'Geist Sans', ui-sans-serif, system-ui, sans-serif`,
  mono: `'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace`,
} as const;
