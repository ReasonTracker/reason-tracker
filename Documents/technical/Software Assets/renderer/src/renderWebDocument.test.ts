import type { ClaimId, Connector, ConnectorId, DebateId, Score, TargetRelation } from "@reasontracker/contracts";
import { describe, expect, it } from "vitest";
import { renderWebDocument } from "./renderWebDocument.ts";
import type { LayoutEdge, PositionedLayoutModel, PositionedLayoutNode } from "./layout/types.ts";

function asClaimId(value: string): ClaimId {
    return value as ClaimId;
}

function asDebateId(value: string): DebateId {
    return value as DebateId;
}

function asConnectorId(value: string): ConnectorId {
    return value as ConnectorId;
}

function asScore(id: string, confidence: number): Score {
    return {
        id: id as Score["id"],
        claimId: id as ClaimId,
        confidence,
        reversibleConfidence: confidence * 2 - 1,
        relevance: 1,
    };
}

function positionedNode(id: string, width: number, height: number): PositionedLayoutNode {
    const claimId = asClaimId(id);
    return {
        id,
        claimId,
        claim: {
            id: claimId,
            content: id,
            side: "proMain",
        },
        score: asScore(`score:${id}`, 1),
        depth: 0,
        isRoot: id === "target",
        isLeaf: id !== "target",
        x: 10,
        y: 20,
        width,
        height,
    };
}

function positionedNodeWithSide(
    id: string,
    width: number,
    height: number,
    side: "proMain" | "conMain",
): PositionedLayoutNode {
    const node = positionedNode(id, width, height);
    return {
        ...node,
        claim: {
            ...node.claim,
            side,
        },
    };
}

function edge(
    id: string,
    targetClaimShapeId: string,
    sourceClaimShapeId: string,
    targetRelation: TargetRelation = "proTarget",
): LayoutEdge {
    const connector: Connector = {
        id: asConnectorId(id),
        target: targetClaimShapeId,
        source: sourceClaimShapeId,
        affects: "confidence",
    };

    return {
        id,
        targetClaimShapeId,
        sourceClaimShapeId,
        sourceClaimId: asClaimId(sourceClaimShapeId),
        targetClaimId: asClaimId(targetClaimShapeId),
        connectorId: connector.id,
        connector,
        affects: "confidence",
        targetRelation,
    };
}

describe("renderWebDocument transform scaling", () => {
    it("renders literal CSS transform scale with shell geometry", () => {
        const model: PositionedLayoutModel = {
            rootClaimShapeId: "target",
            claimShapes: {
                target: positionedNode("target", 100, 50),
                c1: positionedNode("c1", 100, 50),
            },
            connectorShapes: {
                e1: edge("e1", "target", "c1"),
            },
            cycleMode: "preserve",
            sourceDebateId: asDebateId("debate:test"),
            layoutEngine: "elkjs",
            layoutBounds: {
                width: 300,
                height: 200,
            },
        };

        const { html } = renderWebDocument(model, {
            useClaimShapeTransformScale: true,
            claimShapeScaleByClaimShapeId: {
                c1: 0.5,
                target: 1,
            },
            claimShapeTransformBaseSize: {
                width: 200,
                height: 100,
            },
        });

        expect(html).toContain("class=\"rt-node-shell\"");
        expect(html).toContain("--rt-node-scale:0.5");
        expect(html).toContain("width:100px;height:50px");
        expect(html).toContain("width:200px;height:100px;--rt-node-scale:0.5");
    });

    it("uses source claim main side for connector styling", () => {
        const model: PositionedLayoutModel = {
            rootClaimShapeId: "target",
            claimShapes: {
                target: positionedNodeWithSide("target", 100, 50, "conMain"),
                c1: positionedNodeWithSide("c1", 100, 50, "conMain"),
            },
            connectorShapes: {
                e1: edge("e1", "target", "c1", "conTarget"),
            },
            cycleMode: "preserve",
            sourceDebateId: asDebateId("debate:test"),
            layoutEngine: "elkjs",
            layoutBounds: {
                width: 300,
                height: 200,
            },
        };

        const { html, css } = renderWebDocument(model);

        expect((html.match(/data-connector-side="conMain"/g) ?? []).length).toBe(2);
        expect(html).not.toContain("data-connector-side=\"proMain\"");
        expect((html.match(/data-target-relation="conTarget"/g) ?? []).length).toBe(2);
        expect(css).toContain(".rt-edge[data-connector-side='conMain'] {");
        expect(css).not.toContain(".rt-edge[data-target-relation='conTarget'] {");
    });
});
