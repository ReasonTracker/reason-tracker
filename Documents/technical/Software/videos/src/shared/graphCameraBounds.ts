import type { ClaimId } from "@debate-core/Claim.ts";
import {
	resolveAnimationFrame,
	type DebateAnimationPlan,
	type DebateFrame,
} from "@planner/DebateAnimationPlan.ts";
import type { PresentationClaimOccurrenceId } from "@planner/buildPresentationGraphFromDebateCore.ts";

// AGENT NOTE: Keep camera framing and motion tuning values together.
/** Matches the 1920 by 1080 episode composition. */
const CAMERA_ASPECT_RATIO = 16 / 9;
/** Adds breathing room around the claims selected for the camera. */
const CAMERA_PADDING_RATIO = 0.22;
/** Prevents camera padding from disappearing around deeply scaled claims. */
const MINIMUM_CAMERA_PADDING = 12;

export type CameraBounds = DebateAnimationPlan["bounds"];

export type ClaimCameraScript = {
	resolveBounds: (frame: number) => CameraBounds
};

export function resolveClaimRouteBounds(
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

export function resolveClaimsBounds(args: {
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

export function fitBoundsToAspectRatio(bounds: CameraBounds): CameraBounds {
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