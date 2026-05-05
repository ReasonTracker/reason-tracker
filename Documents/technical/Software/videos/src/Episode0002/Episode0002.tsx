import { Sequence, useCurrentFrame } from "remotion";

import { DebateRenderSurface } from "../shared/DebateRenderSurface";
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
                    <DebateRenderSurface
                        renderState={playback.renderState}
                        stepProgress={playback.stepProgress}
                    />
                )
                : null}
        </>
    );
};