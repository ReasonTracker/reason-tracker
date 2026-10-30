import { calculateSiblingScaleAllocation } from "../scoring/calculateSourcesScales.ts";
import type {
	PresentationClaimOccurrenceId,
	DebatePresentationGraph,
} from "./buildPresentationGraphFromDebateCore.ts";
import type { ResolvedPresentationMath } from "./resolvePresentationMath.ts";
import { resolveNonNegativeFinite } from "./layoutMath.ts";

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

		const outgoingOccurrence = claimOccurrence.incomingConnectorOccurrenceId
			? args.presentationGraph.connectorOccurrences[claimOccurrence.incomingConnectorOccurrenceId]
			: undefined;
		const relevanceOccurrenceIds = outgoingOccurrence?.type === "confidence"
			? outgoingOccurrence.relevanceConnectorOccurrenceIds
			: [];
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
		if (confidenceOccurrences.length === 0 && relevanceOccurrenceIds.length === 0) {
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
		});

		for (const relevanceOccurrenceId of relevanceOccurrenceIds) {
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
	};

	assignScales(
		args.presentationGraph.rootClaimOccurrenceId,
		args.rootSourcesScale,
		args.rootSourcesScale,
	);

	return { deliveryScales, parentFluidShares, sourcesScales };
}
