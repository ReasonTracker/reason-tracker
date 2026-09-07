import type { AnimationStepId } from "@planner/DebateAnimationPlan.ts";

import { buildTimelineTimes, type TimelineEntry } from "../shared/timeline";

export const EPISODE0001_FPS = 30;

type Episode0001SegmentId = "opening" | AnimationStepId;

type Episode0001SegmentDefinition = {
	id: Episode0001SegmentId;
	label: string;
	durationSeconds: number;
};

export type Episode0001TimelineSegment = {
	id: Episode0001SegmentId;
	label: string;
	from: number;
	durationInFrames: number;
};

const episode0001SegmentDefinitions: readonly Episode0001SegmentDefinition[] = [
    {
        id: "opening",
        label: "step0001 - Opening",
        durationSeconds: 1.1,
    },
    {
        id: "voila",
        label: "step0002 - Voila",
        durationSeconds: 0.7,
    },
    {
        id: "sprout",
        label: "step0003 - Sprout",
        durationSeconds: 0.75,
    },
    {
        id: "firstFill",
        label: "step0004 - First Fill",
        durationSeconds: 0.65,
    },
	{
		id: "wave",
		label: "step0005 - Wave",
		durationSeconds: 0.65,
	},
];

const episode0001TimelineEntries: readonly TimelineEntry<Episode0001SegmentId>[] = episode0001SegmentDefinitions.map(
    ({ id, durationSeconds }) => [id, durationSeconds] as const,
);

const episode0001Timeline = buildTimelineTimes(episode0001TimelineEntries, EPISODE0001_FPS);

export const EPISODE0001_SEGMENTS: readonly Episode0001TimelineSegment[] = episode0001SegmentDefinitions.map(
    (segmentDefinition) => ({
        ...segmentDefinition,
        ...episode0001Timeline.times[segmentDefinition.id],
    }),
);

export const EPISODE0001_DURATION_IN_FRAMES = episode0001Timeline.totalDurationInFrames;

export function resolveEpisode0001Playback(frame: number): {
    segmentId: Episode0001SegmentId;
    stepId?: AnimationStepId;
    stepProgress: number;
} | undefined {
    for (const segment of EPISODE0001_SEGMENTS) {
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
