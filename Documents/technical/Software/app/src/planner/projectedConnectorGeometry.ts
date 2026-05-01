import type { SnapshotWaypoint } from "./Snapshot.ts";
import { getPlannerPipeWidth } from "./plannerVisualGeometry.ts";
import type { TweenNumber, TweenPoint } from "../utils.ts";

// AGENT NOTE: Keep planner-owned connector routing tunables grouped here so
// projection and rendering stay on one geometry contract.
/** Preferred share of the horizontal connector span kept as a straight stub before each bend. */
const CONNECTOR_STUB_SHARE_OF_HORIZONTAL_SPAN = 0.2;
/** Preferred share of the geometry-allowed bend radius for diagonal connectors. */
const CONNECTOR_BEND_RADIUS_SHARE_OF_AVAILABLE_MAX = 1;
/** Largest end-to-end vertical delta still treated as a direct connector instead of an angled route. */
const MAX_STRAIGHT_CONNECTOR_VERTICAL_DELTA_PX = 1;
/** Shortest horizontal run kept before a connector turns into its diagonal middle section. */
const MIN_CONNECTOR_STRAIGHT_PX = 34;
/** Smallest diagonal run preserved between the two connector stubs. */
const MIN_CONNECTOR_DIAGONAL_PX = 36;
/** Smallest centerline bend radius retained before pipe width is considered. */
const MIN_CONNECTOR_BEND_RADIUS_PX = 12;
/** Minimum inner bend radius as a fraction of the rendered pipe width. */
const MIN_CONNECTOR_INNER_BEND_RADIUS_RATIO = 0.3;
/** Smallest visible bulge worth keeping before an angular bend falls back to sharp bend points. */
const MIN_RENDERABLE_ANGULAR_BEND_SAGITTA_PX = 0.1;

/** Position of a connector junction along its confidence connector, measured from source claim to target claim. */
export const PROJECTED_CONNECTOR_JUNCTION_PATH_PROGRESS = 0.2;

export type ConnectorTurnGuide = {
    preferredBendRadius: number;
    returnTurnX: number;
    turnStartX: number;
};

export type ProjectedJunctionGeometry = {
    centerX: number;
    centerY: number;
    leftHeight: number;
    rightHeight: number;
    width: number;
};

type AngularConnectorBendPoints = {
    bendEnd: { x: number; y: number };
    bendStart: { x: number; y: number };
    endStraightLength: number;
    startStraightLength: number;
};

type AngularConnectorBendGeometry = {
    bendPoints: AngularConnectorBendPoints;
    bendRadius: number;
    diagonalTurnAngleRadians: number;
};

export function buildRelevanceConnectorCenterlinePoints(
    source: TweenPoint,
    target: TweenPoint,
    junction: ProjectedJunctionGeometry,
    pipeWidth: number,
): SnapshotWaypoint[] {
    const sourceX = readPointX(source);
    const sourceY = readPointY(source);
    const targetX = readPointX(target);
    const targetY = readPointY(target);
    const fromAbove = sourceY < junction.centerY;
    const edgeDeltaY = getProjectedJunctionRelevanceEdgeDeltaY(junction, fromAbove);
    const cornerX = targetX + ((edgeDeltaY * (targetY - sourceY)) / Math.max(1e-6, junction.width));

    if (Math.abs(sourceY - targetY) <= 1 || cornerX >= sourceX - 1) {
        return [
            createWaypoint({ x: sourceX, y: sourceY }),
            createWaypoint({ x: targetX, y: targetY }),
        ];
    }

    return [
        createWaypoint({ x: sourceX, y: sourceY }),
        createWaypoint({
            x: cornerX,
            y: sourceY,
            radius: resolveOrthogonalConnectorBendRadius(
                { x: sourceX, y: sourceY },
                { x: cornerX, y: targetY },
                pipeWidth,
            ),
        }),
        createWaypoint({ x: targetX, y: targetY }),
    ];
}

export function buildConfidenceCenterlinePoints(
    source: TweenPoint,
    target: TweenPoint,
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): SnapshotWaypoint[] {
    return buildAngularConnectorCenterlinePoints(source, target, pipeWidth, turnGuide);
}

export function buildAngularConnectorCenterlinePoints(
    source: TweenPoint,
    target: TweenPoint,
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): SnapshotWaypoint[] {
    const startPoint = { x: readPointX(source), y: readPointY(source) };
    const endPoint = { x: readPointX(target), y: readPointY(target) };

    if (shouldUseStraightAngularConnector(startPoint, endPoint)) {
        return [createWaypoint(startPoint), createWaypoint(endPoint)];
    }

    const bendGeometry = resolveAngularConnectorBendGeometry(startPoint, endPoint, pipeWidth, turnGuide);

    if (!bendGeometry) {
        return [createWaypoint(startPoint), createWaypoint(endPoint)];
    }

    if (!shouldRoundAngularConnectorBends(bendGeometry)) {
        return buildAngularConnectorSharpBendWaypoints(startPoint, bendGeometry.bendPoints, endPoint);
    }

    return [
        createWaypoint(startPoint),
        createWaypoint({ ...bendGeometry.bendPoints.bendStart, radius: bendGeometry.bendRadius }),
        createWaypoint({ ...bendGeometry.bendPoints.bendEnd, radius: bendGeometry.bendRadius }),
        createWaypoint(endPoint),
    ];
}

export function buildProjectedConnectorJunction(args: {
    center: { x: number; y: number };
    deliveryPipeWidth: number;
    relevancePipeWidth: number;
    sourcePipeWidth: number;
}): ProjectedJunctionGeometry {
    return {
        centerX: args.center.x,
        centerY: args.center.y,
        leftHeight: args.deliveryPipeWidth,
        rightHeight: args.sourcePipeWidth,
        width: args.relevancePipeWidth,
    };
}

export function getPointAtWaypointProgress(
    waypoints: readonly SnapshotWaypoint[],
    progress: number,
): { x: number; y: number } {
    if (waypoints.length <= 1) {
        const firstWaypoint = waypoints[0];
        return firstWaypoint
            ? { x: readTweenNumber(firstWaypoint.x), y: readTweenNumber(firstWaypoint.y) }
            : { x: 0, y: 0 };
    }

    const clampedProgress = Math.min(1, Math.max(0, progress));
    const segmentLengths = waypoints.slice(1).map((point, index) => {
        const previousPoint = waypoints[index];
        return Math.hypot(
            readTweenNumber(point.x) - readTweenNumber(previousPoint.x),
            readTweenNumber(point.y) - readTweenNumber(previousPoint.y),
        );
    });
    const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);

    if (totalLength <= 1e-6) {
        return {
            x: readTweenNumber(waypoints[0]!.x),
            y: readTweenNumber(waypoints[0]!.y),
        };
    }

    const targetLength = totalLength * clampedProgress;
    let traversedLength = 0;

    for (let index = 1; index < waypoints.length; index += 1) {
        const segmentLength = segmentLengths[index - 1] ?? 0;

        if (traversedLength + segmentLength < targetLength) {
            traversedLength += segmentLength;
            continue;
        }

        const segmentStart = waypoints[index - 1]!;
        const segmentEnd = waypoints[index]!;
        const segmentProgress = segmentLength <= 1e-6
            ? 0
            : (targetLength - traversedLength) / segmentLength;

        return {
            x: readTweenNumber(segmentStart.x)
                + ((readTweenNumber(segmentEnd.x) - readTweenNumber(segmentStart.x)) * segmentProgress),
            y: readTweenNumber(segmentStart.y)
                + ((readTweenNumber(segmentEnd.y) - readTweenNumber(segmentStart.y)) * segmentProgress),
        };
    }

    const finalWaypoint = waypoints.at(-1)!;
    return {
        x: readTweenNumber(finalWaypoint.x),
        y: readTweenNumber(finalWaypoint.y),
    };
}

export function getProjectedJunctionRelevanceTargetPoint(
    junction: ProjectedJunctionGeometry,
    fromAbove: boolean,
): { x: number; y: number } {
    return {
        x: junction.centerX,
        y: fromAbove
            ? ((junction.centerY - (junction.leftHeight / 2)) + (junction.centerY - (junction.rightHeight / 2))) / 2
            : ((junction.centerY + (junction.leftHeight / 2)) + (junction.centerY + (junction.rightHeight / 2))) / 2,
    };
}

export function getAngularConnectorTurnGuide(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
): ConnectorTurnGuide | undefined {
    if (shouldUseStraightAngularConnector(startPoint, endPoint)) {
        return undefined;
    }

    const bendGeometry = resolveAngularConnectorBendGeometry(startPoint, endPoint, pipeWidth, undefined);

    return bendGeometry
        ? {
            preferredBendRadius: shouldRoundAngularConnectorBends(bendGeometry)
                ? bendGeometry.bendRadius
                : 0,
            returnTurnX: bendGeometry.bendPoints.bendEnd.x,
            turnStartX: bendGeometry.bendPoints.bendStart.x,
        }
        : undefined;
}

function buildAngularConnectorSharpBendWaypoints(
    startPoint: { x: number; y: number },
    bendPoints: AngularConnectorBendPoints,
    endPoint: { x: number; y: number },
): SnapshotWaypoint[] {
    return [
        createWaypoint(startPoint),
        createWaypoint(bendPoints.bendStart),
        createWaypoint(bendPoints.bendEnd),
        createWaypoint(endPoint),
    ];
}

function resolveAngularConnectorBendGeometry(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
    turnGuide: ConnectorTurnGuide | undefined,
): AngularConnectorBendGeometry | undefined {
    const bendPoints = resolveAngularConnectorBendPoints(startPoint, endPoint, pipeWidth, turnGuide);

    if (!bendPoints) {
        return undefined;
    }

    const diagonalDeltaX = Math.abs(bendPoints.bendStart.x - bendPoints.bendEnd.x);
    const diagonalDeltaY = Math.abs(bendPoints.bendStart.y - bendPoints.bendEnd.y);
    const diagonalTurnAngleRadians = Math.atan2(diagonalDeltaY, diagonalDeltaX);

    return {
        bendPoints,
        bendRadius: resolveDiagonalConnectorBendRadius(
            bendPoints.startStraightLength,
            bendPoints.endStraightLength,
            Math.hypot(diagonalDeltaX, diagonalDeltaY),
            diagonalTurnAngleRadians,
            getMinimumCenterlineBendRadius(pipeWidth),
            turnGuide?.preferredBendRadius,
        ),
        diagonalTurnAngleRadians,
    };
}

function shouldUseStraightAngularConnector(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
): boolean {
    return Math.abs(startPoint.y - endPoint.y) <= MAX_STRAIGHT_CONNECTOR_VERTICAL_DELTA_PX;
}

function shouldRoundAngularConnectorBends(
    bendGeometry: AngularConnectorBendGeometry,
): boolean {
    if (!Number.isFinite(bendGeometry.bendRadius) || bendGeometry.bendRadius < 8) {
        return false;
    }

    const sagitta = bendGeometry.bendRadius * (1 - Math.cos(bendGeometry.diagonalTurnAngleRadians / 2));
    return sagitta >= MIN_RENDERABLE_ANGULAR_BEND_SAGITTA_PX;
}

function createWaypoint(args: { x: number; y: number; radius?: number }): SnapshotWaypoint {
    return args.radius === undefined
        ? { x: args.x, y: args.y }
        : { x: args.x, y: args.y, radius: args.radius };
}

function resolveAngularConnectorBendPoints(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
    turnGuide: ConnectorTurnGuide | undefined,
): AngularConnectorBendPoints | undefined {
    if (turnGuide) {
        const guidedStartStraightLength = startPoint.x - turnGuide.turnStartX;
        const guidedEndStraightLength = turnGuide.returnTurnX - endPoint.x;

        if (
            guidedStartStraightLength > 1
            && guidedEndStraightLength > 1
            && turnGuide.turnStartX > turnGuide.returnTurnX
        ) {
            return {
                bendEnd: { x: turnGuide.returnTurnX, y: endPoint.y },
                bendStart: { x: turnGuide.turnStartX, y: startPoint.y },
                endStraightLength: guidedEndStraightLength,
                startStraightLength: guidedStartStraightLength,
            };
        }
    }

    const straightSegmentLength = resolveConnectorStraightSegmentLength(
        Math.max(0, startPoint.x - endPoint.x),
        getMinimumCenterlineBendRadius(pipeWidth),
    );

    if (straightSegmentLength <= 1) {
        return undefined;
    }

    return {
        bendEnd: { x: endPoint.x + straightSegmentLength, y: endPoint.y },
        bendStart: { x: startPoint.x - straightSegmentLength, y: startPoint.y },
        endStraightLength: straightSegmentLength,
        startStraightLength: straightSegmentLength,
    };
}

function resolveConnectorStraightSegmentLength(
    horizontalSpan: number,
    minimumCenterlineBendRadius: number,
): number {
    const maximumStraightSegmentLength = Math.max(
        0,
        (horizontalSpan - MIN_CONNECTOR_DIAGONAL_PX) / 2,
    );

    if (maximumStraightSegmentLength <= 0) {
        return 0;
    }

    const preferredStraightSegmentLength = Math.max(
        MIN_CONNECTOR_STRAIGHT_PX,
        minimumCenterlineBendRadius,
        horizontalSpan * CONNECTOR_STUB_SHARE_OF_HORIZONTAL_SPAN,
    );

    return Math.min(preferredStraightSegmentLength, maximumStraightSegmentLength);
}

function resolveDiagonalConnectorBendRadius(
    startStraightLength: number,
    endStraightLength: number,
    diagonalLength: number,
    diagonalTurnAngleRadians: number,
    minimumCenterlineBendRadius: number,
    preferredBendRadius?: number,
): number {
    const maximumBendRadius = getMaximumDiagonalCornerBendRadius(
        startStraightLength,
        endStraightLength,
        diagonalLength,
        diagonalTurnAngleRadians,
    );
    const defaultPreferredBendRadius = maximumBendRadius * CONNECTOR_BEND_RADIUS_SHARE_OF_AVAILABLE_MAX;

    return Math.min(
        Math.max(
            MIN_CONNECTOR_BEND_RADIUS_PX,
            minimumCenterlineBendRadius,
            preferredBendRadius ?? defaultPreferredBendRadius,
        ),
        maximumBendRadius,
    );
}

function getMaximumDiagonalCornerBendRadius(
    startStraightLength: number,
    endStraightLength: number,
    diagonalLength: number,
    diagonalTurnAngleRadians: number,
): number {
    const tangentFactor = Math.tan(diagonalTurnAngleRadians / 2);

    if (tangentFactor <= 1e-6) {
        return 0;
    }

    return Math.min(startStraightLength, endStraightLength, diagonalLength / 2) / tangentFactor;
}

function resolveOrthogonalConnectorBendRadius(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
): number {
    const maximumBendRadius = Math.min(
        Math.abs(startPoint.x - endPoint.x),
        Math.abs(startPoint.y - endPoint.y),
    );

    return Math.min(
        Math.max(MIN_CONNECTOR_BEND_RADIUS_PX, getMinimumCenterlineBendRadius(pipeWidth)),
        maximumBendRadius,
    );
}

function getMinimumCenterlineBendRadius(pipeWidth: number): number {
    return (Math.max(0, pipeWidth) / 2)
        + (Math.max(0, pipeWidth) * MIN_CONNECTOR_INNER_BEND_RADIUS_RATIO);
}

function getProjectedJunctionRelevanceEdgeDeltaY(
    junction: ProjectedJunctionGeometry,
    fromAbove: boolean,
): number {
    return fromAbove
        ? (junction.centerY - (junction.rightHeight / 2)) - (junction.centerY - (junction.leftHeight / 2))
        : (junction.centerY + (junction.rightHeight / 2)) - (junction.centerY + (junction.leftHeight / 2));
}

function readPipeWidth(scale: number): number {
    return getPlannerPipeWidth(scale);
}

function readPointX(point: TweenPoint): number {
    return readTweenNumber(point.x);
}

function readPointY(point: TweenPoint): number {
    return readTweenNumber(point.y);
}

function readTweenNumber(value: TweenNumber): number {
    return typeof value === "number" ? value : value.to;
}