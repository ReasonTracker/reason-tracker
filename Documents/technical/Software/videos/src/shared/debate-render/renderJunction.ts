import type { JunctionViz, Side } from "../../../../app/src/planner/Snapshot.ts";

import { resolveTweenBoolean, resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import { svgElement } from "./renderTree";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

const CONNECTOR_OUTLINE_WIDTH_PX = 4;

export function renderJunction(args: {
    item: JunctionViz;
    side: Side | undefined;
} & RenderStepProgress): RenderElementNode | undefined {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const span = Math.max(1, Math.round(resolveTweenNumber(args.item.incomingRelevanceScale, args.stepProgress)));
    const incomingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(args.item.incomingConfidenceScale, args.stepProgress)));
    const outgoingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(args.item.outgoingConfidenceScale, args.stepProgress)));
    const visible = resolveTweenBoolean(args.item.visible, args.stepProgress);

    if (!visible || !args.side) {
        return undefined;
    }

    const leftHeight = args.side === "proMain"
        ? incomingConfidenceHeight
        : outgoingConfidenceHeight;
    const rightHeight = args.side === "proMain"
        ? outgoingConfidenceHeight
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
            "stroke-width": CONNECTOR_OUTLINE_WIDTH_PX,
        },
    });
}

export function getJunctionBounds(args: {
    item: JunctionViz;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const span = Math.max(1, Math.round(resolveTweenNumber(args.item.incomingRelevanceScale, args.stepProgress)));
    const incomingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(args.item.incomingConfidenceScale, args.stepProgress)));
    const outgoingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(args.item.outgoingConfidenceScale, args.stepProgress)));

    return {
        maxX: position.x + (span / 2),
        maxY: position.y + (Math.max(incomingConfidenceHeight, outgoingConfidenceHeight) / 2),
    };
}

function resolveSideStroke(side: Side): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}
