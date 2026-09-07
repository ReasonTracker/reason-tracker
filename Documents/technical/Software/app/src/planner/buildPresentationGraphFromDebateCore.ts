import type { ClaimId } from "../debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConfidenceConnectorId,
	Connector,
	ConnectorId,
	RelevanceConnector,
	RelevanceConnectorId,
} from "../debate-core/Connector.ts";
import type { DebateCore } from "../debate-core/Debate.ts";

const DEFAULT_MAX_PRESENTATION_OCCURRENCES = 100_000;

export type PresentationClaimOccurrenceId = string & {
	readonly __brand: "PresentationClaimOccurrenceId"
};

export type PresentationConnectorOccurrenceId = string & {
	readonly __brand: "PresentationConnectorOccurrenceId"
};

export type PresentationClaimOccurrence = {
	claimId: ClaimId
	confidenceConnectorOccurrenceIds: PresentationConnectorOccurrenceId[]
	id: PresentationClaimOccurrenceId
	incomingConnectorOccurrenceId?: PresentationConnectorOccurrenceId
	terminal: boolean
};

type PresentationConnectorOccurrenceBase = {
	id: PresentationConnectorOccurrenceId
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	targetRelationship: Connector["targetRelationship"]
};

export type PresentationConfidenceConnectorOccurrence = PresentationConnectorOccurrenceBase & {
	confidenceConnectorId: ConfidenceConnectorId
	relevanceConnectorOccurrenceIds: PresentationConnectorOccurrenceId[]
	targetClaimOccurrenceId: PresentationClaimOccurrenceId
	type: "confidence"
};

export type PresentationRelevanceConnectorOccurrence = PresentationConnectorOccurrenceBase & {
	relevanceConnectorId: RelevanceConnectorId
	targetConfidenceConnectorOccurrenceId: PresentationConnectorOccurrenceId
	type: "relevance"
};

export type PresentationConnectorOccurrence =
	| PresentationConfidenceConnectorOccurrence
	| PresentationRelevanceConnectorOccurrence;

export type DebatePresentationGraph = {
	claimOccurrences: Record<PresentationClaimOccurrenceId, PresentationClaimOccurrence>
	connectorOccurrences: Record<PresentationConnectorOccurrenceId, PresentationConnectorOccurrence>
	rootClaimOccurrenceId: PresentationClaimOccurrenceId
};

export interface PresentationProjectionOptions {
	maxOccurrences?: number
}

export class PresentationProjectionTooComplexError extends Error {
	readonly code = "presentation-projection-too-complex";
	readonly details: {
		generatedOccurrences: number
		limit: number
	};

	constructor(details: { generatedOccurrences: number; limit: number }) {
		super(`Presentation projection exceeded the occurrence limit of ${details.limit}.`);
		this.name = "PresentationProjectionTooComplexError";
		this.details = details;
	}
}

export function buildPresentationGraphFromDebateCore(
	debateCore: DebateCore,
	options: PresentationProjectionOptions = {},
): DebatePresentationGraph {
	const maxOccurrences = resolvePositiveInteger(
		options.maxOccurrences,
		DEFAULT_MAX_PRESENTATION_OCCURRENCES,
	);
	const incomingConfidenceConnectors = indexIncomingConfidenceConnectors(debateCore);
	const incomingRelevanceConnectors = indexIncomingRelevanceConnectors(debateCore);
	const graph: DebatePresentationGraph = {
		claimOccurrences: {},
		connectorOccurrences: {},
		rootClaimOccurrenceId: resolveRootClaimOccurrenceId(debateCore.mainClaimId),
	};
	let generatedOccurrences = 0;

	const registerOccurrence = (): void => {
		generatedOccurrences += 1;
		if (generatedOccurrences > maxOccurrences) {
			throw new PresentationProjectionTooComplexError({
				generatedOccurrences,
				limit: maxOccurrences,
			});
		}
	};

	const addClaimOccurrence = (args: {
		ancestorClaimIds: ReadonlySet<ClaimId>
		claimId: ClaimId
		id: PresentationClaimOccurrenceId
		incomingConfidenceConnectorOccurrenceId?: PresentationConnectorOccurrenceId
		incomingConfidenceConnectorId?: ConfidenceConnectorId
		incomingConnectorOccurrenceId?: PresentationConnectorOccurrenceId
	}): void => {
		if (!debateCore.claims[args.claimId]) {
			throw new Error(`Missing claim while building presentation graph: ${args.claimId}`);
		}

		const terminal = args.ancestorClaimIds.has(args.claimId);
		registerOccurrence();
		graph.claimOccurrences[args.id] = {
			claimId: args.claimId,
			confidenceConnectorOccurrenceIds: [],
			id: args.id,
			incomingConnectorOccurrenceId: args.incomingConnectorOccurrenceId,
			terminal,
		};

		if (terminal) {
			return;
		}

		const nextAncestorClaimIds = new Set(args.ancestorClaimIds);
		nextAncestorClaimIds.add(args.claimId);

		if (args.incomingConfidenceConnectorOccurrenceId && args.incomingConfidenceConnectorId) {
			const confidenceOccurrence = graph.connectorOccurrences[
				args.incomingConfidenceConnectorOccurrenceId
			];
			if (!confidenceOccurrence || confidenceOccurrence.type !== "confidence") {
				throw new Error(
					`Missing incoming confidence occurrence: ${args.incomingConfidenceConnectorOccurrenceId}`,
				);
			}

			for (const connector of incomingRelevanceConnectors[args.incomingConfidenceConnectorId] ?? []) {
				const connectorOccurrenceId = resolveChildConnectorOccurrenceId(
					args.id,
					"relevance",
					connector.id,
				);
				const sourceClaimOccurrenceId = resolveSourceClaimOccurrenceId(
					connectorOccurrenceId,
					connector.source,
				);
				registerOccurrence();
				graph.connectorOccurrences[connectorOccurrenceId] = {
					id: connectorOccurrenceId,
					relevanceConnectorId: connector.id,
					sourceClaimOccurrenceId,
					targetConfidenceConnectorOccurrenceId: args.incomingConfidenceConnectorOccurrenceId,
					targetRelationship: connector.targetRelationship,
					type: "relevance",
				};
				confidenceOccurrence.relevanceConnectorOccurrenceIds.push(connectorOccurrenceId);
				addClaimOccurrence({
					ancestorClaimIds: nextAncestorClaimIds,
					claimId: connector.source,
					id: sourceClaimOccurrenceId,
					incomingConnectorOccurrenceId: connectorOccurrenceId,
				});
			}
		}

		for (const connector of incomingConfidenceConnectors[args.claimId] ?? []) {
			const connectorOccurrenceId = resolveChildConnectorOccurrenceId(
				args.id,
				"confidence",
				connector.id,
			);
			const sourceClaimOccurrenceId = resolveSourceClaimOccurrenceId(
				connectorOccurrenceId,
				connector.source,
			);
			registerOccurrence();
			graph.connectorOccurrences[connectorOccurrenceId] = {
				confidenceConnectorId: connector.id,
				id: connectorOccurrenceId,
				relevanceConnectorOccurrenceIds: [],
				sourceClaimOccurrenceId,
				targetClaimOccurrenceId: args.id,
				targetRelationship: connector.targetRelationship,
				type: "confidence",
			};
			graph.claimOccurrences[args.id].confidenceConnectorOccurrenceIds.push(connectorOccurrenceId);
			addClaimOccurrence({
				ancestorClaimIds: nextAncestorClaimIds,
				claimId: connector.source,
				id: sourceClaimOccurrenceId,
				incomingConfidenceConnectorId: connector.id,
				incomingConfidenceConnectorOccurrenceId: connectorOccurrenceId,
				incomingConnectorOccurrenceId: connectorOccurrenceId,
			});
		}
	};

	addClaimOccurrence({
		ancestorClaimIds: new Set(),
		claimId: debateCore.mainClaimId,
		id: graph.rootClaimOccurrenceId,
	});

	return graph;
}

function indexIncomingConfidenceConnectors(
	debateCore: DebateCore,
): Partial<Record<ClaimId, ConfidenceConnector[]>> {
	const connectorsByTargetClaimId: Partial<Record<ClaimId, ConfidenceConnector[]>> = {};

	for (const connector of Object.values(debateCore.connectors)) {
		if (connector.type !== "confidence") {
			continue;
		}

		connectorsByTargetClaimId[connector.targetClaimId] ??= [];
		connectorsByTargetClaimId[connector.targetClaimId]?.push(connector);
	}

	for (const connectors of Object.values(connectorsByTargetClaimId)) {
		connectors?.sort(compareConnectors);
	}

	return connectorsByTargetClaimId;
}

function indexIncomingRelevanceConnectors(
	debateCore: DebateCore,
): Partial<Record<ConfidenceConnectorId, RelevanceConnector[]>> {
	const connectorsByTargetConnectorId: Partial<
		Record<ConfidenceConnectorId, RelevanceConnector[]>
	> = {};

	for (const connector of Object.values(debateCore.connectors)) {
		if (connector.type !== "relevance") {
			continue;
		}

		const targetConnector = debateCore.connectors[connector.targetConfidenceConnectorId];
		if (!targetConnector || targetConnector.type !== "confidence") {
			throw new Error(
				`Relevance connector targets a missing confidence connector: ${connector.id}`,
			);
		}

		connectorsByTargetConnectorId[connector.targetConfidenceConnectorId] ??= [];
		connectorsByTargetConnectorId[connector.targetConfidenceConnectorId]?.push(connector);
	}

	for (const connectors of Object.values(connectorsByTargetConnectorId)) {
		connectors?.sort(compareConnectors);
	}

	return connectorsByTargetConnectorId;
}

function compareConnectors(left: Connector, right: Connector): number {
	const relationshipDifference = relationshipRank(left.targetRelationship)
		- relationshipRank(right.targetRelationship);
	return relationshipDifference || left.id.localeCompare(right.id);
}

function relationshipRank(relationship: Connector["targetRelationship"]): number {
	return relationship === "proTarget" ? 0 : 1;
}

function resolveRootClaimOccurrenceId(claimId: ClaimId): PresentationClaimOccurrenceId {
	return `claim:${claimId}` as PresentationClaimOccurrenceId;
}

function resolveChildConnectorOccurrenceId(
	parentClaimOccurrenceId: PresentationClaimOccurrenceId,
	type: "confidence" | "relevance",
	connectorId: ConnectorId,
): PresentationConnectorOccurrenceId {
	return `${parentClaimOccurrenceId}/${type}:${connectorId}` as PresentationConnectorOccurrenceId;
}

function resolveSourceClaimOccurrenceId(
	connectorOccurrenceId: PresentationConnectorOccurrenceId,
	claimId: ClaimId,
): PresentationClaimOccurrenceId {
	return `${connectorOccurrenceId}/claim:${claimId}` as PresentationClaimOccurrenceId;
}

function resolvePositiveInteger(value: number | undefined, fallback: number): number {
	return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}