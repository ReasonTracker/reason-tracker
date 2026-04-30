import type { TweenBoolean, TweenNumber, TweenPoint } from "../utils.ts";
import type {
    ClaimAggregatorViz,
    ClaimViz,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    JunctionAggregatorViz,
    JunctionViz,
    RelevanceConnectorViz,
    Snapshot,
    SnapshotWaypoint,
} from "./Snapshot.ts";

export function settleSnapshot(snapshot: Snapshot): Snapshot {
    return {
        claims: mapRecord(snapshot.claims, settleClaimViz),
        claimAggregators: mapRecord(snapshot.claimAggregators, settleClaimAggregatorViz),
        junctions: mapRecord(snapshot.junctions, settleJunctionViz),
        junctionAggregators: mapRecord(snapshot.junctionAggregators, settleJunctionAggregatorViz),
        confidenceConnectors: mapRecord(snapshot.confidenceConnectors, settleConfidenceConnectorViz),
        deliveryConnectors: mapRecord(snapshot.deliveryConnectors, settleDeliveryConnectorViz),
        relevanceConnectors: mapRecord(snapshot.relevanceConnectors, settleRelevanceConnectorViz),
    };
}

function mapRecord<TId extends string, TEntity>(
    record: Record<TId, TEntity>,
    settle: (entity: TEntity) => TEntity,
): Record<TId, TEntity> {
    const settled = {} as Record<TId, TEntity>;

    for (const id of Object.keys(record) as TId[]) {
        settled[id] = settle(record[id]!);
    }

    return settled;
}

function settleClaimViz(visual: ClaimViz): ClaimViz {
    return {
        ...visual,
        position: settleTweenPoint(visual.position),
        scale: settleTweenNumber(visual.scale),
        score: settleTweenNumber(visual.score),
    };
}

function settleClaimAggregatorViz(visual: ClaimAggregatorViz): ClaimAggregatorViz {
    return {
        ...visual,
        position: settleTweenPoint(visual.position),
        scale: settleTweenNumber(visual.scale),
        score: settleTweenNumber(visual.score),
    };
}

function settleJunctionViz(visual: JunctionViz): JunctionViz {
    return {
        ...visual,
        position: settleTweenPoint(visual.position),
        leftHeight: settleTweenNumber(visual.leftHeight),
        rightHeight: settleTweenNumber(visual.rightHeight),
        scale: settleTweenNumber(visual.scale),
        visible: settleTweenBoolean(visual.visible),
        width: settleTweenNumber(visual.width),
    };
}

function settleJunctionAggregatorViz(visual: JunctionAggregatorViz): JunctionAggregatorViz {
    return {
        ...visual,
        position: settleTweenPoint(visual.position),
        scale: settleTweenNumber(visual.scale),
        score: settleTweenNumber(visual.score),
        visible: settleTweenBoolean(visual.visible),
    };
}

function settleConfidenceConnectorViz(visual: ConfidenceConnectorViz): ConfidenceConnectorViz {
    return {
        ...visual,
        scale: settleTweenNumber(visual.scale),
        score: settleTweenNumber(visual.score),
        source: settleTweenPoint(visual.source),
        target: settleTweenPoint(visual.target),
        centerlinePoints: visual.centerlinePoints.map(settleSnapshotWaypoint),
        visible: settleTweenBoolean(visual.visible),
    };
}

function settleDeliveryConnectorViz(visual: DeliveryConnectorViz): DeliveryConnectorViz {
    return {
        ...visual,
        scale: settleTweenNumber(visual.scale),
        score: settleTweenNumber(visual.score),
        source: settleTweenPoint(visual.source),
        target: settleTweenPoint(visual.target),
        centerlinePoints: visual.centerlinePoints.map(settleSnapshotWaypoint),
    };
}

function settleRelevanceConnectorViz(visual: RelevanceConnectorViz): RelevanceConnectorViz {
    return {
        ...visual,
        scale: settleTweenNumber(visual.scale),
        score: settleTweenNumber(visual.score),
        source: settleTweenPoint(visual.source),
        target: settleTweenPoint(visual.target),
        centerlinePoints: visual.centerlinePoints.map(settleSnapshotWaypoint),
    };
}

function settleSnapshotWaypoint(waypoint: SnapshotWaypoint): SnapshotWaypoint {
    const radius = waypoint.radius === undefined ? undefined : settleTweenNumber(waypoint.radius);

    return radius === undefined
        ? {
            x: settleTweenNumber(waypoint.x),
            y: settleTweenNumber(waypoint.y),
        }
        : {
            x: settleTweenNumber(waypoint.x),
            y: settleTweenNumber(waypoint.y),
            radius,
        };
}

function settleTweenPoint(point: TweenPoint): TweenPoint {
    return {
        x: settleTweenNumber(point.x),
        y: settleTweenNumber(point.y),
    };
}

function settleTweenBoolean(value: TweenBoolean): TweenBoolean {
    return typeof value === "boolean" ? value : value.to;
}

function settleTweenNumber(value: TweenNumber): TweenNumber {
    return typeof value === "number" ? value : value.to;
}