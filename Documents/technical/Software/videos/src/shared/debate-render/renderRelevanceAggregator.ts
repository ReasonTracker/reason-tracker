import type {
    RelevanceAggregatorViz,
    Snapshot,
} from "../../../../app/src/planner/Snapshot.ts";

import {
    getAggregatorBounds,
    renderAggregatorOutline,
    resolveRelevanceAggregatorGeometry,
} from "./renderAggregator";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

export function renderRelevanceAggregator(args: {
    item: RelevanceAggregatorViz;
    snapshot: Snapshot;
} & RenderStepProgress): RenderElementNode | undefined {
    const geometry = resolveRelevanceAggregatorGeometry(args);

    return geometry ? renderAggregatorOutline(geometry) : undefined;
}

export function getRelevanceAggregatorBounds(args: {
    item: RelevanceAggregatorViz;
    snapshot: Snapshot;
} & RenderStepProgress): { maxX: number; maxY: number } {
    return getAggregatorBounds(resolveRelevanceAggregatorGeometry(args));
}
