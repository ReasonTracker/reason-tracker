//** This step is the sprout for c2 */

import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import type { ClaimId } from "../../../app/src/debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "../../../app/src/debate-core/Connector.ts";
import type {
    ClaimVizId,
    DeliveryConnectorVizId,
    JunctionVizId,
} from "../../../app/src/planner/Snapshot.ts";

import { applyDebateSnapshotRenderStatePatch } from "./applyDebateSnapshotRenderStatePatch";
import {
    mainClaimRightEdgePosition,
    mainClaimVizId,
    mainSupportConfidenceConnectorId,
    mainSupportDeliveryConnectorVizId,
    mainSupportJunctionVizId,
    mainSupportSourcePosition,
} from "./step0001";
import { step0002RenderState } from "./step0002";

const c2ClaimId = "claim-c2" as ClaimId;
const c2ConfidenceConnectorId = "confidence-main-c2" as ConfidenceConnectorId;
const c2ClaimVizId = "claim-viz-c2" as ClaimVizId;
const c2DeliveryConnectorVizId = "delivery-connector-viz-c2" as DeliveryConnectorVizId;
const c2JunctionVizId = "junction-viz-c2" as JunctionVizId;

const claimHalfWidth = 180;
const leftPad = 500;
const layerWidth = 500;
const c2ClaimPosition = { x: leftPad + layerWidth * 2, y: 360 };
const c2ClaimLeftEdgePosition = { x: c2ClaimPosition.x - claimHalfWidth, y: c2ClaimPosition.y };
const mainSupportTargetSideOffset = -44;
const c2TargetSideOffset = 88;

export const step0003RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0002RenderState, {
    snapshot: {
        [mainSupportDeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: mainSupportDeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: mainSupportConfidenceConnectorId,
            sourceJunctionVizId: mainSupportJunctionVizId,
            targetClaimVizId: mainClaimVizId,
            scale: {
                type: "tween/number",
                from: 1,
                to: .5,
            },
            score: .1,
            side: "proMain",
            source: mainSupportSourcePosition,
            target: mainClaimRightEdgePosition,
            targetSideOffset: {
                type: "tween/number",
                from: 0,
                to: mainSupportTargetSideOffset,
            },
        },
        [c2ClaimVizId]: {
            type: "claim",
            id: c2ClaimVizId,
            claimId: c2ClaimId,
            position: c2ClaimPosition,
            scale: .5,
            scourcesScale: 1,
            score: 1,
            side: "conMain",
        },
        [c2DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c2DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c2ConfidenceConnectorId,
            sourceJunctionVizId: c2JunctionVizId,
            targetClaimVizId: mainClaimVizId,
            scale: {
                type: "tween/number",
                from: 0,
                to: .5,
            },
            score: 0,
            side: "conMain",
            source: c2ClaimLeftEdgePosition,
            target: mainClaimRightEdgePosition,
            targetSideOffset: c2TargetSideOffset,
        },
    },
});