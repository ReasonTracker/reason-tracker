import { useCurrentFrame } from "remotion";

import { DebateRenderSurface } from "../shared/DebateRenderSurface";
import {
    EPISODE0001_DURATION_IN_FRAMES,
    EPISODE0001_FPS,
    resolveEpisode0001Playback,
} from "./episodeSequence";

export { EPISODE0001_DURATION_IN_FRAMES, EPISODE0001_FPS };

export const Episode0001 = () => {
    const frame = useCurrentFrame();
    const playback = resolveEpisode0001Playback(frame);

    return (
        <DebateRenderSurface
            renderState={playback.renderState}
            stepProgress={playback.stepProgress}
        />
    );
};
