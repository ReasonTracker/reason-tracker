import { Sequence, useCurrentFrame } from "remotion";

import { DebateAnimationSurface } from "../shared/DebateAnimationSurface";
import { createClaimCameraScript } from "../shared/debate-render/claimCamera";
import { episode0005AnimationChapters } from "./animationPlan";
import {
	EPISODE0005_DURATION_IN_FRAMES,
	EPISODE0005_FPS,
	EPISODE0005_SEGMENTS,
	resolveEpisode0005Playback,
} from "./episodeSequence";

export { EPISODE0005_DURATION_IN_FRAMES, EPISODE0005_FPS };

const finalChapterIndex = episode0005AnimationChapters.length - 1;
const finalChapter = episode0005AnimationChapters[finalChapterIndex];
if (!finalChapter) {
	throw new Error("Episode0005 requires at least one animation chapter.");
}

const episode0005Camera = createClaimCameraScript({
	chapters: episode0005AnimationChapters.map((chapter, chapterIndex) => ({
		addedClaimId: chapter.addedClaimId,
		focusRange: resolveCameraRange(chapterIndex, "opening"),
		followRange: resolveCameraRange(chapterIndex, "wave"),
		plan: chapter.plan,
	})),
	finalView: {
		bounds: finalChapter.plan.bounds,
		range: resolveCameraRange(finalChapterIndex, "zoomOut"),
	},
});

export const Episode0005 = () => {
	const frame = useCurrentFrame();
	const playback = resolveEpisode0005Playback(frame);
	const chapter = playback
		? episode0005AnimationChapters[playback.chapterIndex]
		: undefined;

	return (
		<>
			{EPISODE0005_SEGMENTS.map((segment) => (
				<Sequence
					durationInFrames={segment.durationInFrames}
					from={segment.from}
					key={segment.id}
					layout="none"
					name={segment.label}
				>
					<span style={{ display: "none" }} />
				</Sequence>
			))}
			{playback && chapter
				? (
					<DebateAnimationSurface
						cameraBounds={episode0005Camera.resolveBounds(frame)}
						debateCore={chapter.debateCore}
						plan={chapter.plan}
						stepId={playback.stepId}
						stepProgress={playback.stepProgress}
					/>
				)
				: null}
		</>
	);
};

function resolveCameraRange(
	chapterIndex: number,
	stepId: "opening" | "wave" | "zoomOut",
): { durationInFrames: number; from: number } {
	const segment = EPISODE0005_SEGMENTS.find((item) =>
		item.chapterIndex === chapterIndex && item.stepId === stepId
	);
	if (!segment) {
		throw new Error(`Missing Episode0005 camera segment: ${chapterIndex}:${stepId}`);
	}

	return {
		durationInFrames: segment.durationInFrames,
		from: segment.from,
	};
}