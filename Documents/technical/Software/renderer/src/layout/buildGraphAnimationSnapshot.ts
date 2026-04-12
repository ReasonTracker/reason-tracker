import type {
    GraphAnimationSnapshot,
    GraphClaimVisualState,
    GraphConnectorVisualState,
    LayoutModel,
} from "./types.ts";

export function buildGraphAnimationSnapshot(
    model: LayoutModel,
    options: {
        claimShapeScaleByClaimShapeId?: Record<string, number>;
    } = {},
): GraphAnimationSnapshot {
    const claimVisualByClaimId = {} as GraphAnimationSnapshot["claimVisualByClaimId"];
    const connectorVisualByConnectorId =
        {} as GraphAnimationSnapshot["connectorVisualByConnectorId"];
    const claimRenderOrder: GraphAnimationSnapshot["claimRenderOrder"] = [];
    const connectorRenderOrder: GraphAnimationSnapshot["connectorRenderOrder"] = [];
    const claimShapeScaleByClaimShapeId =
        options.claimShapeScaleByClaimShapeId ?? {};

    for (const claimShapeId of model.claimShapeRenderOrder) {
        const claimShape = model.claimShapes[claimShapeId];
        if (!claimShape) continue;

        const current = claimVisualByClaimId[claimShape.claimId];
        const nextState: GraphClaimVisualState = {
            claimId: claimShape.claimId,
            scoreId: claimShape.score?.id,
            x: claimShape.x,
            y: claimShape.y,
            width: claimShape.width,
            height: claimShape.height,
            scale: claimShapeScaleByClaimShapeId[claimShape.id] ?? 1,
            side: claimShape.claim.side,
            label: String(claimShape.claimId),
            content: claimShape.claim.content,
            confidence: claimShape.score?.confidence ?? 0,
            reversibleConfidence: claimShape.score?.reversibleConfidence ?? 0,
            relevance: claimShape.score?.relevance ?? 0,
        };

        if (!current || claimShape.isRoot) {
            claimVisualByClaimId[claimShape.claimId] = nextState;
            claimRenderOrder.push(claimShape.claimId);
        }
    }

    for (const connectorShapeId of model.connectorShapeRenderOrder) {
        const connectorShape = model.connectorShapes[connectorShapeId];
        if (!connectorShape?.geometry) continue;

        const nextState: GraphConnectorVisualState = {
            connectorId: connectorShape.connectorId,
            sourceClaimId: connectorShape.sourceClaimId,
            targetClaimId: connectorShape.targetClaimId,
            affects: connectorShape.affects,
            side: model.claimShapes[connectorShape.sourceClaimShapeId]?.claim.side ?? "proMain",
            pathD: connectorShape.geometry.pathD,
            strokeWidth: connectorShape.geometry.strokeWidth,
            referenceStrokeWidth: connectorShape.geometry.referenceStrokeWidth,
            sourceSideY: connectorShape.geometry.sourceSideY,
            targetSideY: connectorShape.geometry.targetSideY,
        };

        connectorVisualByConnectorId[connectorShape.connectorId] = nextState;
        connectorRenderOrder.push(connectorShape.connectorId);
    }

    return {
        debateId: model.sourceDebateId,
        width: Math.max(1, Math.ceil(model.layoutBounds.width)),
        height: Math.max(1, Math.ceil(model.layoutBounds.height)),
        claimVisualByClaimId,
        connectorVisualByConnectorId,
        claimRenderOrder,
        connectorRenderOrder,
    };
}
