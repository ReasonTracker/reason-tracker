import { orderConnectorShapeIdsForTarget } from "./orderConnectorShapesForTarget.ts";
import type { ConnectorShape, PlacedClaimShape } from "./types.ts";

// Separation of duties: connector routing geometry belongs to layout calculations.
// Rendering consumes this data and should not recompute connector anchor or path logic.
const SOURCE_SIDE_STRAIGHT_SEGMENT_PERCENT = 0.5;
const TARGET_SIDE_STRAIGHT_SEGMENT_MIN_PERCENT = 0.1;
const TARGET_SIDE_STRAIGHT_SEGMENT_MAX_PERCENT = 0.5;

interface ConnectorOrderingModel {
    claimShapes: Record<string, PlacedClaimShape>;
    connectorShapes: Record<string, ConnectorShape>;
}

export function withConnectorGeometry(
    claimShapes: Record<string, PlacedClaimShape>,
    connectorShapes: Record<string, ConnectorShape>,
): Record<string, ConnectorShape> {
    const connectorShapeStrokeWidthByConnectorShapeId: Record<string, number> = {};
    const connectorShapeReferenceStrokeWidthByConnectorShapeId: Record<string, number> = {};
    const connectorShapeIdsByTargetClaimShapeId: Record<string, string[]> = {};

    const sortedConnectorShapes = Object.values(connectorShapes)
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const connectorShape of sortedConnectorShapes) {
        const sourceClaimShape = claimShapes[connectorShape.sourceClaimShapeId];
        if (!sourceClaimShape) continue;

        const sourceConfidence = sourceClaimShape.score?.confidence ?? 1;
        connectorShapeStrokeWidthByConnectorShapeId[connectorShape.id] = sourceClaimShape.height * sourceConfidence;
        connectorShapeReferenceStrokeWidthByConnectorShapeId[connectorShape.id] = sourceClaimShape.height;
        (connectorShapeIdsByTargetClaimShapeId[connectorShape.targetClaimShapeId] ??= []).push(connectorShape.id);
    }

    const connectorShapeTargetSideYByConnectorShapeId: Record<string, number> = {};
    const connectorShapeTargetApproachFactorByConnectorShapeId: Record<string, number> = {};
    const horizontalGapByTargetClaimShapeId: Record<string, number> = {};

    const orderingModel: ConnectorOrderingModel = {
        claimShapes,
        connectorShapes,
    };

    for (const [targetClaimShapeId, connectorShapeIds] of Object.entries(connectorShapeIdsByTargetClaimShapeId)) {
        const targetClaimShape = claimShapes[targetClaimShapeId];
        if (!targetClaimShape) continue;

        const targetSideX = targetClaimShape.x + targetClaimShape.width;
        let nearestSourceSideX = Number.POSITIVE_INFINITY;
        for (const connectorShapeId of connectorShapeIds) {
            const connectorShape = connectorShapes[connectorShapeId];
            if (!connectorShape) continue;

            const sourceClaimShape = claimShapes[connectorShape.sourceClaimShapeId];
            if (!sourceClaimShape) continue;

            nearestSourceSideX = Math.min(nearestSourceSideX, sourceClaimShape.x);
        }

        horizontalGapByTargetClaimShapeId[targetClaimShapeId] =
            Number.isFinite(nearestSourceSideX)
                ? (nearestSourceSideX - targetSideX)
                : 0;

        const orderedConnectorShapeIds = orderConnectorShapeIdsForTarget(orderingModel, connectorShapeIds);
        const yByConnectorShapeId = computeStackedAnchorYByConnectorShapeId(
            orderedConnectorShapeIds,
            connectorShapeStrokeWidthByConnectorShapeId,
            targetClaimShape,
        );

        Object.assign(connectorShapeTargetSideYByConnectorShapeId, yByConnectorShapeId);

        const centerY = targetClaimShape.y + targetClaimShape.height / 2;
        let maxDistanceFromCenter = 0;
        for (const connectorShapeId of orderedConnectorShapeIds) {
            const y = yByConnectorShapeId[connectorShapeId];
            if (y == null) continue;
            maxDistanceFromCenter = Math.max(maxDistanceFromCenter, Math.abs(y - centerY));
        }

        for (const connectorShapeId of orderedConnectorShapeIds) {
            const y = yByConnectorShapeId[connectorShapeId];
            if (y == null || maxDistanceFromCenter === 0) {
                connectorShapeTargetApproachFactorByConnectorShapeId[connectorShapeId] = 1;
                continue;
            }

            const distanceFromCenter = Math.abs(y - centerY);
            const centeredness = 1 - Math.min(1, distanceFromCenter / maxDistanceFromCenter);
            connectorShapeTargetApproachFactorByConnectorShapeId[connectorShapeId] = centeredness;
        }
    }

    const placedConnectorShapes: Record<string, ConnectorShape> = {};

    for (const connectorShape of sortedConnectorShapes) {
        const targetClaimShape = claimShapes[connectorShape.targetClaimShapeId];
        const sourceClaimShape = claimShapes[connectorShape.sourceClaimShapeId];

        if (!targetClaimShape || !sourceClaimShape) {
            placedConnectorShapes[connectorShape.id] = { ...connectorShape };
            continue;
        }

        const targetSideX = targetClaimShape.x + targetClaimShape.width;
        const targetSideY = connectorShapeTargetSideYByConnectorShapeId[connectorShape.id] ?? (targetClaimShape.y + targetClaimShape.height / 2);
        const sourceSideX = sourceClaimShape.x;
        const sourceSideY = sourceClaimShape.y + sourceClaimShape.height / 2;
        const targetHorizontalGap = horizontalGapByTargetClaimShapeId[connectorShape.targetClaimShapeId] ?? 0;
        const sourceSideStraightSegment = targetHorizontalGap * SOURCE_SIDE_STRAIGHT_SEGMENT_PERCENT;
        const targetApproachFactor = connectorShapeTargetApproachFactorByConnectorShapeId[connectorShape.id] ?? 1;
        const targetSideStraightSegment = targetHorizontalGap * (
            TARGET_SIDE_STRAIGHT_SEGMENT_MIN_PERCENT
            + targetApproachFactor * (TARGET_SIDE_STRAIGHT_SEGMENT_MAX_PERCENT - TARGET_SIDE_STRAIGHT_SEGMENT_MIN_PERCENT)
        );
        const sourceElbowX = targetSideX + targetHorizontalGap - sourceSideStraightSegment;
        const pathD = `M ${targetSideX} ${targetSideY} C ${targetSideX + targetSideStraightSegment} ${targetSideY}, ${sourceElbowX} ${sourceSideY}, ${sourceSideX} ${sourceSideY}`;

        placedConnectorShapes[connectorShape.id] = {
            ...connectorShape,
            geometry: {
                targetSideY,
                sourceSideY,
                strokeWidth: connectorShapeStrokeWidthByConnectorShapeId[connectorShape.id] ?? 2,
                referenceStrokeWidth: connectorShapeReferenceStrokeWidthByConnectorShapeId[connectorShape.id] ?? 2,
                pathD,
            },
        };
    }

    return placedConnectorShapes;
}

function computeStackedAnchorYByConnectorShapeId(
    connectorShapeIds: string[],
    connectorShapeStrokeWidthByConnectorShapeId: Record<string, number>,
    targetClaimShape: PlacedClaimShape,
): Record<string, number> {
    const connectorCount = connectorShapeIds.length;
    const centerY = targetClaimShape.y + targetClaimShape.height / 2;
    const totalStrokeWidth = connectorShapeIds.reduce((sum, connectorShapeId) => {
        const strokeWidth = connectorShapeStrokeWidthByConnectorShapeId[connectorShapeId] ?? 0;
        return sum + strokeWidth;
    }, 0);
    const totalGapHeight = Math.max(0, targetClaimShape.height - totalStrokeWidth);
    const gap = connectorCount > 1
        ? totalGapHeight / (connectorCount - 1)
        : 0;
    const totalStackHeight = totalStrokeWidth + gap * Math.max(0, connectorCount - 1);

    const yByConnectorShapeId: Record<string, number> = {};
    let cursorY = centerY - totalStackHeight / 2;

    for (const connectorShapeId of connectorShapeIds) {
        const strokeWidth = connectorShapeStrokeWidthByConnectorShapeId[connectorShapeId] ?? 0;
        yByConnectorShapeId[connectorShapeId] = cursorY + strokeWidth / 2;
        cursorY += strokeWidth + gap;
    }

    return yByConnectorShapeId;
}