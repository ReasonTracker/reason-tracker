//** This step is just the initial state, nothign should happen */
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

export const mainClaimId = "claim-main" as ClaimId;
const c1ClaimId = "claim-c1" as ClaimId;
export const mainSupportConfidenceConnectorId = "confidence-main-support" as ConfidenceConnectorId;

export const mainClaimVizId = "claim-viz-main" as ClaimVizId;
const c1ClaimVizId = "claim-viz-c1" as ClaimVizId;
export const mainClaimAggregatorVizId = "claim-aggregator-viz-main" as ClaimAggregatorVizId;
const c1ClaimAggregatorVizId = "claim-aggregator-viz-c1" as ClaimAggregatorVizId;
const mainSupportJunctionAggregatorVizId = "junction-aggregator-viz-main-support" as JunctionAggregatorVizId;
export const mainSupportJunctionVizId = "junction-viz-main-support" as JunctionVizId;
const mainSupportConfidenceConnectorVizId = "confidence-connector-viz-main-support" as ConfidenceConnectorVizId;
export const mainSupportDeliveryConnectorVizId = "delivery-connector-viz-main-support" as DeliveryConnectorVizId;

export const leftPad = 500;
export const layerWidth = 500;
const claimHalfWidth = 180;
export const fullScalePipeWidth = 176;

export const mainClaimPosition = { x: leftPad, y: 180 };
export const mainClaimAggregatorPosition = { x: leftPad, y: 260 };
const c1ClaimPosition = { x: leftPad + layerWidth * 2, y: 180 };
const c1ClaimAggregatorPosition = { x: leftPad + layerWidth * 2, y: 260 };
export const mainClaimRightEdgePosition = { x: mainClaimPosition.x + claimHalfWidth, y: mainClaimPosition.y };
export const mainSupportSourcePosition = { x: c1ClaimPosition.x - claimHalfWidth, y: c1ClaimPosition.y };

export const step0001RenderState: DebateSnapshotRenderState = {
    debateCore: {
        id: "debate-1" as DebateSnapshotRenderState["debateCore"]["id"],
        description: "Debate state shared by planner tests.",
        name: "Planner Test Debate",
        mainClaimId,
        claims: {
            [mainClaimId]: {
                id: mainClaimId,
                content: "Main claim",
            },
            [c1ClaimId]: {
                id: c1ClaimId,
                content: "C1",
            },
        },
        connectors: {
            [mainSupportConfidenceConnectorId]: {
                id: mainSupportConfidenceConnectorId,
                type: "confidence",
                source: c1ClaimId,
                targetClaimId: mainClaimId,
                targetRelationship: "proTarget",
            },
        },
    },
    snapshot: {
        [mainClaimVizId]: {
            type: "claim",
            id: mainClaimVizId,
            claimId: mainClaimId,
            position: mainClaimPosition,
            scale: 1,
            scourcesScale: 1,
            score: 1,
            side: "proMain",
        },
        [c1ClaimVizId]: {
            type: "claim",
            id: c1ClaimVizId,
            claimId: c1ClaimId,
            position: c1ClaimPosition,
            scale: 1,
            scourcesScale: 1,
            score: 1,
            side: "proMain",
        },
        [mainClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: mainClaimAggregatorVizId,
            animationType: "uniform",
            claimId: mainClaimId,
            deliveryConnectorVizIds: [mainSupportDeliveryConnectorVizId],
            position: mainClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c1ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c1ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c1ClaimId,
            deliveryConnectorVizIds: [],
            position: c1ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [mainSupportJunctionVizId]: {
            type: "junction",
            id: mainSupportJunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: mainSupportConfidenceConnectorId,
            junctionAggregatorVizId: mainSupportJunctionAggregatorVizId,
            position: mainSupportSourcePosition,
            outgoingConfidenceScale: fullScalePipeWidth,
            incomingConfidenceScale: fullScalePipeWidth,
            incomingRelevanceScale: fullScalePipeWidth,
            visible: false,
        },
        [mainSupportJunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: mainSupportJunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: mainSupportConfidenceConnectorId,
            position: mainSupportSourcePosition,
            relevanceConnectorVizIds: [],
            scale: 1,
            score: 1,
            visible: false,
        },
        [mainSupportConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: mainSupportConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: mainSupportConfidenceConnectorId,
            sourceClaimVizId: c1ClaimVizId,
            targetJunctionVizId: mainSupportJunctionVizId,
            visible: false,
            scale: 1,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
        },
        [mainSupportDeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: mainSupportDeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: mainSupportConfidenceConnectorId,
            sourceJunctionVizId: mainSupportJunctionVizId,
            targetClaimVizId: mainClaimVizId,
            scale: 1,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
            targetSideOffset: 0,
        },
    },
};