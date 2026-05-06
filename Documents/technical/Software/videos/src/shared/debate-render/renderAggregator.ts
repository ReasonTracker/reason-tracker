import type {
    DeliveryAggregatorViz,
    RelevanceAggregatorViz,
    Side,
    Snapshot,
    VizItem,
} from "@planner/Snapshot.ts";
import type { PlannerOptions } from "@planner/contracts.ts";

import { getPlannerClaimHeight, getPlannerClaimWidth } from "./renderClaim";
import { resolveTweenBoolean, resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import { svgElement } from "./renderTree";
import type { RenderElementNode } from "./renderTypes";

export type Point = {
    x: number;
    y: number;
};

export type UnitVector = {
    x: number;
    y: number;
};

export type AggregatorGeometry = {
    aggregatorId: string;
    depth: number;
    edgeCenter: Point;
    edgeLength: number;
    outwardNormal: UnitVector;
    side: Side;
    tangent: UnitVector;
};

export type AggregatorAttachment = {
    approachUnit: UnitVector;
    point: Point;
    tangent: UnitVector;
};

/** Outline width shared with the other graph outline shapes. */
const AGGREGATOR_OUTLINE_WIDTH_PX = 4;
/** Skip rendering when the outline would still occupy less than a visible sliver. */
const MIN_RENDERABLE_AGGREGATOR_DEPTH_PX = 0.5;

export function renderAggregatorOutline(args: AggregatorGeometry): RenderElementNode | undefined {
    if (args.depth <= MIN_RENDERABLE_AGGREGATOR_DEPTH_PX || args.edgeLength <= MIN_RENDERABLE_AGGREGATOR_DEPTH_PX) {
        return undefined;
    }

    const tangent = normalizeUnitVector(args.tangent, { x: -args.outwardNormal.y, y: args.outwardNormal.x });
    const outwardNormal = normalizeUnitVector(args.outwardNormal, { x: 1, y: 0 });
    const halfEdgeLength = args.edgeLength / 2;
    const innerStart = addPoint(args.edgeCenter, scaleUnitVector(tangent, -halfEdgeLength));
    const innerEnd = addPoint(args.edgeCenter, scaleUnitVector(tangent, halfEdgeLength));
    const outerEnd = addPoint(innerEnd, scaleUnitVector(outwardNormal, args.depth));
    const outerStart = addPoint(innerStart, scaleUnitVector(outwardNormal, args.depth));
    const pathData = [
        `M ${innerStart.x} ${innerStart.y}`,
        `L ${innerEnd.x} ${innerEnd.y}`,
        `L ${outerEnd.x} ${outerEnd.y}`,
        `L ${outerStart.x} ${outerStart.y}`,
        "Z",
    ].join(" ");

    return svgElement("path", {
        attributes: {
            "class": "rt-debate-render__aggregator",
            "d": pathData,
            "data-aggregator-id": args.aggregatorId,
            "fill": "none",
            "pointer-events": "none",
            "stroke": resolveSideStroke(args.side),
            "stroke-linejoin": "round",
            "stroke-width": AGGREGATOR_OUTLINE_WIDTH_PX,
        },
    });
}

export function resolveDeliveryAggregatorGeometry(args: {
    item: DeliveryAggregatorViz;
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
    stepProgress: number;
}): AggregatorGeometry | undefined {
    const claimItem = getClaimVizForClaimId(args.snapshot, args.item.claimId);

    if (!claimItem) {
        return undefined;
    }

    const sourceReferencePoint = resolveDeliveryAggregatorSourceReferencePoint({
        deliveryConnectorVizId: args.item.deliveryConnectorVizIds[0] ? String(args.item.deliveryConnectorVizIds[0]) : undefined,
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    }) ?? resolveClaimFallbackReferencePoint({
        claimItem,
        stepProgress: args.stepProgress,
    });
    const claimPosition = resolveTweenPoint(claimItem.position, args.stepProgress);
    const claimScale = resolveTweenNumber(claimItem.scale, args.stepProgress);

    return {
        aggregatorId: String(args.item.id),
        depth: args.item.deliveryConnectorVizIds.length >= 2
            ? resolveAggregatorDepth(resolveTweenNumber(args.item.scale, args.stepProgress), args.plannerOptions)
            : 0,
        edgeCenter: {
            x: claimPosition.x
                + ((sourceReferencePoint.x <= claimPosition.x ? -1 : 1)
                    * (getPlannerClaimWidth(claimScale, args.plannerOptions) / 2)),
            y: claimPosition.y,
        },
        edgeLength: getPlannerClaimHeight(claimScale, args.plannerOptions),
        outwardNormal: sourceReferencePoint.x <= claimPosition.x
            ? { x: -1, y: 0 }
            : { x: 1, y: 0 },
        side: claimItem.side,
        tangent: { x: 0, y: 1 },
    };
}

export function resolveRelevanceAggregatorGeometry(args: {
    item: RelevanceAggregatorViz;
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
    stepProgress: number;
}): AggregatorGeometry | undefined {
    const junctionItem = getJunctionForConfidenceConnector(args.snapshot, args.item.confidenceConnectorId);
    const side = resolveRelevanceAggregatorSide(args.snapshot, args.item);

    if (!junctionItem || !side) {
        return undefined;
    }

    const firstConnector = getSnapshotItem(args.snapshot, args.item.relevanceConnectorVizIds[0] ? String(args.item.relevanceConnectorVizIds[0]) : "");
    const sourceClaim = firstConnector?.type === "relevanceConnector"
        ? getSnapshotItem(args.snapshot, String(firstConnector.sourceClaimVizId))
        : undefined;
    const junctionPosition = resolveTweenPoint(junctionItem.position, args.stepProgress);
    const sourceClaimPosition = sourceClaim?.type === "claim"
        ? resolveTweenPoint(sourceClaim.position, args.stepProgress)
        : { x: junctionPosition.x, y: junctionPosition.y - 1 };
    const span = Math.max(1, Math.round(resolveTweenNumber(junctionItem.incomingRelevanceScale, args.stepProgress)));
    const incomingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(junctionItem.incomingConfidenceScale, args.stepProgress)));
    const outgoingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(junctionItem.outgoingConfidenceScale, args.stepProgress)));
    const leftHeight = side === "proMain"
        ? incomingConfidenceHeight
        : outgoingConfidenceHeight;
    const rightHeight = side === "proMain"
        ? outgoingConfidenceHeight
        : incomingConfidenceHeight;
    const leftX = junctionPosition.x - (span / 2);
    const rightX = junctionPosition.x + (span / 2);
    const attachToTop = sourceClaimPosition.y <= junctionPosition.y;
    const edgeStart = attachToTop
        ? { x: leftX, y: junctionPosition.y - (leftHeight / 2) }
        : { x: leftX, y: junctionPosition.y + (leftHeight / 2) };
    const edgeEnd = attachToTop
        ? { x: rightX, y: junctionPosition.y - (rightHeight / 2) }
        : { x: rightX, y: junctionPosition.y + (rightHeight / 2) };
    const tangent = normalizeUnitVector({
        x: edgeEnd.x - edgeStart.x,
        y: edgeEnd.y - edgeStart.y,
    }, { x: 1, y: 0 });

    return {
        aggregatorId: String(args.item.id),
        depth: resolveTweenBoolean(args.item.visible, args.stepProgress) && args.item.relevanceConnectorVizIds.length >= 2
            ? resolveAggregatorDepth(resolveTweenNumber(args.item.scale, args.stepProgress), args.plannerOptions)
            : 0,
        edgeCenter: {
            x: (edgeStart.x + edgeEnd.x) / 2,
            y: (edgeStart.y + edgeEnd.y) / 2,
        },
        edgeLength: Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y),
        outwardNormal: attachToTop
            ? { x: tangent.y, y: -tangent.x }
            : { x: -tangent.y, y: tangent.x },
        side,
        tangent,
    };
}

export function resolveAggregatorOuterEdgeAttachment(args: AggregatorGeometry | undefined): AggregatorAttachment | undefined {
    if (!args) {
        return undefined;
    }

    const outwardNormal = normalizeUnitVector(args.outwardNormal, { x: 1, y: 0 });
    const inwardApproachUnit = {
        x: -outwardNormal.x,
        y: -outwardNormal.y,
    };

    return {
        approachUnit: inwardApproachUnit,
        point: addPoint(args.edgeCenter, scaleUnitVector(outwardNormal, args.depth)),
        tangent: normalizeUnitVector(args.tangent, { x: -outwardNormal.y, y: outwardNormal.x }),
    };
}

export function getAggregatorBounds(args: AggregatorGeometry | undefined): { maxX: number; maxY: number } {
    if (!args || args.depth <= MIN_RENDERABLE_AGGREGATOR_DEPTH_PX || args.edgeLength <= MIN_RENDERABLE_AGGREGATOR_DEPTH_PX) {
        return { maxX: 0, maxY: 0 };
    }

    const tangent = normalizeUnitVector(args.tangent, { x: -args.outwardNormal.y, y: args.outwardNormal.x });
    const outwardNormal = normalizeUnitVector(args.outwardNormal, { x: 1, y: 0 });
    const halfEdgeLength = args.edgeLength / 2;
    const corners = [
        addPoint(args.edgeCenter, scaleUnitVector(tangent, -halfEdgeLength)),
        addPoint(args.edgeCenter, scaleUnitVector(tangent, halfEdgeLength)),
    ];

    corners.push(
        addPoint(corners[0], scaleUnitVector(outwardNormal, args.depth)),
        addPoint(corners[1], scaleUnitVector(outwardNormal, args.depth)),
    );

    return {
        maxX: Math.max(...corners.map((corner) => corner.x)) + (AGGREGATOR_OUTLINE_WIDTH_PX / 2),
        maxY: Math.max(...corners.map((corner) => corner.y)) + (AGGREGATOR_OUTLINE_WIDTH_PX / 2),
    };
}

export function resolveAggregatorDepth(scale: number, plannerOptions: PlannerOptions): number {
    return plannerOptions.aggregatorDepth * clampVisualScale(scale);
}

export function normalizeUnitVector(vector: UnitVector, fallback: UnitVector): UnitVector {
    const length = Math.hypot(vector.x, vector.y);

    if (length <= 1e-6) {
        return fallback;
    }

    return {
        x: vector.x / length,
        y: vector.y / length,
    };
}

function addPoint(point: Point, offset: UnitVector): Point {
    return {
        x: point.x + offset.x,
        y: point.y + offset.y,
    };
}

function scaleUnitVector(vector: UnitVector, distance: number): UnitVector {
    return {
        x: vector.x * distance,
        y: vector.y * distance,
    };
}

function resolveSideStroke(side: Side): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}

function clampVisualScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1;
    }

    return Math.min(1, Math.max(0, scale));
}

function resolveDeliveryAggregatorSourceReferencePoint(args: {
    deliveryConnectorVizId: string | undefined;
    snapshot: Snapshot;
    stepProgress: number;
}): Point | undefined {
    if (!args.deliveryConnectorVizId) {
        return undefined;
    }

    const connector = getSnapshotItem(args.snapshot, args.deliveryConnectorVizId);

    if (!connector || connector.type !== "deliveryConnector") {
        return undefined;
    }

    const sourceJunction = getSnapshotItem(args.snapshot, String(connector.sourceJunctionVizId));

    if (sourceJunction?.type === "junction" && resolveTweenBoolean(sourceJunction.visible, args.stepProgress)) {
        return resolveTweenPoint(sourceJunction.position, args.stepProgress);
    }

    const sourceClaimVizId = getSourceClaimVizIdForConfidenceConnector(args.snapshot, connector.confidenceConnectorId);

    if (!sourceClaimVizId) {
        return undefined;
    }

    const sourceClaim = getSnapshotItem(args.snapshot, sourceClaimVizId);

    if (!sourceClaim || sourceClaim.type !== "claim") {
        return undefined;
    }

    return resolveTweenPoint(sourceClaim.position, args.stepProgress);
}

function resolveClaimFallbackReferencePoint(args: {
    claimItem: Extract<VizItem, { type: "claim" }>;
    stepProgress: number;
}): Point {
    const claimPosition = resolveTweenPoint(args.claimItem.position, args.stepProgress);

    return {
        x: claimPosition.x - 1,
        y: claimPosition.y,
    };
}

function getClaimVizForClaimId(snapshot: Snapshot, claimId: DeliveryAggregatorViz["claimId"]) {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "claim" && item.claimId === claimId) {
            return item;
        }
    }

    return undefined;
}

function getSourceClaimVizIdForConfidenceConnector(
    snapshot: Snapshot,
    confidenceConnectorId: string,
): string | undefined {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "confidenceConnector" && item.confidenceConnectorId === confidenceConnectorId) {
            return String(item.sourceClaimVizId);
        }
    }

    return undefined;
}

function getJunctionForConfidenceConnector(
    snapshot: Snapshot,
    confidenceConnectorId: RelevanceAggregatorViz["confidenceConnectorId"],
) {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "junction" && item.confidenceConnectorId === confidenceConnectorId) {
            return item;
        }
    }

    return undefined;
}

function resolveRelevanceAggregatorSide(
    snapshot: Snapshot,
    aggregator: RelevanceAggregatorViz,
): Side | undefined {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "confidenceConnector" && item.confidenceConnectorId === aggregator.confidenceConnectorId) {
            return item.side;
        }
    }

    const firstConnector = getSnapshotItem(snapshot, aggregator.relevanceConnectorVizIds[0] ? String(aggregator.relevanceConnectorVizIds[0]) : "");

    return firstConnector?.type === "relevanceConnector"
        ? firstConnector.side
        : undefined;
}

function getSnapshotItem(snapshot: Snapshot, itemId: string): VizItem | undefined {
    return (snapshot as Partial<Record<string, VizItem>>)[itemId];
}