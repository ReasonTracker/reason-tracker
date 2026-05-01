import type { TweenNumber, TweenPoint } from "../utils.ts";
import type {
    ClaimViz,
    ClaimVizId,
    ConnectorBandPlacement,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    DeliveryConnectorVizId,
    JunctionAggregatorVizId,
    JunctionViz,
    RelevanceConnectorViz,
    Snapshot,
} from "./Snapshot.ts";
import { buildDeliveryStackLayout } from "./deliveryStackLayout.ts";
import {
    buildConfidenceCenterlinePoints,
    getAngularConnectorTurnGuide,
    getPointAtWaypointProgress,
    PROJECTED_CONNECTOR_JUNCTION_PATH_PROGRESS,
    type ConnectorTurnGuide,
    type ProjectedJunctionGeometry,
} from "./projectedConnectorGeometry.ts";
import {
    getPlannerClaimWidth,
    getPlannerPipeWidth,
} from "./plannerVisualGeometry.ts";

export type ResolvedConnectorPoint = {
    x: number;
    y: number;
};

export type ResolvedClaimLayout = {
    centerX: number;
    centerY: number;
    leftX: number;
    rightX: number;
};

export type ResolvedJunctionLayout = ProjectedJunctionGeometry;

export type ResolvedSnapshotScoreFlowLayout = {
    claimLayoutById: ReadonlyMap<ClaimVizId, ResolvedClaimLayout>;
    connectorBandPlacementByConnectorVizId: ReadonlyMap<string, ConnectorBandPlacement>;
    deliveryTargetPointByConnectorVizId: ReadonlyMap<DeliveryConnectorVizId, ResolvedConnectorPoint>;
    deliveryTurnGuideByTargetClaimVizId: ReadonlyMap<ClaimVizId, ConnectorTurnGuide>;
    junctionLayoutByAggregatorVizId: ReadonlyMap<JunctionAggregatorVizId, ResolvedJunctionLayout>;
    junctionLayoutById: ReadonlyMap<string, ResolvedJunctionLayout>;
};

export function buildResolvedSnapshotScoreFlowLayout(args: {
    snapshot: Snapshot;
    percent: number;
}): ResolvedSnapshotScoreFlowLayout {
    const claimLayoutById = new Map<ClaimVizId, ResolvedClaimLayout>();
    const connectorBandPlacementByConnectorVizId = buildConnectorBandPlacementByConnectorVizId(args.snapshot);

    for (const visual of Object.values(args.snapshot.claims)) {
        claimLayoutById.set(visual.id, resolveClaimLayout(visual, args.percent));
    }

    const deliveryTargetPointByConnectorVizId = buildDeliveryTargetPointByConnectorVizId({
        claimAggregators: args.snapshot.claimAggregators,
        claimLayoutById,
        deliveryConnectors: args.snapshot.deliveryConnectors,
        percent: args.percent,
    });
    const {
        junctionLayoutByAggregatorVizId,
        junctionLayoutById,
    } = buildResolvedJunctionLayoutMaps({
        claimLayoutById,
        deliveryTargetPointByConnectorVizId,
        percent: args.percent,
        snapshot: args.snapshot,
    });
    const deliveryTurnGuideByTargetClaimVizId = buildDeliveryTurnGuideByTargetClaimVizId({
        deliveryConnectors: args.snapshot.deliveryConnectors,
        deliveryTargetPointByConnectorVizId,
        junctionLayoutById,
        percent: args.percent,
    });

    return {
        claimLayoutById,
        connectorBandPlacementByConnectorVizId,
        deliveryTargetPointByConnectorVizId,
        deliveryTurnGuideByTargetClaimVizId,
        junctionLayoutByAggregatorVizId,
        junctionLayoutById,
    };
}

export function usesVisibleDeliveryJunctionSource(
    sourceJunction: ResolvedJunctionLayout | undefined,
): sourceJunction is ResolvedJunctionLayout {
    return !!sourceJunction && sourceJunction.width > 0;
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

function buildResolvedJunctionLayoutMaps(args: {
    claimLayoutById: ReadonlyMap<ClaimVizId, ResolvedClaimLayout>;
    deliveryTargetPointByConnectorVizId: ReadonlyMap<DeliveryConnectorVizId, ResolvedConnectorPoint>;
    percent: number;
    snapshot: Snapshot;
}): {
    junctionLayoutByAggregatorVizId: ReadonlyMap<JunctionAggregatorVizId, ResolvedJunctionLayout>;
    junctionLayoutById: ReadonlyMap<string, ResolvedJunctionLayout>;
} {
    const confidenceConnectorByScoreNodeKey = new Map<string, ConfidenceConnectorViz>();
    const confidenceConnectorByConfidenceConnectorKey = new Map<string, ConfidenceConnectorViz>();
    const deliveryConnectorByScoreNodeKey = new Map<string, DeliveryConnectorViz>();
    const deliveryConnectorByConfidenceConnectorKey = new Map<string, DeliveryConnectorViz>();
    const junctionLayoutById = new Map<string, ResolvedJunctionLayout>();
    const junctionLayoutByAggregatorVizId = new Map<JunctionAggregatorVizId, ResolvedJunctionLayout>();

    for (const visual of Object.values(args.snapshot.confidenceConnectors)) {
        if (visual.scoreNodeId) {
            confidenceConnectorByScoreNodeKey.set(String(visual.scoreNodeId), visual);
        }

        if (visual.confidenceConnectorId) {
            confidenceConnectorByConfidenceConnectorKey.set(String(visual.confidenceConnectorId), visual);
        }
    }

    for (const visual of Object.values(args.snapshot.deliveryConnectors)) {
        if (visual.scoreNodeId) {
            deliveryConnectorByScoreNodeKey.set(String(visual.scoreNodeId), visual);
        }

        if (visual.confidenceConnectorId) {
            deliveryConnectorByConfidenceConnectorKey.set(String(visual.confidenceConnectorId), visual);
        }
    }

    for (const visual of Object.values(args.snapshot.junctions)) {
        const fallbackLayout = resolveJunctionLayoutFromVisual(visual, args.percent);
        const confidenceConnector = (visual.scoreNodeId
            ? confidenceConnectorByScoreNodeKey.get(String(visual.scoreNodeId))
            : undefined)
            ?? (visual.confidenceConnectorId
                ? confidenceConnectorByConfidenceConnectorKey.get(String(visual.confidenceConnectorId))
                : undefined);
        const deliveryConnector = (visual.scoreNodeId
            ? deliveryConnectorByScoreNodeKey.get(String(visual.scoreNodeId))
            : undefined)
            ?? (visual.confidenceConnectorId
                ? deliveryConnectorByConfidenceConnectorKey.get(String(visual.confidenceConnectorId))
                : undefined);
        const sourceClaim = confidenceConnector
            ? args.claimLayoutById.get(confidenceConnector.sourceClaimVizId)
            : undefined;
        const targetPoint = deliveryConnector
            ? args.deliveryTargetPointByConnectorVizId.get(deliveryConnector.id)
            : undefined;
        const resolvedLayout = sourceClaim && targetPoint && confidenceConnector
            ? {
                ...fallbackLayout,
                ...resolveJunctionCenter({
                    confidenceConnector,
                    percent: args.percent,
                    sourceClaim,
                    targetPoint,
                }),
            }
            : fallbackLayout;

        junctionLayoutById.set(String(visual.id), resolvedLayout);
        junctionLayoutByAggregatorVizId.set(visual.junctionAggregatorVizId, resolvedLayout);
    }

    return {
        junctionLayoutByAggregatorVizId,
        junctionLayoutById,
    };
}

function resolveJunctionCenter(args: {
    confidenceConnector: ConfidenceConnectorViz;
    percent: number;
    sourceClaim: ResolvedClaimLayout;
    targetPoint: ResolvedConnectorPoint;
}): Pick<ResolvedJunctionLayout, "centerX" | "centerY"> {
    const sourcePipeWidth = getPlannerPipeWidth(
        Math.max(0, resolveTweenNumber(args.confidenceConnector.scale, args.percent)),
    );
    const center = getPointAtWaypointProgress(
        buildConfidenceCenterlinePoints(
            {
                x: args.sourceClaim.leftX,
                y: args.sourceClaim.centerY,
            },
            args.targetPoint,
            sourcePipeWidth,
        ),
        PROJECTED_CONNECTOR_JUNCTION_PATH_PROGRESS,
    );

    return {
        centerX: center.x,
        centerY: center.y,
    };
}

function resolveJunctionLayoutFromVisual(visual: JunctionViz, percent: number): ResolvedJunctionLayout {
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
    deliveryConnectors: Snapshot["deliveryConnectors"];
    deliveryTargetPointByConnectorVizId: ReadonlyMap<DeliveryConnectorVizId, ResolvedConnectorPoint>;
    junctionLayoutById: ReadonlyMap<string, ResolvedJunctionLayout>;
    percent: number;
}): ReadonlyMap<ClaimVizId, ConnectorTurnGuide> {
    const turnGuideByTargetClaimVizId = new Map<ClaimVizId, ConnectorTurnGuide>();

    for (const visual of Object.values(args.deliveryConnectors)) {
        const sourceJunction = args.junctionLayoutById.get(String(visual.sourceJunctionVizId));

        if (!usesVisibleDeliveryJunctionSource(sourceJunction)) {
            continue;
        }

        const source = {
            x: sourceJunction.centerX - (sourceJunction.width / 2),
            y: sourceJunction.centerY,
        };
        const target = args.deliveryTargetPointByConnectorVizId.get(visual.id);

        if (!target) {
            continue;
        }

        const guide = getAngularConnectorTurnGuide(
            source,
            target,
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

function buildDeliveryTargetPointByConnectorVizId(args: {
    claimAggregators: Snapshot["claimAggregators"];
    claimLayoutById: ReadonlyMap<ClaimVizId, ResolvedClaimLayout>;
    deliveryConnectors: Snapshot["deliveryConnectors"];
    percent: number;
}): ReadonlyMap<DeliveryConnectorVizId, ResolvedConnectorPoint> {
    const stableOrderByConnectorVizId = new Map<DeliveryConnectorVizId, number>();

    for (const claimAggregator of Object.values(args.claimAggregators)) {
        claimAggregator.deliveryConnectorVizIds.forEach((connectorVizId, index) => {
            if (!stableOrderByConnectorVizId.has(connectorVizId)) {
                stableOrderByConnectorVizId.set(connectorVizId, index);
            }
        });
    }

    const members = Object.values(args.deliveryConnectors).flatMap((visual, index) => {
        const sourceClaim = args.claimLayoutById.get(visual.sourceClaimVizId);
        const targetClaim = args.claimLayoutById.get(visual.targetClaimVizId);

        if (!sourceClaim || !targetClaim) {
            return [];
        }

        return [{
            id: visual.id,
            sourceCenterY: sourceClaim.centerY,
            stackHeight: getPlannerPipeWidth(Math.max(0, resolveTweenNumber(visual.scale, args.percent)))
                * clampConnectorScore(resolveTweenNumber(visual.score, args.percent)),
            stableOrder: stableOrderByConnectorVizId.get(visual.id) ?? index,
            targetCenterY: targetClaim.centerY,
            targetId: visual.targetClaimVizId,
        }];
    });
    const stackLayout = buildDeliveryStackLayout(members);
    const targetPointByConnectorVizId = new Map<DeliveryConnectorVizId, ResolvedConnectorPoint>();

    for (const visual of Object.values(args.deliveryConnectors)) {
        const targetClaim = args.claimLayoutById.get(visual.targetClaimVizId);

        if (!targetClaim) {
            continue;
        }

        targetPointByConnectorVizId.set(visual.id, {
            x: targetClaim.rightX,
            y: stackLayout.centerYById.get(visual.id) ?? targetClaim.centerY,
        });
    }

    return targetPointByConnectorVizId;
}

function clampConnectorScore(score: number): number {
    if (!Number.isFinite(score)) {
        return 0;
    }

    return Math.min(1, Math.max(0, score));
}

function buildConnectorBandPlacementByConnectorVizId(snapshot: Snapshot): ReadonlyMap<string, ConnectorBandPlacement> {
    const connectorBandPlacementByConnectorVizId = new Map<string, ConnectorBandPlacement>();

    for (const visual of Object.values(snapshot.confidenceConnectors)) {
        connectorBandPlacementByConnectorVizId.set(String(visual.id), resolveConnectorBandPlacement(visual));
    }

    for (const visual of Object.values(snapshot.deliveryConnectors)) {
        connectorBandPlacementByConnectorVizId.set(String(visual.id), resolveConnectorBandPlacement(visual));
    }

    for (const visual of Object.values(snapshot.relevanceConnectors)) {
        connectorBandPlacementByConnectorVizId.set(String(visual.id), resolveConnectorBandPlacement(visual));
    }

    return connectorBandPlacementByConnectorVizId;
}

function resolveConnectorBandPlacement(
    visual: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz,
): ConnectorBandPlacement {
    return visual.bandPlacement ?? "lowerSide";
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