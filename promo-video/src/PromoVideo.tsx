import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BEATS } from "./theme";
import { Beat1Hook } from "./scenes/Beat1Hook";
import { Beat2Reveal } from "./scenes/Beat2Reveal";
import { Beat3Workflow } from "./scenes/Beat3Workflow";
import { Beat4Power } from "./scenes/Beat4Power";
import { Beat5CTA } from "./scenes/Beat5CTA";

export const PromoVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#1e1e2e" }}>
      <Sequence from={BEATS.hook.from} durationInFrames={BEATS.hook.durationInFrames}>
        <Beat1Hook />
      </Sequence>
      <Sequence from={BEATS.reveal.from} durationInFrames={BEATS.reveal.durationInFrames}>
        <Beat2Reveal />
      </Sequence>
      <Sequence from={BEATS.workflow.from} durationInFrames={BEATS.workflow.durationInFrames}>
        <Beat3Workflow />
      </Sequence>
      <Sequence from={BEATS.power.from} durationInFrames={BEATS.power.durationInFrames}>
        <Beat4Power />
      </Sequence>
      <Sequence from={BEATS.cta.from} durationInFrames={BEATS.cta.durationInFrames}>
        <Beat5CTA />
      </Sequence>
    </AbsoluteFill>
  );
};
