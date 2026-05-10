import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo";
import { DURATION, FPS, HEIGHT, WIDTH } from "./theme";
import { loadFonts } from "./loadFonts";
import "./global.css";

loadFonts();

export const Root: React.FC = () => {
  return (
    <Composition
      id="PromoVideo"
      component={PromoVideo}
      durationInFrames={DURATION}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
