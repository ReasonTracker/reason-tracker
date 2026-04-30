import { buildResolvedSnapshotConnectorGeometryById } from "../../../app/src/planner/resolveSnapshotConnectorGeometry.ts";
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
    Bounds,
    PlannerSnapshotRenderMode,
    PlannerSnapshotRenderResult,
    SnapshotRenderInput,
} from "./renderTypes";
import { htmlElement, svgElement } from "./renderTree";

type PlannerSnapshotSceneArgs = {
    snapshot: Snapshot;
    percent: number;
    mode: PlannerSnapshotRenderMode;
    viewportBounds?: Bounds;
};

type PlannerSnapshotSceneLayout = {
    bounds: Bounds | undefined;
    claimAggregatorModels: ReturnType<typeof buildClaimAggregatorRenderModel>[];
    claimModels: NonNullable<ReturnType<typeof buildClaimRenderModel>>[];
    connectorModels: NonNullable<ReturnType<typeof buildConnectorRenderModel>>[];
    junctionAggregatorModels: ReturnType<typeof buildJunctionAggregatorRenderModel>[];
    junctionModels: NonNullable<ReturnType<typeof buildJunctionRenderModel>>[];
};

export function getPlannerSnapshotSceneBounds(args: PlannerSnapshotSceneArgs): Bounds {
    return buildPlannerSnapshotSceneLayout(args).bounds ?? {
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
    };
}

export function getPlannerSnapshotViewportTarget(args: PlannerSnapshotSceneArgs): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    const bounds = getPlannerSnapshotSceneBounds(args);
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    return {
        x: bounds.minX + width / 2,
        y: bounds.minY + height / 2,
        width,
        height,
    };
}

export function renderPlannerSnapshotScene(args: PlannerSnapshotSceneArgs): PlannerSnapshotRenderResult {
    const layout = buildPlannerSnapshotSceneLayout(args);
    const resolvedBounds = args.viewportBounds ?? layout.bounds ?? {
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
                        position: "relative",
                        height,
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
                                ...layout.connectorModels.flatMap((model) => renderConnector(model, offset)),
                                ...layout.junctionModels.map((model) => renderJunction(model, offset)),
                            ],
                        }),
                        ...layout.claimModels.map((model) => renderClaim(model, offset)),
                        ...layout.claimAggregatorModels.map((model) => renderAggregator(model, offset)),
                        ...layout.junctionAggregatorModels.map((model) => renderAggregator(model, offset)),
                    ],
                }),
            ],
        }),
    };
}

function buildPlannerSnapshotSceneLayout(args: PlannerSnapshotSceneArgs): PlannerSnapshotSceneLayout {
    const connectorGeometryById = buildResolvedSnapshotConnectorGeometryById({
        snapshot: args.snapshot,
        percent: args.percent,
    });
    const claimModels = Object.values(args.snapshot.claims)
        .map((visual) => buildClaimRenderModel(visual, args.percent))
        .filter((model): model is NonNullable<typeof model> => !!model);

    const junctionModels = Object.values(args.snapshot.junctions)
        .map((visual) => buildJunctionRenderModel({
            visual,
            percent: args.percent,
            side: resolveJunctionSide(args.snapshot, visual),
        }))
        .filter((model): model is NonNullable<typeof model> => !!model);
    const connectorModels = [
        ...Object.values(args.snapshot.relevanceConnectors),
        ...Object.values(args.snapshot.confidenceConnectors),
        ...Object.values(args.snapshot.deliveryConnectors),
    ]
        .map((visual) => buildConnectorRenderModel({
            geometry: connectorGeometryById.get(String(visual.id)),
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
    const claimAggregatorModels = Object.values(args.snapshot.claimAggregators)
        .map((visual) => buildClaimAggregatorRenderModel({
            visual,
            percent: args.percent,
            claimModel: visual.scoreNodeId ? claimModels.find((model) => model.scoreNodeId === String(visual.scoreNodeId)) : undefined,
        }));
    const junctionAggregatorModels = Object.values(args.snapshot.junctionAggregators)
        .map((visual) => buildJunctionAggregatorRenderModel({
            visual,
            percent: args.percent,
            junctionModel: visual.scoreNodeId
                ? junctionModels.find((model) => model.scoreNodeId === String(visual.scoreNodeId))
                : undefined,
        }));

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

    return {
        bounds,
        claimAggregatorModels,
        claimModels,
        connectorModels,
        junctionAggregatorModels,
        junctionModels,
    };
}

export function renderVoilaSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "voila",
        viewportBounds: input.viewportBounds,
    });
}

export function renderSproutSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "sprout",
        viewportBounds: input.viewportBounds,
    });
}

export function renderFirstFillSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "firstFill",
        viewportBounds: input.viewportBounds,
    });
}

export function renderScaleSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "scale",
        viewportBounds: input.viewportBounds,
    });
}

export function renderOrderSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "order",
        viewportBounds: input.viewportBounds,
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