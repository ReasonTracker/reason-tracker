import type { ClaimId } from "@debate-core/Claim.ts";
import { resolveAnimationFrame } from "@planner/DebateAnimationPlan.ts";
import { Easing, interpolate } from "remotion";

import type {
	CompiledEpisodeScript,
	CompiledGraphAnimation,
	ScheduledEpisodeAction,
} from "./compileEpisodeScript";
import {
	fitBoundsToAspectRatio,
	resolveClaimRouteBounds,
	resolveClaimsBounds,
	type CameraBounds,
	type ClaimCameraScript,
} from "./graphCameraBounds";
import type { EpisodeAction } from "./episodeScriptSpec";

const CAMERA_EASING = Easing.bezier(0.42, 0, 0.2, 1);
const FALLBACK_BOUNDS: CameraBounds = {
	height: 1080,
	minX: 0,
	minY: 0,
	width: 1920,
};

type CameraAction = Extract<EpisodeAction, { type: `camera.${string}` }>;
type ScheduledCameraAction = ScheduledEpisodeAction & { action: CameraAction };

type CameraTransition = {
	bounds: readonly CameraBounds[]
	durationInFrames: number
	from: number
	type: CameraAction["type"]
};

export function compileSceneCamera(episode: CompiledEpisodeScript): ClaimCameraScript | undefined {
	const cameraActions = episode.actions
		.filter(isScheduledCameraAction)
		.sort((left, right) => left.from - right.from || left.index - right.index);
	if (cameraActions.length === 0) {
		return undefined;
	}

	let previousEnd = 0;
	const transitions = cameraActions.map((scheduled): CameraTransition => {
		if (scheduled.from < previousEnd) {
			throw new Error(
				`Camera action ${scheduled.index} starts at frame ${scheduled.from} before the previous camera action ends at frame ${previousEnd}.`,
			);
		}
		previousEnd = scheduled.endFrame;
		const bounds = scheduled.action.type === "camera.follow"
			? resolveFollowBounds(episode, scheduled)
			: [resolveTargetBounds(episode, scheduled)];
		return {
			bounds,
			durationInFrames: scheduled.durationInFrames,
			from: scheduled.from,
			type: scheduled.action.type,
		};
	});
	const initialBounds = resolveInitialBounds(episode, transitions);

	return {
		resolveBounds(frame) {
			let currentBounds = initialBounds;
			for (const transition of transitions) {
				if (frame < transition.from) {
					return currentBounds;
				}
				const finalBounds = transition.bounds.at(-1) ?? currentBounds;
				if (transition.type === "camera.cut" || transition.durationInFrames <= 1) {
					currentBounds = finalBounds;
					continue;
				}
				const endFrame = transition.from + transition.durationInFrames;
				if (frame < endFrame) {
					return transition.type === "camera.follow"
						? interpolateRouteBounds(currentBounds, transition, frame)
						: interpolateBounds(
							currentBounds,
							finalBounds,
							resolveProgress(frame, transition.from, transition.durationInFrames),
						);
				}
				currentBounds = finalBounds;
			}
			return currentBounds;
		},
	};
}

function resolveInitialBounds(
	episode: CompiledEpisodeScript,
	transitions: readonly CameraTransition[],
): CameraBounds {
	const firstAnimation = episode.graphAnimations[0];
	return firstAnimation?.plan.bounds ?? transitions[0]?.bounds[0] ?? FALLBACK_BOUNDS;
}

function resolveTargetBounds(
	episode: CompiledEpisodeScript,
	scheduled: ScheduledCameraAction,
): CameraBounds {
	if (scheduled.action.type === "camera.follow") {
		throw new Error("Camera follow actions use routeFrom, not target.");
	}
	const target = scheduled.action.target;
	const targetFrame = scheduled.from + signedSecondsToFrames(
		target.offsetSeconds,
		episode.composition.fps,
	);
	if ("component" in target) {
		return requireGraphAnimation(episode, target.component, scheduled, targetFrame).plan.bounds;
	}
	if ("scene" in target) {
		const visibleAnimations = resolveVisibleGraphAnimations(episode, scheduled, targetFrame);
		return combineBounds(visibleAnimations.map((animation) => animation.plan.bounds));
	}

	return resolveObjectsBounds(episode, scheduled, target.objects, targetFrame);
}

function resolveObjectsBounds(
	episode: CompiledEpisodeScript,
	scheduled: ScheduledCameraAction,
	references: readonly string[],
	targetFrame: number,
): CameraBounds {
	const parsedReferences = references.map((reference) => {
		const separatorIndex = reference.indexOf(".");
		return separatorIndex < 0
			? undefined
			: {
				claimKey: reference.slice(separatorIndex + 1),
				graphKey: reference.slice(0, separatorIndex),
			};
	});
	const graphKey = parsedReferences[0]?.graphKey;
	if (graphKey && parsedReferences.every((reference) => reference?.graphKey === graphKey)) {
		const animation = requireGraphAnimation(episode, graphKey, scheduled, targetFrame);
		const frame = resolveAnimationFrame(animation.plan, "wave", 1);
		const domainClaimIds = new Set(parsedReferences.map((reference) =>
			`${graphKey}:claim:${reference!.claimKey}` as ClaimId
		));
		const occurrenceIds = Object.values(frame.claims)
			.filter((claim) => domainClaimIds.has(claim.claimId))
			.map((claim) => claim.id);
		if (occurrenceIds.length === domainClaimIds.size) {
			return resolveClaimsBounds({ claimOccurrenceIds: occurrenceIds, frame, plan: animation.plan });
		}
	}

	return combineBounds(references.map((reference) =>
		resolveObjectBounds(episode, scheduled, reference, targetFrame)
	));
}

function resolveObjectBounds(
	episode: CompiledEpisodeScript,
	scheduled: ScheduledCameraAction,
	reference: string,
	targetFrame: number,
): CameraBounds {
	const separatorIndex = reference.indexOf(".");
	if (separatorIndex < 0) {
		return requireGraphAnimation(episode, reference, scheduled, targetFrame).plan.bounds;
	}
	const graphKey = reference.slice(0, separatorIndex);
	const claimKey = reference.slice(separatorIndex + 1);
	const animation = requireGraphAnimation(episode, graphKey, scheduled, targetFrame);
	const frame = resolveAnimationFrame(animation.plan, "wave", 1);
	const domainClaimId = `${graphKey}:claim:${claimKey}` as ClaimId;
	const occurrenceIds = Object.values(frame.claims)
		.filter((claim) => claim.claimId === domainClaimId)
		.map((claim) => claim.id);
	if (occurrenceIds.length === 0) {
		if (animation.debateCore.claims[domainClaimId]) {
			return animation.plan.bounds;
		}
		throw new Error(
			`Camera action ${scheduled.index} references missing object: ${reference}`,
		);
	}
	return resolveClaimsBounds({ claimOccurrenceIds: occurrenceIds, frame, plan: animation.plan });
}

function resolveFollowBounds(
	episode: CompiledEpisodeScript,
	scheduled: ScheduledCameraAction,
): readonly CameraBounds[] {
	if (scheduled.action.type !== "camera.follow") {
		throw new Error("Only camera.follow actions have routes.");
	}
	const reference = scheduled.action.routeFrom;
	const separatorIndex = reference.indexOf(".");
	if (separatorIndex < 0) {
		throw new Error(`Camera follow requires a component.object reference: ${reference}`);
	}
	const graphKey = reference.slice(0, separatorIndex);
	const claimKey = reference.slice(separatorIndex + 1);
	const claim = `${graphKey}:claim:${claimKey}` as ClaimId;
	const animation = [...episode.graphAnimations].reverse().find((candidate) =>
		candidate.graph === graphKey
		&& candidate.from <= scheduled.from
		&& candidate.addedClaimIds.includes(claim)
	);
	if (!animation) {
		throw new Error(
			`Camera action ${scheduled.index} cannot follow claim not added by an earlier action: ${reference}`,
		);
	}
	const settledFrame = resolveAnimationFrame(animation.plan, "wave", 1);
	if (!Object.values(settledFrame.claims).some((item) => item.claimId === claim)) {
		return [animation.plan.bounds];
	}
	return resolveClaimRouteBounds(animation.plan, claim);
}

function requireGraphAnimation(
	episode: CompiledEpisodeScript,
	graphKey: string,
	scheduled: ScheduledCameraAction,
	targetFrame = scheduled.from,
): CompiledGraphAnimation {
	const animation = [...episode.graphAnimations].reverse().find((candidate) =>
		candidate.graph === graphKey && candidate.from <= targetFrame
	);
	if (!animation) {
		throw new Error(
			`Camera action ${scheduled.index} references graph without a rendered state: ${graphKey}`,
		);
	}
	return animation;
}

function resolveVisibleGraphAnimations(
	episode: CompiledEpisodeScript,
	scheduled: ScheduledCameraAction,
	targetFrame = scheduled.from,
): readonly CompiledGraphAnimation[] {
	const visibleByGraph = new Map<string, CompiledGraphAnimation>();
	for (const animation of episode.graphAnimations) {
		if (animation.from <= targetFrame) {
			visibleByGraph.set(animation.graph, animation);
		}
	}
	if (visibleByGraph.size === 0) {
		throw new Error(`Camera action ${scheduled.index} cannot frame an empty scene.`);
	}
	return [...visibleByGraph.values()];
}

function signedSecondsToFrames(seconds: number, fps: number): number {
	return Math.sign(seconds) * Math.round(Math.abs(seconds) * fps);
}

function combineBounds(bounds: readonly CameraBounds[]): CameraBounds {
	if (bounds.length === 0) {
		return FALLBACK_BOUNDS;
	}
	const minX = Math.min(...bounds.map((item) => item.minX));
	const minY = Math.min(...bounds.map((item) => item.minY));
	const maxX = Math.max(...bounds.map((item) => item.minX + item.width));
	const maxY = Math.max(...bounds.map((item) => item.minY + item.height));
	return fitBoundsToAspectRatio({
		height: maxY - minY,
		minX,
		minY,
		width: maxX - minX,
	});
}

function interpolateRouteBounds(
	startBounds: CameraBounds,
	transition: CameraTransition,
	frame: number,
): CameraBounds {
	const route = transition.bounds.length > 0 ? transition.bounds : [startBounds];
	const destinations = boundsEqual(startBounds, route[0]!)
		? route
		: [startBounds, ...route];
	if (destinations.length === 1) {
		return destinations[0]!;
	}
	const progress = resolveProgress(frame, transition.from, transition.durationInFrames);
	const position = progress * (destinations.length - 1);
	const index = Math.min(destinations.length - 2, Math.floor(position));
	return interpolateBounds(
		destinations[index]!,
		destinations[index + 1]!,
		position - index,
	);
}

function boundsEqual(left: CameraBounds, right: CameraBounds): boolean {
	return left.height === right.height
		&& left.minX === right.minX
		&& left.minY === right.minY
		&& left.width === right.width;
}

function interpolateBounds(from: CameraBounds, to: CameraBounds, progress: number): CameraBounds {
	const easedProgress = CAMERA_EASING(Math.min(1, Math.max(0, progress)));
	return {
		height: interpolate(easedProgress, [0, 1], [from.height, to.height]),
		minX: interpolate(easedProgress, [0, 1], [from.minX, to.minX]),
		minY: interpolate(easedProgress, [0, 1], [from.minY, to.minY]),
		width: interpolate(easedProgress, [0, 1], [from.width, to.width]),
	};
}

function resolveProgress(frame: number, from: number, durationInFrames: number): number {
	return durationInFrames <= 1
		? 1
		: Math.min(1, Math.max(0, (frame - from) / (durationInFrames - 1)));
}

function isScheduledCameraAction(
	action: ScheduledEpisodeAction,
): action is ScheduledCameraAction {
	return action.action.type.startsWith("camera.");
}
