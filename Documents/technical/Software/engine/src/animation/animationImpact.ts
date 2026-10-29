import type {
	AppliedConfidenceClaimAddCommand,
	AppliedRelevanceClaimAddCommand,
} from "./applyDebateCommand.ts";
import type { DebateFrame } from "./DebateAnimationPlan.ts";
import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "../layout/buildPresentationGraphFromDebateCore.ts";
import type { ResolvedPresentationMath } from "../layout/resolvePresentationMath.ts";

export type CommandImpact = {
	addedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	contactConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	directAddedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	taperedDeliveryOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
};

export type FirstWaveImpact = {
	claimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	connectorOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
};

export function resolveCommandImpact(
	appliedCommands: readonly (
		| AppliedConfidenceClaimAddCommand
		| AppliedRelevanceClaimAddCommand
	)[],
	settledFrame: DebateFrame,
): CommandImpact {
	const addedClaimIds = new Set(appliedCommands.map((applied) => applied.claimId));
	const newConfidenceConnectorIds = new Set(
		appliedCommands.flatMap((applied) =>
			"confidenceConnectorId" in applied ? [applied.confidenceConnectorId] : []
		),
	);
	const newRelevanceConnectorIds = new Set(
		appliedCommands.flatMap((applied) =>
			"relevanceConnectorId" in applied ? [applied.relevanceConnectorId] : []
		),
	);
	const addedClaimOccurrenceIds = new Set(
		Object.values(settledFrame.claims)
			.filter((claim) => addedClaimIds.has(claim.claimId))
			.map((claim) => claim.id),
	);
	const newConfidenceOccurrenceIds = new Set(
		Object.values(settledFrame.confidenceConnections)
			.filter((connection) => newConfidenceConnectorIds.has(connection.confidenceConnectorId))
			.map((connection) => connection.id),
	);
	const newRelevanceOccurrences = Object.values(settledFrame.relevanceConnections)
		.filter((connection) => newRelevanceConnectorIds.has(connection.relevanceConnectorId));
	const newRelevanceOccurrenceIds = new Set(
		newRelevanceOccurrences.map((connection) => connection.id),
	);
	const contactConfidenceOccurrenceIds = new Set(newConfidenceOccurrenceIds);
	for (const relevanceOccurrence of newRelevanceOccurrences) {
		contactConfidenceOccurrenceIds.add(
			relevanceOccurrence.targetConfidenceConnectorOccurrenceId,
		);
	}
	const firstWaveTargetClaimOccurrenceIds = new Set(
		[...contactConfidenceOccurrenceIds].map((occurrenceId) => {
			const connection = settledFrame.confidenceConnections[occurrenceId];
			if (!connection) {
				throw new Error(`Missing contact confidence occurrence: ${occurrenceId}`);
			}
			return connection.targetClaimOccurrenceId;
		}),
	);
	const directAddedClaimOccurrenceIds = new Set(
		[...addedClaimOccurrenceIds].filter(
			(occurrenceId) => !firstWaveTargetClaimOccurrenceIds.has(occurrenceId),
		),
	);

	return {
		addedClaimOccurrenceIds,
		contactConfidenceOccurrenceIds,
		directAddedClaimOccurrenceIds,
		newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds,
		taperedDeliveryOccurrenceIds: new Set(newConfidenceOccurrenceIds),
	};
}

export function resolveFirstWaveImpact(
	commandImpact: CommandImpact,
	settledResolvedMath: ResolvedPresentationMath,
): FirstWaveImpact {
	const claimOccurrenceIds = new Set<PresentationClaimOccurrenceId>();
	const connectorOccurrenceIds = new Set<PresentationConnectorOccurrenceId>();
	const presentationGraph = settledResolvedMath.presentationGraph;

	for (const occurrenceId of commandImpact.contactConfidenceOccurrenceIds) {
		const connection = presentationGraph.connectorOccurrences[occurrenceId];
		if (!connection || connection.type !== "confidence") {
			throw new Error(`Missing contact confidence occurrence: ${occurrenceId}`);
		}
		const targetClaim = presentationGraph.claimOccurrences[connection.targetClaimOccurrenceId];
		if (!targetClaim) {
			throw new Error(`Missing first-wave target claim: ${connection.targetClaimOccurrenceId}`);
		}

		claimOccurrenceIds.add(targetClaim.id);
		if (!targetClaim.incomingConnectorOccurrenceId) {
			continue;
		}
		connectorOccurrenceIds.add(targetClaim.incomingConnectorOccurrenceId);
		const outgoingConnection = presentationGraph.connectorOccurrences[
			targetClaim.incomingConnectorOccurrenceId
		];
		if (outgoingConnection?.type === "relevance") {
			connectorOccurrenceIds.add(
				outgoingConnection.targetConfidenceConnectorOccurrenceId,
			);
		}
	}

	return { claimOccurrenceIds, connectorOccurrenceIds };
}
