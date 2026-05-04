import type { JunctionViz, Side } from "../../../../app/src/planner/Snapshot.ts";

import { resolveTweenBoolean, resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import { svgElement } from "./renderTree";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

const CONNECTOR_OUTLINE_WIDTH_PX = 4;
const JUNCTION_BASE_WIDTH_PX = 28;
const JUNCTION_BASE_HEIGHT_PX = 18;
const JUNCTION_NARROW_SIDE_RATIO = 0.82;
const JUNCTION_WIDE_SIDE_RATIO = 1.18;

export function renderJunction(args: {
    item: JunctionViz;
    side: Side | undefined;
} & RenderStepProgress): RenderElementNode | undefined {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const scale = resolveTweenNumber(args.item.scale, args.stepProgress);
    const visible = resolveTweenBoolean(args.item.visible, args.stepProgress);

    if (!visible || scale <= 0 || !args.side) {
        return undefined;
    }

    const width = getRenderedJunctionWidth(scale);
    const narrowHeight = Math.max(1, Math.round(JUNCTION_BASE_HEIGHT_PX * JUNCTION_NARROW_SIDE_RATIO * clampVisualScale(scale)));
    const wideHeight = getRenderedJunctionHeight(scale);
    const leftHeight = args.side === "proMain" ? narrowHeight : wideHeight;
    const rightHeight = args.side === "proMain" ? wideHeight : narrowHeight;
    const leftX = position.x - (width / 2);
    const rightX = position.x + (width / 2);
    const pathData = [
        `M ${leftX} ${position.y - (leftHeight / 2)}`,
        `L ${rightX} ${position.y - (rightHeight / 2)}`,
        `L ${rightX} ${position.y + (rightHeight / 2)}`,
        `L ${leftX} ${position.y + (leftHeight / 2)}`,
        "Z",
    ].join(" ");

    return svgElement("path", {
        attributes: {
            "data-junction-id": String(args.item.id),
            "d": pathData,
            "fill": "none",
            "pointer-events": "none",
            "stroke": resolveSideStroke(args.side),
            "stroke-linejoin": "round",
            "stroke-width": CONNECTOR_OUTLINE_WIDTH_PX,
        },
    });
}

export function getJunctionBounds(args: {
    item: JunctionViz;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const scale = resolveTweenNumber(args.item.scale, args.stepProgress);

    return {
        maxX: position.x + (getRenderedJunctionWidth(scale) / 2),
        maxY: position.y + (getRenderedJunctionHeight(scale) / 2),
    };
}

export function getRenderedJunctionWidth(scale: number): number {
    return Math.max(1, Math.round(JUNCTION_BASE_WIDTH_PX * clampVisualScale(scale)));
}

export function getRenderedJunctionHeight(scale: number): number {
    return Math.max(1, Math.round(JUNCTION_BASE_HEIGHT_PX * JUNCTION_WIDE_SIDE_RATIO * clampVisualScale(scale)));
}

function clampVisualScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1;
    }

    return Math.min(1, Math.max(0, scale));
}

function resolveSideStroke(side: Side): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}
