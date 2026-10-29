import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "../layout/buildPresentationGraphFromDebateCore.ts";
import type { DebateFrame } from "./DebateAnimationPlan.ts";

export function augmentOpeningFrame(args: {
	addedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	openingFrame: DebateFrame
	stagingFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.stagingFrame);

	for (const claim of Object.values(frame.claims)) {
		const openingClaim = args.openingFrame.claims[claim.id];
		if (openingClaim) {
			frame.claims[claim.id] = { ...openingClaim, position: { ...openingClaim.position } };
		} else if (args.addedClaimOccurrenceIds.has(claim.id)) {
			claim.scale = 0;
		} else {
			throw new Error(`Opening frame is missing existing claim occurrence: ${claim.id}`);
		}
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const openingConnection = args.openingFrame.confidenceConnections[connection.id];
		if (openingConnection) {
			frame.confidenceConnections[connection.id] = {
				...connection,
				...openingConnection,
				relevanceConnectorOccurrenceIds: connection.relevanceConnectorOccurrenceIds,
			};
		} else if (args.newConfidenceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
			connection.shellReveal = 0;
		} else {
			throw new Error(`Opening frame is missing existing confidence occurrence: ${connection.id}`);
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		const openingConnection = args.openingFrame.relevanceConnections[connection.id];
		if (openingConnection) {
			frame.relevanceConnections[connection.id] = { ...openingConnection };
		} else if (args.newRelevanceOccurrenceIds.has(connection.id)) {
			connection.scale = 0;
			connection.score = 0;
			connection.shellReveal = 0;
		} else {
			throw new Error(`Opening frame is missing existing relevance occurrence: ${connection.id}`);
		}
	}

	return frame;
}

export function preserveOpeningFrameState(
	placementFrame: DebateFrame,
	openingFrame: DebateFrame,
): DebateFrame {
	const frame = cloneFrame(placementFrame);

	for (const claim of Object.values(frame.claims)) {
		const openingClaim = openingFrame.claims[claim.id];
		if (openingClaim) {
			frame.claims[claim.id] = { ...openingClaim, position: { ...openingClaim.position } };
		}
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const openingConnection = openingFrame.confidenceConnections[connection.id];
		if (openingConnection) {
			frame.confidenceConnections[connection.id] = {
				...connection,
				...openingConnection,
				relevanceConnectorOccurrenceIds: connection.relevanceConnectorOccurrenceIds,
			};
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		const openingConnection = openingFrame.relevanceConnections[connection.id];
		if (openingConnection) {
			frame.relevanceConnections[connection.id] = { ...openingConnection };
		}
	}

	return frame;
}

export function applyTemporaryDeliveryTapers(
	frame: DebateFrame,
	occurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>,
): DebateFrame {
	const taperedFrame = cloneFrame(frame);
	for (const occurrenceId of occurrenceIds) {
		const connection = taperedFrame.confidenceConnections[occurrenceId];
		if (!connection) {
			throw new Error(`Missing tapered confidence occurrence: ${occurrenceId}`);
		}
		connection.deliveryTargetScale = connection.deliveryScale * connection.score;
	}

	return taperedFrame;
}

export function buildVoilaFrame(args: {
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	stagingFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.stagingFrame);

	for (const occurrenceId of args.newConfidenceOccurrenceIds) {
		const connection = frame.confidenceConnections[occurrenceId];
		if (!connection) {
			throw new Error(`Missing new confidence occurrence: ${occurrenceId}`);
		}
		connection.shellReveal = 0;
	}

	for (const occurrenceId of args.newRelevanceOccurrenceIds) {
		const connection = frame.relevanceConnections[occurrenceId];
		if (!connection) {
			throw new Error(`Missing new relevance occurrence: ${occurrenceId}`);
		}
		connection.shellReveal = 0;
	}

	return frame;
}

export function buildSproutFrame(args: {
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	voilaFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.voilaFrame);

	for (const connection of Object.values(frame.confidenceConnections)) {
		if (args.newConfidenceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
			connection.shellReveal = 1;
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		if (args.newRelevanceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
			connection.shellReveal = 1;
		}
	}

	return frame;
}

export function preserveRevealState(frame: DebateFrame, revealFrame: DebateFrame): DebateFrame {
	const preservedFrame = cloneFrame(frame);
	for (const connection of Object.values(preservedFrame.confidenceConnections)) {
		connection.shellReveal = revealFrame.confidenceConnections[connection.id]?.shellReveal
			?? connection.shellReveal;
	}
	for (const connection of Object.values(preservedFrame.relevanceConnections)) {
		connection.shellReveal = revealFrame.relevanceConnections[connection.id]?.shellReveal
			?? connection.shellReveal;
	}
	return preservedFrame;
}

export function applyDisplayState(
	frame: DebateFrame,
	displayFrame: DebateFrame,
): DebateFrame {
	const resolvedFrame = cloneFrame(frame);

	for (const claim of Object.values(resolvedFrame.claims)) {
		const displayClaim = displayFrame.claims[claim.id];
		if (!displayClaim) {
			throw new Error(`Missing display claim frame: ${claim.id}`);
		}

		claim.displayContent = displayClaim.displayContent;
		claim.displaySide = displayClaim.displaySide;
	}

	for (const connection of Object.values(resolvedFrame.confidenceConnections)) {
		const displayConnection = displayFrame.confidenceConnections[connection.id];
		if (!displayConnection) {
			throw new Error(`Missing display confidence frame: ${connection.id}`);
		}

		connection.displaySide = displayConnection.displaySide;
	}

	for (const connection of Object.values(resolvedFrame.relevanceConnections)) {
		const displayConnection = displayFrame.relevanceConnections[connection.id];
		if (!displayConnection) {
			throw new Error(`Missing display relevance frame: ${connection.id}`);
		}

		connection.displaySide = displayConnection.displaySide;
	}

	return resolvedFrame;
}

export function cloneFrame(frame: DebateFrame): DebateFrame {
	return {
		claims: mapRecord(frame.claims, (claim) => ({
			...claim,
			position: { ...claim.position },
		})),
		confidenceConnections: mapRecord(frame.confidenceConnections, (connection) => ({
			...connection,
			relevanceConnectorOccurrenceIds: [...connection.relevanceConnectorOccurrenceIds],
			volumeTransitions: [...connection.volumeTransitions],
		})),
		relevanceConnections: mapRecord(frame.relevanceConnections, (connection) => ({
			...connection,
			volumeTransitions: [...connection.volumeTransitions],
		})),
	};
}

function mapRecord<TKey extends string, TValue>(
	record: Record<TKey, TValue>,
	mapValue: (value: TValue) => TValue,
): Record<TKey, TValue> {
	return Object.fromEntries(
		Object.entries(record).map(([key, value]) => [key, mapValue(value as TValue)]),
	) as Record<TKey, TValue>;
}
