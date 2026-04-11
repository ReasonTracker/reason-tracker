import { Sequence, useCurrentFrame } from "remotion";
import {
  BRAND_SEQUENCE_END_FRAME,
  BRAND_SEQUENCE_TAGLINE,
  TAGLINE_CENTER_OFFSET,
  getBrandSequenceState,
} from "./brandSequenceMotion.ts";

// AGENT NOTE: Keep the tunable timing constants here so remapping stays aligned with the shared website motion.
const DEFAULT_BRAND_SEQUENCE_FROM = 0;
const DEFAULT_BRAND_SEQUENCE_DURATION = BRAND_SEQUENCE_END_FRAME;

type EpisodeBrandSequenceProps = {
  from?: number;
  duration?: number;
};

const EpisodeBrandSequenceContent = ({ duration = DEFAULT_BRAND_SEQUENCE_DURATION }: Pick<EpisodeBrandSequenceProps, "duration">) => {
  const frame = useCurrentFrame();
  const motionFrame = getScaledBrandSequenceFrame(frame, duration);
  const { reasonX, trackerX, wordOpacity, taglineY, taglineOpacity } = getBrandSequenceState(motionFrame);

  return (
    <div className="rt-brand-sequence" aria-label="Reason Tracker brand sequence">
      <div className="rt-brand-sequence__lockup">
        <span className="rt-brand-sequence__reason" style={{ opacity: wordOpacity, transform: `translateX(${reasonX}px)` }}>
          Reason
        </span>
        <span className="rt-brand-sequence__tracker" style={{ opacity: wordOpacity, transform: `translateX(${trackerX}px)` }}>
          Tracker
        </span>
      </div>
      <span
        className="rt-brand-sequence__tagline"
        style={{ opacity: taglineOpacity, transform: `translate(${TAGLINE_CENTER_OFFSET}px, ${taglineY}px)` }}
      >
        <span className="rt-brand-sequence__tagline-shadow" aria-hidden="true">
          {BRAND_SEQUENCE_TAGLINE}
        </span>
        <span className="rt-brand-sequence__tagline-text">{BRAND_SEQUENCE_TAGLINE}</span>
      </span>
    </div>
  );
};

export const EpisodeBrandSequence = ({
  from = DEFAULT_BRAND_SEQUENCE_FROM,
  duration = DEFAULT_BRAND_SEQUENCE_DURATION,
}: EpisodeBrandSequenceProps) => {
  return (
    <Sequence from={from} durationInFrames={duration}>
      <EpisodeBrandSequenceContent duration={duration} />
    </Sequence>
  );
};

const getScaledBrandSequenceFrame = (frame: number, duration: number) => {
  const safeDuration = Number.isFinite(duration) ? Math.max(1, duration) : DEFAULT_BRAND_SEQUENCE_DURATION;
  const safeFrame = Number.isFinite(frame) ? Math.max(0, frame) : 0;

  if (safeDuration === DEFAULT_BRAND_SEQUENCE_DURATION) {
    return safeFrame;
  }

  if (safeDuration === 1) {
    return BRAND_SEQUENCE_END_FRAME;
  }

  return (safeFrame / (safeDuration - 1)) * BRAND_SEQUENCE_END_FRAME;
};