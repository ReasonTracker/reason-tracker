import type { TweenNumber, TweenPoint } from "../utils.ts";
import type {
    ClaimViz,
    ClaimVizId,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    JunctionAggregatorVizId,
    JunctionViz,
    RelevanceConnectorViz,
    Snapshot,
    SnapshotWaypoint,
} from "./Snapshot.ts";
import {
    getPlannerClaimWidth,
    getPlannerPipeWidth,
} from "./plannerVisualGeometry.ts";
import {
    buildAngularConnectorCenterlinePoints,
    buildConfidenceCenterlinePoints,
    buildRelevanceConnectorCenterlinePoints,
    getAngularConnectorTurnGuide,
    getProjectedJunctionRelevanceTargetPoint,
    type ConnectorTurnGuide,
    type ProjectedJunctionGeometry,
} from "./projectedConnectorGeometry.ts";

export type ResolvedConnectorPoint = {
    x: number;
    y: number;
};

export type ResolvedConnectorWaypoint = {
    x: number;
    y: number;
    radius?: number;
};

export type ResolvedSnapshotConnectorGeometry = {
    centerlinePoints: ResolvedConnectorWaypoint[];
    source: ResolvedConnectorPoint;
    target: ResolvedConnectorPoint;
};

type ResolvedClaimLayout = {
    centerX: number;
    centerY: number;
    leftX: number;
    rightX: number;
};

type ResolvedJunctionLayout = ProjectedJunctionGeometry;

export function buildResolvedSnapshotConnectorGeometryById(args: {
    snapshot: Snapshot;
    percent: number;
}): ReadonlyMap<string, ResolvedSnapshotConnectorGeometry> {
    const claimLayoutById = new Map<ClaimVizId, ResolvedClaimLayout>();

    for (const visual of Object.values(args.snapshot.claims)) {
        claimLayoutById.set(visual.id, resolveClaimLayout(visual, args.percent));
    }

    const junctionLayoutById = new Map<string, ResolvedJunctionLayout>();
    const junctionLayoutByAggregatorVizId = new Map<JunctionAggregatorVizId, ResolvedJunctionLayout>();

    for (const visual of Object.values(args.snapshot.junctions)) {
        const layout = resolveJunctionLayout(visual, args.percent);
        junctionLayoutById.set(String(visual.id), layout);
        junctionLayoutByAggregatorVizId.set(visual.junctionAggregatorVizId, layout);
    }

    const deliveryTurnGuideByTargetClaimVizId = buildDeliveryTurnGuideByTargetClaimVizId({
        claimLayoutById,
        deliveryConnectors: args.snapshot.deliveryConnectors,
        percent: args.percent,
    });
    const geometryById = new Map<string, ResolvedSnapshotConnectorGeometry>();

    for (const visual of Object.values(args.snapshot.confidenceConnectors)) {
        const geometry = resolveConfidenceConnectorGeometry({
            claimLayoutById,
            junctionLayoutById,
            percent: args.percent,
            visual,
        });

        if (geometry) {
            geometryById.set(String(visual.id), geometry);
        }
    }

    for (const visual of Object.values(args.snapshot.deliveryConnectors)) {
        const geometry = resolveDeliveryConnectorGeometry({
            claimLayoutById,
            deliveryTurnGuideByTargetClaimVizId,
            junctionLayoutById,
            percent: args.percent,
            visual,
        });

        if (geometry) {
            geometryById.set(String(visual.id), geometry);
        }
    }

    for (const visual of Object.values(args.snapshot.relevanceConnectors)) {
        const geometry = resolveRelevanceConnectorGeometry({
            claimLayoutById,
            junctionLayoutByAggregatorVizId,
            percent: args.percent,
            visual,
        });

        if (geometry) {
            geometryById.set(String(visual.id), geometry);
        }
    }

    return geometryById;
}

function resolveClaimLayout(visual: ClaimViz, percent: number): ResolvedClaimLayout {
    const center = resolveTweenPoint(visual.position, percent);
    const width = getPlannerClaimWidth(Math.max(0, resolveTweenNumber(visual.scale, percent)));

    return {
        centerX: center.x,
        centerY: center.y,
        leftX: center.x - (width / 2),
        rightX: center.x + (width / 2),
    };
}

function resolveJunctionLayout(visual: JunctionViz, percent: number): ResolvedJunctionLayout {
    const center = resolveTweenPoint(visual.position, percent);

    return {
        centerX: center.x,
        centerY: center.y,
        leftHeight: Math.max(0, resolveTweenNumber(visual.leftHeight, percent)),
        rightHeight: Math.max(0, resolveTweenNumber(visual.rightHeight, percent)),
        width: Math.max(0, resolveTweenNumber(visual.width, percent)),
    };
}

function buildDeliveryTurnGuideByTargetClaimVizId(args: {
    claimLayoutById: ReadonlyMap<ClaimVizId, ResolvedClaimLayout>;
    deliveryConnectors: Snapshot["deliveryConnectors"];
    percent: number;
}): ReadonlyMap<ClaimVizId, ConnectorTurnGuide> {
    const turnGuideByTargetClaimVizId = new Map<ClaimVizId, ConnectorTurnGuide>();

    for (const visual of Object.values(args.deliveryConnectors)) {
        if (!visual.sourceClaimVizId) {
            continue;
        }

        const sourceClaim = args.claimLayoutById.get(visual.sourceClaimVizId);
        const targetClaim = args.claimLayoutById.get(visual.targetClaimVizId);

        if (!sourceClaim || !targetClaim) {
            continue;
        }

        const guide = getAngularConnectorTurnGuide(
            {
                x: sourceClaim.leftX,
                y: sourceClaim.centerY,
            },
            {
                x: targetClaim.rightX,
                y: targetClaim.centerY,
            },
            getPlannerPipeWidth(Math.max(0, resolveTweenNumber(visual.scale, args.percent))),
        );

        if (!guide) {
            continue;
        }

        const currentGuide = turnGuideByTargetClaimVizId.get(visual.targetClaimVizId);
        const nextGuide = !currentGuide || guide.turnStartX < currentGuide.turnStartX
            ? guide
            : currentGuide;

        turnGuideByTargetClaimVizId.set(visual.targetClaimVizId, {
            preferredBendRadius: Math.max(currentGuide?.preferredBendRadius ?? 0, guide.preferredBendRadius),
            returnTurnX: nextGuide.returnTurnX,
            turnStartX: nextGuide.turnStartX,
        });
    }

    return turnGuideByTargetClaimVizId;
}

function resolveConfidenceConnectorGeometry(args: {
    claimLayoutById: ReadonlyMap<ClaimVizId, ResolvedClaimLayout>;
    junctionLayoutById: ReadonlyMap<string, ResolvedJunctionLayout>;
    percent: number;
    visual: ConfidenceConnectorViz;
}): ResolvedSnapshotConnectorGeometry | undefined {
    const sourceClaim = args.claimLayoutById.get(args.visual.sourceClaimVizId);
    const targetJunction = args.junctionLayoutById.get(String(args.visual.targetJunctionVizId));

    if (!sourceClaim || !targetJunction) {
        return undefined;
    }

    const source = {
        x: sourceClaim.leftX,
        y: sourceClaim.centerY,
    };
    const target = {
        x: targetJunction.centerX + (targetJunction.width / 2),
        y: targetJunction.centerY,
    };

    return {
        centerlinePoints: toResolvedWaypointList(
            buildConfidenceCenterlinePoints(source, target, getPlannerPipeWidth(resolveTweenNumber(args.visual.scale, args.percent))),
        ),
        source,
        target,
    };
}

function resolveDeliveryConnectorGeometry(args: {
    claimLayoutById: ReadonlyMap<ClaimVizId, ResolvedClaimLayout>;
    deliveryTurnGuideByTargetClaimVizId: ReadonlyMap<ClaimVizId, ConnectorTurnGuide>;
    junctionLayoutById: ReadonlyMap<string, ResolvedJunctionLayout>;
    percent: number;
    visual: DeliveryConnectorViz;
}): ResolvedSnapshotConnectorGeometry | undefined {
    const targetClaim = args.claimLayoutById.get(args.visual.targetClaimVizId);

    if (!targetClaim) {
        return undefined;
    }

    const pipeWidth = getPlannerPipeWidth(resolveTweenNumber(args.visual.scale, args.percent));
    const source = args.visual.sourceClaimVizId
        ? resolveDeliveryClaimSource(args.claimLayoutById.get(args.visual.sourceClaimVizId))
        : resolveDeliveryJunctionSource(args.junctionLayoutById.get(String(args.visual.sourceJunctionVizId)));

    if (!source) {
        return undefined;
    }

    const target = {
        x: targetClaim.rightX,
        y: targetClaim.centerY,
    };
    const centerlinePoints = args.visual.sourceClaimVizId
        ? buildConfidenceCenterlinePoints(
            source,
            target,
            pipeWidth,
            args.deliveryTurnGuideByTargetClaimVizId.get(args.visual.targetClaimVizId),
        )
        : buildAngularConnectorCenterlinePoints(source, target, pipeWidth);

    return {
        centerlinePoints: toResolvedWaypointList(centerlinePoints),
        source,
        target,
    };
}

function resolveDeliveryClaimSource(
    sourceClaim: ResolvedClaimLayout | undefined,
): ResolvedConnectorPoint | undefined {
    if (!sourceClaim) {
        return undefined;
    }

    return {
        x: sourceClaim.leftX,
        y: sourceClaim.centerY,
    };
}

function resolveDeliveryJunctionSource(
    sourceJunction: ResolvedJunctionLayout | undefined,
): ResolvedConnectorPoint | undefined {
    if (!sourceJunction) {
        return undefined;
    }

    return {
        x: sourceJunction.centerX - (sourceJunction.width / 2),
        y: sourceJunction.centerY,
    };
}

function resolveRelevanceConnectorGeometry(args: {
    claimLayoutById: ReadonlyMap<ClaimVizId, ResolvedClaimLayout>;
    junctionLayoutByAggregatorVizId: ReadonlyMap<JunctionAggregatorVizId, ResolvedJunctionLayout>;
    percent: number;
    visual: RelevanceConnectorViz;
}): ResolvedSnapshotConnectorGeometry | undefined {
    const sourceClaim = args.claimLayoutById.get(args.visual.sourceClaimVizId);
    const targetJunction = args.junctionLayoutByAggregatorVizId.get(args.visual.targetJunctionAggregatorVizId);

    if (!sourceClaim || !targetJunction) {
        return undefined;
    }

    const source = {
        x: sourceClaim.leftX,
        y: sourceClaim.centerY,
    };
    const target = getProjectedJunctionRelevanceTargetPoint(targetJunction, source.y < targetJunction.centerY);

    return {
        centerlinePoints: toResolvedWaypointList(
            buildRelevanceConnectorCenterlinePoints(
                source,
                target,
                targetJunction,
                getPlannerPipeWidth(resolveTweenNumber(args.visual.scale, args.percent)),
            ),
        ),
        source,
        target,
    };
}

function toResolvedWaypointList(waypoints: readonly SnapshotWaypoint[]): ResolvedConnectorWaypoint[] {
    return waypoints.map((waypoint) => ({
        x: readTweenNumber(waypoint.x),
        y: readTweenNumber(waypoint.y),
        radius: waypoint.radius === undefined ? undefined : readTweenNumber(waypoint.radius),
    }));
}

function resolveTweenPoint(point: TweenPoint, percent: number): ResolvedConnectorPoint {
    return {
        x: resolveTweenNumber(point.x, percent),
        y: resolveTweenNumber(point.y, percent),
    };
}

function resolveTweenNumber(value: TweenNumber, percent: number): number {
    if (typeof value === "number") {
        return value;
    }

    const clampedPercent = Math.min(1, Math.max(0, Number.isFinite(percent) ? percent : 0));
    return value.from + ((value.to - value.from) * clampedPercent);
}

function readTweenNumber(value: TweenNumber): number {
    return typeof value === "number" ? value : value.to;
}