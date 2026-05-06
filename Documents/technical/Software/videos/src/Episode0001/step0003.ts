//** This step is the sprout for c2 */

import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import type {
    ClaimVizId,
    DeliveryConnectorVizId,
} from "@planner/Snapshot.ts";

import {
    applyDebateSnapshotRenderStatePatch,
    stripDebateSnapshotRenderStateAnimations,
} from "../shared/debateSnapshotRenderStatePatch";
import {
    mainSupportDeliveryConnectorVizId,
} from "./step0001";
import { step0002RenderState } from "./step0002";

const step0003BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0002RenderState);

const c1ClaimVizId = "claim-viz-c1" as ClaimVizId;
const c2DeliveryConnectorVizId = "delivery-connector-viz-c2" as DeliveryConnectorVizId;

const claimHalfWidth = 180;
const siblingClaimScale = .5;
const leftPad = 500;
const layerWidth = 500;
const rightColumnClaimCenterX = leftPad + layerWidth * 2;
const leftJustifiedClaimLeftX = rightColumnClaimCenterX - claimHalfWidth;
const leftJustifiedScaledClaimCenterX = leftJustifiedClaimLeftX + (claimHalfWidth * siblingClaimScale);
const c1ClaimPosition = { x: rightColumnClaimCenterX, y: 180 };
const c1ScaledClaimPosition = { x: leftJustifiedScaledClaimCenterX, y: c1ClaimPosition.y };
const mainSupportTargetSideOffset = -44;
const c2TargetSideOffset = 50;

export const step0003RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0003BaseRenderState, {
    snapshot: {
        [mainSupportDeliveryConnectorVizId]: {
            id: mainSupportDeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: 1,
                to: .5,
                startPct: .5,
                endPct: .7,
            },
            direction: "targetToSource",
            targetSideOffset: {
                type: "tween/number",
                from: 0,
                to: mainSupportTargetSideOffset,
                startPct: .5,
                endPct: .7,
            },
        },
        [c1ClaimVizId]: {
            id: c1ClaimVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: c1ClaimPosition.x,
                    to: c1ScaledClaimPosition.x,
                },
                y: c1ClaimPosition.y,
                startPct: .7,
                endPct: 1,
            },
            scale: {
                type: "tween/number",
                from: 1,
                to: siblingClaimScale,
                startPct: .7,
                endPct: 1,
            },
        },
        [c2DeliveryConnectorVizId]: {
            id: c2DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: 0,
                to: .5,
            },
            targetSideOffset: c2TargetSideOffset,
        },
    },
});