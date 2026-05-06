import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import type { ClaimId } from "../../../app/src/debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "../../../app/src/debate-core/Connector.ts";
import type {
    DeliveryAggregatorVizId,
    ClaimVizId,
    ConfidenceConnectorVizId,
    DeliveryConnectorVizId,
    RelevanceAggregatorVizId,
    JunctionVizId,
} from "../../../app/src/planner/Snapshot.ts";

import {
    applyDebateSnapshotRenderStatePatch,
    stripDebateSnapshotRenderStateAnimations,
} from "../shared/debateSnapshotRenderStatePatch";
import {
    c1DeliveryAggregatorVizId,
    c1ClaimId,
    c1ClaimRightEdgePosition,
    c4DeliveryConnectorVizId,
    c5DeliveryConnectorVizId,
    c6DeliveryConnectorVizId,
    claimHalfWidth,
    step0001RenderState,
    thirdColumnClaimLeftEdgeX,
    thirdLayerPipeWidth,
    thirdLayerClaimScale,
} from "./step0001";

const step0002BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0001RenderState);

const c7ClaimId = "episode-0002-claim-c7" as ClaimId;
const c7ConfidenceConnectorId = "episode-0002-confidence-c1-c7" as ConfidenceConnectorId;

export const c7ClaimVizId = "episode-0002-claim-viz-c7" as ClaimVizId;
export const c7DeliveryAggregatorVizId = "episode-0002-delivery-aggregator-viz-c7" as DeliveryAggregatorVizId;
export const c7RelevanceAggregatorVizId = "episode-0002-relevance-aggregator-viz-c7" as RelevanceAggregatorVizId;
export const c7JunctionVizId = "episode-0002-junction-viz-c7" as JunctionVizId;
const c7ConfidenceConnectorVizId = "episode-0002-confidence-connector-viz-c7" as ConfidenceConnectorVizId;
export const c7DeliveryConnectorVizId = "episode-0002-delivery-connector-viz-c7" as DeliveryConnectorVizId;

const compactThirdLayerClaimScale = .32;
const c7FinalY = 540;
const c7ClaimPosition = {
    x: thirdColumnClaimLeftEdgeX + (claimHalfWidth * compactThirdLayerClaimScale),
    y: c7FinalY,
};
const c7DeliveryAggregatorPosition = { x: c7ClaimPosition.x, y: c7FinalY + 60 };
const c7ClaimLeftEdgePosition = { x: thirdColumnClaimLeftEdgeX, y: c7FinalY };
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
        [c1DeliveryAggregatorVizId]: {
            id: c1DeliveryAggregatorVizId,
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
                to: compactThirdLayerClaimScale,
            },
            scourcesScale: 1,
            score: 1,
            side: "conMain",
        },
        [c7DeliveryAggregatorVizId]: {
            type: "deliveryAggregator",
            id: c7DeliveryAggregatorVizId,
            animationType: "uniform",
            claimId: c7ClaimId,
            deliveryConnectorVizIds: [],
            position: c7DeliveryAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c7JunctionVizId]: {
            type: "junction",
            id: c7JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c7ConfidenceConnectorId,
            relevanceAggregatorVizId: c7RelevanceAggregatorVizId,
            position: c7ClaimLeftEdgePosition,
            outgoingConfidenceScale: thirdLayerPipeWidth,
            incomingConfidenceScale: thirdLayerPipeWidth,
            incomingRelevanceScale: thirdLayerPipeWidth,
            visible: false,
        },
        [c7RelevanceAggregatorVizId]: {
            type: "relevanceAggregator",
            id: c7RelevanceAggregatorVizId,
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
            targetSideOffset: c7TargetSideOffset,
        },
    },
});