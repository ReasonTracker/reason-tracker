import type { ConnectorId } from "../debate-core/Connector.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import { calculateSiblingScaleAllocation } from "../math/calculateSourcesScales.ts";
import {
	resolveCyclesFromDebateCore,
	type AggregatedClaimScore,
	type ConnectorScoreContribution,
	type CycleResolutionOptions,
	type CycleResolvedScoreResult,
} from "../math/resolveCyclesFromDebateCore.ts";
import {
	buildPresentationGraphFromDebateCore,
	type DebatePresentationGraph,
	type PresentationClaimOccurrenceId,
	type PresentationConnectorOccurrenceId,
	type PresentationProjectionOptions,
} from "./buildPresentationGraphFromDebateCore.ts";

export type PresentationSide = "proMain" | "conMain";

export type ResolvedPresentationMath = {
	claimScores: Partial<Record<PresentationClaimOccurrenceId, AggregatedClaimScore>>
	connectorScores: Partial<
		Record<PresentationConnectorOccurrenceId, ConnectorScoreContribution>
	>
	cycleResolution: CycleResolvedScoreResult
	debateCore: DebateCore
	deliveryScales: Partial<Record<PresentationClaimOccurrenceId, number>>
	derivedContents: Partial<Record<PresentationClaimOccurrenceId, string>>
	derivedSides: Partial<Record<PresentationClaimOccurrenceId, PresentationSide>>
	displayContents: Partial<Record<PresentationClaimOccurrenceId, string>>
	displaySides: Partial<Record<PresentationClaimOccurrenceId, PresentationSide>>
	originalContents: Partial<Record<PresentationClaimOccurrenceId, string>>
	originalSides: Partial<Record<PresentationClaimOccurrenceId, PresentationSide>>
	parentFluidShares: Partial<Record<PresentationClaimOccurrenceId, number>>
	presentationGraph: DebatePresentationGraph
	sourcesScales: Partial<Record<PresentationClaimOccurrenceId, number>>
};

export interface ResolvePresentationMathOptions {
	cycleResolution?: CycleResolutionOptions
	presentationProjection?: PresentationProjectionOptions
	rootSourcesScale?: number
}

export function resolvePresentationMath(
	debateCore: DebateCore,
	options: ResolvePresentationMathOptions = {},
): ResolvedPresentationMath {
	const cycleResolution = resolveCyclesFromDebateCore(
		debateCore,
		options.cycleResolution,
	);
	const presentationGraph = buildPresentationGraphFromDebateCore(
		debateCore,
		options.presentationProjection,
	);
	const claimScores: ResolvedPresentationMath["claimScores"] = {};
	const connectorScores: ResolvedPresentationMath["connectorScores"] = {};

	for (const occurrence of Object.values(presentationGraph.claimOccurrences)) {
		const score = cycleResolution.claimScoresByRole[occurrence.affects][occurrence.claimId];
		if (!score) {
			throw new Error(
				`Missing aggregate score for presentation claim occurrence: ${occurrence.id}`,
			);
		}

		claimScores[occurrence.id] = score;
	}

	for (const occurrence of Object.values(presentationGraph.connectorOccurrences)) {
		const connectorId = resolveConnectorId(occurrence);
		const score = cycleResolution.connectorScores[connectorId];
		if (!score) {
			throw new Error(
				`Missing aggregate score for presentation connector occurrence: ${occurrence.id}`,
			);
		}

		connectorScores[occurrence.id] = score;
	}

	const originalSides = calculatePresentationSides(presentationGraph);
	const presentationDisplay = resolvePresentationDisplay({
		claimScores,
		debateCore,
		displayMode: "derived",
		originalSides,
		presentationGraph,
	});
	const { deliveryScales, parentFluidShares, sourcesScales } = calculatePresentationScales({
		connectorScores,
		presentationGraph,
		rootSourcesScale: resolveNonNegativeFinite(options.rootSourcesScale ?? 1),
	});

	return {
		claimScores,
		connectorScores,
		cycleResolution,
		debateCore,
		deliveryScales,
		...presentationDisplay,
		parentFluidShares,
		presentationGraph,
		originalSides,
		sourcesScales,
	};
}

export function resolvePresentationMathSnapshot(args: {
	basis: ResolvedPresentationMath
	claimScores: ResolvedPresentationMath["claimScores"]
	connectorScores: ResolvedPresentationMath["connectorScores"]
	displayMode?: "derived" | "original"
	rootSourcesScale: number
}): ResolvedPresentationMath {
	const presentationScales = calculatePresentationScales({
		connectorScores: args.connectorScores,
		presentationGraph: args.basis.presentationGraph,
		rootSourcesScale: args.rootSourcesScale,
	});

	return {
		...args.basis,
		...presentationScales,
		claimScores: { ...args.claimScores },
		connectorScores: { ...args.connectorScores },
		...resolvePresentationDisplay({
			claimScores: args.claimScores,
			debateCore: args.basis.debateCore,
			displayMode: args.displayMode ?? "derived",
			originalSides: args.basis.originalSides,
			presentationGraph: args.basis.presentationGraph,
		}),
	};
}

function resolvePresentationDisplay(args: {
	claimScores: ResolvedPresentationMath["claimScores"]
	debateCore: DebateCore
	displayMode: "derived" | "original"
	originalSides: ResolvedPresentationMath["originalSides"]
	presentationGraph: DebatePresentationGraph
}): Pick<
	ResolvedPresentationMath,
	"derivedContents" | "derivedSides" | "displayContents" | "displaySides" | "originalContents"
> {
	const derivedContents: ResolvedPresentationMath["derivedContents"] = {};
	const derivedSides: ResolvedPresentationMath["derivedSides"] = {};
	const displayContents: ResolvedPresentationMath["displayContents"] = {};
	const displaySides: ResolvedPresentationMath["displaySides"] = {};
	const originalContents: ResolvedPresentationMath["originalContents"] = {};

	for (const occurrence of Object.values(args.presentationGraph.claimOccurrences)) {
		const claim = args.debateCore.claims[occurrence.claimId];
		const originalSide = args.originalSides[occurrence.id];
		const score = args.claimScores[occurrence.id];
		if (!claim || !originalSide || !score) {
			throw new Error(`Missing resolved display state for ${occurrence.id}`);
		}

		const derivedSide = score.reversed ? flipSide(originalSide) : originalSide;
		const originalContent = claim.content;
		const derivedContent = score.reversed
			? claim.reversedContent ?? originalContent
			: originalContent;

		derivedContents[occurrence.id] = derivedContent;
		derivedSides[occurrence.id] = derivedSide;
		displayContents[occurrence.id] = args.displayMode === "derived"
			? derivedContent
			: originalContent;
		displaySides[occurrence.id] = args.displayMode === "derived"
			? derivedSide
			: originalSide;
		originalContents[occurrence.id] = originalContent;
	}

	return {
		derivedContents,
		derivedSides,
		displayContents,
		displaySides,
		originalContents,
	};
}

function calculatePresentationSides(
	graph: DebatePresentationGraph,
): ResolvedPresentationMath["originalSides"] {
	const sides: ResolvedPresentationMath["originalSides"] = {};

	const assignSide = (
		claimOccurrenceId: PresentationClaimOccurrenceId,
		side: PresentationSide,
	): void => {
		const claimOccurrence = graph.claimOccurrences[claimOccurrenceId];
		if (!claimOccurrence) {
			throw new Error(`Missing presentation claim occurrence: ${claimOccurrenceId}`);
		}

		sides[claimOccurrenceId] = side;
		if (claimOccurrence.terminal) {
			return;
		}

		for (const connectorOccurrenceId of claimOccurrence.confidenceConnectorOccurrenceIds) {
			const connectorOccurrence = graph.connectorOccurrences[connectorOccurrenceId];
			if (!connectorOccurrence || connectorOccurrence.type !== "confidence") {
				throw new Error(`Missing presentation confidence occurrence: ${connectorOccurrenceId}`);
			}

			const sourceSide = resolveChildSide(side, connectorOccurrence.targetRelationship);
			assignSide(connectorOccurrence.sourceClaimOccurrenceId, sourceSide);

			for (const relevanceOccurrenceId of connectorOccurrence.relevanceConnectorOccurrenceIds) {
				const relevanceOccurrence = graph.connectorOccurrences[relevanceOccurrenceId];
				if (!relevanceOccurrence || relevanceOccurrence.type !== "relevance") {
					throw new Error(`Missing presentation relevance occurrence: ${relevanceOccurrenceId}`);
				}

				assignSide(
					relevanceOccurrence.sourceClaimOccurrenceId,
					resolveChildSide(sourceSide, relevanceOccurrence.targetRelationship),
				);
			}
		}
	};

	assignSide(graph.rootClaimOccurrenceId, "proMain");
	return sides;
}

export function calculatePresentationScales(args: {
	connectorScores: ResolvedPresentationMath["connectorScores"]
	presentationGraph: DebatePresentationGraph
	rootSourcesScale: number
}): Pick<
	ResolvedPresentationMath,
	"deliveryScales" | "parentFluidShares" | "sourcesScales"
> {
	const deliveryScales: ResolvedPresentationMath["deliveryScales"] = {};
	const parentFluidShares: ResolvedPresentationMath["parentFluidShares"] = {};
	const sourcesScales: ResolvedPresentationMath["sourcesScales"] = {};

	const assignScales = (
		claimOccurrenceId: PresentationClaimOccurrenceId,
		sourcesScale: number,
		deliveryScale: number,
	): void => {
		const claimOccurrence = args.presentationGraph.claimOccurrences[claimOccurrenceId];
		if (!claimOccurrence) {
			throw new Error(`Missing presentation claim occurrence: ${claimOccurrenceId}`);
		}

		sourcesScales[claimOccurrenceId] = sourcesScale;
		deliveryScales[claimOccurrenceId] = deliveryScale;
		if (claimOccurrence.terminal) {
			return;
		}

		const confidenceOccurrences = claimOccurrence.confidenceConnectorOccurrenceIds.map(
			(connectorOccurrenceId) => {
				const connectorOccurrence = args.presentationGraph.connectorOccurrences[
					connectorOccurrenceId
				];
				if (!connectorOccurrence || connectorOccurrence.type !== "confidence") {
					throw new Error(
						`Missing presentation confidence occurrence: ${connectorOccurrenceId}`,
					);
				}

				return connectorOccurrence;
			},
		);
		if (confidenceOccurrences.length === 0) {
			return;
		}

		const allocation = calculateSiblingScaleAllocation({
			children: confidenceOccurrences.map((occurrence) => {
				const score = args.connectorScores[occurrence.id];
				if (!score) {
					throw new Error(`Missing presentation connector score: ${occurrence.id}`);
				}

				return {
					contributionWeight: resolveNonNegativeFinite(score.deliveryScore),
					id: occurrence.id,
					relevanceMultiplier: resolveNonNegativeFinite(score.relevanceMultiplier),
				};
			}),
			parentCapacity: sourcesScale,
		});

		confidenceOccurrences.forEach((occurrence) => {
			const deliveryScale = allocation.deliveryScales[occurrence.id];
			const parentFluidShare = allocation.parentFluidShares[occurrence.id];
			if (deliveryScale === undefined || parentFluidShare === undefined) {
				throw new Error(`Missing presentation scale allocation: ${occurrence.id}`);
			}
			parentFluidShares[occurrence.sourceClaimOccurrenceId] = parentFluidShare;
			assignScales(
				occurrence.sourceClaimOccurrenceId,
				allocation.sharedChildSourcesScale,
				deliveryScale,
			);

			for (const relevanceOccurrenceId of occurrence.relevanceConnectorOccurrenceIds) {
				const relevanceOccurrence = args.presentationGraph.connectorOccurrences[
					relevanceOccurrenceId
				];
				if (!relevanceOccurrence || relevanceOccurrence.type !== "relevance") {
					throw new Error(`Missing presentation relevance occurrence: ${relevanceOccurrenceId}`);
				}

				assignScales(
					relevanceOccurrence.sourceClaimOccurrenceId,
					allocation.sharedChildSourcesScale,
					allocation.sharedChildSourcesScale,
				);
			}
		});
	};

	assignScales(
		args.presentationGraph.rootClaimOccurrenceId,
		args.rootSourcesScale,
		args.rootSourcesScale,
	);

	return { deliveryScales, parentFluidShares, sourcesScales };
}

function resolveConnectorId(
	occurrence: DebatePresentationGraph["connectorOccurrences"][PresentationConnectorOccurrenceId],
): ConnectorId {
	return occurrence.type === "confidence"
		? occurrence.confidenceConnectorId
		: occurrence.relevanceConnectorId;
}

function resolveChildSide(
	parentSide: PresentationSide,
	targetRelationship: "proTarget" | "conTarget",
): PresentationSide {
	if (targetRelationship === "proTarget") {
		return parentSide;
	}

	return parentSide === "proMain" ? "conMain" : "proMain";
}

function resolveNonNegativeFinite(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`Expected a finite non-negative number: ${value}`);
	}

	return value;
}

function flipSide(side: PresentationSide): PresentationSide {
	return side === "proMain" ? "conMain" : "proMain";
}