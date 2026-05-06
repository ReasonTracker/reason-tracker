import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";

import {
    applyDebateSnapshotRenderStatePatch,
    stripDebateSnapshotRenderStateAnimations,
} from "../shared/debateSnapshotRenderStatePatch";
import {
    c4DeliveryAggregatorVizId,
    c4ClaimVizId,
    c4DeliveryConnectorVizId,
    c4RelevanceAggregatorVizId,
    c4JunctionVizId,
    c5DeliveryAggregatorVizId,
    c5ClaimVizId,
    c5DeliveryConnectorVizId,
    c5RelevanceAggregatorVizId,
    c5JunctionVizId,
    c6DeliveryAggregatorVizId,
    c6ClaimVizId,
    c6DeliveryConnectorVizId,
    c6RelevanceAggregatorVizId,
    c6JunctionVizId,
    claimHalfWidth,
    thirdColumnClaimLeftEdgeX,
    thirdLayerClaimScale,
} from "./step0001";
import {
    c7DeliveryConnectorVizId,
    step0002RenderState,
} from "./step0002";

const step0003BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0002RenderState);

const compactThirdLayerClaimScale = .32;
const initialColumnX = thirdColumnClaimLeftEdgeX + (claimHalfWidth * thirdLayerClaimScale);
const compactColumnX = thirdColumnClaimLeftEdgeX + (claimHalfWidth * compactThirdLayerClaimScale);

const c4InitialY = 80;
const c5InitialY = 260;
const c6InitialY = 440;

const c4FinalY = 60;
const c5FinalY = 220;
const c6FinalY = 380;

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
                startPct: .7,
                endPct: 1,
            },
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .7,
                endPct: 1,
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
                startPct: .7,
                endPct: 1,
            },
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .7,
                endPct: 1,
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
                startPct: .7,
                endPct: 1,
            },
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .7,
                endPct: 1,
            },
        },
        [c4DeliveryAggregatorVizId]: {
            id: c4DeliveryAggregatorVizId,
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
                startPct: .7,
                endPct: 1,
            },
        },
        [c5DeliveryAggregatorVizId]: {
            id: c5DeliveryAggregatorVizId,
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
                startPct: .7,
                endPct: 1,
            },
        },
        [c6DeliveryAggregatorVizId]: {
            id: c6DeliveryAggregatorVizId,
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
                startPct: .7,
                endPct: 1,
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
                startPct: .7,
                endPct: 1,
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
                startPct: .7,
                endPct: 1,
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
                startPct: .7,
                endPct: 1,
            },
        },
        [c4RelevanceAggregatorVizId]: {
            id: c4RelevanceAggregatorVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c4InitialY,
                    to: c4FinalY,
                },
                startPct: .7,
                endPct: 1,
            },
        },
        [c5RelevanceAggregatorVizId]: {
            id: c5RelevanceAggregatorVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c5InitialY,
                    to: c5FinalY,
                },
                startPct: .7,
                endPct: 1,
            },
        },
        [c6RelevanceAggregatorVizId]: {
            id: c6RelevanceAggregatorVizId,
            position: {
                x: thirdColumnClaimLeftEdgeX,
                y: {
                    type: "tween/number",
                    from: c6InitialY,
                    to: c6FinalY,
                },
                startPct: .7,
                endPct: 1,
            },
        },
        [c4DeliveryConnectorVizId]: {
            id: c4DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .5,
                endPct: .7,
            },
            direction: "targetToSource",
            targetSideOffset: {
                type: "tween/number",
                from: c4InitialTargetSideOffset,
                to: c4FinalTargetSideOffset,
                startPct: .5,
                endPct: .7,
            },
        },
        [c5DeliveryConnectorVizId]: {
            id: c5DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .5,
                endPct: .7,
            },
            direction: "targetToSource",
            targetSideOffset: {
                type: "tween/number",
                from: c5InitialTargetSideOffset,
                to: c5FinalTargetSideOffset,
                startPct: .5,
                endPct: .7,
            },
        },
        [c6DeliveryConnectorVizId]: {
            id: c6DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: thirdLayerClaimScale,
                to: compactThirdLayerClaimScale,
                startPct: .5,
                endPct: .7,
            },
            direction: "targetToSource",
            targetSideOffset: {
                type: "tween/number",
                from: c6InitialTargetSideOffset,
                to: c6FinalTargetSideOffset,
                startPct: .5,
                endPct: .7,
            },
        },
        [c7DeliveryConnectorVizId]: {
            id: c7DeliveryConnectorVizId,
            scale: {
                type: "tween/number",
                from: 0,
                to: compactThirdLayerClaimScale,
                startPct: 0,
                endPct: .5,
            },
            targetSideOffset: c7FinalTargetSideOffset,
        },
    },
});