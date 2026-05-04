import type { ClaimId } from "../../../app/src/debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "../../../app/src/debate-core/Connector.ts";
import { sampleSnapshot } from "./sampleDebateState.ts";
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

const mainClaimVizId = "claim-viz-main" as ClaimVizId;
const mainClaimAggregatorVizId = "claim-aggregator-viz-main" as ClaimAggregatorVizId;
const mainSupportDeliveryConnectorVizId = "delivery-connector-viz-main-support" as DeliveryConnectorVizId;

const voilaConMainClaimId = "claim-child-voila-con-main" as ClaimId;
const voilaConMainConfidenceConnectorId = "confidence-main-voila-con-main" as ConfidenceConnectorId;

const voilaConMainClaimVizId = "claim-viz-child-voila-con-main" as ClaimVizId;
const voilaConMainClaimAggregatorVizId = "claim-aggregator-viz-child-voila-con-main" as ClaimAggregatorVizId;
const voilaConMainJunctionAggregatorVizId = "junction-aggregator-viz-main-voila-con-main" as JunctionAggregatorVizId;
const voilaConMainJunctionVizId = "junction-viz-main-voila-con-main" as JunctionVizId;
const voilaConMainConfidenceConnectorVizId = "confidence-connector-viz-main-voila-con-main" as ConfidenceConnectorVizId;
const voilaConMainDeliveryConnectorVizId = "delivery-connector-viz-main-voila-con-main" as DeliveryConnectorVizId;

const mainClaimPosition = { x: 640, y: 180 };
const voilaConMainClaimPosition = { x: 800, y: 360 };
const voilaConMainClaimAggregatorPosition = { x: 800, y: 440 };

function tweenNumber(from: number, to: number) {
    return {
        type: "tween/number" as const,
        from,
        to,
    };
}

export const sampleVoilaSnapshot: Snapshot = {
    ...sampleSnapshot,
    [mainClaimAggregatorVizId]: {
        type: "claimAggregator",
        id: mainClaimAggregatorVizId,
        animationType: "uniform",
        claimId: mainClaimId,
        deliveryConnectorVizIds: [
            mainSupportDeliveryConnectorVizId,
            voilaConMainDeliveryConnectorVizId,
        ],
        position: { x: 640, y: 260 },
        scale: 1,
        score: 1,
    },
    [voilaConMainClaimVizId]: {
        type: "claim",
        id: voilaConMainClaimVizId,
        claimId: voilaConMainClaimId,
        position: voilaConMainClaimPosition,
        scale: tweenNumber(0, 1),
        scourcesScale: 1,
        score: 0.8,
        side: "conMain",
    },
    [voilaConMainClaimAggregatorVizId]: {
        type: "claimAggregator",
        id: voilaConMainClaimAggregatorVizId,
        animationType: "uniform",
        claimId: voilaConMainClaimId,
        deliveryConnectorVizIds: [],
        position: voilaConMainClaimAggregatorPosition,
        scale: 1,
        score: 0.8,
    },
    [voilaConMainJunctionVizId]: {
        type: "junction",
        id: voilaConMainJunctionVizId,
        animationType: "uniform",
        confidenceConnectorId: voilaConMainConfidenceConnectorId,
        junctionAggregatorVizId: voilaConMainJunctionAggregatorVizId,
        position: voilaConMainClaimPosition,
        scale: 1,
        visible: false,
    },
    [voilaConMainJunctionAggregatorVizId]: {
        type: "junctionAggregator",
        id: voilaConMainJunctionAggregatorVizId,
        animationType: "uniform",
        confidenceConnectorId: voilaConMainConfidenceConnectorId,
        position: voilaConMainClaimPosition,
        relevanceConnectorVizIds: [],
        scale: 1,
        score: 0.8,
        visible: false,
    },
    [voilaConMainConfidenceConnectorVizId]: {
        type: "confidenceConnector",
        id: voilaConMainConfidenceConnectorVizId,
        animationType: "uniform",
        confidenceConnectorId: voilaConMainConfidenceConnectorId,
        sourceClaimVizId: voilaConMainClaimVizId,
        targetJunctionVizId: voilaConMainJunctionVizId,
        visible: false,
        scale: 1,
        score: 0.8,
        side: "conMain",
        source: voilaConMainClaimPosition,
        target: voilaConMainClaimPosition,
    },
    [voilaConMainDeliveryConnectorVizId]: {
        type: "deliveryConnector",
        id: voilaConMainDeliveryConnectorVizId,
        confidenceConnectorId: voilaConMainConfidenceConnectorId,
        sourceJunctionVizId: voilaConMainJunctionVizId,
        targetClaimVizId: mainClaimVizId,
        scale: 1,
        score: 0.8,
        side: "conMain",
        source: voilaConMainClaimPosition,
        target: mainClaimPosition,
    },
};