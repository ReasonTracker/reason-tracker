import type { AnimationStepId } from "@planner/DebateAnimationPlan.ts";

import { buildTimelineTimes, type TimelineEntry } from "../shared/timeline";

export const EPISODE0002_FPS = 30;

type Episode0002SegmentId = "opening" | AnimationStepId;

type Episode0002SegmentDefinition = {
	id: Episode0002SegmentId;
	label: string;
	durationSeconds: number;
};

export type Episode0002TimelineSegment = {
	id: Episode0002SegmentId;
	label: string;
	from: number;
	durationInFrames: number;
};

const episode0002SegmentDefinitions: readonly Episode0002SegmentDefinition[] = [
    {
        id: "opening",
        label: "step0001 - Opening",
        durationSeconds: 1.2,
    },
    {
        id: "voila",
        label: "step0002 - Voila",
        durationSeconds: 0.7,
    },
    {
        id: "sprout",
        label: "step0003 - Sprout",
        durationSeconds: 0.8,
    },
    {
        id: "firstFill",
        label: "step0004 - First Fill",
        durationSeconds: 0.65,
    },
];

const episode0002TimelineEntries: readonly TimelineEntry<Episode0002SegmentId>[] = episode0002SegmentDefinitions.map(
    ({ id, durationSeconds }) => [id, durationSeconds] as const,
);

const episode0002Timeline = buildTimelineTimes(episode0002TimelineEntries, EPISODE0002_FPS);

export const EPISODE0002_SEGMENTS: readonly Episode0002TimelineSegment[] = episode0002SegmentDefinitions.map(
    (segmentDefinition) => ({
        ...segmentDefinition,
        ...episode0002Timeline.times[segmentDefinition.id],
    }),
);

export const EPISODE0002_DURATION_IN_FRAMES = episode0002Timeline.totalDurationInFrames;

export function resolveEpisode0002Playback(frame: number): {
    segmentId: Episode0002SegmentId;
    stepId?: AnimationStepId;
    stepProgress: number;
} | undefined {
    for (const segment of EPISODE0002_SEGMENTS) {
        const endFrame = segment.from + segment.durationInFrames;
        if (frame >= segment.from && frame < endFrame) {
            return {
                segmentId: segment.id,
				stepId: segment.id === "opening" ? undefined : segment.id,
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