import type {
    DeliveryAggregatorViz,
    Snapshot,
} from "../../../../app/src/planner/Snapshot.ts";
import type { PlannerOptions } from "../../../../app/src/planner/contracts.ts";

import {
    getAggregatorBounds,
    renderAggregatorOutline,
    resolveDeliveryAggregatorGeometry,
} from "./renderAggregator";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

export function renderDeliveryAggregator(args: {
    item: DeliveryAggregatorViz;
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
} & RenderStepProgress): RenderElementNode | undefined {
    const geometry = resolveDeliveryAggregatorGeometry(args);

    return geometry ? renderAggregatorOutline(geometry) : undefined;
}

export function getDeliveryAggregatorBounds(args: {
    item: DeliveryAggregatorViz;
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
} & RenderStepProgress): { maxX: number; maxY: number } {
    return getAggregatorBounds(resolveDeliveryAggregatorGeometry(args));
}
