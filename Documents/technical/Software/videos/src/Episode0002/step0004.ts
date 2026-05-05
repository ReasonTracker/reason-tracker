import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";

import {
    applyDebateSnapshotRenderStatePatch,
    stripDebateSnapshotRenderStateAnimations,
} from "../shared/debateSnapshotRenderStatePatch";
import { c7DeliveryConnectorVizId } from "./step0002";
import { step0003RenderState } from "./step0003";

const step0004BaseRenderState = stripDebateSnapshotRenderStateAnimations(step0003RenderState);

export const step0004RenderState: DebateSnapshotRenderState = applyDebateSnapshotRenderStatePatch(step0004BaseRenderState, {
    snapshot: {
        [c7DeliveryConnectorVizId]: {
            id: c7DeliveryConnectorVizId,
            score: {
                type: "tween/number",
                from: 0,
                to: 1,
            },
        },
    },
});