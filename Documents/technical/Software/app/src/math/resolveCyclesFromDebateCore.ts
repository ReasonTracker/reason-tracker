import type { ClaimId } from "../debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConnectorId,
	RelevanceConnector,
} from "../debate-core/Connector.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import {
	buildScoreGraphFromDebateCore,
	type BuiltScoreGraphFromDebateCore,
} from "./buildScoreGraphFromDebateCore.ts";
import {
	calculateScoresWithSteps,
	type ScoreCalculationStep,
} from "./calculateScores.ts";
import { NEUTRAL_RELEVANCE } from "./scoringAxioms.ts";
import type { Score } from "./scoreTypes.ts";

// AGENT NOTE: Keep cycle-resolution safety limits grouped here.
/** Maximum number of connector subsets considered during exact break-set enumeration. */
const DEFAULT_MAX_CANDIDATE_STATES = 65_536;
/** Maximum number of inclusion-minimal acyclic variants retained for averaging. */
const DEFAULT_MAX_VARIANTS = 4_096;
/** Maximum total occurrence nodes built across all roots and variants in one resolution. */
const DEFAULT_MAX_OCCURRENCE_NODES = 250_000;

export interface CycleResolutionOptions {
	maxCandidateStates?: number
	maxOccurrenceNodes?: number
	maxVariants?: number
}

export type CycleComponent = {
	claimIds: ClaimId[]
	connectorIds: ConnectorId[]
}

type DependencyNodeId = string & { readonly __brand: "DependencyNodeId" };

type DependencyNode =
	| { id: DependencyNodeId; kind: "claim"; claimId: ClaimId }
	| { id: DependencyNodeId; kind: "connector"; connectorId: ConnectorId };

type DependencyGraph = {
	edgesBySource: Map<DependencyNodeId, DependencyNodeId[]>
	nodes: Map<DependencyNodeId, DependencyNode>
}

export type AggregatedClaimScore = Omit<Score, "scoreNodeId">;

export type ConnectorScoreContribution = {
	deliveryScore: number
	relevanceMultiplier: number
	sourceScore: number
}

export type CycleBreakVariant = {
	breakConnectorIds: ConnectorId[]
	claimScores: Partial<Record<ClaimId, AggregatedClaimScore>>
	connectorScores: Partial<Record<ConnectorId, ConnectorScoreContribution>>
	graph: BuiltScoreGraphFromDebateCore
	id: string
	scoreCalculationSteps: ScoreCalculationStep[]
}

export type CycleResolvedScoreResult = {
	claimScores: Partial<Record<ClaimId, AggregatedClaimScore>>
	connectorScores: Partial<Record<ConnectorId, ConnectorScoreContribution>>
	cycleComponents: CycleComponent[]
	reachableClaimIds: ClaimId[]
	reachableConnectorIds: ConnectorId[]
	variants: CycleBreakVariant[]
}

export class CycleResolutionTooComplexError extends Error {
	readonly code = "cycle-resolution-too-complex";
	readonly details: {
		candidateConnectorCount: number
		estimatedCandidateStates: number
		limit: number
		limitKind: "candidateStates" | "occurrenceNodes" | "variants"
	};

	constructor(details: {
		candidateConnectorCount: number
		estimatedCandidateStates: number
		limit: number
		limitKind: "candidateStates" | "occurrenceNodes" | "variants"
	}) {
		super(
			`Cycle resolution exceeded the ${details.limitKind} limit of ${details.limit}.`,
		);
		this.name = "CycleResolutionTooComplexError";
		this.details = details;
	}
}

export function resolveCyclesFromDebateCore(
	debateCore: DebateCore,
	options: CycleResolutionOptions = {},
): CycleResolvedScoreResult {
	const limits = resolveCycleResolutionLimits(options);
	const dependencyGraph = buildDependencyGraph(debateCore);
	const reachableDependencyNodeIds = resolveReachableDependencyNodeIds(
		resolveClaimDependencyNodeId(debateCore.mainClaimId),
		dependencyGraph,
	);
	const reachableDependencyGraph = filterDependencyGraph(
		dependencyGraph,
		reachableDependencyNodeIds,
	);
	const reachableClaimIds = [...reachableDependencyGraph.nodes.values()]
		.filter((node): node is Extract<DependencyNode, { kind: "claim" }> => node.kind === "claim")
		.map((node) => node.claimId)
		.sort(compareIds);
	const reachableConnectorIds = [...reachableDependencyGraph.nodes.values()]
		.filter((node): node is Extract<DependencyNode, { kind: "connector" }> => node.kind === "connector")
		.map((node) => node.connectorId)
		.sort(compareIds);
	const cycleComponents = resolveCycleComponents(reachableDependencyGraph);
	const candidateConnectorIds = resolveCycleCandidateConnectorIds(cycleComponents);
	const breakSets = enumerateMinimalBreakSets({
		candidateConnectorIds,
		dependencyGraph: reachableDependencyGraph,
		limits,
	});
	let occurrenceNodeCount = 0;
	const variants = breakSets.map((breakConnectorIds, variantIndex) => {
		const excludedConnectorIds = new Set(breakConnectorIds);
		const graph = buildScoreGraphFromDebateCore(debateCore, { excludedConnectorIds });
		const mainScoreRun = calculateScoresWithSteps(graph.graph);
		const claimScores: Partial<Record<ClaimId, AggregatedClaimScore>> = {};

		for (const claimId of reachableClaimIds) {
			const claimGraph = claimId === debateCore.mainClaimId
				? graph
				: buildScoreGraphFromDebateCore(debateCore, {
					excludedConnectorIds,
					rootClaimId: claimId,
				});

			occurrenceNodeCount += Object.keys(claimGraph.graph.nodes).length;
			if (occurrenceNodeCount > limits.maxOccurrenceNodes) {
				throw new CycleResolutionTooComplexError({
					candidateConnectorCount: candidateConnectorIds.length,
					estimatedCandidateStates: breakSets.length,
					limit: limits.maxOccurrenceNodes,
					limitKind: "occurrenceNodes",
				});
			}

			const scores = claimId === debateCore.mainClaimId
				? mainScoreRun.scores
				: calculateScoresWithSteps(claimGraph.graph).scores;
			const rootScore = scores[claimGraph.rootScoreNodeId];

			if (!rootScore) {
				throw new Error(`Missing root score for cycle variant claim: ${claimId}`);
			}

			claimScores[claimId] = toAggregatedClaimScore(rootScore);
		}

		return {
			breakConnectorIds,
			claimScores,
			connectorScores: calculateVariantConnectorScores({
				claimScores,
				debateCore,
				excludedConnectorIds,
				reachableConnectorIds,
			}),
			graph,
			id: `cycle-variant:${variantIndex}:${breakConnectorIds.join("|") || "acyclic"}`,
			scoreCalculationSteps: mainScoreRun.steps,
		};
	});

	return {
		claimScores: averageClaimScores(reachableClaimIds, variants),
		connectorScores: averageConnectorScores(reachableConnectorIds, variants),
		cycleComponents,
		reachableClaimIds,
		reachableConnectorIds,
		variants,
	};
}

function buildDependencyGraph(debateCore: DebateCore): DependencyGraph {
	const graph: DependencyGraph = {
		edgesBySource: new Map(),
		nodes: new Map(),
	};

	for (const claimId of Object.keys(debateCore.claims) as ClaimId[]) {
		addDependencyNode(graph, {
			id: resolveClaimDependencyNodeId(claimId),
			kind: "claim",
			claimId,
		});
	}

	for (const connector of Object.values(debateCore.connectors)) {
		assertClaimExists(debateCore, connector.source);
		if (connector.type === "confidence") {
			assertClaimExists(debateCore, connector.targetClaimId);
		}

		addDependencyNode(graph, {
			id: resolveConnectorDependencyNodeId(connector.id),
			kind: "connector",
			connectorId: connector.id,
		});
	}

	for (const connector of Object.values(debateCore.connectors)) {
		const connectorNodeId = resolveConnectorDependencyNodeId(connector.id);
		if (connector.type === "confidence") {
			addDependencyEdge(graph, resolveClaimDependencyNodeId(connector.targetClaimId), connectorNodeId);
			addDependencyEdge(graph, connectorNodeId, resolveClaimDependencyNodeId(connector.source));
			continue;
		}

		const targetConfidenceConnector = debateCore.connectors[connector.targetConfidenceConnectorId];
		if (!targetConfidenceConnector || targetConfidenceConnector.type !== "confidence") {
			throw new Error(
				`Relevance connector targets a missing confidence connector: ${connector.id}`,
			);
		}

		addDependencyEdge(
			graph,
			resolveConnectorDependencyNodeId(targetConfidenceConnector.id),
			connectorNodeId,
		);
		addDependencyEdge(graph, connectorNodeId, resolveClaimDependencyNodeId(connector.source));
	}

	for (const targets of graph.edgesBySource.values()) {
		targets.sort(compareIds);
	}

	return graph;
}

function resolveReachableDependencyNodeIds(
	rootNodeId: DependencyNodeId,
	graph: DependencyGraph,
): Set<DependencyNodeId> {
	const reachable = new Set<DependencyNodeId>();
	const pending = [rootNodeId];

	while (pending.length > 0) {
		const nodeId = pending.pop();
		if (!nodeId || reachable.has(nodeId)) {
			continue;
		}

		reachable.add(nodeId);
		for (const targetNodeId of graph.edgesBySource.get(nodeId) ?? []) {
			pending.push(targetNodeId);
		}
	}

	return reachable;
}

function resolveCycleComponents(graph: DependencyGraph): CycleComponent[] {
	const indexByNodeId = new Map<DependencyNodeId, number>();
	const lowLinkByNodeId = new Map<DependencyNodeId, number>();
	const stack: DependencyNodeId[] = [];
	const onStack = new Set<DependencyNodeId>();
	const components: DependencyNodeId[][] = [];
	let nextIndex = 0;

	const visit = (nodeId: DependencyNodeId): void => {
		indexByNodeId.set(nodeId, nextIndex);
		lowLinkByNodeId.set(nodeId, nextIndex);
		nextIndex += 1;
		stack.push(nodeId);
		onStack.add(nodeId);

		for (const targetNodeId of graph.edgesBySource.get(nodeId) ?? []) {
			if (!indexByNodeId.has(targetNodeId)) {
				visit(targetNodeId);
				lowLinkByNodeId.set(
					nodeId,
					Math.min(
						lowLinkByNodeId.get(nodeId) ?? Number.POSITIVE_INFINITY,
						lowLinkByNodeId.get(targetNodeId) ?? Number.POSITIVE_INFINITY,
					),
				);
			} else if (onStack.has(targetNodeId)) {
				lowLinkByNodeId.set(
					nodeId,
					Math.min(
						lowLinkByNodeId.get(nodeId) ?? Number.POSITIVE_INFINITY,
						indexByNodeId.get(targetNodeId) ?? Number.POSITIVE_INFINITY,
					),
				);
			}
		}

		if (lowLinkByNodeId.get(nodeId) !== indexByNodeId.get(nodeId)) {
			return;
		}

		const component: DependencyNodeId[] = [];
		while (stack.length > 0) {
			const member = stack.pop();
			if (!member) {
				break;
			}

			onStack.delete(member);
			component.push(member);
			if (member === nodeId) {
				break;
			}
		}
		components.push(component);
	};

	for (const nodeId of [...graph.nodes.keys()].sort(compareIds)) {
		if (!indexByNodeId.has(nodeId)) {
			visit(nodeId);
		}
	}

	return components
		.filter((nodeIds) => nodeIds.length > 1)
		.map((nodeIds) => {
			const nodes = nodeIds.map((nodeId) => graph.nodes.get(nodeId));
			return {
				claimIds: nodes
					.filter((node): node is Extract<DependencyNode, { kind: "claim" }> => node?.kind === "claim")
					.map((node) => node.claimId)
					.sort(compareIds),
				connectorIds: nodes
					.filter((node): node is Extract<DependencyNode, { kind: "connector" }> => node?.kind === "connector")
					.map((node) => node.connectorId)
					.sort(compareIds),
			};
		})
		.sort((left, right) => compareIds(left.claimIds[0], right.claimIds[0]));
}

function resolveCycleCandidateConnectorIds(components: CycleComponent[]): ConnectorId[] {
	return [...new Set(components.flatMap((component) => component.connectorIds))].sort(compareIds);
}

function enumerateMinimalBreakSets(args: {
	candidateConnectorIds: ConnectorId[]
	dependencyGraph: DependencyGraph
	limits: Required<CycleResolutionOptions>
}): ConnectorId[][] {
	if (args.candidateConnectorIds.length === 0) {
		return [[]];
	}

	const estimatedCandidateStates = 2 ** args.candidateConnectorIds.length;
	if (!Number.isSafeInteger(estimatedCandidateStates)
		|| estimatedCandidateStates > args.limits.maxCandidateStates) {
		throw new CycleResolutionTooComplexError({
			candidateConnectorCount: args.candidateConnectorIds.length,
			estimatedCandidateStates,
			limit: args.limits.maxCandidateStates,
			limitKind: "candidateStates",
		});
	}

	const accepted: ConnectorId[][] = [];
	for (let size = 1; size <= args.candidateConnectorIds.length; size += 1) {
		for (const candidate of combinationsOfSize(args.candidateConnectorIds, size)) {
			const candidateSet = new Set(candidate);
			if (accepted.some((breakSet) => breakSet.every((connectorId) => candidateSet.has(connectorId)))) {
				continue;
			}

			if (hasDirectedCycle(removeConnectorNodes(args.dependencyGraph, candidateSet))) {
				continue;
			}

			accepted.push(candidate);
			if (accepted.length > args.limits.maxVariants) {
				throw new CycleResolutionTooComplexError({
					candidateConnectorCount: args.candidateConnectorIds.length,
					estimatedCandidateStates,
					limit: args.limits.maxVariants,
					limitKind: "variants",
				});
			}
		}
	}

	if (accepted.length === 0) {
		throw new Error("Cycle resolution could not produce an acyclic break variant.");
	}

	return accepted;
}

function hasDirectedCycle(graph: DependencyGraph): boolean {
	const visiting = new Set<DependencyNodeId>();
	const visited = new Set<DependencyNodeId>();

	const visit = (nodeId: DependencyNodeId): boolean => {
		if (visiting.has(nodeId)) {
			return true;
		}
		if (visited.has(nodeId)) {
			return false;
		}

		visiting.add(nodeId);
		for (const targetNodeId of graph.edgesBySource.get(nodeId) ?? []) {
			if (visit(targetNodeId)) {
				return true;
			}
		}
		visiting.delete(nodeId);
		visited.add(nodeId);
		return false;
	};

	return [...graph.nodes.keys()].some((nodeId) => visit(nodeId));
}

function combinationsOfSize<T>(values: T[], size: number): T[][] {
	const combinations: T[][] = [];
	const current: T[] = [];

	const append = (startIndex: number): void => {
		if (current.length === size) {
			combinations.push([...current]);
			return;
		}

		for (let index = startIndex; index <= values.length - (size - current.length); index += 1) {
			current.push(values[index]);
			append(index + 1);
			current.pop();
		}
	};

	append(0);
	return combinations;
}

function calculateVariantConnectorScores(args: {
	claimScores: Partial<Record<ClaimId, AggregatedClaimScore>>
	debateCore: DebateCore
	excludedConnectorIds: ReadonlySet<ConnectorId>
	reachableConnectorIds: ConnectorId[]
}): Partial<Record<ConnectorId, ConnectorScoreContribution>> {
	const connectorScores: Partial<Record<ConnectorId, ConnectorScoreContribution>> = {};

	for (const connectorId of args.reachableConnectorIds) {
		const connector = args.debateCore.connectors[connectorId];
		if (!connector) {
			continue;
		}

		const sourceScore = args.claimScores[connector.source]?.value ?? 1;
		if (args.excludedConnectorIds.has(connector.id)) {
			connectorScores[connector.id] = {
				deliveryScore: 0,
				relevanceMultiplier: 0,
				sourceScore,
			};
			continue;
		}

		const relevanceMultiplier = connector.type === "confidence"
			? calculateConfidenceConnectorRelevance({
				claimScores: args.claimScores,
				confidenceConnector: connector,
				debateCore: args.debateCore,
				excludedConnectorIds: args.excludedConnectorIds,
			})
			: NEUTRAL_RELEVANCE;

		connectorScores[connector.id] = {
			deliveryScore: sourceScore * relevanceMultiplier,
			relevanceMultiplier,
			sourceScore,
		};
	}

	return connectorScores;
}

function calculateConfidenceConnectorRelevance(args: {
	claimScores: Partial<Record<ClaimId, AggregatedClaimScore>>
	confidenceConnector: ConfidenceConnector
	debateCore: DebateCore
	excludedConnectorIds: ReadonlySet<ConnectorId>
}): number {
	let relevance = NEUTRAL_RELEVANCE;
	const relevanceConnectors = Object.values(args.debateCore.connectors)
		.filter((connector): connector is RelevanceConnector =>
			connector.type === "relevance"
			&& connector.targetConfidenceConnectorId === args.confidenceConnector.id,
		)
		.sort((left, right) => compareIds(left.id, right.id));

	for (const connector of relevanceConnectors) {
		if (args.excludedConnectorIds.has(connector.id)) {
			continue;
		}

		const score = args.claimScores[connector.source]?.value ?? 1;
		if (connector.targetRelationship === "proTarget") {
			relevance *= 1 + score;
		} else {
			relevance *= 1 / (1 + Math.abs(score));
		}
	}

	return relevance;
}

function averageClaimScores(
	claimIds: ClaimId[],
	variants: CycleBreakVariant[],
): Partial<Record<ClaimId, AggregatedClaimScore>> {
	const scores: Partial<Record<ClaimId, AggregatedClaimScore>> = {};

	for (const claimId of claimIds) {
		const contributions = variants.map((variant) => variant.claimScores[claimId]);
		if (contributions.some((score) => !score)) {
			throw new Error(`Missing claim contribution while averaging cycle variants: ${claimId}`);
		}

		scores[claimId] = {
			claimId,
			rawValue: average(contributions.map((score) => score?.rawValue ?? 0)),
			totalWeight: average(contributions.map((score) => score?.totalWeight ?? 0)),
			value: average(contributions.map((score) => score?.value ?? 0)),
			weightedSum: average(contributions.map((score) => score?.weightedSum ?? 0)),
		};
	}

	return scores;
}

function averageConnectorScores(
	connectorIds: ConnectorId[],
	variants: CycleBreakVariant[],
): Partial<Record<ConnectorId, ConnectorScoreContribution>> {
	const scores: Partial<Record<ConnectorId, ConnectorScoreContribution>> = {};

	for (const connectorId of connectorIds) {
		const contributions = variants.map((variant) => variant.connectorScores[connectorId]);
		if (contributions.some((score) => !score)) {
			throw new Error(`Missing connector contribution while averaging cycle variants: ${connectorId}`);
		}

		scores[connectorId] = {
			deliveryScore: average(contributions.map((score) => score?.deliveryScore ?? 0)),
			relevanceMultiplier: average(contributions.map((score) => score?.relevanceMultiplier ?? 0)),
			sourceScore: average(contributions.map((score) => score?.sourceScore ?? 0)),
		};
	}

	return scores;
}

function toAggregatedClaimScore(score: Score): AggregatedClaimScore {
	return {
		claimId: score.claimId,
		rawValue: score.rawValue,
		totalWeight: score.totalWeight,
		value: score.value,
		weightedSum: score.weightedSum,
	};
}

function addDependencyNode(graph: DependencyGraph, node: DependencyNode): void {
	graph.nodes.set(node.id, node);
	graph.edgesBySource.set(node.id, graph.edgesBySource.get(node.id) ?? []);
}

function addDependencyEdge(
	graph: DependencyGraph,
	fromNodeId: DependencyNodeId,
	toNodeId: DependencyNodeId,
): void {
	const targets = graph.edgesBySource.get(fromNodeId);
	if (!targets || !graph.nodes.has(toNodeId)) {
		throw new Error(`Cannot add dependency edge with a missing node: ${fromNodeId} -> ${toNodeId}`);
	}

	targets.push(toNodeId);
}

function filterDependencyGraph(
	graph: DependencyGraph,
	includedNodeIds: ReadonlySet<DependencyNodeId>,
): DependencyGraph {
	const filtered: DependencyGraph = {
		edgesBySource: new Map(),
		nodes: new Map(),
	};

	for (const nodeId of includedNodeIds) {
		const node = graph.nodes.get(nodeId);
		if (!node) {
			continue;
		}

		filtered.nodes.set(nodeId, node);
		filtered.edgesBySource.set(
			nodeId,
			(graph.edgesBySource.get(nodeId) ?? []).filter((targetNodeId) => includedNodeIds.has(targetNodeId)),
		);
	}

	return filtered;
}

function removeConnectorNodes(
	graph: DependencyGraph,
	excludedConnectorIds: ReadonlySet<ConnectorId>,
): DependencyGraph {
	const includedNodeIds = new Set(
		[...graph.nodes.values()]
			.filter((node) => node.kind === "claim" || !excludedConnectorIds.has(node.connectorId))
			.map((node) => node.id),
	);

	return filterDependencyGraph(graph, includedNodeIds);
}

function resolveClaimDependencyNodeId(claimId: ClaimId): DependencyNodeId {
	return `claim:${claimId}` as DependencyNodeId;
}

function resolveConnectorDependencyNodeId(connectorId: ConnectorId): DependencyNodeId {
	return `connector:${connectorId}` as DependencyNodeId;
}

function resolveCycleResolutionLimits(
	options: CycleResolutionOptions,
): Required<CycleResolutionOptions> {
	return {
		maxCandidateStates: resolvePositiveInteger(
			options.maxCandidateStates,
			DEFAULT_MAX_CANDIDATE_STATES,
		),
		maxOccurrenceNodes: resolvePositiveInteger(
			options.maxOccurrenceNodes,
			DEFAULT_MAX_OCCURRENCE_NODES,
		),
		maxVariants: resolvePositiveInteger(options.maxVariants, DEFAULT_MAX_VARIANTS),
	};
}

function resolvePositiveInteger(value: number | undefined, fallback: number): number {
	return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function assertClaimExists(debateCore: DebateCore, claimId: ClaimId): void {
	if (!debateCore.claims[claimId]) {
		throw new Error(`Connector references a missing claim: ${claimId}`);
	}
}

function average(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compareIds(left: string, right: string): number {
	return left.localeCompare(right);
}