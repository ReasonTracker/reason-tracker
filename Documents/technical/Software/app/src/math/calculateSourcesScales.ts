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
 * Direct score children of the same target share one solved source-side scale
 * for their sibling group. That shared scale is chosen from the current
 * target-owned source-side potential scale and the direct score children's
 * current scored delivery demand. Direct relevance children stay on the
 * affected confidence connection's source side, so they inherit that same
 * solved source-side scale unchanged.
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
 * Direct score children of the same target share one solved source-side scale.
 * That shared scale is chosen from the target-owned source-side budget and the
 * direct score children's current scored delivery demand, so sibling claims
 * stay equal while the outgoing delivery side can still widen or shrink
 * continuously after the junction.
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
 * Resolves one target's direct score-child delivery scales.
 *
 * Each direct score child starts from the same solved source-side scale.
 * Relevance continuously widens or shrinks that child's outgoing delivery side
 * from the same shared sibling-group base scale. Current score still changes
 * the fluid fill inside the authored pipe diameter, and that same current
 * score also participates in solving the shared sibling-group base scale.
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
 * This matches the source-side scale when no relevance changes the confidence
 * connection. When relevance is present, direct score children still share the
 * same source-side scale and only the outgoing delivery side widens or shrinks
 * continuously from that common base, while the shared base itself is solved
 * from the direct score children's current scored delivery demand.
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
    let totalScoredDeliveryDemand = 0;

    for (const scoreChildId of scoreChildIds) {
        const childScore = args.scores[scoreChildId];

        if (!childScore) {
            throw new Error(`Missing score for direct score child while resolving scales: ${scoreChildId}`);
        }

        const relevanceMultiplier = resolveSourcesScale(calculateRelevance(scoreChildId, graphWithChildren, args.scores));
        const scoredDeliveryDemand = resolveSourcesScale(relevanceMultiplier * resolveSourcesScale(childScore.value));

        relevanceByScoreNodeId[scoreChildId] = relevanceMultiplier;
        totalRelevance += relevanceMultiplier;
        totalScoredDeliveryDemand += scoredDeliveryDemand;
    }

    const fallbackToEqualSplit = totalRelevance === 0;
    const rawDeliveryDemandTotal = fallbackToEqualSplit ? scoreChildIds.length : totalRelevance;
    const normalizedTotal = totalScoredDeliveryDemand > 0
        ? totalScoredDeliveryDemand
        : rawDeliveryDemandTotal;
    const sharedChildSourcesScale = resolveSourcesScale(targetSourcesScale / normalizedTotal);
    const deliveryScales: SourcesScales = {};

    for (const scoreChildId of scoreChildIds) {
        const relevanceMultiplier = fallbackToEqualSplit
            ? 1
            : (relevanceByScoreNodeId[scoreChildId] ?? 0);

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