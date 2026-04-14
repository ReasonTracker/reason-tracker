// See 📌README.md in this folder for local coding standards before editing this file.

import ELK from "elkjs/lib/elk.bundled.js";
import type { Debate } from "../../contracts/src/Debate.ts";
import type { ConnectorId } from "../../contracts/src/Connector.ts";
import type { Score, ScoreId } from "../../contracts/src/Score.ts";
import { getScoresForClaimId } from "./graph.ts";

// AGENT NOTE: keep tunable layout constants grouped here.
const DEFAULT_SCORE_WIDTH = 320;
const DEFAULT_SCORE_HEIGHT = 180;
const DEFAULT_NODE_SPACING = 48;
const DEFAULT_LAYER_SPACING = 96;
const DEFAULT_CONNECTOR_NODE_GAP = 32;
const MIN_CONNECTOR_STROKE_WIDTH = 2;
const ELK_EDGE_THICKNESS_MULTIPLIER = 10;

export interface CalculateLayoutRequest {
	/**
	 * The canonical incoming order is Score.incomingScoreIds.
	 *
	 * Layout must honor that order when placing target-side connector stacking.
	 * This API intentionally does not accept or return a second incoming-order
	 * field, because layout is not allowed to create a competing source of truth.
	 */
	debate: Debate
	options?: LayoutOptions
}

export interface LayoutOptions {
	/** Maps to ELK node spacing. */
	nodeSpacing?: number
	/** Maps to ELK spacing between layers. */
	layerSpacing?: number
	/** Maps to ELK edge-node spacing. */
	connectorNodeGap?: number
	/** Enables per-score ELK spacing overrides based on the scaled score size. */
	scaleConnectionDistanceWithScore?: boolean
}

/**
	 * Derived layout data for one debate layout pass.
	 *
	 * Canonical domain data stays on Debate, Score, Claim, and Connector. This
	 * object only holds the geometry and ordering produced by the layout engine.
	 *
	 * The root score is derived from debate.mainClaimId. The implementation
	 * should error if the main claim resolves to anything other than one score.
 */
export interface DebateLayout {
	bounds: LayoutBounds
	scoreLayouts: Record<ScoreId, ScoreLayout>
	connectorRoutes: Record<ConnectorId, ConnectorRoute>
}

export interface LayoutBounds {
	width: number
	height: number
}

export interface ScoreLayout {
	scoreId: ScoreId
	x: number
	y: number
	width: number
	height: number
	isRoot: boolean
	isLeaf: boolean
}

export interface ConnectorRoute {
	connectorId: ConnectorId
	path: LayoutPoint[]
	strokeWidth: number
}

export interface LayoutPoint {
	x: number
	y: number
}

export type CalculateLayout = (
	request: CalculateLayoutRequest,
) => DebateLayout | Promise<DebateLayout>;

type ElkConstructor = new () => ElkLayoutApi;

type LayoutElkNode = ElkNode & {
	children?: LayoutElkNode[]
	edges?: LayoutElkEdge[]
};

type ElkLayoutApi = {
	layout: (graph: LayoutElkNode) => Promise<LayoutElkNode>
};

type ElkNode = {
	id: string
	x?: number
	y?: number
	width?: number
	height?: number
	children?: ElkNode[]
	edges?: LayoutElkEdge[]
	layoutOptions?: Record<string, string>
};

type LayoutElkEdge = {
	id?: string
	sources: string[]
	targets: string[]
	sections?: LayoutElkEdgeSection[]
	layoutOptions?: Record<string, string>
};

type LayoutElkEdgeSection = {
	startPoint: LayoutElkPoint
	endPoint: LayoutElkPoint
	bendPoints?: LayoutElkPoint[]
};

type LayoutElkPoint = {
	x: number
	y: number
};

export async function calculateLayout(request: CalculateLayoutRequest): Promise<DebateLayout> {
	const rootScore = getRootScore(request.debate);
	const scoreIdsInLayoutOrder = collectScoreIdsInLayoutOrder(request.debate, rootScore.id);
	const elkGraph = buildElkGraph(request.debate, rootScore.id, scoreIdsInLayoutOrder, request.options);
	const elk = new (ELK as unknown as ElkConstructor)();
	const laidOutGraph = await elk.layout(elkGraph);

	return buildDebateLayout({
		debate: request.debate,
		rootScore,
		scoreIdsInLayoutOrder,
		laidOutGraph,
	});
}

function getRootScore(debate: Debate): Score {
	const rootScores = getScoresForClaimId(debate, debate.mainClaimId);
	if (rootScores.length !== 1) {
		throw new Error(
			`Expected exactly one root score for main claim ${debate.mainClaimId}, found ${rootScores.length}.`,
		);
	}

	return rootScores[0];
}

function collectScoreIdsInLayoutOrder(debate: Debate, rootScoreId: ScoreId): ScoreId[] {
	const visited = new Set<ScoreId>();
	const ordered: ScoreId[] = [];

	visitScore(rootScoreId);

	for (const scoreId of Object.keys(debate.scores) as ScoreId[]) {
		visitScore(scoreId);
	}

	return ordered;

	function visitScore(scoreId: ScoreId): void {
		if (visited.has(scoreId)) {
			return;
		}

		const score = debate.scores[scoreId];
		if (!score) {
			throw new Error(`Score ${scoreId} was not found in the debate.`);
		}

		visited.add(scoreId);
		ordered.push(scoreId);

		for (const incomingScoreId of score.incomingScoreIds) {
			visitScore(incomingScoreId);
		}
	}
}

function buildElkGraph(
	debate: Debate,
	rootScoreId: ScoreId,
	scoreIdsInLayoutOrder: ScoreId[],
	options: LayoutOptions | undefined,
): LayoutElkNode {
	const sizeByScoreId = computeScoreSizeByScoreId(debate, rootScoreId, scoreIdsInLayoutOrder);
	const children: LayoutElkNode[] = scoreIdsInLayoutOrder.map((scoreId) => ({
		id: scoreId,
		width: sizeByScoreId[scoreId]?.width ?? DEFAULT_SCORE_WIDTH,
		height: sizeByScoreId[scoreId]?.height ?? DEFAULT_SCORE_HEIGHT,
		layoutOptions: {
			...(scoreId === rootScoreId
				? {
					"elk.layered.layering.layerConstraint": "FIRST",
				}
				: {}),
			...(options?.scaleConnectionDistanceWithScore
				? getIndividualSpacingLayoutOptions(
					sizeByScoreId[scoreId]?.width ?? DEFAULT_SCORE_WIDTH,
					options.nodeSpacing ?? DEFAULT_NODE_SPACING,
				)
				: {}),
		},
	}));

	const edges = buildElkEdges(debate, scoreIdsInLayoutOrder, sizeByScoreId);

	return {
		id: "reason-tracker-layout",
		children,
		edges,
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": "RIGHT",
			"elk.spacing.nodeNode": String(options?.nodeSpacing ?? DEFAULT_NODE_SPACING),
			"elk.layered.spacing.nodeNodeBetweenLayers": String(options?.layerSpacing ?? DEFAULT_LAYER_SPACING),
			"elk.spacing.edgeNode": String(options?.connectorNodeGap ?? DEFAULT_CONNECTOR_NODE_GAP),
			"elk.layered.cycleBreaking.strategy": "GREEDY",
			"elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS",
			"elk.layered.considerModelOrder": "NODES_AND_EDGES",
			"elk.layered.crossingMinimization.forceNodeModelOrder": "true",
			"elk.layered.compaction.connectedComponents": "false",
		},
	};
}

function computeScoreSizeByScoreId(
	debate: Debate,
	rootScoreId: ScoreId,
	scoreIdsInLayoutOrder: ScoreId[],
): Record<ScoreId, { width: number; height: number }> {
	const confidenceCascadeScaleByScoreId = {} as Record<ScoreId, number>;
	const relevanceNormalizedScaleByScoreId = {} as Record<ScoreId, number>;
	const scaleByScoreId = {} as Record<ScoreId, number>;
	const sizeByScoreId = {} as Record<ScoreId, { width: number; height: number }>;

	for (const scoreId of scoreIdsInLayoutOrder) {
		confidenceCascadeScaleByScoreId[scoreId] = 1;
		relevanceNormalizedScaleByScoreId[scoreId] = 1;
		scaleByScoreId[scoreId] = 1;
		sizeByScoreId[scoreId] = {
			width: DEFAULT_SCORE_WIDTH,
			height: DEFAULT_SCORE_HEIGHT,
		};
	}

	const incomingScoreIdsByTargetScoreId = {} as Record<ScoreId, Set<ScoreId>>;
	for (const scoreId of scoreIdsInLayoutOrder) {
		const score = debate.scores[scoreId];
		if (!score) {
			throw new Error(`Score ${scoreId} was not found in the debate.`);
		}

		incomingScoreIdsByTargetScoreId[scoreId] = new Set(score.incomingScoreIds);
	}

	const confidenceGroupScaleByTargetScoreId = {} as Record<ScoreId, number>;
	for (const targetScoreId of scoreIdsInLayoutOrder) {
		const incomingScoreIds = incomingScoreIdsByTargetScoreId[targetScoreId];
		if (!incomingScoreIds || incomingScoreIds.size === 0) {
			continue;
		}

		let totalPositiveConfidenceMass = 0;
		for (const incomingScoreId of incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (!incomingScore) {
				throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
			}

			if (incomingScore.confidence > 0) {
				totalPositiveConfidenceMass += incomingScore.confidence;
			}
		}

		confidenceGroupScaleByTargetScoreId[targetScoreId] = 1 / Math.max(1, totalPositiveConfidenceMass);
	}

	confidenceCascadeScaleByScoreId[rootScoreId] = 1;
	scaleByScoreId[rootScoreId] = 1;

	for (const targetScoreId of scoreIdsInLayoutOrder) {
		const incomingScoreIds = incomingScoreIdsByTargetScoreId[targetScoreId];
		if (!incomingScoreIds || incomingScoreIds.size === 0) {
			continue;
		}

		const targetFinalScale = scaleByScoreId[targetScoreId] ?? 1;
		const cascadedConfidenceScaleFromTarget =
			targetFinalScale * (confidenceGroupScaleByTargetScoreId[targetScoreId] ?? 1);

		let maxIncomingRelevance = 0;
		for (const incomingScoreId of incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (!incomingScore) {
				throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
			}

			maxIncomingRelevance = Math.max(maxIncomingRelevance, Math.max(0, incomingScore.relevance));
		}
		if (maxIncomingRelevance <= 0) {
			maxIncomingRelevance = 1;
		}

		for (const incomingScoreId of incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (!incomingScore) {
				throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
			}

			const nextConfidenceCascadeScale = Math.min(
				confidenceCascadeScaleByScoreId[incomingScoreId] ?? 1,
				cascadedConfidenceScaleFromTarget,
			);
			confidenceCascadeScaleByScoreId[incomingScoreId] = nextConfidenceCascadeScale;

			const relevanceNormalizedScale = Math.min(
				1,
				Math.max(0, incomingScore.relevance) / maxIncomingRelevance,
			);
			relevanceNormalizedScaleByScoreId[incomingScoreId] = relevanceNormalizedScale;
			scaleByScoreId[incomingScoreId] = nextConfidenceCascadeScale * relevanceNormalizedScale;
		}
	}

	for (const scoreId of scoreIdsInLayoutOrder) {
		const scale = scaleByScoreId[scoreId] ?? 1;
		sizeByScoreId[scoreId] = {
			width: DEFAULT_SCORE_WIDTH * scale,
			height: DEFAULT_SCORE_HEIGHT * scale,
		};
	}

	return sizeByScoreId;
}

function buildElkEdges(
	debate: Debate,
	scoreIdsInLayoutOrder: ScoreId[],
	sizeByScoreId: Record<ScoreId, { width: number; height: number }>,
): LayoutElkEdge[] {
	const edges: LayoutElkEdge[] = [];

	for (const targetScoreId of scoreIdsInLayoutOrder) {
		const targetScore = debate.scores[targetScoreId];
		if (!targetScore) {
			throw new Error(`Score ${targetScoreId} was not found in the debate.`);
		}

		for (const incomingScoreId of targetScore.incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (!incomingScore) {
				throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
			}

			if (!incomingScore.connectorId) {
				throw new Error(`Incoming score ${incomingScoreId} is missing connectorId.`);
			}

			const sourceSize = sizeByScoreId[incomingScoreId];
			if (!sourceSize) {
				throw new Error(`Size for incoming score ${incomingScoreId} was not found.`);
			}

			edges.push({
				id: incomingScore.connectorId,
				sources: [targetScoreId],
				targets: [incomingScoreId],
				layoutOptions: {
					// Intentionally preserve Score.incomingScoreIds order when sending edges to ELK.
					"elk.edge.thickness": String(getElkEdgeThickness(sourceSize.height, incomingScore.confidence)),
				},
			});
		}
	}

	return edges;
}

function buildDebateLayout(args: {
	debate: Debate
	rootScore: Score
	scoreIdsInLayoutOrder: ScoreId[]
	laidOutGraph: LayoutElkNode
}): DebateLayout {
	const placedNodeByScoreId = new Map<ScoreId, ElkNode>();
	for (const child of args.laidOutGraph.children ?? []) {
		placedNodeByScoreId.set(child.id as ScoreId, child);
	}

	const scoreLayouts = {} as DebateLayout["scoreLayouts"];
	let maxX = 0;
	let maxY = 0;

	for (const scoreId of args.scoreIdsInLayoutOrder) {
		const score = args.debate.scores[scoreId];
		const placed = placedNodeByScoreId.get(scoreId);
		if (!score) {
			throw new Error(`Score ${scoreId} was not found in the debate.`);
		}
		if (placed?.x == null || placed.y == null || placed.width == null || placed.height == null) {
			throw new Error(`ELK did not return a placement for score ${scoreId}.`);
		}

		scoreLayouts[scoreId] = {
			scoreId,
			x: placed.x,
			y: placed.y,
			width: placed.width,
			height: placed.height,
			isRoot: scoreId === args.rootScore.id,
			isLeaf: score.incomingScoreIds.length === 0,
		};

		maxX = Math.max(maxX, placed.x + placed.width);
		maxY = Math.max(maxY, placed.y + placed.height);
	}

	const connectorRoutes = buildConnectorRoutes(args.debate, scoreLayouts);

	return {
		bounds: {
			width: Math.max(1, Math.ceil(args.laidOutGraph.width ?? maxX)),
			height: Math.max(1, Math.ceil(args.laidOutGraph.height ?? maxY)),
		},
		scoreLayouts,
		connectorRoutes,
	};
}

function buildConnectorRoutes(
	debate: Debate,
	scoreLayouts: DebateLayout["scoreLayouts"],
): DebateLayout["connectorRoutes"] {
	const connectorRoutes = {} as DebateLayout["connectorRoutes"];

	for (const score of Object.values(debate.scores)) {
		if (!score.connectorId) {
			continue;
		}

		const sourceScoreLayout = scoreLayouts[score.id];
		if (!sourceScoreLayout) {
			throw new Error(`Score layout for source score ${score.id} was not found.`);
		}

		connectorRoutes[score.connectorId] = {
			connectorId: score.connectorId,
			path: buildFallbackRoute(scoreLayouts, score.id, score.connectorId, debate),
			strokeWidth: getRenderedConnectorStrokeWidth(sourceScoreLayout.height, score.confidence),
		};
	}

	return connectorRoutes;
}

function getSourceScoreForConnectorId(debate: Debate, connectorId: ConnectorId): Score {
	for (const score of Object.values(debate.scores)) {
		if (score.connectorId === connectorId) {
			return score;
		}
	}

	throw new Error(`Score for connector ${connectorId} was not found in the debate.`);
}

function buildFallbackRoute(
	scoreLayouts: DebateLayout["scoreLayouts"],
	sourceScoreId: ScoreId,
	connectorId: ConnectorId,
	debate: Debate,
): LayoutPoint[] {
	const sourceScoreLayout = scoreLayouts[sourceScoreId];
	const targetScore = getTargetScoreForConnectorId(debate, connectorId);
	const targetScoreLayout = scoreLayouts[targetScore.id];

	if (!sourceScoreLayout || !targetScoreLayout) {
		return [];
	}

	return [
		{
			x: sourceScoreLayout.x,
			y: sourceScoreLayout.y + sourceScoreLayout.height / 2,
		},
		{
			x: targetScoreLayout.x + targetScoreLayout.width,
			y: targetScoreLayout.y + targetScoreLayout.height / 2,
		},
	];
}

function getTargetScoreForConnectorId(debate: Debate, connectorId: ConnectorId): Score {
	for (const score of Object.values(debate.scores)) {
		for (const incomingScoreId of score.incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (incomingScore?.connectorId === connectorId) {
				return score;
			}
		}
	}

	throw new Error(`Target score for connector ${connectorId} was not found in the debate.`);
}

function getElkEdgeThickness(sourceHeight: number, sourceConfidence: number): number {
	return Math.max(
		MIN_CONNECTOR_STROKE_WIDTH,
		sourceHeight * sourceConfidence * ELK_EDGE_THICKNESS_MULTIPLIER,
	);
}

function getRenderedConnectorStrokeWidth(sourceHeight: number, sourceConfidence: number): number {
	return Math.max(MIN_CONNECTOR_STROKE_WIDTH, sourceHeight * sourceConfidence);
}

function getIndividualSpacingLayoutOptions(
	scoreWidth: number,
	defaultNodeSpacing: number,
): Record<string, string> {
	const scoreScale = Math.max(0, Math.min(1, scoreWidth / DEFAULT_SCORE_WIDTH));
	const scaledNodeSpacing = Math.max(0, defaultNodeSpacing * scoreScale);

	return {
		"elk.spacing.individual": `spacing.nodeNode:${scaledNodeSpacing}`,
	};
}