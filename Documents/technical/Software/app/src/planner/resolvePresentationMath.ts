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
	deliveryScales: Partial<Record<PresentationClaimOccurrenceId, number>>
	parentFluidShares: Partial<Record<PresentationClaimOccurrenceId, number>>
	presentationGraph: DebatePresentationGraph
	sides: Partial<Record<PresentationClaimOccurrenceId, PresentationSide>>
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
		const score = cycleResolution.claimScores[occurrence.claimId];
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

	const sides = calculatePresentationSides(presentationGraph);
	const { deliveryScales, parentFluidShares, sourcesScales } = calculatePresentationScales({
		connectorScores,
		presentationGraph,
		rootSourcesScale: resolveNonNegativeFinite(options.rootSourcesScale ?? 1),
	});

	return {
		claimScores,
		connectorScores,
		cycleResolution,
		deliveryScales,
		parentFluidShares,
		presentationGraph,
		sides,
		sourcesScales,
	};
}

function calculatePresentationSides(
	graph: DebatePresentationGraph,
): ResolvedPresentationMath["sides"] {
	const sides: ResolvedPresentationMath["sides"] = {};

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