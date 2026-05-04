import type { ClaimId } from "../../../app/src/debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "../../../app/src/debate-core/Connector.ts";
import type { DebateCore } from "../../../app/src/debate-core/Debate.ts";
import type {
    ClaimAggregatorVizId,
    ClaimVizId,
    ConfidenceConnectorVizId,
    DeliveryConnectorVizId,
    JunctionAggregatorVizId,
    JunctionVizId,
    Snapshot,
} from "../../../app/src/planner/Snapshot.ts";

const mainClaimId = "claim-main" as ClaimId;
const existingChildClaimId = "claim-child-existing" as ClaimId;
const mainSupportConfidenceConnectorId = "confidence-main-support" as ConfidenceConnectorId;

const mainClaimVizId = "claim-viz-main" as ClaimVizId;
const existingChildClaimVizId = "claim-viz-child-existing" as ClaimVizId;
const mainClaimAggregatorVizId = "claim-aggregator-viz-main" as ClaimAggregatorVizId;
const existingChildClaimAggregatorVizId = "claim-aggregator-viz-child-existing" as ClaimAggregatorVizId;
const mainSupportJunctionAggregatorVizId = "junction-aggregator-viz-main-support" as JunctionAggregatorVizId;
const mainSupportJunctionVizId = "junction-viz-main-support" as JunctionVizId;
const mainSupportConfidenceConnectorVizId = "confidence-connector-viz-main-support" as ConfidenceConnectorVizId;
const mainSupportDeliveryConnectorVizId = "delivery-connector-viz-main-support" as DeliveryConnectorVizId;

const mainClaimPosition = { x: 640, y: 180 };
const existingChildClaimPosition = { x: 360, y: 360 };

export const sampleDebateCore: DebateCore = {
    id: "debate-1" as DebateCore["id"],
    description: "Debate state shared by planner tests.",
    name: "Planner Test Debate",
    mainClaimId,
    claims: {
        [mainClaimId]: {
            id: mainClaimId,
            content: "Main claim",
        },
        [existingChildClaimId]: {
            id: existingChildClaimId,
            content: "Existing child claim supporting the main claim",
        },
    },
    connectors: {
        [mainSupportConfidenceConnectorId]: {
            id: mainSupportConfidenceConnectorId,
            type: "confidence",
            source: existingChildClaimId,
            targetClaimId: mainClaimId,
            targetRelationship: "proTarget",
        },
    },
};

export const sampleSnapshot: Snapshot = {
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
    [existingChildClaimVizId]: {
        type: "claim",
        id: existingChildClaimVizId,
        claimId: existingChildClaimId,
        position: existingChildClaimPosition,
        scale: 1,
        scourcesScale: 1,
        score: 0.8,
        side: "proMain",
    },
    [mainClaimAggregatorVizId]: {
        type: "claimAggregator",
        id: mainClaimAggregatorVizId,
        animationType: "uniform",
        claimId: mainClaimId,
        deliveryConnectorVizIds: [mainSupportDeliveryConnectorVizId],
        position: { x: 640, y: 260 },
        scale: 1,
        score: 1,
    },
    [existingChildClaimAggregatorVizId]: {
        type: "claimAggregator",
        id: existingChildClaimAggregatorVizId,
        animationType: "uniform",
        claimId: existingChildClaimId,
        deliveryConnectorVizIds: [],
        position: { x: 360, y: 440 },
        scale: 1,
        score: 0.8,
    },
    [mainSupportJunctionVizId]: {
        type: "junction",
        id: mainSupportJunctionVizId,
        animationType: "uniform",
        confidenceConnectorId: mainSupportConfidenceConnectorId,
        junctionAggregatorVizId: mainSupportJunctionAggregatorVizId,
        position: existingChildClaimPosition,
        scale: 1,
        visible: false,
    },
    [mainSupportJunctionAggregatorVizId]: {
        type: "junctionAggregator",
        id: mainSupportJunctionAggregatorVizId,
        animationType: "uniform",
        confidenceConnectorId: mainSupportConfidenceConnectorId,
        position: existingChildClaimPosition,
        relevanceConnectorVizIds: [],
        scale: 1,
        score: 0.8,
        visible: false,
    },
    [mainSupportConfidenceConnectorVizId]: {
        type: "confidenceConnector",
        id: mainSupportConfidenceConnectorVizId,
        animationType: "uniform",
        confidenceConnectorId: mainSupportConfidenceConnectorId,
        sourceClaimVizId: existingChildClaimVizId,
        targetJunctionVizId: mainSupportJunctionVizId,
        visible: false,
        scale: 1,
        score: 0.8,
        side: "proMain",
        source: existingChildClaimPosition,
        target: existingChildClaimPosition,
    },
    [mainSupportDeliveryConnectorVizId]: {
        type: "deliveryConnector",
        id: mainSupportDeliveryConnectorVizId,
        confidenceConnectorId: mainSupportConfidenceConnectorId,
        sourceJunctionVizId: mainSupportJunctionVizId,
        targetClaimVizId: mainClaimVizId,
        scale: 1,
        score: 0.8,
        side: "proMain",
        source: existingChildClaimPosition,
        target: mainClaimPosition,
    },
};