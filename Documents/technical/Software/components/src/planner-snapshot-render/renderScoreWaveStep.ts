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
import type { PlannerSnapshotRenderResult, ScoreWaveStepRenderInput } from "./renderTypes";

export function renderScoreWaveStep(input: ScoreWaveStepRenderInput): PlannerSnapshotRenderResult {
    switch (input.step.type) {
        case "firstFill":
            return renderFirstFillSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "voila":
            return renderVoilaSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "sprout":
            return renderSproutSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "relevanceConnectorAdjust":
            return renderRelevanceConnectorAdjustSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "junctionAggregatorAdjust":
            return renderJunctionAggregatorAdjustSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "confidenceConnectorAdjust":
            return renderConfidenceConnectorAdjustSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "junctionAdjust":
            return renderJunctionAdjustSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "deliveryConnectorAdjust":
            return renderDeliveryConnectorAdjustSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "claimAggregatorAdjust":
            return renderClaimAggregatorAdjustSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "claimAdjust":
            return renderClaimAdjustSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "scale":
            return renderScaleSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
        case "order":
            return renderOrderSnapshot({ snapshot: input.step.snapshot, percent: input.percent });
    }
}