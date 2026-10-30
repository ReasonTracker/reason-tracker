import { resolveAnimationFrame } from "@reasontracker/engine/animation/DebateAnimationPlan.ts";
import { DebateAnimationSurface } from "./DebateAnimationSurface";
import type {
	CompiledEpisodeScript,
	GraphPlayback,
} from "../episode-script/compileEpisodeScript";

// These insets are composition-space margins for screen-fill scaling.
const SCREEN_FILL_HORIZONTAL_INSET = 180;
const SCREEN_FILL_VERTICAL_INSET = 150;
const SCREEN_FILL_STYLE = {
	inset: 0,
	pointerEvents: "none",
	position: "absolute",
	zIndex: 2,
} as const;

export function ScreenFillClaim({
	cameraBounds,
	episode,
	playback,
}: {
	cameraBounds: { height: number; minX: number; minY: number; width: number }
	episode: CompiledEpisodeScript
	playback: GraphPlayback
}) {
	if (!playback.screenFill || !playback.animation.screenFill) {
		return null;
	}

	const targetFrame = resolveAnimationFrame(playback.animation.plan, "voila", 1);
	const targetClaim = Object.entries(targetFrame.claims).find(([, claim]) =>
		claim.claimId === playback.animation.screenFill?.claimId
	);
	if (!targetClaim) {
		throw new Error(`Screen-fill claim ${playback.animation.screenFill.claimId} is missing from its planner frame.`);
	}
	const [claimOccurrenceId, claim] = targetClaim;
	const cameraScale = episode.composition.width / cameraBounds.width;
	const destination = {
		scale: claim.scale * cameraScale,
		x: (claim.position.x - cameraBounds.minX) * cameraScale,
		y: (claim.position.y - cameraBounds.minY) * cameraScale,
	};
	const screenFill = {
		scale: Math.min(
			(episode.composition.width - (SCREEN_FILL_HORIZONTAL_INSET * 2)) / playback.animation.plan.options.claimWidth,
			(episode.composition.height - (SCREEN_FILL_VERTICAL_INSET * 2)) / playback.animation.plan.options.claimHeight,
		),
		x: episode.composition.width / 2,
		y: episode.composition.height / 2,
	};
	const progress = playback.screenFill.stage === "settle"
		? smoothStep(playback.screenFill.progress)
		: 0;
	const isolatedFrame = {
		...targetFrame,
		claims: {
			[claimOccurrenceId]: {
				...claim,
				opacity: 1,
				position: {
					x: interpolateNumber(screenFill.x, destination.x, progress),
					y: interpolateNumber(screenFill.y, destination.y, progress),
				},
				scale: interpolateNumber(screenFill.scale, destination.scale, progress),
			},
		},
		confidenceConnections: {},
		relevanceConnections: {},
	};
	const renderBounds = {
		height: episode.composition.height,
		minX: 0,
		minY: 0,
		width: episode.composition.width,
	};

	return (
		<div style={SCREEN_FILL_STYLE}>
			<DebateAnimationSurface
				claimScoreVisibility={playback.animation.claimScoreVisibility}
				claimTextReveals={episode.claimTextReveals}
				frameOverride={isolatedFrame}
				hideScores={playback.animation.hideScores}
				plan={playback.animation.plan}
				renderBounds={renderBounds}
				stepProgress={0}
			/>
		</div>
	);
}

function interpolateNumber(from: number, to: number, progress: number): number {
	return from + ((to - from) * progress);
}

function smoothStep(progress: number): number {
	const bounded = Math.max(0, Math.min(1, progress));
	return bounded * bounded * (3 - (2 * bounded));
}
