import { calculateRelevance } from "./calculateRelevance.ts";
import { withChildrenByParentId } from "./calculateScores.ts";
import type { ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.ts";

export type SourcesScales = Partial<Record<ScoreNodeId, number>>;

type DirectScoreChildScalePlan = {
    deliveryScales: SourcesScales;
    scoreChildIds: ScoreNodeId[];
    sharedChildSourcesScale: number;
};

/**
 * Recursively assigns each ScoreNode's source-side potential scale.
 *
 * All confidence children of the same target share one `sourcesScale`.
 * That shared value = `targetSourcesScale / sum(relevanceMultipliers)`,
 * clamped to not exceed `targetSourcesScale`. If all relevance multipliers
 * are zero the target budget is split equally among children.
 * Relevance children inherit the same `sourcesScale` as their sibling
 * confidence child.
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
 * Resolves one target's confidence-child source-side scales.
 *
 * All confidence children of the same target share one `sourcesScale` so
 * sibling claims stay equal in structural size regardless of their scores.
 */
export function calculateDirectScoreChildSourcesScales(args: {
    targetScoreNodeId: ScoreNodeId;
    targetSourcesScale: number;
    graph: ScoreGraph;
    scores: Scores;
}): SourcesScales {
    const { scoreChildIds, sharedChildSourcesScale } = resolveDirectScoreChildScalePlan(args);

    if (scoreChildIds.length === 0) {
        return {};
    }

    const sourcesScales: SourcesScales = {};

    for (const scoreChildId of scoreChildIds) {
        sourcesScales[scoreChildId] = sharedChildSourcesScale;
    }

    return sourcesScales;
}

/**
 * Resolves one target's confidence-child delivery scales.
 *
 * Each confidence child's delivery connector scale =
 * `sharedChildSourcesScale × relevanceMultiplier`. Score controls fluid fill
 * inside that pipe but does not affect its structural diameter.
 */
export function calculateDirectScoreChildDeliveryScales(args: {
    targetScoreNodeId: ScoreNodeId;
    targetSourcesScale: number;
    graph: ScoreGraph;
    scores: Scores;
}): SourcesScales {
    return resolveDirectScoreChildScalePlan(args).deliveryScales;
}

/**
 * Recursively assigns each ScoreNode's delivery-side scale.
 *
 * Matches the source-side scale when relevanceMultiplier = 1. When relevance
 * is present the delivery connector widens or narrows proportionally while
 * the shared sibling `sourcesScale` stays the same for all siblings.
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
        scores: args.scores,
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

function resolveDirectScoreChildScalePlan(args: {
    targetScoreNodeId: ScoreNodeId;
    targetSourcesScale: number;
    graph: ScoreGraph;
    scores: Scores;
}): DirectScoreChildScalePlan {
    const graphWithChildren = withChildrenByParentId(args.graph);
    const scoreChildIds = getDirectScoreChildIds(args.targetScoreNodeId, graphWithChildren);

    if (scoreChildIds.length === 0) {
        return {
            deliveryScales: {},
            scoreChildIds,
            sharedChildSourcesScale: 0,
        };
    }

    const targetSourcesScale = resolveSourcesScale(args.targetSourcesScale);
    const relevanceByScoreNodeId: SourcesScales = {};
    let totalRelevance = 0;

    for (const scoreChildId of scoreChildIds) {
        const relevanceMultiplier = resolveSourcesScale(calculateRelevance(scoreChildId, graphWithChildren, args.scores));

        relevanceByScoreNodeId[scoreChildId] = relevanceMultiplier;
        totalRelevance += relevanceMultiplier;
    }

    const denominator = totalRelevance > 0 ? totalRelevance : scoreChildIds.length;
    const sharedChildSourcesScale = Math.min(targetSourcesScale / denominator, targetSourcesScale);
    const deliveryScales: SourcesScales = {};

    for (const scoreChildId of scoreChildIds) {
        const relevanceMultiplier = totalRelevance > 0
            ? (relevanceByScoreNodeId[scoreChildId] ?? 0)
            : 1;

        deliveryScales[scoreChildId] = resolveSourcesScale(sharedChildSourcesScale * relevanceMultiplier);
    }

    return {
        deliveryScales,
        scoreChildIds,
        sharedChildSourcesScale,
    };
}

function resolveSourcesScale(sourcesScale: number): number {
    if (!Number.isFinite(sourcesScale) || sourcesScale < 0) {
        throw new Error(`Source scale must be a finite non-negative number: ${sourcesScale}`);
    }

    return sourcesScale;
}