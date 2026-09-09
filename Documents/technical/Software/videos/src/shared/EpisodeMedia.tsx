import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";

// AGENT NOTE: Keep tunable media motion constants grouped here.
const TRANSITION_FRAMES = 20;
const BOTTOM_OFFSET_PX = 160;
const MAX_HEIGHT_PX = 720;
const MAX_WIDTH_PX = 1280;
const LEAN_IN_DEGREES = 50;

type EpisodeMediaProps = {
    durationInFrames: number
    source: string
};

export function EpisodeMedia({ durationInFrames, source }: EpisodeMediaProps) {
    const frame = useCurrentFrame();
    const transitionFrames = Math.min(TRANSITION_FRAMES, Math.floor(durationInFrames / 2));
    const exitStartFrame = durationInFrames - transitionFrames;
    const enterProgress = interpolate(frame, [0, transitionFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
    const exitProgress = interpolate(frame, [exitStartFrame, durationInFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
    const progress = Math.min(enterProgress, 1 - exitProgress);

    return (
        <AbsoluteFill
            style={{
                pointerEvents: "none",
            }}
        >
            <Img
                src={source}
                style={{
                    bottom: BOTTOM_OFFSET_PX,
                    maxHeight: MAX_HEIGHT_PX,
                    maxWidth: MAX_WIDTH_PX,
                    position: "absolute",
                    right: "100%",
                    transform: `rotate(${progress * LEAN_IN_DEGREES}deg)`,
                    transformOrigin: "right bottom",
                }}
            />
        </AbsoluteFill>
    );
}