import {
    renderClaimAggregatorAdjustSnapshot,
    renderJunctionAggregatorAdjustSnapshot,
} from "./renderAggregator";
import { renderClaimAdjustSnapshot } from "./renderClaim";
import {
    renderConfidenceConnectorAdjustSnapshot,
    renderDeliveryConnectorAdjustSnapshot,
    renderRelevanceConnectorAdjustSnapshot,
} from "./renderConnector";
import { renderJunctionAdjustSnapshot } from "./renderJunction";
import {
    renderFirstFillSnapshot,
    renderOrderSnapshot,
    renderScaleSnapshot,
    renderSproutSnapshot,
    renderVoilaSnapshot,
} from "./renderPlannerSnapshotScene";
import type { PlannerSnapshotRenderResult, ScoreWaveFrameRenderInput } from "./renderTypes";

export function renderScoreWaveFrame(input: ScoreWaveFrameRenderInput): PlannerSnapshotRenderResult {
    if (input.frame.specialCase === "firstFill") {
        return renderFirstFillSnapshot({
            snapshot: input.frame.snapshot,
            percent: input.percent,
        });
    }

    switch (input.frame.stepType) {
        case "voila":
            return renderVoilaSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "sprout":
            return renderSproutSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "relevanceConnectorAdjust":
            return renderRelevanceConnectorAdjustSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "junctionAggregatorAdjust":
            return renderJunctionAggregatorAdjustSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "confidenceConnectorAdjust":
            return renderConfidenceConnectorAdjustSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "junctionAdjust":
            return renderJunctionAdjustSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "deliveryConnectorAdjust":
            return renderDeliveryConnectorAdjustSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "claimAggregatorAdjust":
            return renderClaimAggregatorAdjustSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "claimAdjust":
            return renderClaimAdjustSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "scale":
            return renderScaleSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
        case "order":
            return renderOrderSnapshot({ snapshot: input.frame.snapshot, percent: input.percent });
    }
}