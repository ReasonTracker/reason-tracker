import type { DebateSnapshotRenderState, RenderStepProgress } from "../shared/debate-render/renderTypes";

import { buildTimelineTimes, type TimelineEntry } from "../shared/timeline";
import { step0001RenderState } from "./step0001";
import { step0002RenderState } from "./step0002";

export const EPISODE0001_FPS = 30;

type Episode0001SegmentId = "opening" | "reveal" | "settled";

const episode0001States: Record<Episode0001SegmentId, DebateSnapshotRenderState> = {
    opening: step0001RenderState,
    reveal: step0002RenderState,
    settled: step0002RenderState,
};

const episode0001TimelineEntries: readonly TimelineEntry<Episode0001SegmentId>[] = [
    ["opening", 1.1],
    ["reveal", 1.6],
    ["settled", 1.2],
];

const episode0001Timeline = buildTimelineTimes(episode0001TimelineEntries, EPISODE0001_FPS);

const orderedSegmentIds: readonly Episode0001SegmentId[] = ["opening", "reveal", "settled"];

export const EPISODE0001_DURATION_IN_FRAMES = episode0001Timeline.totalDurationInFrames;

export function resolveEpisode0001Playback(frame: number): RenderStepProgress & {
    renderState: DebateSnapshotRenderState;
    segmentId: Episode0001SegmentId;
} {
    for (const segmentId of orderedSegmentIds) {
        const segment = episode0001Timeline.times[segmentId];

        if (frame < segment.from) {
            break;
        }

        const endFrame = segment.from + segment.durationInFrames;

        if (frame < endFrame) {
            return {
                renderState: episode0001States[segmentId],
                segmentId,
                stepProgress: resolveStepProgress(frame, segment.from, segment.durationInFrames),
            };
        }
    }

    const finalSegmentId = orderedSegmentIds.at(-1) ?? "settled";
    const finalSegment = episode0001Timeline.times[finalSegmentId];

    return {
        renderState: episode0001States[finalSegmentId],
        segmentId: finalSegmentId,
        stepProgress: resolveStepProgress(frame, finalSegment.from, finalSegment.durationInFrames),
    };
}

function resolveStepProgress(frame: number, stepStartFrame: number, stepDurationInFrames: number): number {
    if (stepDurationInFrames <= 1) {
        return 1;
    }

    const rawStepProgress = (frame - stepStartFrame) / Math.max(1, stepDurationInFrames - 1);

    return Math.min(1, Math.max(0, rawStepProgress));
}
