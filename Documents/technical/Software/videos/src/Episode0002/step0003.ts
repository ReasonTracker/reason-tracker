import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";

import {
    applyDebateSnapshotRenderStatePatch,
    stripDebateSnapshotRenderStateAnimations,
} from "../shared/debateSnapshotRenderStatePatch";
import {
    c4ClaimAggregatorVizId,
    c4ClaimVizId,
    c4DeliveryConnectorVizId,
    c4JunctionAggregatorVizId,
    c4JunctionVizId,
    c5ClaimAggregatorVizId,
    c5ClaimVizId,
    c5DeliveryConnectorVizId,
    c5JunctionAggregatorVizId,
    c5JunctionVizId,
    c6ClaimAggregatorVizId,
    c6ClaimVizId,
    c6DeliveryConnectorVizId,
    c6JunctionAggregatorVizId,
    c6JunctionVizId,
    claimHalfWidth,
    thirdColumnClaimLeftEdgeX,
    thirdLayerClaimScale,
} from "./step0001";
import {
    c7ClaimAggregatorVizId,
    c7ClaimVizId,
    c7DeliveryConnectorVizId,
    c7JunctionAggregatorVizId,
    c7JunctionVizId,
    step0002RenderState,
} from "./step0002";

const step0003BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0002RenderState);

const compactThirdLayerClaimScale = .32;
const initialColumnX = thirdColumnClaimLeftEdgeX + (claimHalfWidth * thirdLayerClaimScale);
const compactColumnX = thirdColumnClaimLeftEdgeX + (claimHalfWidth * compactThirdLayerClaimScale);

const c4InitialY = 80;
const c5InitialY = 260;
const c6InitialY = 440;
const c7InitialY = 620;

const c4FinalY = 60;
const c5FinalY = 220;
const c6FinalY = 380;
const c7FinalY = 540;

const c4InitialTargetSideOffset = -36;
const c5InitialTargetSideOffset = 0;
const c6InitialTargetSideOffset = 36;
const c4FinalTargetSideOffset = -54;
const c5FinalTargetSideOffset = -18;
const c6FinalTargetSideOffset = 18;
const c7FinalTargetSideOffset = 54;

export const step0003RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0003BaseRenderState, {
    snapshot: {
        [c4ClaimVizId]: {
            id: c4ClaimVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c4InitialY,
                    to: c4FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .45,
                endPct: .85,
            },
        },
        [c5ClaimVizId]: {
            id: c5ClaimVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c5InitialY,
                    to: c5FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .45,
                endPct: .85,
            },
        },
        [c6ClaimVizId]: {
            id: c6ClaimVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c6InitialY,
                    to: c6FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .45,
                endPct: .85,
            },
        },
        [c7ClaimVizId]: {
            id: c7ClaimVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c7InitialY,
                    to: c7FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .45,
                endPct: .85,
            },
        },
        [c4ClaimAggregatorVizId]: {
            id: c4ClaimAggregatorVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c4InitialY + 60,
                    to: c4FinalY + 60,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c5ClaimAggregatorVizId]: {
            id: c5ClaimAggregatorVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c5InitialY + 60,
                    to: c5FinalY + 60,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c6ClaimAggregatorVizId]: {
            id: c6ClaimAggregatorVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c6InitialY + 60,
                    to: c6FinalY + 60,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c7ClaimAggregatorVizId]: {
            id: c7ClaimAggregatorVizId,
            position: {
                x: {
                    type: "tween/number",
                    from: initialColumnX,
                    to: compactColumnX,
                },
                y: {
                    type: "tween/number",
                    from: c7InitialY + 60,
                    to: c7FinalY + 60,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c4JunctionVizId]: {
            id: c4JunctionVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c4InitialY,
                    to: c4FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c5JunctionVizId]: {
            id: c5JunctionVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c5InitialY,
                    to: c5FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c6JunctionVizId]: {
            id: c6JunctionVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c6InitialY,
                    to: c6FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c7JunctionVizId]: {
            id: c7JunctionVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c7InitialY,
                    to: c7FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c4JunctionAggregatorVizId]: {
            id: c4JunctionAggregatorVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c4InitialY,
                    to: c4FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c5JunctionAggregatorVizId]: {
            id: c5JunctionAggregatorVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c5InitialY,
                    to: c5FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c6JunctionAggregatorVizId]: {
            id: c6JunctionAggregatorVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c6InitialY,
                    to: c6FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c7JunctionAggregatorVizId]: {
            id: c7JunctionAggregatorVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c7InitialY,
                    to: c7FinalY,
                },
                startPct: .45,
                endPct: .85,
            },
        },
        [c4DeliveryConnectorVizId]: {
            id: c4DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .45,
                endPct: .85,
            },
            targetSideOffset: {
                type: "tween/number",
                from: c4InitialTargetSideOffset,
                to: c4FinalTargetSideOffset,
                startPct: .45,
                endPct: .85,
            },
        },
        [c5DeliveryConnectorVizId]: {
            id: c5DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .45,
                endPct: .85,
            },
            targetSideOffset: {
                type: "tween/number",
                from: c5InitialTargetSideOffset,
                to: c5FinalTargetSideOffset,
                startPct: .45,
                endPct: .85,
            },
        },
        [c6DeliveryConnectorVizId]: {
            id: c6DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .45,
                endPct: .85,
            },
            targetSideOffset: {
                type: "tween/number",
                from: c6InitialTargetSideOffset,
                to: c6FinalTargetSideOffset,
                startPct: .45,
                endPct: .85,
            },
        },
        [c7DeliveryConnectorVizId]: {
            id: c7DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: 0,
                to: compactThirdLayerClaimScale,
            },
            targetSideOffset: c7FinalTargetSideOffset,
        },
    },
});