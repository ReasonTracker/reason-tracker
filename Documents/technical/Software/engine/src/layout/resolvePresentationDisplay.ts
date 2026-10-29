import type { DebateCore } from "../debate-core/Debate.ts";
import type {
	PresentationClaimOccurrenceId,
	DebatePresentationGraph,
} from "./buildPresentationGraphFromDebateCore.ts";
import type {
	PresentationSide,
	ResolvedPresentationMath,
} from "./resolvePresentationMath.ts";

export function resolvePresentationDisplay(args: {
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

export function calculatePresentationSides(
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

function resolveChildSide(
	parentSide: PresentationSide,
	targetRelationship: "proTarget" | "conTarget",
): PresentationSide {
	if (targetRelationship === "proTarget") {
		return parentSide;
	}

	return flipSide(parentSide);
}

function flipSide(side: PresentationSide): PresentationSide {
	return side === "proMain" ? "conMain" : "proMain";
}
