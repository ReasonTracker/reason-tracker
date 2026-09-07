import { Sequence, useCurrentFrame } from "remotion";

import { DebateAnimationSurface } from "../shared/DebateAnimationSurface";
import {
    episode0004AnimationPlan,
    episode0004DebateCore,
} from "./animationPlan";
import {
    EPISODE0004_DURATION_IN_FRAMES,
    EPISODE0004_FPS,
    EPISODE0004_SEGMENTS,
    resolveEpisode0004Playback,
} from "./episodeSequence";

export { EPISODE0004_DURATION_IN_FRAMES, EPISODE0004_FPS };

export const Episode0004 = () => {
    const frame = useCurrentFrame();
    const playback = resolveEpisode0004Playback(frame);

    return (
        <>
            {EPISODE0004_SEGMENTS.map((segment) => (
                <Sequence
                    key={segment.id}
                    from={segment.from}
                    durationInFrames={segment.durationInFrames}
                    name={segment.label}
                    layout="none"
                >
                    <span style={{ display: "none" }} />
                </Sequence>
            ))}
            {playback
                ? (
                    <DebateAnimationSurface
                        debateCore={episode0004DebateCore}
                        plan={episode0004AnimationPlan}
                        stepId={playback.stepId}
                        stepProgress={playback.stepProgress}
                    />
                )
                : null}
        </>
    );
};