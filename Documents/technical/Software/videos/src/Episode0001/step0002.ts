//** This step is the voila for c2 */

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
} from "./applyDebateSnapshotRenderStatePatch";
import {
    leftPad,
    layerWidth,
    mainClaimAggregatorVizId,
    mainClaimId,
    mainClaimRightEdgePosition,
    mainClaimVizId,
    mainSupportDeliveryConnectorVizId,
    step0001RenderState,
} from "./step0001";

const step0002BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0001RenderState);

const c2ClaimId = "claim-c2" as ClaimId;
const c2ConfidenceConnectorId = "confidence-main-c2" as ConfidenceConnectorId;

const c2ClaimVizId = "claim-viz-c2" as ClaimVizId;
const c2ClaimAggregatorVizId = "claim-aggregator-viz-c2" as ClaimAggregatorVizId;
const c2JunctionAggregatorVizId = "junction-aggregator-viz-c2" as JunctionAggregatorVizId;
const c2JunctionVizId = "junction-viz-c2" as JunctionVizId;
const c2ConfidenceConnectorVizId = "confidence-connector-viz-c2" as ConfidenceConnectorVizId;
const c2DeliveryConnectorVizId = "delivery-connector-viz-c2" as DeliveryConnectorVizId;

const claimHalfWidth = 180;
const claim2Scale = .5;
const rightColumnClaimCenterX = leftPad + layerWidth * 2;
const leftJustifiedClaimLeftX = rightColumnClaimCenterX - claimHalfWidth;
const leftJustifiedScaledClaimCenterX = leftJustifiedClaimLeftX + (claimHalfWidth * claim2Scale);
const c2ClaimPosition = { x: leftJustifiedScaledClaimCenterX, y: 360 };
const c2ClaimAggregatorPosition = { x: leftPad + (layerWidth * claim2Scale) * 2, y: 440 };
const c2ClaimLeftEdgePosition = { x: leftJustifiedClaimLeftX, y: c2ClaimPosition.y };


export const step0002RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0002BaseRenderState, {
    debateCore: {
        claims: {
            [c2ClaimId]: {
                id: c2ClaimId,
                content: "C2",
            },
        },
        connectors: {
            [c2ConfidenceConnectorId]: {
                id: c2ConfidenceConnectorId,
                type: "confidence",
                source: c2ClaimId,
                targetClaimId: mainClaimId,
                targetRelationship: "conTarget",
            },
        },
    },
    snapshot: {
        [mainClaimAggregatorVizId]: {
            id: mainClaimAggregatorVizId,
            deliveryConnectorVizIds: [
                mainSupportDeliveryConnectorVizId,
                c2DeliveryConnectorVizId,
            ],
        },
        [c2ClaimVizId]: {
            type: "claim",
            id: c2ClaimVizId,
            claimId: c2ClaimId,
            position: c2ClaimPosition,
            scale: {
                type: "tween/number",
                from: 0,
                to: .5,
            },
            scourcesScale: 1,
            score: 1,
            side: "conMain",
        },
        [c2ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c2ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c2ClaimId,
            deliveryConnectorVizIds: [],
            position: c2ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c2JunctionVizId]: {
            type: "junction",
            id: c2JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c2ConfidenceConnectorId,
            junctionAggregatorVizId: c2JunctionAggregatorVizId,
            position: c2ClaimLeftEdgePosition,
            scale: 1,
            visible: false,
        },
        [c2JunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: c2JunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: c2ConfidenceConnectorId,
            position: c2ClaimLeftEdgePosition,
            relevanceConnectorVizIds: [],
            scale: 1,
            score: 1,
            visible: false,
        },
        [c2ConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: c2ConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c2ConfidenceConnectorId,
            sourceClaimVizId: c2ClaimVizId,
            targetJunctionVizId: c2JunctionVizId,
            visible: false,
            scale: 1,
            score: 1,
            side: "conMain",
            direction: "sourceToTarget",
            source: c2ClaimLeftEdgePosition,
            target: c2ClaimLeftEdgePosition,
        },
        [c2DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c2DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c2ConfidenceConnectorId,
            sourceJunctionVizId: c2JunctionVizId,
            targetClaimVizId: mainClaimVizId,
            scale: 0,
            score: 0,
            side: "conMain",
            direction: "sourceToTarget",
            source: c2ClaimLeftEdgePosition,
            target: mainClaimRightEdgePosition,
            targetSideOffset: 0,
        },
    },
});