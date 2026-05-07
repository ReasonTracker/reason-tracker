import type { DebateSnapshotRenderState, RenderStepProgress } from "../shared/debate-render/renderTypes";

import { buildTimelineTimes, type TimelineEntry } from "../shared/timeline";
import {
    firstFillRenderState,
    openingRenderState,
    sproutRenderState,
    voilaRenderState,
} from "./plannerRenderStates";

export const EPISODE0004_FPS = 30;

type Episode0004SegmentId = "opening" | "voila" | "sprout" | "firstFill";

type Episode0004SegmentDefinition = {
    id: Episode0004SegmentId;
    label: string;
    durationSeconds: number;
    renderState: DebateSnapshotRenderState;
};

export type Episode0004TimelineSegment = {
    id: Episode0004SegmentId;
    label: string;
    from: number;
    durationInFrames: number;
    renderState: DebateSnapshotRenderState;
};

const episode0004SegmentDefinitions: readonly Episode0004SegmentDefinition[] = [
    {
        id: "opening",
        label: "step0001 - Opening",
        durationSeconds: 1.2,
        renderState: openingRenderState,
    },
    {
        id: "voila",
        label: "step0002 - Voila",
        durationSeconds: 0.7,
        renderState: voilaRenderState,
    },
    {
        id: "sprout",
        label: "step0003 - Sprout",
        durationSeconds: 0.8,
        renderState: sproutRenderState,
    },
    {
        id: "firstFill",
        label: "step0004 - First Fill",
        durationSeconds: 0.65,
        renderState: firstFillRenderState,
    },
];

const episode0004TimelineEntries: readonly TimelineEntry<Episode0004SegmentId>[] = episode0004SegmentDefinitions.map(
    ({ id, durationSeconds }) => [id, durationSeconds] as const,
);

const episode0004Timeline = buildTimelineTimes(episode0004TimelineEntries, EPISODE0004_FPS);

export const EPISODE0004_SEGMENTS: readonly Episode0004TimelineSegment[] = episode0004SegmentDefinitions.map(
    (segmentDefinition) => ({
        ...segmentDefinition,
        ...episode0004Timeline.times[segmentDefinition.id],
    }),
);

export const EPISODE0004_DURATION_IN_FRAMES = episode0004Timeline.totalDurationInFrames;

export function resolveEpisode0004Playback(frame: number): (RenderStepProgress & {
    renderState: DebateSnapshotRenderState;
    segmentId: Episode0004SegmentId;
}) | undefined {
    for (const segment of EPISODE0004_SEGMENTS) {
        const endFrame = segment.from + segment.durationInFrames;
        if (frame >= segment.from && frame < endFrame) {
            return {
                renderState: segment.renderState,
                segmentId: segment.id,
                stepProgress: resolveStepProgress(frame, segment.from, segment.durationInFrames),
            };
        }
    }

    return undefined;
}

function resolveStepProgress(frame: number, stepStartFrame: number, stepDurationInFrames: number): number {
    if (stepDurationInFrames <= 1) {
        return 1;
    }

    const rawStepProgress = (frame - stepStartFrame) / Math.max(1, stepDurationInFrames - 1);

    return Math.min(1, Math.max(0, rawStepProgress));
}