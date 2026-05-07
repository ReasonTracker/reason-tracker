import { calculateRelevance } from "./calculateRelevance.ts";
import { withChildrenByParentId } from "./calculateScores.ts";
import type { ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.ts";

export type SourcesScales = Partial<Record<ScoreNodeId, number>>;

/**
 * Recursively assigns each ScoreNode's source-side potential scale.
 *
 * Direct score children all start from equal inherited shares of the current
 * target's source-side potential scale. Direct relevance children stay on the
 * affected confidence connection's source side, so they inherit that same
 * base source-side scale unchanged.
 */
export function calculateSourcesScales(args: {
    rootScoreNodeId: ScoreNodeId;
    rootSourcesScale: number;
    graph: ScoreGraph;
    scores: Scores;
}): SourcesScales {
    const graphWithChildren = withChildrenByParentId(args.graph);
    const sourcesScales: SourcesScales = {};

    assignSourcesScale({
        graph: graphWithChildren,
        scoreNodeId: args.rootScoreNodeId,
        scores: args.scores,
        sourcesScale: resolveSourcesScale(args.rootSourcesScale),
        sourcesScales,
    });

    return sourcesScales;
}

/**
 * Resolves one target's direct score-child source-side scales.
 *
 * Before relevance modifiers are applied, direct score children of the same
 * target all start from equal inherited shares of that target-owned
 * source-side budget.
 */
export function calculateDirectScoreChildSourcesScales(args: {
    targetScoreNodeId: ScoreNodeId;
    targetSourcesScale: number;
    graph: ScoreGraph;
}): SourcesScales {
    const graphWithChildren = withChildrenByParentId(args.graph);
    const scoreChildIds = getDirectScoreChildIds(args.targetScoreNodeId, graphWithChildren);

    if (scoreChildIds.length === 0) {
        return {};
    }

    const targetSourcesScale = resolveSourcesScale(args.targetSourcesScale);
    const equalShare = resolveSourcesScale(targetSourcesScale / scoreChildIds.length);
    const sourcesScales: SourcesScales = {};

    for (const scoreChildId of scoreChildIds) {
        sourcesScales[scoreChildId] = equalShare;
    }

    return sourcesScales;
}

/**
 * Resolves one target's direct score-child delivery scales.
 *
 * Each direct score child starts from the same equal inherited source-side
 * scale. Relevance changes how much of that fixed target-owned budget each
 * direct confidence child receives on the outgoing delivery side, but current
 * score does not shrink the full pipe diameter here.
 */
export function calculateDirectScoreChildDeliveryScales(args: {
    targetScoreNodeId: ScoreNodeId;
    targetSourcesScale: number;
    graph: ScoreGraph;
    scores: Scores;
}): SourcesScales {
    const graphWithChildren = withChildrenByParentId(args.graph);
    const scoreChildIds = getDirectScoreChildIds(args.targetScoreNodeId, graphWithChildren);

    if (scoreChildIds.length === 0) {
        return {};
    }

    const targetSourcesScale = resolveSourcesScale(args.targetSourcesScale);
    const relevanceByScoreNodeId: SourcesScales = {};
    let totalRelevance = 0;

    for (const scoreChildId of scoreChildIds) {
        const relevanceMultiplier = resolveSourcesScale(calculateRelevance(scoreChildId, graphWithChildren, args.scores));

        relevanceByScoreNodeId[scoreChildId] = relevanceMultiplier;
        totalRelevance += relevanceMultiplier;
    }

    const fallbackToEqualSplit = totalRelevance === 0;
    const normalizedTotal = fallbackToEqualSplit ? scoreChildIds.length : totalRelevance;
    const sourcesScales: SourcesScales = {};

    for (const scoreChildId of scoreChildIds) {
        const relevanceMultiplier = fallbackToEqualSplit
            ? 1
            : (relevanceByScoreNodeId[scoreChildId] ?? 0);

        sourcesScales[scoreChildId] = resolveSourcesScale(
            targetSourcesScale * (relevanceMultiplier / normalizedTotal),
        );
    }

    return sourcesScales;
}

/**
 * Recursively assigns each ScoreNode's delivery-side scale.
 *
 * This matches the source-side scale when no relevance changes the confidence
 * connection. Relevance can widen or shrink only the outgoing delivery side.
 */
export function calculateDeliveryScales(args: {
    rootScoreNodeId: ScoreNodeId;
    rootSourcesScale: number;
    graph: ScoreGraph;
    scores: Scores;
    sourcesScales: SourcesScales;
}): SourcesScales {
    const graphWithChildren = withChildrenByParentId(args.graph);
    const deliveryScales: SourcesScales = {};

    assignDeliveryScale({
        deliveryScale: resolveSourcesScale(args.rootSourcesScale),
        deliveryScales,
        graph: graphWithChildren,
        scoreNodeId: args.rootScoreNodeId,
        scores: args.scores,
        sourcesScales: args.sourcesScales,
    });

    return deliveryScales;
}

function assignSourcesScale(args: {
    graph: ScoreGraph;
    scoreNodeId: ScoreNodeId;
    scores: Scores;
    sourcesScale: number;
    sourcesScales: SourcesScales;
}): void {
    const scoreNode = args.graph.nodes[args.scoreNodeId];

    if (!scoreNode) {
        throw new Error(`Missing ScoreNode while assigning source scales: ${args.scoreNodeId}`);
    }

    args.sourcesScales[args.scoreNodeId] = args.sourcesScale;

    const childIds = args.graph.childrenByParentId?.[args.scoreNodeId] ?? [];

    for (const childId of childIds) {
        const child = args.graph.nodes[childId];

        if (!child || child.affects !== "Relevance") {
            continue;
        }

        assignSourcesScale({
            ...args,
            scoreNodeId: childId,
            sourcesScale: args.sourcesScale,
        });
    }

    const directScoreChildSourcesScales = calculateDirectScoreChildSourcesScales({
        targetScoreNodeId: args.scoreNodeId,
        targetSourcesScale: args.sourcesScale,
        graph: args.graph,
    });

    for (const childId of getDirectScoreChildIds(args.scoreNodeId, args.graph)) {
        const childSourcesScale = directScoreChildSourcesScales[childId];

        if (childSourcesScale === undefined) {
            throw new Error(`Missing allocated source scale for direct score child: ${childId}`);
        }

        assignSourcesScale({
            ...args,
            scoreNodeId: childId,
            sourcesScale: childSourcesScale,
        });
    }
}

function assignDeliveryScale(args: {
    deliveryScale: number;
    deliveryScales: SourcesScales;
    graph: ScoreGraph;
    scoreNodeId: ScoreNodeId;
    scores: Scores;
    sourcesScales: SourcesScales;
}): void {
    const scoreNode = args.graph.nodes[args.scoreNodeId];

    if (!scoreNode) {
        throw new Error(`Missing ScoreNode while assigning delivery scales: ${args.scoreNodeId}`);
    }

    args.deliveryScales[args.scoreNodeId] = args.deliveryScale;

    const childIds = args.graph.childrenByParentId?.[args.scoreNodeId] ?? [];

    for (const childId of childIds) {
        const child = args.graph.nodes[childId];

        if (!child || child.affects !== "Relevance") {
            continue;
        }

        const childSourcesScale = args.sourcesScales[childId];

        if (childSourcesScale === undefined) {
            throw new Error(`Missing source scale for relevance child while assigning delivery scales: ${childId}`);
        }

        assignDeliveryScale({
            ...args,
            deliveryScale: childSourcesScale,
            scoreNodeId: childId,
        });
    }

    const targetSourcesScale = args.sourcesScales[args.scoreNodeId];

    if (targetSourcesScale === undefined) {
        throw new Error(`Missing source scale for score node while assigning delivery scales: ${args.scoreNodeId}`);
    }

    const directScoreChildDeliveryScales = calculateDirectScoreChildDeliveryScales({
        targetScoreNodeId: args.scoreNodeId,
        targetSourcesScale,
        graph: args.graph,
        scores: args.scores,
    });

    for (const childId of getDirectScoreChildIds(args.scoreNodeId, args.graph)) {
        const childDeliveryScale = directScoreChildDeliveryScales[childId];

        if (childDeliveryScale === undefined) {
            throw new Error(`Missing delivery scale for direct score child: ${childId}`);
        }

        assignDeliveryScale({
            ...args,
            deliveryScale: childDeliveryScale,
            scoreNodeId: childId,
        });
    }
}

function getDirectScoreChildIds(
    targetScoreNodeId: ScoreNodeId,
    graph: ScoreGraph,
): ScoreNodeId[] {
    const childIds = graph.childrenByParentId?.[targetScoreNodeId] ?? [];

    return childIds.filter((childId: ScoreNodeId) => graph.nodes[childId]?.affects === "Score");
}

function resolveSourcesScale(sourcesScale: number): number {
    if (!Number.isFinite(sourcesScale) || sourcesScale < 0) {
        throw new Error(`Source scale must be a finite non-negative number: ${sourcesScale}`);
    }

    return sourcesScale;
}