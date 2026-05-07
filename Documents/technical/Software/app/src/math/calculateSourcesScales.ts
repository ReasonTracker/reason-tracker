import { calculateRelevance } from "./calculateRelevance.ts";
import { withChildrenByParentId } from "./calculateScores.ts";
import type { ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.ts";

export type SourcesScales = Partial<Record<ScoreNodeId, number>>;

/**
 * Recursively assigns each ScoreNode's source-side potential scale.
 *
 * Direct score children all start from equal inherited shares of the current
 * target's potential scale. Relevance reweights those equal shares while
 * keeping the full target-owned budget on that source side fixed. Direct
 * relevance children inherit the affected confidence connection's potential
 * scale unchanged because they live on that lane rather than taking a
 * separate claim-lane scale.
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
 * Resolves one target's direct score-child potential scales.
 *
 * Each direct score child starts from the same equal inherited share of the
 * target's source-side potential scale. Relevance changes how much of that
 * fixed target-owned budget each direct confidence child receives, but
 * current score does not shrink the full pipe diameter here.
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