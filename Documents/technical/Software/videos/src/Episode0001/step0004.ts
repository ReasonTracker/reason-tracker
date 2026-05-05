//** This step is the first fill for c2 */

import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import type { ConfidenceConnectorId } from "../../../app/src/debate-core/Connector.ts";
import type {
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
import { step0003RenderState } from "./step0003";

const c2ConfidenceConnectorId = "confidence-main-c2" as ConfidenceConnectorId;
const c2DeliveryConnectorVizId = "delivery-connector-viz-c2" as DeliveryConnectorVizId;
const c2JunctionVizId = "junction-viz-c2" as JunctionVizId;

const claimHalfWidth = 180;
const leftPad = 500;
const layerWidth = 500;
const c2ClaimPosition = { x: leftPad + layerWidth * 2, y: 360 };
const c2ClaimLeftEdgePosition = { x: c2ClaimPosition.x - claimHalfWidth, y: c2ClaimPosition.y };
const mainSupportTargetSideOffset = -44;
const c2TargetSideOffset = 88;

export const step0004RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0003RenderState, {
    snapshot: {
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
            source: mainSupportSourcePosition,
            target: mainClaimRightEdgePosition,
            targetSideOffset: mainSupportTargetSideOffset,
        },
        [c2DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c2DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c2ConfidenceConnectorId,
            sourceJunctionVizId: c2JunctionVizId,
            targetClaimVizId: mainClaimVizId,
            scale: .5,
            score: {
                type: "tween/number",
                from: 0,
                to: 1,
            },
            side: "conMain",
            source: c2ClaimLeftEdgePosition,
            target: mainClaimRightEdgePosition,
            targetSideOffset: c2TargetSideOffset,
        },
    },
});