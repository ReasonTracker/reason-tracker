import type { AnimationStepId } from "@planner/DebateAnimationPlan.ts";

import { resolveClaimCameraDestinationCount } from "../shared/debate-render/claimCamera";
import { buildTimelineTimes, type TimelineEntry } from "../shared/timeline";
import { episode0005AnimationChapters } from "./animationPlan";

export const EPISODE0005_FPS = 30;

type Episode0005SegmentStepId = "opening" | "zoomOut" | AnimationStepId;

type Episode0005SegmentDefinition = {
	chapterIndex: number
	durationSeconds: number
	id: string
	label: string
	stepId: Episode0005SegmentStepId
};

export type Episode0005TimelineSegment = Episode0005SegmentDefinition & {
	durationInFrames: number
	from: number
};

const stepDefinitions: readonly {
	durationSeconds: number
	label: string
	stepId: Episode0005SegmentStepId
}[] = [
	{ durationSeconds: 1.2, label: "Opening", stepId: "opening" },
	{ durationSeconds: 0.7, label: "Voila", stepId: "voila" },
	{ durationSeconds: 0.8, label: "Sprout", stepId: "sprout" },
	{ durationSeconds: 0.65, label: "First Fill", stepId: "firstFill" },
	{ durationSeconds: 0.65, label: "Wave", stepId: "wave" },
];

const chapterSegmentDefinitions: readonly Episode0005SegmentDefinition[] = episode0005AnimationChapters.flatMap(
	(chapter, chapterIndex) => stepDefinitions.map((step) => ({
		chapterIndex,
		durationSeconds: step.stepId === "wave"
			? Math.max(
				step.durationSeconds,
				(resolveClaimCameraDestinationCount(chapter.plan, chapter.addedClaimId) - 1)
					* step.durationSeconds,
			)
			: step.durationSeconds,
		id: `${chapter.id}:${step.stepId}`,
		label: `${chapter.label} - ${step.label}`,
		stepId: step.stepId,
	})),
);

const finalChapterIndex = episode0005AnimationChapters.length - 1;
const segmentDefinitions: readonly Episode0005SegmentDefinition[] = [
	...chapterSegmentDefinitions,
	{
		chapterIndex: finalChapterIndex,
		durationSeconds: 2,
		id: "final:zoomOut",
		label: "Final debate - Zoom out",
		stepId: "zoomOut",
	},
];

const timelineEntries: readonly TimelineEntry<string>[] = segmentDefinitions.map(
	({ durationSeconds, id }) => [id, durationSeconds] as const,
);

const timeline = buildTimelineTimes(timelineEntries, EPISODE0005_FPS);

export const EPISODE0005_SEGMENTS: readonly Episode0005TimelineSegment[] = segmentDefinitions.map(
	(segment) => ({
		...segment,
		...timeline.times[segment.id],
	}),
);

export const EPISODE0005_DURATION_IN_FRAMES = timeline.totalDurationInFrames;

export function resolveEpisode0005Playback(frame: number): {
	chapterIndex: number
	stepId?: AnimationStepId
	stepProgress: number
} | undefined {
	for (const segment of EPISODE0005_SEGMENTS) {
		const endFrame = segment.from + segment.durationInFrames;
		if (frame >= segment.from && frame < endFrame) {
			return {
				chapterIndex: segment.chapterIndex,
				stepId: segment.stepId === "opening"
					? undefined
					: segment.stepId === "zoomOut"
						? "wave"
						: segment.stepId,
				stepProgress: segment.stepId === "zoomOut"
					? 1
					: resolveStepProgress(frame, segment.from, segment.durationInFrames),
			};
		}
	}

	return undefined;
}

function resolveStepProgress(
	frame: number,
	stepStartFrame: number,
	stepDurationInFrames: number,
): number {
	if (stepDurationInFrames <= 1) {
		return 1;
	}

	const progress = (frame - stepStartFrame) / Math.max(1, stepDurationInFrames - 1);

	return Math.min(1, Math.max(0, progress));
}