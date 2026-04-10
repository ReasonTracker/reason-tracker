import type { TargetRelation } from "@reasontracker/contracts";
import { asClaimId, asConnectorId, asDebateId, asScore } from "./testContracts.ts";
import type {
    LayoutEdge,
    LayoutModel,
    LayoutNode,
    PositionedLayoutModel,
    PositionedLayoutNode,
} from "./types.ts";

export function layoutNode(id: string, confidence: number, depth = 0): LayoutNode {
    const claimId = asClaimId(id);
    return {
        id,
        claimId,
        claim: {
            id: claimId,
            content: id,
            side: "proMain",
        },
        score: asScore(`score:${id}`, confidence),
        depth,
        isRoot: id === "target",
        isLeaf: id !== "target",
    };
}

export function positionedLayoutNode(
    id: string,
    side: "proMain" | "conMain",
    confidence: number,
    y: number,
): PositionedLayoutNode {
    const claimId = asClaimId(id);
    return {
        id,
        claimId,
        claim: {
            id: claimId,
            content: id,
            side,
        },
        score: asScore(`score:${id}`, confidence),
        depth: 0,
        isRoot: id === "target",
        isLeaf: id !== "target",
        x: id === "target" ? 260 : 40,
        y,
        width: 120,
        height: 40,
    };
}

export function layoutEdgeToTarget(
    id: string,
    sourceClaimShapeId: string,
    targetRelation: TargetRelation,
): LayoutEdge {
    return {
        id,
        targetClaimShapeId: "target",
        sourceClaimShapeId,
        sourceClaimId: asClaimId(sourceClaimShapeId),
        targetClaimId: asClaimId("target"),
        connectorId: asConnectorId(id),
        connector: {
            id: asConnectorId(id),
            source: sourceClaimShapeId,
            target: "target",
            affects: "confidence",
        },
        affects: "confidence",
        targetRelation,
    };
}

export function layoutModel(
    claimShapes: Record<string, LayoutNode>,
    connectorShapes: Record<string, LayoutEdge>,
): LayoutModel {
    return {
        rootClaimShapeId: "target",
        claimShapes,
        connectorShapes,
        cycleMode: "preserve",
        sourceDebateId: asDebateId("debate:test"),
    };
}

export function positionedLayoutModel(
    claimShapes: Record<string, PositionedLayoutNode>,
    connectorShapes: Record<string, LayoutEdge>,
): PositionedLayoutModel {
    return {
        rootClaimShapeId: "target",
        claimShapes,
        connectorShapes,
        cycleMode: "preserve",
        sourceDebateId: asDebateId("debate:test"),
        layoutEngine: "elkjs",
        layoutBounds: {
            width: 600,
            height: 400,
        },
    };
}
