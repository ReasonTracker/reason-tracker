import { orderConnectorShapeIdsForTarget } from "./orderConnectorShapesForTarget.ts";
import type { ConnectorShape, LayoutOptions, PlacedClaimShape } from "./types.ts";

// Separation of duties: connector routing geometry belongs to layout calculations.
// Rendering consumes this data and should not recompute connector anchor or path logic.

export function withConnectorGeometry(
    claimShapes: Record<string, PlacedClaimShape>,
    connectorShapes: Record<string, ConnectorShape>,
    options: LayoutOptions = {},
    context: {
        targetAnchorYByConnectorShapeId?: Record<string, number>;
        sourceAnchorYByConnectorShapeId?: Record<string, number>;
        orderedConnectorShapeIdsByTargetClaimShapeId?: Record<string, string[]>;
        connectorShapeProcessingOrder?: string[];
        elkPathDByConnectorShapeId?: Record<string, string>;
    } = {},
): Record<string, ConnectorShape> {
    const sourceSideStraightSegmentPercent = options.sourceSideStraightSegmentPercent ?? 0.5;
    const targetSideStraightSegmentPercent = options.targetSideStraightSegmentPercent ?? 0.5;
    const connectorShapeStrokeWidthByConnectorShapeId: Record<string, number> = {};
    const connectorShapeReferenceStrokeWidthByConnectorShapeId: Record<string, number> = {};
    const connectorShapeIdsByTargetClaimShapeId: Record<string, string[]> = {};

    const connectorShapeIdsInProcessingOrder = context.connectorShapeProcessingOrder
        ? context.connectorShapeProcessingOrder.filter((connectorShapeId) => Boolean(connectorShapes[connectorShapeId]))
        : Object.keys(connectorShapes).sort((a, b) => a.localeCompare(b));

    const sortedConnectorShapes = connectorShapeIdsInProcessingOrder
        .map((connectorShapeId) => connectorShapes[connectorShapeId])
        .filter((connectorShape): connectorShape is ConnectorShape => Boolean(connectorShape));

    for (const connectorShape of sortedConnectorShapes) {
        const sourceClaimShape = claimShapes[connectorShape.sourceClaimShapeId];
        if (!sourceClaimShape) continue;

        const sourceConfidence = sourceClaimShape.score?.confidence ?? 1;
        connectorShapeStrokeWidthByConnectorShapeId[connectorShape.id] = sourceClaimShape.height * sourceConfidence;
        connectorShapeReferenceStrokeWidthByConnectorShapeId[connectorShape.id] = sourceClaimShape.height;
        (connectorShapeIdsByTargetClaimShapeId[connectorShape.targetClaimShapeId] ??= []).push(connectorShape.id);
    }

    const connectorShapeTargetSideYByConnectorShapeId: Record<string, number> = {};
    const horizontalGapByTargetClaimShapeId: Record<string, number> = {};

    const orderingModel = {
        claimShapes,
        connectorShapes,
        targetAnchorYByConnectorShapeId: context.targetAnchorYByConnectorShapeId,
        sourceAnchorYByConnectorShapeId: context.sourceAnchorYByConnectorShapeId,
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

        const orderedConnectorShapeIds = context.orderedConnectorShapeIdsByTargetClaimShapeId?.[targetClaimShapeId]
            ?? orderConnectorShapeIdsForTarget(orderingModel, connectorShapeIds);

        if (options.debugConnectorOrder) {
            console.log(`[stack-order] target=${targetClaimShapeId} connectors=${orderedConnectorShapeIds.join(" -> ")}`);
        }

        const yByConnectorShapeId = computeStackedAnchorYByConnectorShapeId(
            orderedConnectorShapeIds,
            connectorShapeStrokeWidthByConnectorShapeId,
            connectorShapeReferenceStrokeWidthByConnectorShapeId,
            targetClaimShape,
            options.spreadTargetAnchorY,
        );

        Object.assign(connectorShapeTargetSideYByConnectorShapeId, yByConnectorShapeId);

    }

    const placedConnectorShapes: Record<string, ConnectorShape> = {};

    if (options.debugConnectorOrder) {
        const bendProcessOrder = sortedConnectorShapes.map((connectorShape) => connectorShape.id);
        console.log(`[bend-process-order] connectors=${bendProcessOrder.join(" -> ")}`);
    }

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
        const sourceSideY = context.sourceAnchorYByConnectorShapeId?.[connectorShape.id]
            ?? (sourceClaimShape.y + sourceClaimShape.height / 2);
        const targetHorizontalGap = horizontalGapByTargetClaimShapeId[connectorShape.targetClaimShapeId] ?? 0;
        const elkPathD = context.elkPathDByConnectorShapeId?.[connectorShape.id];
        const pathD = options.connectorPathShape === "elk-bends" && elkPathD
            ? elkPathD
            : options.connectorPathShape === "curved"
                ? buildCurvedConnectorPathD(
                    targetSideX,
                    targetSideY,
                    sourceSideX,
                    sourceSideY,
                    targetHorizontalGap,
                    sourceSideStraightSegmentPercent,
                    targetSideStraightSegmentPercent,
                )
                : options.connectorPathShape === "sharp-corners"
                    ? buildSharpCornerConnectorPathD(
                        targetSideX,
                        targetSideY,
                        sourceSideX,
                        sourceSideY,
                        targetHorizontalGap,
                        sourceSideStraightSegmentPercent,
                        targetSideStraightSegmentPercent,
                    )
                    : `M ${sourceSideX} ${sourceSideY} L ${targetSideX} ${targetSideY}`;

        if (options.debugConnectorOrder) {
            console.log(
                `[bend] connector=${connectorShape.id} target=${connectorShape.targetClaimShapeId} targetY=${targetSideY} sourceY=${sourceSideY}`,
            );
        }

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
    connectorShapeReferenceStrokeWidthByConnectorShapeId: Record<string, number>,
    targetClaimShape: PlacedClaimShape,
    spreadTargetAnchorY: boolean | undefined,
): Record<string, number> {
    const connectorCount = connectorShapeIds.length;
    const totalStrokeWidth = connectorShapeIds.reduce((sum, connectorShapeId) => {
        const strokeWidth = connectorShapeStrokeWidthByConnectorShapeId[connectorShapeId] ?? 0;
        return sum + strokeWidth;
    }, 0);

    const firstConnectorShapeId = connectorShapeIds[0];
    const lastConnectorShapeId = connectorShapeIds[connectorCount - 1];
    const firstStrokeWidth = firstConnectorShapeId
        ? (connectorShapeStrokeWidthByConnectorShapeId[firstConnectorShapeId] ?? 0)
        : 0;
    const lastStrokeWidth = lastConnectorShapeId
        ? (connectorShapeStrokeWidthByConnectorShapeId[lastConnectorShapeId] ?? 0)
        : 0;
    const firstReferenceStrokeWidth = firstConnectorShapeId
        ? (connectorShapeReferenceStrokeWidthByConnectorShapeId[firstConnectorShapeId] ?? firstStrokeWidth)
        : firstStrokeWidth;
    const lastReferenceStrokeWidth = lastConnectorShapeId
        ? (connectorShapeReferenceStrokeWidthByConnectorShapeId[lastConnectorShapeId] ?? lastStrokeWidth)
        : lastStrokeWidth;

    // Only reserve potential-confidence overhang on the outer stack boundaries.
    const topBoundaryPadding = Math.max(0, (firstReferenceStrokeWidth - firstStrokeWidth) / 2);
    const bottomBoundaryPadding = Math.max(0, (lastReferenceStrokeWidth - lastStrokeWidth) / 2);

    const totalGapHeight = Math.max(
        0,
        targetClaimShape.height - topBoundaryPadding - bottomBoundaryPadding - totalStrokeWidth,
    );
    const gap = spreadTargetAnchorY && connectorCount > 1
        ? totalGapHeight / (connectorCount - 1)
        : 0;

    const totalStackHeight = topBoundaryPadding
        + totalStrokeWidth
        + bottomBoundaryPadding
        + gap * Math.max(0, connectorCount - 1);
    const centerY = targetClaimShape.y + targetClaimShape.height / 2;

    const yByConnectorShapeId: Record<string, number> = {};
    let cursorY = centerY - totalStackHeight / 2 + topBoundaryPadding;

    for (const connectorShapeId of connectorShapeIds) {
        const strokeWidth = connectorShapeStrokeWidthByConnectorShapeId[connectorShapeId] ?? 0;
        yByConnectorShapeId[connectorShapeId] = cursorY + strokeWidth / 2;
        cursorY += strokeWidth + gap;
    }

    return yByConnectorShapeId;
}

function buildCurvedConnectorPathD(
    targetSideX: number,
    targetSideY: number,
    sourceSideX: number,
    sourceSideY: number,
    targetHorizontalGap: number,
    sourceSideStraightSegmentPercent: number,
    targetSideStraightSegmentPercent: number,
): string {
    const sourceSideStraightSegment = targetHorizontalGap * sourceSideStraightSegmentPercent;
    const targetSideStraightSegment = targetHorizontalGap * targetSideStraightSegmentPercent;
    const sourceElbowX = targetSideX + targetHorizontalGap - sourceSideStraightSegment;
    return `M ${sourceSideX} ${sourceSideY} C ${sourceElbowX} ${sourceSideY}, ${targetSideX + targetSideStraightSegment} ${targetSideY}, ${targetSideX} ${targetSideY}`;
}

function buildSharpCornerConnectorPathD(
    targetSideX: number,
    targetSideY: number,
    sourceSideX: number,
    sourceSideY: number,
    targetHorizontalGap: number,
    sourceSideStraightSegmentPercent: number,
    targetSideStraightSegmentPercent: number,
): string {
    const sourceSideStraightSegment = targetHorizontalGap * sourceSideStraightSegmentPercent;
    const targetSideStraightSegment = targetHorizontalGap * targetSideStraightSegmentPercent;
    const sourceElbowX = targetSideX + targetHorizontalGap - sourceSideStraightSegment;
    return [
        `M ${sourceSideX} ${sourceSideY}`,
        `L ${sourceElbowX} ${sourceSideY}`,
        `L ${targetSideX + targetSideStraightSegment} ${targetSideY}`,
        `L ${targetSideX} ${targetSideY}`,
    ].join(" ");
}
