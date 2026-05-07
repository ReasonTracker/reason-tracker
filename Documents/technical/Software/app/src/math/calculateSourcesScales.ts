import { calculateChildImpact } from "./calculateChildImpact.js";
import { calculateRelevance } from "./calculateRelevance.js";
import { withChildrenByParentId } from "./calculateScores.js";
import type { ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.js";

export type SourcesScales = Partial<Record<ScoreNodeId, number>>;

/**
 * Recursively assigns each ScoreNode's source-side scale budget.
 *
 * Direct score children split the current target budget according to their
 * current weighted impact. Direct relevance children inherit the current
 * target budget unchanged because they live on the affected confidence
 * connection's lane rather than taking a separate claim-lane share.
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
 * Allocates one target's source-side scale budget across its direct score
 * children.
 *
 * The shares always sum back to the target budget. When the current weighted
 * impacts all resolve to zero, the budget falls back to an equal split across
 * the direct score children.
 */
export function calculateDirectScoreChildSourcesScales(args: {
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
    const weightsByScoreNodeId: SourcesScales = {};
    let totalWeight = 0;

    for (const scoreChildId of scoreChildIds) {
        const scoreChild = graphWithChildren.nodes[scoreChildId];

        if (!scoreChild) {
            throw new Error(`Missing direct score child while calculating source scales: ${scoreChildId}`);
        }

        const childScore = args.scores[scoreChildId];

        if (!childScore) {
            throw new Error(`Missing score for direct score child while calculating source scales: ${scoreChildId}`);
        }

        const relevance = calculateRelevance(scoreChildId, graphWithChildren, args.scores);
        const impact = calculateChildImpact(scoreChild, childScore, relevance);

        weightsByScoreNodeId[scoreChildId] = impact.weight;
        totalWeight += impact.weight;
    }

    const fallbackToEqualSplit = totalWeight === 0;
    const normalizedTotal = fallbackToEqualSplit ? scoreChildIds.length : totalWeight;
    const sourcesScales: SourcesScales = {};

    for (const scoreChildId of scoreChildIds) {
        const shareWeight = fallbackToEqualSplit
            ? 1
            : (weightsByScoreNodeId[scoreChildId] ?? 0);

        sourcesScales[scoreChildId] = targetSourcesScale * (shareWeight / normalizedTotal);
    }

    return sourcesScales;
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