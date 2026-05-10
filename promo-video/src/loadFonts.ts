import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

/**
 * Load campaign fonts via @remotion/google-fonts.
 * Each loader registers its own delayRender + continueRender, so this is
 * safe to call from module top level and works in concurrent video render.
 */
export const loadFonts = (): void => {
  loadBricolage("normal", { weights: ["400", "600", "700", "800"] });
  loadGeist("normal", { weights: ["400", "500", "600", "700"] });
  loadJetBrains("normal", { weights: ["400", "500", "600", "700"] });
};
