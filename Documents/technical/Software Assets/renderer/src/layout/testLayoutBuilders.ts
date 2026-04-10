import type { TargetRelation } from "@reasontracker/contracts";
import { asClaimId, asConnectorId, asDebateId, asScore } from "./testContracts.ts";
import type {
    ConnectorShape,
    DraftLayoutModel,
    ClaimShape,
    LayoutModel,
    PlacedClaimShape,
} from "./types.ts";

export function claimShape(id: string, confidence: number, depth = 0): ClaimShape {
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

export function placedClaimShape(
    id: string,
    side: "proMain" | "conMain",
    confidence: number,
    y: number,
): PlacedClaimShape {
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

export function connectorShapeToTarget(
    id: string,
    sourceClaimShapeId: string,
    targetRelation: TargetRelation,
): ConnectorShape {
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
    claimShapes: Record<string, ClaimShape>,
    connectorShapes: Record<string, ConnectorShape>,
): DraftLayoutModel {
    return {
        rootClaimShapeId: "target",
        claimShapes,
        connectorShapes,
        cycleMode: "preserve",
        sourceDebateId: asDebateId("debate:test"),
    };
}

export function placedLayoutModel(
    claimShapes: Record<string, PlacedClaimShape>,
    connectorShapes: Record<string, ConnectorShape>,
): LayoutModel {
    const connectorShapeRenderOrder = Object.keys(connectorShapes).sort((a, b) => a.localeCompare(b));
    const claimShapeRenderOrder = Object.keys(claimShapes)
        .sort((a, b) => {
            const depthOrder = claimShapes[a].depth - claimShapes[b].depth;
            if (depthOrder !== 0) return depthOrder;
            return a.localeCompare(b);
        });

    return {
        rootClaimShapeId: "target",
        claimShapes,
        connectorShapes,
        connectorShapeRenderOrder,
        claimShapeRenderOrder,
        cycleMode: "preserve",
        sourceDebateId: asDebateId("debate:test"),
        layoutEngine: "elkjs",
        layoutBounds: {
            width: 600,
            height: 400,
        },
    };
}
