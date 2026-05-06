import {
    resolvePlannerOptions,
    type PlannerOptions,
} from "../../../../app/src/planner/contracts.ts";
import type {
    DeliveryAggregatorViz,
    ClaimViz,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    RelevanceAggregatorViz,
    JunctionViz,
    RelevanceConnectorViz,
    Snapshot,
    Side,
} from "../../../../app/src/planner/Snapshot.ts";

import { getClaimBounds, renderClaim } from "./renderClaim";
import { getDeliveryAggregatorBounds, renderDeliveryAggregator } from "./renderDeliveryAggregator";
import { getConnectorBounds, renderConnector } from "./renderConnector";
import { getJunctionBounds, renderJunction } from "./renderJunction";
import { getRelevanceAggregatorBounds, renderRelevanceAggregator } from "./renderRelevanceAggregator";
import { htmlElement, svgElement } from "./renderTree";
import type {
    DebateRenderResult,
    DebateSnapshotRenderState,
    RenderElementNode,
    RenderStepProgress,
} from "./renderTypes";

const GRAPH_PADDING_PX = 96;

export function renderDebateSnapshot(args: RenderStepProgress & {
    renderState: DebateSnapshotRenderState;
}): DebateRenderResult {
    const claims: ClaimViz[] = [];
    const deliveryAggregators: DeliveryAggregatorViz[] = [];
    const junctions: JunctionViz[] = [];
    const relevanceAggregators: RelevanceAggregatorViz[] = [];
    const connectors: Array<
        ConfidenceConnectorViz
        | DeliveryConnectorViz
        | RelevanceConnectorViz
    > = [];

    for (const item of Object.values(args.renderState.snapshot)) {
        if (item.type === "claim") {
            claims.push(item);
            continue;
        }

        if (item.type === "deliveryAggregator") {
            deliveryAggregators.push(item);
            continue;
        }

        if (item.type === "junction") {
            junctions.push(item);
            continue;
        }

        if (item.type === "relevanceAggregator") {
            relevanceAggregators.push(item);
            continue;
        }

        connectors.push(item);
    }

    const plannerOptions = resolvePlannerOptions(args.renderState.plannerOptions);

    const width = computeSceneWidth({
        deliveryAggregators,
        claims,
        connectors,
        plannerOptions,
        relevanceAggregators,
        junctions,
        snapshot: args.renderState.snapshot,
        stepProgress: args.stepProgress,
    });
    const height = computeSceneHeight({
        deliveryAggregators,
        claims,
        connectors,
        plannerOptions,
        relevanceAggregators,
        junctions,
        snapshot: args.renderState.snapshot,
        stepProgress: args.stepProgress,
    });
    const junctionSideByConfidenceConnectorId = new Map<string, Side>();

    for (const connector of connectors) {
        if (connector.type === "confidenceConnector") {
            junctionSideByConfidenceConnectorId.set(String(connector.confidenceConnectorId), connector.side);
        }
    }

    const root = htmlElement("div", {
        attributes: {
            "aria-label": "Reason Tracker debate graph",
            "class": "rt-debate-render",
            "data-renderer": "debate-snapshot",
        },
        styles: {
            height,
            width,
        },
        children: [
            htmlElement("div", {
                attributes: {
                    "class": "rt-debate-render__scene",
                },
                styles: {
                    height,
                    width,
                },
                children: [
                    svgElement("svg", {
                        attributes: {
                            "aria-hidden": true,
                            "class": "rt-debate-render__svg",
                            "height": height,
                            "viewBox": `0 0 ${width} ${height}`,
                            "width": width,
                        },
                        children: [
                            ...connectors.flatMap((connector) => renderConnector({
                                item: connector,
                                plannerOptions,
                                snapshot: args.renderState.snapshot,
                                stepProgress: args.stepProgress,
                            })),
                            ...junctions
                                .map((junction) => renderJunction({
                                    item: junction,
                                    side: junctionSideByConfidenceConnectorId.get(String(junction.confidenceConnectorId)),
                                    stepProgress: args.stepProgress,
                                }))
                                .filter((node): node is RenderElementNode => !!node),
                            ...deliveryAggregators
                                .map((aggregator) => renderDeliveryAggregator({
                                    item: aggregator,
                                    plannerOptions,
                                    snapshot: args.renderState.snapshot,
                                    stepProgress: args.stepProgress,
                                }))
                                .filter((node): node is RenderElementNode => !!node),
                            ...relevanceAggregators
                                .map((aggregator) => renderRelevanceAggregator({
                                    item: aggregator,
                                    plannerOptions,
                                    snapshot: args.renderState.snapshot,
                                    stepProgress: args.stepProgress,
                                }))
                                .filter((node): node is RenderElementNode => !!node),
                        ],
                    }),
                    ...claims
                        .map((claim) => renderClaim({
                            claim: args.renderState.debateCore.claims[claim.claimId],
                            item: claim,
                            plannerOptions,
                            stepProgress: args.stepProgress,
                        }))
                        .filter((node): node is RenderElementNode => !!node),
                ],
            }),
        ],
    });

    return {
        height,
        root,
        width,
    };
}

function computeSceneWidth(args: {
    deliveryAggregators: DeliveryAggregatorViz[];
    claims: ClaimViz[];
    connectors: Array<ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz>;
    plannerOptions: PlannerOptions;
    relevanceAggregators: RelevanceAggregatorViz[];
    junctions: JunctionViz[];
    snapshot: Snapshot;
    stepProgress: number;
}): number {
    let maxX = 1920 - GRAPH_PADDING_PX;

    for (const claim of args.claims) {
        maxX = Math.max(maxX, getClaimBounds({
            item: claim,
            plannerOptions: args.plannerOptions,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const aggregator of args.deliveryAggregators) {
        maxX = Math.max(maxX, getDeliveryAggregatorBounds({
            item: aggregator,
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const junction of args.junctions) {
        maxX = Math.max(maxX, getJunctionBounds({
            item: junction,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const aggregator of args.relevanceAggregators) {
        maxX = Math.max(maxX, getRelevanceAggregatorBounds({
            item: aggregator,
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const connector of args.connectors) {
        maxX = Math.max(maxX, getConnectorBounds({
            item: connector,
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    return Math.max(1920, Math.ceil(maxX + GRAPH_PADDING_PX));
}

function computeSceneHeight(args: {
    deliveryAggregators: DeliveryAggregatorViz[];
    claims: ClaimViz[];
    connectors: Array<ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz>;
    plannerOptions: PlannerOptions;
    relevanceAggregators: RelevanceAggregatorViz[];
    junctions: JunctionViz[];
    snapshot: Snapshot;
    stepProgress: number;
}): number {
    let maxY = 1080 - GRAPH_PADDING_PX;

    for (const claim of args.claims) {
        maxY = Math.max(maxY, getClaimBounds({
            item: claim,
            plannerOptions: args.plannerOptions,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const aggregator of args.deliveryAggregators) {
        maxY = Math.max(maxY, getDeliveryAggregatorBounds({
            item: aggregator,
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const junction of args.junctions) {
        maxY = Math.max(maxY, getJunctionBounds({
            item: junction,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const aggregator of args.relevanceAggregators) {
        maxY = Math.max(maxY, getRelevanceAggregatorBounds({
            item: aggregator,
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const connector of args.connectors) {
        maxY = Math.max(maxY, getConnectorBounds({
            item: connector,
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    return Math.max(1080, Math.ceil(maxY + GRAPH_PADDING_PX));
}
