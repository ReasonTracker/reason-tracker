import type { TweenNumber } from "../utils.ts";
import type {
    ClaimVizId,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    DeliveryConnectorVizId,
    JunctionAggregatorVizId,
    RelevanceConnectorViz,
    Snapshot,
    SnapshotWaypoint,
} from "./Snapshot.ts";
import {
    getPlannerPipeWidth,
} from "./plannerVisualGeometry.ts";
import {
    buildAngularConnectorCenterlinePoints,
    buildConfidenceCenterlinePoints,
    buildRelevanceConnectorCenterlinePoints,
    getProjectedJunctionRelevanceTargetPoint,
    type ConnectorTurnGuide,
} from "./projectedConnectorGeometry.ts";
import {
    buildResolvedSnapshotScoreFlowLayout,
    type ResolvedClaimLayout,
    type ResolvedConnectorPoint,
    type ResolvedJunctionLayout,
    type ResolvedSnapshotScoreFlowLayout,
    usesVisibleDeliveryJunctionSource,
} from "./resolveSnapshotScoreFlowLayout.ts";

export type { ResolvedConnectorPoint, ResolvedSnapshotScoreFlowLayout } from "./resolveSnapshotScoreFlowLayout.ts";

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

export function buildResolvedSnapshotConnectorGeometryById(args: {
    snapshot: Snapshot;
    percent: number;
    resolvedScoreFlowLayout?: ResolvedSnapshotScoreFlowLayout;
}): ReadonlyMap<string, ResolvedSnapshotConnectorGeometry> {
    const resolvedScoreFlowLayout = args.resolvedScoreFlowLayout ?? buildResolvedSnapshotScoreFlowLayout({
        snapshot: args.snapshot,
        percent: args.percent,
    });
    const geometryById = new Map<string, ResolvedSnapshotConnectorGeometry>();

    for (const visual of Object.values(args.snapshot.confidenceConnectors)) {
        const geometry = resolveConfidenceConnectorGeometry({
            claimLayoutById: resolvedScoreFlowLayout.claimLayoutById,
            junctionLayoutById: resolvedScoreFlowLayout.junctionLayoutById,
            percent: args.percent,
            visual,
        });

        if (geometry) {
            geometryById.set(String(visual.id), geometry);
        }
    }

    for (const visual of Object.values(args.snapshot.deliveryConnectors)) {
        const geometry = resolveDeliveryConnectorGeometry({
            claimLayoutById: resolvedScoreFlowLayout.claimLayoutById,
            deliveryTurnGuideByTargetClaimVizId: resolvedScoreFlowLayout.deliveryTurnGuideByTargetClaimVizId,
            deliveryTargetPointByConnectorVizId: resolvedScoreFlowLayout.deliveryTargetPointByConnectorVizId,
            junctionLayoutById: resolvedScoreFlowLayout.junctionLayoutById,
            percent: args.percent,
            visual,
        });

        if (geometry) {
            geometryById.set(String(visual.id), geometry);
        }
    }

    for (const visual of Object.values(args.snapshot.relevanceConnectors)) {
        const geometry = resolveRelevanceConnectorGeometry({
            claimLayoutById: resolvedScoreFlowLayout.claimLayoutById,
            junctionLayoutByAggregatorVizId: resolvedScoreFlowLayout.junctionLayoutByAggregatorVizId,
            percent: args.percent,
            visual,
        });

        if (geometry) {
            geometryById.set(String(visual.id), geometry);
        }
    }

    return geometryById;
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
    deliveryTargetPointByConnectorVizId: ReadonlyMap<DeliveryConnectorVizId, ResolvedConnectorPoint>;
    junctionLayoutById: ReadonlyMap<string, ResolvedJunctionLayout>;
    percent: number;
    visual: DeliveryConnectorViz;
}): ResolvedSnapshotConnectorGeometry | undefined {
    const targetClaim = args.claimLayoutById.get(args.visual.targetClaimVizId);

    if (!targetClaim) {
        return undefined;
    }

    const pipeWidth = getPlannerPipeWidth(resolveTweenNumber(args.visual.scale, args.percent));
    const sourceClaim = args.claimLayoutById.get(args.visual.sourceClaimVizId);
    const sourceJunction = args.junctionLayoutById.get(String(args.visual.sourceJunctionVizId));
    const useJunctionSource = usesVisibleDeliveryJunctionSource(sourceJunction);
    const source = useJunctionSource
        ? resolveDeliveryJunctionSource(sourceJunction)
        : resolveDeliveryClaimSource(sourceClaim);

    if (!source) {
        return undefined;
    }

    const target = args.deliveryTargetPointByConnectorVizId.get(args.visual.id) ?? {
        x: targetClaim.rightX,
        y: targetClaim.centerY,
    };
    const centerlinePoints = useJunctionSource
        ? buildAngularConnectorCenterlinePoints(source, target, pipeWidth)
        : buildConfidenceCenterlinePoints(
            source,
            target,
            pipeWidth,
            args.deliveryTurnGuideByTargetClaimVizId.get(args.visual.targetClaimVizId),
        );

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