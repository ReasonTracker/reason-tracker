import type {
    JunctionViz,
    Side,
} from "../../../app/src/app.js";
import type { ResolvedJunctionLayout } from "../../../app/src/planner/resolveSnapshotScoreFlowLayout.ts";

import { boundsFromCenteredRect } from "./bounds";
import {
    CONNECTOR_OUTLINE_WIDTH_PX,
    resolveSideStroke,
} from "./sceneConstants";
import { renderPlannerSnapshotScene } from "./renderPlannerSnapshotScene";
import {
    resolvePresenceOpacity,
    resolveTweenBooleanOpacity,
    resolveTweenNumber,
    resolveTweenPoint,
} from "./resolveTween";
import type {
    Bounds,
    PlannerSnapshotRenderResult,
    RenderElementNode,
    SnapshotRenderInput,
} from "./renderTypes";
import { svgElement } from "./renderTree";

export type JunctionRenderModel = {
    bounds: Bounds;
    centerX: number;
    centerY: number;
    id: string;
    junctionAggregatorVizId: string;
    leftHeight: number;
    opacity: number;
    rightHeight: number;
    scoreNodeId?: string;
    side: Side;
    width: number;
};

export function buildJunctionRenderModel(args: {
    layout?: ResolvedJunctionLayout;
    visual: JunctionViz;
    percent: number;
    side: Side;
}): JunctionRenderModel {
    const opacity = resolvePresenceOpacity(args.visual.scale, args.percent)
        * resolveTweenBooleanOpacity(args.visual.visible, args.percent);
    const layout = args.layout ?? resolveJunctionLayoutFromVisual(args.visual, args.percent);

    return {
        bounds: boundsFromCenteredRect(layout.centerX, layout.centerY, layout.width, Math.max(layout.leftHeight, layout.rightHeight)),
        centerX: layout.centerX,
        centerY: layout.centerY,
        id: args.visual.id,
        junctionAggregatorVizId: String(args.visual.junctionAggregatorVizId),
        leftHeight: layout.leftHeight,
        opacity,
        rightHeight: layout.rightHeight,
        scoreNodeId: args.visual.scoreNodeId ? String(args.visual.scoreNodeId) : undefined,
        side: args.side,
        width: layout.width,
    };
}

export function renderJunction(model: JunctionRenderModel, offset: { x: number; y: number }): RenderElementNode {
    const centerX = model.centerX + offset.x;
    const centerY = model.centerY + offset.y;
    const leftX = centerX - model.width / 2;
    const rightX = centerX + model.width / 2;
    const leftTopY = centerY - model.leftHeight / 2;
    const rightTopY = centerY - model.rightHeight / 2;
    const rightBottomY = centerY + model.rightHeight / 2;
    const leftBottomY = centerY + model.leftHeight / 2;
    const pathData = [
        `M ${leftX} ${leftTopY}`,
        `L ${rightX} ${rightTopY}`,
        `L ${rightX} ${rightBottomY}`,
        `L ${leftX} ${leftBottomY}`,
        "Z",
    ].join(" ");

    return svgElement("path", {
        attributes: {
            "data-junction-id": model.id,
            d: pathData,
            fill: "none",
            opacity: model.opacity,
            "pointer-events": "none",
            stroke: resolveSideStroke(model.side),
            "stroke-linejoin": "round",
            "stroke-width": CONNECTOR_OUTLINE_WIDTH_PX,
        },
    });
}

export function renderJunctionAdjustSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "junctionAdjust",
    });
}

function resolveJunctionLayoutFromVisual(visual: JunctionViz, percent: number): ResolvedJunctionLayout {
    const center = resolveTweenPoint(visual.position, percent);

    return {
        centerX: center.x,
        centerY: center.y,
        leftHeight: Math.max(0, resolveTweenNumber(visual.leftHeight, percent)),
        rightHeight: Math.max(0, resolveTweenNumber(visual.rightHeight, percent)),
        width: Math.max(0, resolveTweenNumber(visual.width, percent)),
    };
}