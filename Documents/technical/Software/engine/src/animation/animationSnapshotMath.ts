import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "../layout/buildPresentationGraphFromDebateCore.ts";
import {
	resolvePresentationMathSnapshot,
	type ResolvedPresentationMath,
} from "../layout/resolvePresentationMath.ts";
import {
	resolveFirstWaveImpact,
	type CommandImpact,
} from "./animationImpact.ts";

export function resolveFirstFillMath(args: {
	commandImpact: CommandImpact
	settledResolvedMath: ResolvedPresentationMath
	stagingResolvedMath: ResolvedPresentationMath
}): ResolvedPresentationMath {
	const claimScores = { ...args.stagingResolvedMath.claimScores };
	const connectorScores = { ...args.stagingResolvedMath.connectorScores };

	for (const occurrenceId of args.commandImpact.directAddedClaimOccurrenceIds) {
		claimScores[occurrenceId] = requireClaimScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}
	for (const occurrenceId of args.commandImpact.contactConfidenceOccurrenceIds) {
		connectorScores[occurrenceId] = requireConnectorScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}
	for (const occurrenceId of args.commandImpact.newRelevanceOccurrenceIds) {
		connectorScores[occurrenceId] = requireConnectorScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}

	return resolveSnapshotMath(args.settledResolvedMath, claimScores, connectorScores, "original");
}

export function resolveFirstWaveMath(args: {
	commandImpact: CommandImpact
	firstFillResolvedMath: ResolvedPresentationMath
	settledResolvedMath: ResolvedPresentationMath
}): ResolvedPresentationMath {
	const claimScores = { ...args.firstFillResolvedMath.claimScores };
	const connectorScores = { ...args.firstFillResolvedMath.connectorScores };
	const impact = resolveFirstWaveImpact(args.commandImpact, args.settledResolvedMath);

	for (const occurrenceId of impact.claimOccurrenceIds) {
		claimScores[occurrenceId] = requireClaimScore(args.settledResolvedMath, occurrenceId);
	}
	for (const occurrenceId of impact.connectorOccurrenceIds) {
		connectorScores[occurrenceId] = requireConnectorScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}

	return resolveSnapshotMath(args.settledResolvedMath, claimScores, connectorScores, "original");
}

export function resolvePlacementMath(args: {
	openingResolvedMath: ResolvedPresentationMath
	settledResolvedMath: ResolvedPresentationMath
}): ResolvedPresentationMath {
	const claimScores: ResolvedPresentationMath["claimScores"] = {};
	for (const occurrence of Object.values(
		args.settledResolvedMath.presentationGraph.claimOccurrences,
	)) {
		claimScores[occurrence.id] = args.openingResolvedMath.claimScores[occurrence.id] ?? {
			claimId: occurrence.claimId,
			directedValue: 0,
			originalValue: 0,
			reversed: false,
			totalWeight: 0,
			value: 0,
			weightedSum: 0,
		};
	}

	const connectorScores: ResolvedPresentationMath["connectorScores"] = {};
	for (const occurrence of Object.values(
		args.settledResolvedMath.presentationGraph.connectorOccurrences,
	)) {
		connectorScores[occurrence.id] = args.openingResolvedMath.connectorScores[occurrence.id] ?? {
			deliveryScore: 0,
			relevanceMultiplier: 1,
			sourceScore: 0,
		};
	}

	return resolveSnapshotMath(args.settledResolvedMath, claimScores, connectorScores, "original");
}

export function resolveSnapshotMath(
	basis: ResolvedPresentationMath,
	claimScores: ResolvedPresentationMath["claimScores"],
	connectorScores: ResolvedPresentationMath["connectorScores"],
	displayMode: "derived" | "original" = "derived",
): ResolvedPresentationMath {
	return resolvePresentationMathSnapshot({
		basis,
		claimScores,
		connectorScores,
		displayMode,
		rootSourcesScale: basis.sourcesScales[basis.presentationGraph.rootClaimOccurrenceId] ?? 1,
	});
}

export function assertScoreChangesLimitedTo(args: {
	allowedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	allowedConnectorOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	from: ResolvedPresentationMath
	label: string
	to: ResolvedPresentationMath
}): void {
	for (const [occurrenceId, score] of Object.entries(args.to.claimScores)) {
		const typedOccurrenceId = occurrenceId as PresentationClaimOccurrenceId;
		if (
			!args.allowedClaimOccurrenceIds.has(typedOccurrenceId)
			&& !claimScoresEqual(score, args.from.claimScores[typedOccurrenceId])
		) {
			throw new Error(`${args.label} unexpectedly changes claim score: ${occurrenceId}`);
		}
	}
	for (const [occurrenceId, score] of Object.entries(args.to.connectorScores)) {
		const typedOccurrenceId = occurrenceId as PresentationConnectorOccurrenceId;
		if (
			!args.allowedConnectorOccurrenceIds.has(typedOccurrenceId)
			&& !connectorScoresEqual(score, args.from.connectorScores[typedOccurrenceId])
		) {
			throw new Error(`${args.label} unexpectedly changes connector score: ${occurrenceId}`);
		}
	}
}

function requireClaimScore(
	math: ResolvedPresentationMath,
	occurrenceId: PresentationClaimOccurrenceId,
) {
	const score = math.claimScores[occurrenceId];
	if (!score) {
		throw new Error(`Missing claim score for occurrence: ${occurrenceId}`);
	}
	return score;
}

function requireConnectorScore(
	math: ResolvedPresentationMath,
	occurrenceId: PresentationConnectorOccurrenceId,
) {
	const score = math.connectorScores[occurrenceId];
	if (!score) {
		throw new Error(`Missing connector score for occurrence: ${occurrenceId}`);
	}
	return score;
}

function claimScoresEqual(
	left: ResolvedPresentationMath["claimScores"][PresentationClaimOccurrenceId],
	right: ResolvedPresentationMath["claimScores"][PresentationClaimOccurrenceId],
): boolean {
	return left?.claimId === right?.claimId
		&& left?.directedValue === right?.directedValue
		&& left?.originalValue === right?.originalValue
		&& left?.reversed === right?.reversed
		&& left?.totalWeight === right?.totalWeight
		&& left?.value === right?.value
		&& left?.weightedSum === right?.weightedSum;
}

function connectorScoresEqual(
	left: ResolvedPresentationMath["connectorScores"][PresentationConnectorOccurrenceId],
	right: ResolvedPresentationMath["connectorScores"][PresentationConnectorOccurrenceId],
): boolean {
	return left?.deliveryScore === right?.deliveryScore
		&& left?.relevanceMultiplier === right?.relevanceMultiplier
		&& left?.sourceScore === right?.sourceScore;
}
