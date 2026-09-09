import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";

// AGENT NOTE: Keep tunable media motion constants grouped here.
const TRANSITION_FRAMES = 15;
const BOTTOM_OFFSET_PX = 160;
const MAX_HEIGHT_PX = 720;
const MAX_WIDTH_PX = 1280;

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
                alignItems: "center",
                display: "flex",
                justifyContent: "flex-end",
                paddingBottom: BOTTOM_OFFSET_PX,
                pointerEvents: "none",
            }}
        >
            <Img
                src={source}
                style={{
                    maxHeight: MAX_HEIGHT_PX,
                    maxWidth: MAX_WIDTH_PX,
                    opacity: progress,
                    transform: `translateY(${(1 - progress) * 400}px)`,
                }}
            />
        </AbsoluteFill>
    );
}