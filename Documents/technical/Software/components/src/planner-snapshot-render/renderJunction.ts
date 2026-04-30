import type { JunctionViz, Side } from "../../../app/src/app.js";

import { boundsFromCenteredRect } from "./bounds";
import {
    CONNECTOR_OUTLINE_WIDTH_PX,
    JUNCTION_BASE_HEIGHT_PX,
    JUNCTION_BASE_WIDTH_PX,
    JUNCTION_WIDE_SIDE_RATIO,
    resolveSideStroke,
} from "./sceneConstants";
import { renderPlannerSnapshotScene } from "./renderPlannerSnapshotScene";
import {
    getTweenNumberEndpoints,
    getTweenPointEndpoints,
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
    leftHeight: number;
    opacity: number;
    rightHeight: number;
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
    const scaleEndpoints = getTweenNumberEndpoints(args.visual.scale);
    const pointEndpoints = getTweenPointEndpoints(args.visual.position);
    const widthEndpoints = getTweenNumberEndpoints(args.visual.width);
    const leftHeightEndpoints = getTweenNumberEndpoints(args.visual.leftHeight);
    const rightHeightEndpoints = getTweenNumberEndpoints(args.visual.rightHeight);
    const maxScale = Math.max(scaleEndpoints.from, scaleEndpoints.to);
    const width = Math.max(0, resolveTweenNumber(args.visual.width, args.percent));
    const leftHeight = Math.max(0, resolveTweenNumber(args.visual.leftHeight, args.percent));
    const rightHeight = Math.max(0, resolveTweenNumber(args.visual.rightHeight, args.percent));

    return {
        bounds: boundsFromCenteredRect(
            (pointEndpoints.from.x + pointEndpoints.to.x) / 2,
            (pointEndpoints.from.y + pointEndpoints.to.y) / 2,
            Math.max(widthEndpoints.from, widthEndpoints.to, JUNCTION_BASE_WIDTH_PX * maxScale),
            Math.max(
                leftHeightEndpoints.from,
                leftHeightEndpoints.to,
                rightHeightEndpoints.from,
                rightHeightEndpoints.to,
                JUNCTION_BASE_HEIGHT_PX * maxScale * JUNCTION_WIDE_SIDE_RATIO,
            ),
        ),
        centerX: center.x,
        centerY: center.y,
        id: args.visual.id,
        leftHeight,
        opacity,
        rightHeight,
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