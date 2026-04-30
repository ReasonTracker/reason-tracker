import type {
    JunctionViz,
    Side,
} from "../../../app/src/app.js";

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
    visual: JunctionViz;
    percent: number;
    side: Side;
}): JunctionRenderModel | undefined {
    const scale = Math.max(0, resolveTweenNumber(args.visual.scale, args.percent));
    const opacity = resolvePresenceOpacity(args.visual.scale, args.percent)
        * resolveTweenBooleanOpacity(args.visual.visible, args.percent);

    if (scale <= 0 || opacity <= 0) {
        return undefined;
    }

    const center = resolveTweenPoint(args.visual.position, args.percent);
    const centerX = center.x;
    const centerY = center.y;
    const width = Math.max(0, resolveTweenNumber(args.visual.width, args.percent));
    const leftHeight = Math.max(0, resolveTweenNumber(args.visual.leftHeight, args.percent));
    const rightHeight = Math.max(0, resolveTweenNumber(args.visual.rightHeight, args.percent));

    return {
        bounds: boundsFromCenteredRect(centerX, centerY, width, Math.max(leftHeight, rightHeight)),
        centerX,
        centerY,
        id: args.visual.id,
        junctionAggregatorVizId: String(args.visual.junctionAggregatorVizId),
        leftHeight,
        opacity,
        rightHeight,
        scoreNodeId: args.visual.scoreNodeId ? String(args.visual.scoreNodeId) : undefined,
        side: args.side,
        width,
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