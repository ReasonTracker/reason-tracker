import type { ClaimAggregatorViz, JunctionAggregatorViz } from "../../../app/src/app.js";
import { getPlannerClaimAggregatorOffsetX } from "../../../app/src/planner/plannerVisualGeometry.ts";

import { boundsFromCenteredRect } from "./bounds";
import { renderPlannerSnapshotScene } from "./renderPlannerSnapshotScene";
import { AGGREGATOR_BASE_SIZE_PX } from "./sceneConstants";
import { resolveTweenPoint } from "./resolveTween";
import type { ClaimRenderModel } from "./renderClaim";
import type { JunctionRenderModel } from "./renderJunction";
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
    args: {
        visual: ClaimAggregatorViz;
        percent: number;
        claimModel?: ClaimRenderModel;
    },
): AggregatorRenderModel {
    if (args.claimModel) {
        return buildCenteredAggregatorRenderModel(
            "claimAggregator",
            args.visual.id,
            args.claimModel.centerX - getPlannerClaimAggregatorOffsetX(args.claimModel.scale),
            args.claimModel.centerY,
        );
    }

    return buildPositionedAggregatorRenderModel("claimAggregator", args.visual.id, args.visual.position, args.percent);
}

export function buildJunctionAggregatorRenderModel(
    args: {
        visual: JunctionAggregatorViz;
        percent: number;
        junctionModel?: JunctionRenderModel;
    },
): AggregatorRenderModel {
    if (args.junctionModel) {
        return buildCenteredAggregatorRenderModel(
            "junctionAggregator",
            args.visual.id,
            args.junctionModel.centerX,
            args.junctionModel.centerY,
        );
    }

    return buildPositionedAggregatorRenderModel("junctionAggregator", args.visual.id, args.visual.position, args.percent);
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

function buildPositionedAggregatorRenderModel(
    kind: AggregatorRenderModel["kind"],
    id: string,
    position: ClaimAggregatorViz["position"],
    percent: number,
): AggregatorRenderModel {
    const center = resolveTweenPoint(position, percent);

    return buildCenteredAggregatorRenderModel(kind, id, center.x, center.y);
}

function buildCenteredAggregatorRenderModel(
    kind: AggregatorRenderModel["kind"],
    id: string,
    x: number,
    y: number,
): AggregatorRenderModel {
    return {
        bounds: boundsFromCenteredRect(x, y, AGGREGATOR_BASE_SIZE_PX, AGGREGATOR_BASE_SIZE_PX),
        id,
        kind,
        size: AGGREGATOR_BASE_SIZE_PX,
        x,
        y,
    };
}