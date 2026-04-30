import type {
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    JunctionViz,
    Snapshot,
    Side,
} from "../../../app/src/app.js";

import { mergeBounds } from "./bounds";
import {
    CONNECTOR_LAYER_STYLES,
    GRAPH_PADDING_PX,
    GRAPH_ROOT_STYLES,
} from "./sceneConstants";
import {
    buildClaimAggregatorRenderModel,
    buildJunctionAggregatorRenderModel,
    renderAggregator,
} from "./renderAggregator";
import { buildClaimRenderModel, renderClaim } from "./renderClaim";
import { buildConnectorRenderModel, renderConnector } from "./renderConnector";
import { buildJunctionRenderModel, renderJunction } from "./renderJunction";
import type {
    PlannerSnapshotRenderMode,
    PlannerSnapshotRenderResult,
    SnapshotRenderInput,
} from "./renderTypes";
import { htmlElement, svgElement } from "./renderTree";

export function renderPlannerSnapshotScene(args: {
    snapshot: Snapshot;
    percent: number;
    mode: PlannerSnapshotRenderMode;
}): PlannerSnapshotRenderResult {
    const connectorModels = [
        ...Object.values(args.snapshot.relevanceConnectors),
        ...Object.values(args.snapshot.confidenceConnectors),
        ...Object.values(args.snapshot.deliveryConnectors),
    ]
        .map((visual) => buildConnectorRenderModel({
            visual,
            percent: args.percent,
            mode: args.mode,
        }))
        .filter((model): model is NonNullable<typeof model> => !!model)
        .sort((left, right) => {
            const leftMidY = midpointY(left.centerlinePoints);
            const rightMidY = midpointY(right.centerlinePoints);
            return leftMidY - rightMidY || left.id.localeCompare(right.id);
        });
    const claimModels = Object.values(args.snapshot.claims)
        .map((visual) => buildClaimRenderModel(visual, args.percent))
        .filter((model): model is NonNullable<typeof model> => !!model);
    const claimAggregatorModels = Object.values(args.snapshot.claimAggregators)
        .map((visual) => buildClaimAggregatorRenderModel(visual, args.percent));
    const junctionAggregatorModels = Object.values(args.snapshot.junctionAggregators)
        .map((visual) => buildJunctionAggregatorRenderModel(visual, args.percent));
    const junctionModels = Object.values(args.snapshot.junctions)
        .map((visual) => buildJunctionRenderModel({
            visual,
            percent: args.percent,
            side: resolveJunctionSide(args.snapshot, visual),
        }))
        .filter((model): model is NonNullable<typeof model> => !!model);

    let bounds = undefined;

    for (const connectorModel of connectorModels) {
        bounds = mergeBounds(bounds, connectorModel.bounds);
    }

    for (const claimModel of claimModels) {
        bounds = mergeBounds(bounds, claimModel.bounds);
    }

    for (const aggregatorModel of claimAggregatorModels) {
        bounds = mergeBounds(bounds, aggregatorModel.bounds);
    }

    for (const aggregatorModel of junctionAggregatorModels) {
        bounds = mergeBounds(bounds, aggregatorModel.bounds);
    }

    for (const junctionModel of junctionModels) {
        bounds = mergeBounds(bounds, junctionModel.bounds);
    }

    const resolvedBounds = bounds ?? {
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
    };
    const width = Math.max(1, Math.ceil(resolvedBounds.maxX - resolvedBounds.minX + GRAPH_PADDING_PX * 2));
    const height = Math.max(1, Math.ceil(resolvedBounds.maxY - resolvedBounds.minY + GRAPH_PADDING_PX * 2));
    const offset = {
        x: GRAPH_PADDING_PX - resolvedBounds.minX,
        y: GRAPH_PADDING_PX - resolvedBounds.minY,
    };

    return {
        root: htmlElement("div", {
            attributes: {
                "aria-label": "Reason Tracker graph",
                "data-render-mode": args.mode,
                "data-renderer": "planner-snapshot-scene",
            },
            styles: {
                ...GRAPH_ROOT_STYLES,
                height,
                width,
            },
            children: [
                htmlElement("div", {
                    styles: {
                        height,
                        position: "relative",
                        width,
                    },
                    children: [
                        svgElement("svg", {
                            attributes: {
                                "aria-hidden": true,
                                height,
                                viewBox: `0 0 ${width} ${height}`,
                                width,
                            },
                            styles: CONNECTOR_LAYER_STYLES,
                            children: [
                                ...connectorModels.flatMap((model) => renderConnector(model, offset)),
                                ...junctionModels.map((model) => renderJunction(model, offset)),
                            ],
                        }),
                        ...claimModels.map((model) => renderClaim(model, offset)),
                        ...claimAggregatorModels.map((model) => renderAggregator(model, offset)),
                        ...junctionAggregatorModels.map((model) => renderAggregator(model, offset)),
                    ],
                }),
            ],
        }),
    };
}

export function renderVoilaSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "voila",
    });
}

export function renderSproutSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "sprout",
    });
}

export function renderFirstFillSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "firstFill",
    });
}

export function renderScaleSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "scale",
    });
}

export function renderOrderSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "order",
    });
}

function midpointY(points: ReadonlyArray<{ y: number }>): number {
    if (points.length < 1) {
        return 0;
    }

    return points.reduce((total, point) => total + point.y, 0) / points.length;
}

function resolveJunctionSide(snapshot: Snapshot, visual: JunctionViz): Side {
    const confidenceConnector = findConfidenceConnector(snapshot, visual);

    if (confidenceConnector) {
        return confidenceConnector.side;
    }

    const deliveryConnector = findDeliveryConnector(snapshot, visual);

    return deliveryConnector?.side ?? "proMain";
}

function findConfidenceConnector(snapshot: Snapshot, visual: JunctionViz): ConfidenceConnectorViz | undefined {
    if (visual.confidenceConnectorId) {
        return Object.values(snapshot.confidenceConnectors).find(
            (connector) => connector.confidenceConnectorId === visual.confidenceConnectorId,
        );
    }

    if (!visual.scoreNodeId) {
        return undefined;
    }

    return Object.values(snapshot.confidenceConnectors).find(
        (connector) => connector.scoreNodeId === visual.scoreNodeId,
    );
}

function findDeliveryConnector(snapshot: Snapshot, visual: JunctionViz): DeliveryConnectorViz | undefined {
    if (!visual.scoreNodeId) {
        return undefined;
    }

    return Object.values(snapshot.deliveryConnectors).find(
        (connector) => connector.scoreNodeId === visual.scoreNodeId,
    );
}