import { Sequence, useCurrentFrame } from "remotion";

import { DebateAnimationSurface } from "../shared/DebateAnimationSurface";
import {
    episode0002AnimationPlan,
    episode0002ResolvedDebateCore,
} from "./animationPlan";
import {
    EPISODE0002_DURATION_IN_FRAMES,
    EPISODE0002_FPS,
    EPISODE0002_SEGMENTS,
    resolveEpisode0002Playback,
} from "./episodeSequence";

export { EPISODE0002_DURATION_IN_FRAMES, EPISODE0002_FPS };

export const Episode0002 = () => {
    const frame = useCurrentFrame();
    const playback = resolveEpisode0002Playback(frame);

    return (
        <>
            {EPISODE0002_SEGMENTS.map((segment) => (
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
                        debateCore={episode0002ResolvedDebateCore}
                        plan={episode0002AnimationPlan}
                        stepId={playback.stepId}
                        stepProgress={playback.stepProgress}
                    />
                )
                : null}
        </>
    );
};