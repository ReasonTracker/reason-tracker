import type { DeliveryAggregatorViz } from "../../../../app/src/planner/Snapshot.ts";

import { resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import { htmlElement } from "./renderTree";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

const AGGREGATOR_BASE_SIZE_PX = 2;
const PLANNER_BASE_DELIVERY_AGGREGATOR_OFFSET_X_PX = 36;

export function renderDeliveryAggregator(args: {
    item: DeliveryAggregatorViz;
} & RenderStepProgress): RenderElementNode {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);
    const scale = resolveTweenNumber(args.item.scale, args.stepProgress);
    const x = position.x - getPlannerDeliveryAggregatorOffsetX(scale);

    return htmlElement("div", {
        attributes: {
            "class": "rt-debate-render__aggregator rt-debate-render__aggregator--claim",
            "data-aggregator-id": String(args.item.id),
        },
        styles: {
            height: AGGREGATOR_BASE_SIZE_PX,
            left: x - (AGGREGATOR_BASE_SIZE_PX / 2),
            top: position.y - (AGGREGATOR_BASE_SIZE_PX / 2),
            width: AGGREGATOR_BASE_SIZE_PX,
        },
    });
}

export function getDeliveryAggregatorBounds(args: {
    item: DeliveryAggregatorViz;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const position = resolveTweenPoint(args.item.position, args.stepProgress);

    return {
        maxX: position.x,
        maxY: position.y,
    };
}

function getPlannerDeliveryAggregatorOffsetX(scale: number): number {
    return Math.round(PLANNER_BASE_DELIVERY_AGGREGATOR_OFFSET_X_PX * clampVisualScale(scale));
}

function clampVisualScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1;
    }

    return Math.min(1, Math.max(0, scale));
}
