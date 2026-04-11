import { useCurrentFrame } from "remotion";
import {
  BRAND_SEQUENCE_TAGLINE,
  TAGLINE_CENTER_OFFSET,
  getBrandSequenceState,
} from "./brandSequenceMotion.ts";

export const EpisodeBrandSequence = () => {
  const frame = useCurrentFrame();
  const { reasonX, trackerX, wordOpacity, taglineY, taglineOpacity } = getBrandSequenceState(frame);

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
        {BRAND_SEQUENCE_TAGLINE}
      </span>
    </div>
  );
};