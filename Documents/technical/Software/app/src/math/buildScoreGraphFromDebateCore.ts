import type { ClaimId } from "../debate-core/Claim.ts";
import type {
	ConnectorId,
	ConfidenceConnectorId,
	RelevanceConnectorId,
} from "../debate-core/Connector.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type { ScoreGraph, ScoreNode, ScoreNodeId } from "./scoreTypes.ts";

export interface BuiltScoreGraphFromDebateCore {
	graph: ScoreGraph
	rootScoreNodeId: ScoreNodeId
	scoreNodeIdByConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, ScoreNodeId>>
	scoreNodeIdsByConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, ScoreNodeId[]>>
	scoreNodeIdByRelevanceConnectorId: Partial<Record<RelevanceConnectorId, ScoreNodeId>>
	scoreNodeIdsByRelevanceConnectorId: Partial<Record<RelevanceConnectorId, ScoreNodeId[]>>
}

export interface BuildScoreGraphFromDebateCoreOptions {
	excludedConnectorIds?: ReadonlySet<ConnectorId>
	rootClaimId?: ClaimId
}

/**
 * Normalizes DebateCore into the acyclic occurrence graph consumed by math.
 *
 * The public app boundary can stay DebateCore-shaped even when math needs one
 * occurrence per scored path through that graph.
 */
export function buildScoreGraphFromDebateCore(
	debateCore: DebateCore,
	options: BuildScoreGraphFromDebateCoreOptions = {},
): BuiltScoreGraphFromDebateCore {
	const rootClaimId = options.rootClaimId ?? debateCore.mainClaimId;
	const mainClaim = debateCore.claims[rootClaimId];

	if (!mainClaim) {
		throw new Error(`Missing root claim while building score graph: ${rootClaimId}`);
	}

	const incomingConfidenceConnectorIdsByTargetClaimId = indexIncomingConfidenceConnectorIdsByTargetClaimId(debateCore);
	const incomingRelevanceConnectorIdsByTargetConfidenceConnectorId = indexIncomingRelevanceConnectorIdsByTargetConfidenceConnectorId(debateCore);
	const nodes: Record<ScoreNodeId, ScoreNode> = {};
	const scoreNodeIdByConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, ScoreNodeId>> = {};
	const scoreNodeIdsByConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, ScoreNodeId[]>> = {};
	const scoreNodeIdByRelevanceConnectorId: Partial<Record<RelevanceConnectorId, ScoreNodeId>> = {};
	const scoreNodeIdsByRelevanceConnectorId: Partial<Record<RelevanceConnectorId, ScoreNodeId[]>> = {};
	const rootScoreNodeId = resolveRootScoreNodeId(rootClaimId);

	addClaimOccurrence({
		ancestorClaimIds: new Set<ClaimId>(),
		claimId: rootClaimId,
		debateCore,
		excludedConnectorIds: options.excludedConnectorIds ?? new Set<ConnectorId>(),
		incomingConfidenceConnectorIdsByTargetClaimId,
		incomingRelevanceConnectorIdsByTargetConfidenceConnectorId,
		nodes,
		scoreNodeId: rootScoreNodeId,
		scoreNodeIdByConfidenceConnectorId,
		scoreNodeIdsByConfidenceConnectorId,
		scoreNodeIdByRelevanceConnectorId,
		scoreNodeIdsByRelevanceConnectorId,
	});

	return {
		graph: { nodes },
		rootScoreNodeId,
		scoreNodeIdByConfidenceConnectorId,
		scoreNodeIdsByConfidenceConnectorId,
		scoreNodeIdByRelevanceConnectorId,
		scoreNodeIdsByRelevanceConnectorId,
	};
}

function addClaimOccurrence(args: {
	ancestorClaimIds: ReadonlySet<ClaimId>;
	claimId: ClaimId;
	debateCore: DebateCore;
	excludedConnectorIds: ReadonlySet<ConnectorId>;
	incomingConfidenceConnectorIdsByTargetClaimId: Partial<Record<ClaimId, ConfidenceConnectorId[]>>;
	incomingRelevanceConnectorIdsByTargetConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, RelevanceConnectorId[]>>;
	nodes: Record<ScoreNodeId, ScoreNode>;
	parentId?: ScoreNodeId;
	proParent?: boolean;
	affects?: ScoreNode["affects"];
	scoreNodeId: ScoreNodeId;
	confidenceConnectorId?: ConfidenceConnectorId;
	scoreNodeIdByConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, ScoreNodeId>>;
	scoreNodeIdsByConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, ScoreNodeId[]>>;
	scoreNodeIdByRelevanceConnectorId: Partial<Record<RelevanceConnectorId, ScoreNodeId>>;
	scoreNodeIdsByRelevanceConnectorId: Partial<Record<RelevanceConnectorId, ScoreNodeId[]>>;
}): void {
	if (args.ancestorClaimIds.has(args.claimId)) {
		throw new Error(`Cycle found while building score graph for claim: ${args.claimId}`);
	}

	const claim = args.debateCore.claims[args.claimId];

	if (!claim) {
		throw new Error(`Missing claim while building score graph: ${args.claimId}`);
	}

	args.nodes[args.scoreNodeId] = {
		affects: args.affects ?? "Score",
		claimId: args.claimId,
		id: args.scoreNodeId,
		parentId: args.parentId,
		proParent: args.proParent,
	};

	if (args.confidenceConnectorId) {
		args.scoreNodeIdByConfidenceConnectorId[args.confidenceConnectorId] ??= args.scoreNodeId;
		args.scoreNodeIdsByConfidenceConnectorId[args.confidenceConnectorId] ??= [];
		args.scoreNodeIdsByConfidenceConnectorId[args.confidenceConnectorId]?.push(args.scoreNodeId);
	}

	const nextAncestorClaimIds = new Set(args.ancestorClaimIds);
	nextAncestorClaimIds.add(args.claimId);

	for (const relevanceConnectorId of args.confidenceConnectorId
		? getSortedIds(args.incomingRelevanceConnectorIdsByTargetConfidenceConnectorId[args.confidenceConnectorId])
		: []) {
		if (args.excludedConnectorIds.has(relevanceConnectorId)) {
			continue;
		}

		const relevanceConnector = args.debateCore.connectors[relevanceConnectorId];

		if (!relevanceConnector || relevanceConnector.type !== "relevance") {
			throw new Error(`Missing relevance connector while building score graph: ${relevanceConnectorId}`);
		}

		const relevanceScoreNodeId = resolveChildScoreNodeId(args.scoreNodeId, "relevance", relevanceConnector.id);
		args.scoreNodeIdByRelevanceConnectorId[relevanceConnector.id] ??= relevanceScoreNodeId;
		args.scoreNodeIdsByRelevanceConnectorId[relevanceConnector.id] ??= [];
		args.scoreNodeIdsByRelevanceConnectorId[relevanceConnector.id]?.push(relevanceScoreNodeId);

		addClaimOccurrence({
			...args,
			ancestorClaimIds: nextAncestorClaimIds,
			affects: "Relevance",
			claimId: relevanceConnector.source,
			confidenceConnectorId: undefined,
			parentId: args.scoreNodeId,
			proParent: relevanceConnector.targetRelationship === "proTarget",
			scoreNodeId: relevanceScoreNodeId,
		});
	}

	for (const confidenceConnectorId of getSortedIds(args.incomingConfidenceConnectorIdsByTargetClaimId[args.claimId])) {
		if (args.excludedConnectorIds.has(confidenceConnectorId)) {
			continue;
		}

		const confidenceConnector = args.debateCore.connectors[confidenceConnectorId];

		if (!confidenceConnector || confidenceConnector.type !== "confidence") {
			throw new Error(`Missing confidence connector while building score graph: ${confidenceConnectorId}`);
		}

		addClaimOccurrence({
			...args,
			ancestorClaimIds: nextAncestorClaimIds,
			affects: "Score",
			claimId: confidenceConnector.source,
			confidenceConnectorId: confidenceConnector.id,
			parentId: args.scoreNodeId,
			proParent: confidenceConnector.targetRelationship === "proTarget",
			scoreNodeId: resolveChildScoreNodeId(args.scoreNodeId, "confidence", confidenceConnector.id),
		});
	}
}

function indexIncomingConfidenceConnectorIdsByTargetClaimId(
	debateCore: DebateCore,
): Partial<Record<ClaimId, ConfidenceConnectorId[]>> {
	const incomingConfidenceConnectorIdsByTargetClaimId: Partial<Record<ClaimId, ConfidenceConnectorId[]>> = {};

	for (const connector of Object.values(debateCore.connectors)) {
		if (connector.type !== "confidence") {
			continue;
		}

		incomingConfidenceConnectorIdsByTargetClaimId[connector.targetClaimId] ??= [];
		incomingConfidenceConnectorIdsByTargetClaimId[connector.targetClaimId]?.push(connector.id);
	}

	return incomingConfidenceConnectorIdsByTargetClaimId;
}

function indexIncomingRelevanceConnectorIdsByTargetConfidenceConnectorId(
	debateCore: DebateCore,
): Partial<Record<ConfidenceConnectorId, RelevanceConnectorId[]>> {
	const incomingRelevanceConnectorIdsByTargetConfidenceConnectorId: Partial<Record<ConfidenceConnectorId, RelevanceConnectorId[]>> = {};

	for (const connector of Object.values(debateCore.connectors)) {
		if (connector.type !== "relevance") {
			continue;
		}

		incomingRelevanceConnectorIdsByTargetConfidenceConnectorId[connector.targetConfidenceConnectorId] ??= [];
		incomingRelevanceConnectorIdsByTargetConfidenceConnectorId[connector.targetConfidenceConnectorId]?.push(connector.id);
	}

	return incomingRelevanceConnectorIdsByTargetConfidenceConnectorId;
}

function getSortedIds<TId extends string>(ids: readonly TId[] | undefined): TId[] {
	return [...(ids ?? [])].sort((left, right) => left.localeCompare(right));
}

function resolveRootScoreNodeId(claimId: ClaimId): ScoreNodeId {
	return `score-root:${claimId}` as ScoreNodeId;
}

function resolveChildScoreNodeId(
	parentScoreNodeId: ScoreNodeId,
	connectorType: "confidence" | "relevance",
	connectorId: ConnectorId,
): ScoreNodeId {
	return `${parentScoreNodeId}/${connectorType}:${connectorId}` as ScoreNodeId;
}