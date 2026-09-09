import { describe, expect, it } from "vitest";
import {
    calculateDirectScoreChildScalePlan,
} from "./calculateSourcesScales.ts";
import type {
    ClaimId,
    Score,
    ScoreGraph,
    ScoreNode,
    ScoreNodeId,
    Scores,
} from "./scoreTypes.ts";

describe("calculateDirectScoreChildScalePlan", () => {
    it.each([
        { expectedScale: 1, scores: [1, 0, 0, 0], shares: [1, 0, 0, 0] },
        { expectedScale: 0.5, scores: [1, 1, 0, 0], shares: [0.5, 0.5, 0, 0] },
        { expectedScale: 1, scores: [0.2, 0.3], shares: [0.2, 0.3] },
        { expectedScale: 1 / 1.4, scores: [0.6, 0.8], shares: [0.6 / 1.4, 0.8 / 1.4] },
        { expectedScale: 1, scores: [0, 0, 0], shares: [0, 0, 0] },
        { expectedScale: 1, scores: [0.4, 0.6], shares: [0.4, 0.6] },
        { expectedScale: 1, scores: [0.499999, 0.5], shares: [0.499999, 0.5] },
        {
            expectedScale: 1 / 1.000001,
            scores: [0.500001, 0.5],
            shares: [0.500001 / 1.000001, 0.5 / 1.000001],
        },
    ])("allocates scores $scores", ({ expectedScale, scores, shares }) => {
        const fixture = createFixture(scores);
        const allocation = calculateDirectScoreChildScalePlan({
            graph: fixture.graph,
            scores: fixture.scores,
            targetScoreNodeId: fixture.targetId,
            targetSourcesScale: 1,
        });

        expect(allocation.sharedChildSourcesScale).toBeCloseTo(expectedScale);
        fixture.childIds.forEach((childId, index) => {
            expect(allocation.deliveryScales[childId]).toBeCloseTo(expectedScale);
            expect(allocation.contributionWeights[childId]).toBeCloseTo(scores[index] ?? 0);
            expect(allocation.parentFluidShares[childId]).toBeCloseTo(shares[index] ?? 0);
        });
    });

    it("applies relevance after resolving the sibling base scale", () => {
        const fixture = createFixture([1, 0], { firstChildRelevanceScore: 1 });
        const allocation = calculateDirectScoreChildScalePlan({
            graph: fixture.graph,
            scores: fixture.scores,
            targetScoreNodeId: fixture.targetId,
            targetSourcesScale: 1,
        });

        expect(allocation.sharedChildSourcesScale).toBeCloseTo(0.5);
        expect(allocation.contributionWeights[fixture.childIds[0]!]).toBeCloseTo(2);
        expect(allocation.deliveryScales[fixture.childIds[0]!]).toBeCloseTo(1);
        expect(allocation.parentFluidShares[fixture.childIds[0]!]).toBeCloseTo(1);
        expect(allocation.deliveryScales[fixture.childIds[1]!]).toBeCloseTo(0.5);
        expect(allocation.parentFluidShares[fixture.childIds[1]!]).toBe(0);
    });
});

function createFixture(
    childValues: number[],
    options: { firstChildRelevanceScore?: number } = {},
): {
    childIds: ScoreNodeId[];
    graph: ScoreGraph;
    scores: Scores;
    targetId: ScoreNodeId;
} {
    const targetId = scoreNodeId("target");
    const childIds = childValues.map((_, index) => scoreNodeId(`child-${index}`));
    const nodes = Object.fromEntries([
        [targetId, scoreNode(targetId, "Score")],
        ...childIds.map((childId) => [
            childId,
            scoreNode(childId, "Score", targetId),
        ] as const),
    ]) as ScoreGraph["nodes"];
    const childrenByParentId: NonNullable<ScoreGraph["childrenByParentId"]> = {
        [targetId]: childIds,
    };
    const scores: Scores = Object.fromEntries([
        [targetId, score(targetId, 1)],
        ...childIds.map((childId, index) => [childId, score(childId, childValues[index] ?? 0)] as const),
    ]);

    if (options.firstChildRelevanceScore !== undefined) {
        const firstChildId = childIds[0]!;
        const relevanceId = scoreNodeId("relevance");
        nodes[relevanceId] = scoreNode(relevanceId, "Relevance", firstChildId, true);
        childrenByParentId[firstChildId] = [relevanceId];
        scores[relevanceId] = score(relevanceId, options.firstChildRelevanceScore);
    }

    return {
        childIds,
        graph: { childrenByParentId, nodes },
        scores,
        targetId,
    };
}

function scoreNode(
    id: ScoreNodeId,
    affects: ScoreNode["affects"],
    parentId?: ScoreNodeId,
    proParent?: boolean,
): ScoreNode {
    return {
        affects,
        claimId: id as unknown as ClaimId,
        id,
        ...(parentId === undefined ? {} : { parentId }),
        ...(proParent === undefined ? {} : { proParent }),
    };
}

function score(id: ScoreNodeId, value: number): Score {
    return {
        claimId: id as unknown as ClaimId,
        rawValue: value,
        scoreNodeId: id,
        totalWeight: 0,
        value,
        weightedSum: 0,
    };
}

function scoreNodeId(id: string): ScoreNodeId {
    return id as ScoreNodeId;
}