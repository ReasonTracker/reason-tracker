import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import type { ClaimId } from "../../../app/src/debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "../../../app/src/debate-core/Connector.ts";
import type {
    ClaimAggregatorVizId,
    ClaimVizId,
    ConfidenceConnectorVizId,
    DeliveryConnectorVizId,
    JunctionAggregatorVizId,
    JunctionVizId,
} from "../../../app/src/planner/Snapshot.ts";

import {
    applyDebateSnapshotRenderStatePatch,
    stripDebateSnapshotRenderStateAnimations,
} from "../shared/debateSnapshotRenderStatePatch";
import {
    c1ClaimAggregatorVizId,
    c1ClaimId,
    c1ClaimRightEdgePosition,
    c4DeliveryConnectorVizId,
    c5DeliveryConnectorVizId,
    c6DeliveryConnectorVizId,
    claimHalfWidth,
    step0001RenderState,
    thirdColumnClaimLeftEdgeX,
    thirdLayerClaimScale,
} from "./step0001";

const step0002BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0001RenderState);

const c7ClaimId = "episode-0002-claim-c7" as ClaimId;
const c7ConfidenceConnectorId = "episode-0002-confidence-c1-c7" as ConfidenceConnectorId;

export const c7ClaimVizId = "episode-0002-claim-viz-c7" as ClaimVizId;
export const c7ClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-c7" as ClaimAggregatorVizId;
export const c7JunctionAggregatorVizId = "episode-0002-junction-aggregator-viz-c7" as JunctionAggregatorVizId;
export const c7JunctionVizId = "episode-0002-junction-viz-c7" as JunctionVizId;
const c7ConfidenceConnectorVizId = "episode-0002-confidence-connector-viz-c7" as ConfidenceConnectorVizId;
export const c7DeliveryConnectorVizId = "episode-0002-delivery-connector-viz-c7" as DeliveryConnectorVizId;

const c7InitialY = 620;
const c7ClaimPosition = {
    x: thirdColumnClaimLeftEdgeX + (claimHalfWidth * thirdLayerClaimScale),
    y: c7InitialY,
};
const c7ClaimAggregatorPosition = { x: c7ClaimPosition.x, y: c7InitialY + 60 };
const c7ClaimLeftEdgePosition = { x: thirdColumnClaimLeftEdgeX, y: c7InitialY };
const c7TargetSideOffset = 54;

export const step0002RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0002BaseRenderState, {
    debateCore: {
        claims: {
            [c7ClaimId]: {
                id: c7ClaimId,
                content: "C7",
            },
        },
        connectors: {
            [c7ConfidenceConnectorId]: {
                id: c7ConfidenceConnectorId,
                type: "confidence",
                source: c7ClaimId,
                targetClaimId: c1ClaimId,
                targetRelationship: "conTarget",
            },
        },
    },
    snapshot: {
        [c1ClaimAggregatorVizId]: {
            id: c1ClaimAggregatorVizId,
            deliveryConnectorVizIds: [
                c4DeliveryConnectorVizId,
                c5DeliveryConnectorVizId,
                c6DeliveryConnectorVizId,
                c7DeliveryConnectorVizId,
            ],
        },
        [c7ClaimVizId]: {
            type: "claim",
            id: c7ClaimVizId,
            claimId: c7ClaimId,
            position: c7ClaimPosition,
            scale: {
                type: "tween/number",
                from: 0,
                to: thirdLayerClaimScale,
            },
            scourcesScale: 1,
            score: 1,
            side: "conMain",
        },
        [c7ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c7ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c7ClaimId,
            deliveryConnectorVizIds: [],
            position: c7ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c7JunctionVizId]: {
            type: "junction",
            id: c7JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c7ConfidenceConnectorId,
            junctionAggregatorVizId: c7JunctionAggregatorVizId,
            position: c7ClaimLeftEdgePosition,
            scale: 1,
            visible: false,
        },
        [c7JunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: c7JunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: c7ConfidenceConnectorId,
            position: c7ClaimLeftEdgePosition,
            relevanceConnectorVizIds: [],
            scale: 1,
            score: 1,
            visible: false,
        },
        [c7ConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: c7ConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c7ConfidenceConnectorId,
            sourceClaimVizId: c7ClaimVizId,
            targetJunctionVizId: c7JunctionVizId,
            visible: false,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "conMain",
            direction: "sourceToTarget",
            source: c7ClaimLeftEdgePosition,
            target: c7ClaimLeftEdgePosition,
        },
        [c7DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c7DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c7ConfidenceConnectorId,
            sourceJunctionVizId: c7JunctionVizId,
            targetClaimVizId: "episode-0002-claim-viz-c1" as ClaimVizId,
            scale: 0,
            score: 0,
            side: "conMain",
            direction: "sourceToTarget",
            source: c7ClaimLeftEdgePosition,
            target: c1ClaimRightEdgePosition,
            targetSideOffset: c7TargetSideOffset,
        },
    },
});