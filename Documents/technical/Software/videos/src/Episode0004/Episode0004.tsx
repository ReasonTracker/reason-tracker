import { Sequence, useCurrentFrame } from "remotion";

import { DebateRenderSurface } from "../shared/DebateRenderSurface";
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
                    <DebateRenderSurface
                        renderState={playback.renderState}
                        stepProgress={playback.stepProgress}
                    />
                )
                : null}
        </>
    );
};