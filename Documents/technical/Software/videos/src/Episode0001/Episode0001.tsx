import { Sequence, useCurrentFrame } from "remotion";

import { DebateRenderSurface } from "../shared/DebateRenderSurface";
import {
    EPISODE0001_DURATION_IN_FRAMES,
    EPISODE0001_FPS,
    EPISODE0001_SEGMENTS,
    resolveEpisode0001Playback,
} from "./episodeSequence";

export { EPISODE0001_DURATION_IN_FRAMES, EPISODE0001_FPS };

export const Episode0001 = () => {
    const frame = useCurrentFrame();
    const playback = resolveEpisode0001Playback(frame);

    return (
        <>
            {EPISODE0001_SEGMENTS.map((segment) => (
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
                    <DebateRenderSurface
                        renderState={playback.renderState}
                        stepProgress={playback.stepProgress}
                    />
                )
                : null}
        </>
    );
};
