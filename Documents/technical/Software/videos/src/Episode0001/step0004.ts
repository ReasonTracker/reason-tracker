//** This step is the first fill for c2 */

import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import type {
    DeliveryConnectorVizId,
} from "@planner/Snapshot.ts";

import {
    applyDebateSnapshotRenderStatePatch,
    stripDebateSnapshotRenderStateAnimations,
} from "../shared/debateSnapshotRenderStatePatch";
import { step0003RenderState } from "./step0003";

const c2DeliveryConnectorVizId = "delivery-connector-viz-c2" as DeliveryConnectorVizId;

const step0004BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0003RenderState);

export const step0004RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0004BaseRenderState, {
    snapshot: {
        [c2DeliveryConnectorVizId]: {
            id: c2DeliveryConnectorVizId,
            score: {
                type: "tween/number",
                from: 0,
                to: 1,
            },
        },
    },
});