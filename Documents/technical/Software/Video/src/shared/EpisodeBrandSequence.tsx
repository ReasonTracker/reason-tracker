import { Easing, interpolate, useCurrentFrame } from "remotion";

const WORD_ENTRY_FRAMES = 30;
const WORD_HOLD_END = 120;
const WORD_EXIT_END = 150;
const TAGLINE_CENTER_OFFSET = 22;

export const EpisodeBrandSequence = () => {
  const frame = useCurrentFrame();
  const entryEasing = Easing.out(Easing.cubic);
  const reasonX = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [-520, -42, -42, -190], {
    easing: entryEasing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const trackerX = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [520, 42, 42, 190], {
    easing: entryEasing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const wordOpacity = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [120, 0, 0, 28], {
    easing: entryEasing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineOpacity = interpolate(frame, [0, WORD_ENTRY_FRAMES, WORD_HOLD_END, WORD_EXIT_END], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        Videos about hard decisions
      </span>
    </div>
  );
};