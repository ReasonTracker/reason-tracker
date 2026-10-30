import type { ConnectorId } from "../debate-core/Connector.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type { PresentationSide } from "../animationContracts.ts";
import {
	resolveCyclesFromDebateCore,
	type AggregatedClaimScore,
	type ConnectorScoreContribution,
	type CycleResolutionOptions,
	type CycleResolvedScoreResult,
} from "../scoring/resolveCyclesFromDebateCore.ts";
import {
	buildPresentationGraphFromDebateCore,
	type DebatePresentationGraph,
	type PresentationClaimOccurrenceId,
	type PresentationConnectorOccurrenceId,
	type PresentationProjectionOptions,
} from "./buildPresentationGraphFromDebateCore.ts";
import { calculatePresentationScales } from "./calculatePresentationScales.ts";
import { resolveNonNegativeFinite } from "./layoutMath.ts";
import {
	calculatePresentationSides,
	resolvePresentationDisplay,
} from "./resolvePresentationDisplay.ts";

export { calculatePresentationScales } from "./calculatePresentationScales.ts";

export type { PresentationSide } from "../animationContracts.ts";

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
	const presentationScales = calculatePresentationScales({
		connectorScores,
		presentationGraph,
		rootSourcesScale: resolveNonNegativeFinite(options.rootSourcesScale ?? 1),
	});

	return {
		claimScores,
		connectorScores,
		cycleResolution,
		debateCore,
		...presentationScales,
		...presentationDisplay,
		originalSides,
		presentationGraph,
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

function resolveConnectorId(
	occurrence: DebatePresentationGraph["connectorOccurrences"][PresentationConnectorOccurrenceId],
): ConnectorId {
	return occurrence.type === "confidence"
		? occurrence.confidenceConnectorId
		: occurrence.relevanceConnectorId;
}
