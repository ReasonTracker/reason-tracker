import type {
    Affects,
    ConnectorId,
    ClaimId,
    Connector,
    DebateId,
    Score,
} from "@reasontracker/contracts";
import { describe, expect, it } from "vitest";
import { computeContributorNodeSizing } from "./computeContributorNodeSizing.ts";
import type { LayoutEdge, LayoutModel, LayoutNode, NodeSize } from "./types.ts";

function asClaimId(value: string): ClaimId {
    return value as ClaimId;
}

function asDebateId(value: string): DebateId {
    return value as DebateId;
}

function asConnectorId(value: string): ConnectorId {
    return value as ConnectorId;
}

function asScore(id: string, confidence: number, relevance = 1): Score {
    return {
        id: id as Score["id"],
        claimId: id as ClaimId,
        confidence,
        reversibleConfidence: confidence * 2 - 1,
        relevance,
    };
}

function node(id: string, confidence: number, depth = 0, relevance = 1): LayoutNode {
    const claimId = asClaimId(id);
    return {
        id,
        claimId,
        claim: {
            id: claimId,
            content: id,
            side: "proMain",
        },
        score: asScore(`score:${id}`, confidence, relevance),
        depth,
        isRoot: false,
        isLeaf: false,
    };
}

function edge(
    id: string,
    targetClaimShapeId: string,
    sourceClaimShapeId: string,
    affects: Affects = "confidence",
): LayoutEdge {
    const connector: Connector = {
        id: asConnectorId(id),
        target: targetClaimShapeId,
        source: sourceClaimShapeId,
        affects,
    };

    return {
        id,
        targetClaimShapeId,
        sourceClaimShapeId,
        sourceClaimId: asClaimId(sourceClaimShapeId),
        targetClaimId: asClaimId(targetClaimShapeId),
        connectorId: connector.id,
        connector,
        affects,
        targetRelation: "proTarget",
    };
}

function layoutModel(claimShapes: Record<string, LayoutNode>, connectorShapes: Record<string, LayoutEdge>): LayoutModel {
    return {
        rootClaimShapeId: "target",
        claimShapes,
        connectorShapes,
        cycleMode: "preserve",
        sourceDebateId: asDebateId("debate:test"),
    };
}

const BASE_SIZE: NodeSize = {
    width: 300,
    height: 200,
};

describe("computeContributorNodeSizing", () => {
    it("returns full-size nodes when confidence and relevance scaling are disabled", () => {
        const model = layoutModel(
            {
                target: node("target", 1),
                c1: node("c1", 0.2, 1),
                c2: node("c2", 0, 1),
            },
            {
                e1: edge("e1", "target", "c1"),
                e2: edge("e2", "target", "c2"),
            },
        );

        const result = computeContributorNodeSizing(model, {
            applyConfidenceScale: false,
            applyRelevanceScale: false,
            defaultClaimShapeSize: BASE_SIZE,
        });

        expect(result.claimShapeScaleByClaimShapeId.target).toBe(1);
        expect(result.claimShapeScaleByClaimShapeId.c1).toBe(1);
        expect(result.claimShapeScaleByClaimShapeId.c2).toBe(1);
        expect(result.claimShapeSizeByClaimShapeId.c1.height).toBe(200);
    });

    it("keeps a single 0.5-confidence contributor at full size", () => {
        const model = layoutModel(
            {
                target: node("target", 1),
                c1: node("c1", 0.5, 1),
            },
            {
                e1: edge("e1", "target", "c1"),
            },
        );

        const result = computeContributorNodeSizing(model, {
            applyConfidenceScale: true,
            applyRelevanceScale: false,
            defaultClaimShapeSize: BASE_SIZE,
        });

        expect(result.claimShapeScaleByClaimShapeId.c1).toBe(1);
        expect(result.claimShapeSizeByClaimShapeId.c1.height).toBe(200);
    });

    it("shrinks all contributors equally when cumulative positive confidence exceeds one", () => {
        const model = layoutModel(
            {
                target: node("target", 1),
                c1: node("c1", 1, 1),
                c2: node("c2", 1, 1),
            },
            {
                e1: edge("e1", "target", "c1"),
                e2: edge("e2", "target", "c2"),
            },
        );

        const result = computeContributorNodeSizing(model, {
            applyConfidenceScale: true,
            applyRelevanceScale: false,
            defaultClaimShapeSize: BASE_SIZE,
        });

        expect(result.claimShapeScaleByClaimShapeId.c1).toBeCloseTo(0.5, 10);
        expect(result.claimShapeScaleByClaimShapeId.c2).toBeCloseTo(0.5, 10);
        expect(result.claimShapeSizeByClaimShapeId.c1.width).toBeCloseTo(150, 10);
        expect(result.claimShapeSizeByClaimShapeId.c2.width).toBeCloseTo(150, 10);
        expect(result.claimShapeSizeByClaimShapeId.c1.height).toBeCloseTo(100, 10);
        expect(result.claimShapeSizeByClaimShapeId.c2.height).toBeCloseTo(100, 10);
    });

    it("filters zero-confidence contributors from cumulative mass", () => {
        const model = layoutModel(
            {
                target: node("target", 1),
                c1: node("c1", 1, 1),
                c2: node("c2", 0, 1),
                c3: node("c3", 0, 1),
            },
            {
                e1: edge("e1", "target", "c1"),
                e2: edge("e2", "target", "c2"),
                e3: edge("e3", "target", "c3"),
            },
        );

        const result = computeContributorNodeSizing(model, {
            applyConfidenceScale: true,
            applyRelevanceScale: false,
            defaultClaimShapeSize: BASE_SIZE,
        });

        expect(result.claimShapeScaleByClaimShapeId.c1).toBe(1);
        expect(result.claimShapeScaleByClaimShapeId.c2).toBe(1);
        expect(result.claimShapeScaleByClaimShapeId.c3).toBe(1);
        expect(result.claimShapeSizeByClaimShapeId.c2.height).toBe(200);
    });

    it("cascades contributor scale from parent target scale", () => {
        const model = layoutModel(
            {
                target: node("target", 1, 0),
                a: node("a", 0.84, 1),
                b: node("b", 0.42, 1),
                c: node("c", 0.67, 2),
            },
            {
                e1: edge("e1", "target", "a"),
                e2: edge("e2", "target", "b"),
                e3: edge("e3", "a", "c"),
            },
        );

        const result = computeContributorNodeSizing(model, {
            applyConfidenceScale: true,
            applyRelevanceScale: false,
            defaultClaimShapeSize: BASE_SIZE,
        });

        expect(result.claimShapeScaleByClaimShapeId.a).toBeCloseTo(1 / 1.26, 10);
        expect(result.claimShapeScaleByClaimShapeId.b).toBeCloseTo(1 / 1.26, 10);
        expect(result.claimShapeScaleByClaimShapeId.c).toBeCloseTo(1 / 1.26, 10);
    });

    it("includes relevance edges in cascade propagation", () => {
        const model = layoutModel(
            {
                target: node("target", 1, 0),
                c1: node("c1", 1, 1),
                c1b: node("c1b", 1, 1),
                c2: node("c2", 1, 2),
            },
            {
                e1: edge("e1", "target", "c1", "confidence"),
                e1b: edge("e1b", "target", "c1b", "confidence"),
                e2: edge("e2", "c1", "c2", "relevance"),
            },
        );

        const result = computeContributorNodeSizing(model, {
            applyConfidenceScale: true,
            applyRelevanceScale: false,
            defaultClaimShapeSize: BASE_SIZE,
        });

        expect(result.claimShapeScaleByClaimShapeId.c1).toBeCloseTo(0.5, 10);
        expect(result.claimShapeScaleByClaimShapeId.c1b).toBeCloseTo(0.5, 10);
        expect(result.claimShapeScaleByClaimShapeId.c2).toBeCloseTo(0.5, 10);
    });

    it("applies relevance scaling as sibling-normalized shrink-only adjustment", () => {
        const model = layoutModel(
            {
                target: node("target", 1, 0, 1),
                a: node("a", 1, 1, 1),
                b: node("b", 1, 1, 2),
            },
            {
                e1: edge("e1", "target", "a", "confidence"),
                e2: edge("e2", "target", "b", "confidence"),
            },
        );

        const result = computeContributorNodeSizing(model, {
            applyConfidenceScale: true,
            applyRelevanceScale: true,
            defaultClaimShapeSize: BASE_SIZE,
        });

        expect(result.claimShapeScaleByClaimShapeId.a).toBeCloseTo(0.25, 10);
        expect(result.claimShapeScaleByClaimShapeId.b).toBeCloseTo(0.5, 10);
        expect(result.claimShapeSizeByClaimShapeId.b.height).toBeCloseTo(100, 10);
        expect(result.claimShapeSizeByClaimShapeId.a.height).toBeCloseTo(50, 10);
    });
});
