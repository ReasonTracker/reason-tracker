import type { JunctionViz, Side } from "@planner/Snapshot.ts";
import type { PlannerOptions } from "@planner/contracts.ts";

import { resolveTweenBoolean, resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import { svgElement } from "./renderTree";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

const CONNECTOR_OUTLINE_WIDTH_PX = 4;

export function renderJunction(args: {
    item: JunctionViz;
    plannerOptions: PlannerOptions;
    side: Side | undefined;
} & RenderStepProgress): RenderElementNode | undefined {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const span = resolveNonNegativeDimension(resolveTweenNumber(args.item.incomingRelevanceScale, args.stepProgress));
    const incomingConfidenceHeight = resolveNonNegativeDimension(resolveTweenNumber(args.item.incomingConfidenceScale, args.stepProgress));
    const outgoingDeliveryHeight = resolveNonNegativeDimension(resolveTweenNumber(args.item.outgoingDeliveryScale, args.stepProgress));
    const outlineWidth = resolveJunctionOutlineWidth(Math.max(incomingConfidenceHeight, outgoingDeliveryHeight), args.plannerOptions);
    const visible = resolveTweenBoolean(args.item.visible, args.stepProgress);

    if (!visible || !args.side) {
        return undefined;
    }

    const leftHeight = args.side === "proMain"
        ? incomingConfidenceHeight
        : outgoingDeliveryHeight;
    const rightHeight = args.side === "proMain"
        ? outgoingDeliveryHeight
        : incomingConfidenceHeight;
    const leftX = position.x - (span / 2);
    const rightX = position.x + (span / 2);
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
            "stroke-width": outlineWidth,
        },
    });
}

export function getJunctionBounds(args: {
    item: JunctionViz;
    plannerOptions: PlannerOptions;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const span = resolveNonNegativeDimension(resolveTweenNumber(args.item.incomingRelevanceScale, args.stepProgress));
    const incomingConfidenceHeight = resolveNonNegativeDimension(resolveTweenNumber(args.item.incomingConfidenceScale, args.stepProgress));
    const outgoingDeliveryHeight = resolveNonNegativeDimension(resolveTweenNumber(args.item.outgoingDeliveryScale, args.stepProgress));
    const outlineWidth = resolveJunctionOutlineWidth(Math.max(incomingConfidenceHeight, outgoingDeliveryHeight), args.plannerOptions);

    return {
        maxX: position.x + (span / 2) + (outlineWidth / 2),
        maxY: position.y + (Math.max(incomingConfidenceHeight, outgoingDeliveryHeight) / 2) + (outlineWidth / 2),
    };
}

function resolveSideStroke(side: Side): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}

function resolveNonNegativeDimension(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, value);
}

function resolveJunctionOutlineWidth(maxPipeHeight: number, plannerOptions: PlannerOptions): number {
    if (plannerOptions.claimHeight <= 0) {
        return 0;
    }

    return Math.max(0, maxPipeHeight) * (CONNECTOR_OUTLINE_WIDTH_PX / plannerOptions.claimHeight);
}
