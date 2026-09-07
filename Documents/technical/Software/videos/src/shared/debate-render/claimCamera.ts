import type { ClaimId } from "@debate-core/Claim.ts";
import {
	resolveAnimationFrame,
	type DebateAnimationPlan,
	type DebateFrame,
} from "@planner/DebateAnimationPlan.ts";
import type { PresentationClaimOccurrenceId } from "@planner/buildPresentationGraphFromDebateCore.ts";
import { Easing, interpolate } from "remotion";

// AGENT NOTE: Keep camera framing and motion tuning values together.
/** Matches the 1920 by 1080 episode composition. */
const CAMERA_ASPECT_RATIO = 16 / 9;
/** Adds breathing room around the claims selected for the camera. */
const CAMERA_PADDING_RATIO = 0.22;
/** Prevents camera padding from disappearing around deeply scaled claims. */
const MINIMUM_CAMERA_PADDING = 12;
/** Eases each camera destination without resetting between moves. */
const CAMERA_EASING = Easing.bezier(0.42, 0, 0.2, 1);

export type CameraBounds = DebateAnimationPlan["bounds"];

export type CameraFrameRange = {
	durationInFrames: number
	from: number
};

export type ClaimCameraChapter = {
	addedClaimId: ClaimId
	focusRange: CameraFrameRange
	followRange: CameraFrameRange
	plan: DebateAnimationPlan
};

export type ClaimCameraScript = {
	resolveBounds: (frame: number) => CameraBounds
};

export type FinalCameraView = {
	bounds: CameraBounds
	range: CameraFrameRange
};

type ResolvedCameraChapter = {
	finalBounds: CameraBounds
	focusBounds: CameraBounds
	focusRange: CameraFrameRange
	followBounds: readonly CameraBounds[]
	followRange: CameraFrameRange
	startBounds: CameraBounds
};

export function createClaimCameraScript(args: {
	chapters: readonly ClaimCameraChapter[]
	finalView?: FinalCameraView
	initialBounds?: CameraBounds
}): ClaimCameraScript {
	if (args.chapters.length === 0) {
		const fallbackBounds = args.initialBounds ?? {
			height: 1080,
			minX: 0,
			minY: 0,
			width: 1920,
		};
		return { resolveBounds: () => fallbackBounds };
	}

	let previousBounds = args.initialBounds ?? args.chapters[0]!.plan.bounds;
	const chapters = args.chapters.map((chapter): ResolvedCameraChapter => {
		const routeBounds = resolveClaimRouteBounds(chapter.plan, chapter.addedClaimId);
		const resolvedChapter = {
			finalBounds: routeBounds.at(-1) ?? previousBounds,
			focusBounds: routeBounds[0] ?? previousBounds,
			focusRange: chapter.focusRange,
			followBounds: routeBounds,
			followRange: chapter.followRange,
			startBounds: previousBounds,
		};
		previousBounds = resolvedChapter.finalBounds;
		return resolvedChapter;
	});

	const finalChapterBounds = chapters.at(-1)?.finalBounds ?? previousBounds;

	return {
		resolveBounds(frame) {
			for (const chapter of chapters) {
				if (frame < chapter.focusRange.from) {
					return chapter.startBounds;
				}

				const focusEnd = chapter.focusRange.from + chapter.focusRange.durationInFrames;
				if (frame < focusEnd) {
					return interpolateCameraBounds({
						frame,
						from: chapter.startBounds,
						range: chapter.focusRange,
						to: chapter.focusBounds,
					});
				}

				if (frame < chapter.followRange.from) {
					return chapter.focusBounds;
				}

				const followEnd = chapter.followRange.from + chapter.followRange.durationInFrames;
				if (frame < followEnd) {
					return resolveRouteCameraBounds({
						bounds: chapter.followBounds,
						frame,
						range: chapter.followRange,
					});
				}
			}

			if (!args.finalView || frame < args.finalView.range.from) {
				return finalChapterBounds;
			}

			return interpolateCameraBounds({
				frame,
				from: finalChapterBounds,
				range: args.finalView.range,
				to: args.finalView.bounds,
			});
		},
	};
}

export function resolveClaimCameraDestinationCount(
	plan: DebateAnimationPlan,
	addedClaimId: ClaimId,
): number {
	return resolveClaimRouteBounds(plan, addedClaimId).length;
}

function resolveClaimRouteBounds(
	plan: DebateAnimationPlan,
	addedClaimId: ClaimId,
): readonly CameraBounds[] {
	const settledFrame = resolveAnimationFrame(plan, "wave", 1);
	const addedOccurrenceId = resolveAddedClaimOccurrenceId({
		addedClaimId,
		openingFrame: plan.openingFrame,
		settledFrame,
	});
	const route = resolveTargetRoute(settledFrame, addedOccurrenceId);

	return route.map((occurrenceId, index) => resolveClaimsBounds({
		claimOccurrenceIds: route[index + 1]
			? [occurrenceId, route[index + 1]!]
			: [occurrenceId],
		frame: settledFrame,
		plan,
	}));
}

function resolveAddedClaimOccurrenceId(args: {
	addedClaimId: ClaimId
	openingFrame: DebateFrame
	settledFrame: DebateFrame
}): PresentationClaimOccurrenceId {
	const openingOccurrenceIds = new Set(Object.keys(args.openingFrame.claims));
	const addedOccurrence = Object.values(args.settledFrame.claims).find((claim) =>
		claim.claimId === args.addedClaimId && !openingOccurrenceIds.has(claim.id)
	);

	if (!addedOccurrence) {
		throw new Error(`Cannot focus added claim without a new occurrence: ${args.addedClaimId}`);
	}

	return addedOccurrence.id;
}

function resolveTargetRoute(
	frame: DebateFrame,
	startOccurrenceId: PresentationClaimOccurrenceId,
): readonly PresentationClaimOccurrenceId[] {
	const route: PresentationClaimOccurrenceId[] = [startOccurrenceId];
	const visited = new Set<PresentationClaimOccurrenceId>(route);
	let occurrenceId = startOccurrenceId;

	while (true) {
		const outgoingConnection = Object.values(frame.confidenceConnections).find(
			(connection) => connection.sourceClaimOccurrenceId === occurrenceId,
		);
		if (!outgoingConnection || visited.has(outgoingConnection.targetClaimOccurrenceId)) {
			return route;
		}

		occurrenceId = outgoingConnection.targetClaimOccurrenceId;
		visited.add(occurrenceId);
		route.push(occurrenceId);
	}
}

function resolveClaimsBounds(args: {
	claimOccurrenceIds: readonly PresentationClaimOccurrenceId[]
	frame: DebateFrame
	plan: DebateAnimationPlan
}): CameraBounds {
	const claims = args.claimOccurrenceIds.map((occurrenceId) => {
		const claim = args.frame.claims[occurrenceId];
		if (!claim) {
			throw new Error(`Cannot frame missing claim occurrence: ${occurrenceId}`);
		}
		return claim;
	});
	const minX = Math.min(...claims.map((claim) =>
		claim.position.x - ((args.plan.options.claimWidth * claim.scale) / 2)
	));
	const maxX = Math.max(...claims.map((claim) =>
		claim.position.x + ((args.plan.options.claimWidth * claim.scale) / 2)
	));
	const minY = Math.min(...claims.map((claim) =>
		claim.position.y - ((args.plan.options.claimHeight * claim.scale) / 2)
	));
	const maxY = Math.max(...claims.map((claim) =>
		claim.position.y + ((args.plan.options.claimHeight * claim.scale) / 2)
	));
	const padding = Math.max(
		MINIMUM_CAMERA_PADDING,
		Math.max(maxX - minX, maxY - minY) * CAMERA_PADDING_RATIO,
	);

	return fitBoundsToAspectRatio({
		height: (maxY - minY) + (padding * 2),
		minX: minX - padding,
		minY: minY - padding,
		width: (maxX - minX) + (padding * 2),
	});
}

function fitBoundsToAspectRatio(bounds: CameraBounds): CameraBounds {
	const centerX = bounds.minX + (bounds.width / 2);
	const centerY = bounds.minY + (bounds.height / 2);
	const currentAspectRatio = bounds.width / bounds.height;
	const width = currentAspectRatio < CAMERA_ASPECT_RATIO
		? bounds.height * CAMERA_ASPECT_RATIO
		: bounds.width;
	const height = currentAspectRatio > CAMERA_ASPECT_RATIO
		? bounds.width / CAMERA_ASPECT_RATIO
		: bounds.height;

	return {
		height,
		minX: centerX - (width / 2),
		minY: centerY - (height / 2),
		width,
	};
}

function resolveRouteCameraBounds(args: {
	bounds: readonly CameraBounds[]
	frame: number
	range: CameraFrameRange
}): CameraBounds {
	if (args.bounds.length <= 1) {
		return args.bounds[0] ?? { height: 1080, minX: 0, minY: 0, width: 1920 };
	}

	const progress = resolveRangeProgress(args.frame, args.range);
	const transitionCount = args.bounds.length - 1;
	const transitionPosition = progress * transitionCount;
	const transitionIndex = Math.min(
		transitionCount - 1,
		Math.floor(transitionPosition),
	);
	const transitionProgress = transitionPosition - transitionIndex;

	return interpolateCameraBoundsByProgress(
		args.bounds[transitionIndex]!,
		args.bounds[transitionIndex + 1]!,
		transitionProgress,
	);
}

function interpolateCameraBounds(args: {
	frame: number
	from: CameraBounds
	range: CameraFrameRange
	to: CameraBounds
}): CameraBounds {
	return interpolateCameraBoundsByProgress(
		args.from,
		args.to,
		resolveRangeProgress(args.frame, args.range),
	);
}

function interpolateCameraBoundsByProgress(
	from: CameraBounds,
	to: CameraBounds,
	progress: number,
): CameraBounds {
	const easedProgress = CAMERA_EASING(Math.min(1, Math.max(0, progress)));
	return {
		height: interpolate(easedProgress, [0, 1], [from.height, to.height]),
		minX: interpolate(easedProgress, [0, 1], [from.minX, to.minX]),
		minY: interpolate(easedProgress, [0, 1], [from.minY, to.minY]),
		width: interpolate(easedProgress, [0, 1], [from.width, to.width]),
	};
}

function resolveRangeProgress(frame: number, range: CameraFrameRange): number {
	if (range.durationInFrames <= 1) {
		return 1;
	}

	return Math.min(1, Math.max(
		0,
		(frame - range.from) / (range.durationInFrames - 1),
	));
}