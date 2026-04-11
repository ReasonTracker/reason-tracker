import { interpolate, useCurrentFrame } from "remotion";

const WORD_ENTRY_FRAMES = 30;
const WORD_HOLD_END = 120;
const WORD_EXIT_END = 150;

export const EpisodeBrandSequence = () => {
  const frame = useCurrentFrame();
  const reasonX = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [-520, -42, -42, -190], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const trackerX = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [520, 42, 42, 190], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const wordOpacity = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div className="rt-brand-sequence" aria-label="Reason Tracker brand sequence">
      <span className="rt-brand-sequence__reason" style={{ opacity: wordOpacity, transform: `translateX(${reasonX}px)` }}>
        Reason
      </span>
      <span className="rt-brand-sequence__tracker" style={{ opacity: wordOpacity, transform: `translateX(${trackerX}px)` }}>
        tracker
      </span>
    </div>
  );
};