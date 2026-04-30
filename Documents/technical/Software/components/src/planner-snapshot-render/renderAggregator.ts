import type { ClaimAggregatorViz, JunctionAggregatorViz } from "../../../app/src/app.js";

import { boundsFromCenteredRect } from "./bounds";
import { renderPlannerSnapshotScene } from "./renderPlannerSnapshotScene";
import { AGGREGATOR_BASE_SIZE_PX } from "./sceneConstants";
import { resolveTweenPoint } from "./resolveTween";
import type {
    Bounds,
    PlannerSnapshotRenderResult,
    RenderElementNode,
    SnapshotRenderInput,
} from "./renderTypes";
import { htmlElement } from "./renderTree";

export type AggregatorRenderModel = {
    bounds: Bounds;
    id: string;
    kind: "claimAggregator" | "junctionAggregator";
    size: number;
    x: number;
    y: number;
};

export function buildClaimAggregatorRenderModel(
    visual: ClaimAggregatorViz,
    percent: number,
): AggregatorRenderModel {
    return buildAggregatorRenderModel("claimAggregator", visual.id, visual.position, percent);
}

export function buildJunctionAggregatorRenderModel(
    visual: JunctionAggregatorViz,
    percent: number,
): AggregatorRenderModel {
    return buildAggregatorRenderModel("junctionAggregator", visual.id, visual.position, percent);
}

export function renderAggregator(
    model: AggregatorRenderModel,
    offset: { x: number; y: number },
): RenderElementNode {
    return htmlElement("div", {
        attributes: {
            "data-aggregator-id": model.id,
            "data-aggregator-kind": model.kind,
        },
        styles: {
            background: "transparent",
            borderRadius: "50%",
            height: model.size,
            left: model.x + offset.x - model.size / 2,
            opacity: 0,
            pointerEvents: "none",
            position: "absolute",
            top: model.y + offset.y - model.size / 2,
            width: model.size,
        },
    });
}

export function renderClaimAggregatorAdjustSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "claimAggregatorAdjust",
    });
}

export function renderJunctionAggregatorAdjustSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "junctionAggregatorAdjust",
    });
}

function buildAggregatorRenderModel(
    kind: AggregatorRenderModel["kind"],
    id: string,
    position: ClaimAggregatorViz["position"],
    percent: number,
): AggregatorRenderModel {
    const center = resolveTweenPoint(position, percent);

    return {
        bounds: boundsFromCenteredRect(center.x, center.y, AGGREGATOR_BASE_SIZE_PX, AGGREGATOR_BASE_SIZE_PX),
        id,
        kind,
        size: AGGREGATOR_BASE_SIZE_PX,
        x: center.x,
        y: center.y,
    };
}