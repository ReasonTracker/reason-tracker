import type { JunctionAggregatorViz } from "../../../../app/src/planner/Snapshot.ts";

import { resolveTweenBoolean, resolveTweenPoint } from "./resolveTween";
import { htmlElement } from "./renderTree";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

const AGGREGATOR_BASE_SIZE_PX = 2;

export function renderJunctionAggregator(args: {
    item: JunctionAggregatorViz;
} & RenderStepProgress): RenderElementNode | undefined {
    const visible = resolveTweenBoolean(args.item.visible, args.stepProgress);

    if (!visible) {
        return undefined;
    }

    const position = resolveTweenPoint(args.item.position, args.stepProgress);

    return htmlElement("div", {
        attributes: {
            "class": "rt-debate-render__aggregator rt-debate-render__aggregator--junction",
            "data-aggregator-id": String(args.item.id),
        },
        styles: {
            height: AGGREGATOR_BASE_SIZE_PX,
            left: position.x - (AGGREGATOR_BASE_SIZE_PX / 2),
            top: position.y - (AGGREGATOR_BASE_SIZE_PX / 2),
            width: AGGREGATOR_BASE_SIZE_PX,
        },
    });
}

export function getJunctionAggregatorBounds(args: {
    item: JunctionAggregatorViz;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const visible = resolveTweenBoolean(args.item.visible, args.stepProgress);

    if (!visible) {
        return { maxX: 0, maxY: 0 };
    }

    const position = resolveTweenPoint(args.item.position, args.stepProgress);

    return {
        maxX: position.x,
        maxY: position.y,
    };
}

