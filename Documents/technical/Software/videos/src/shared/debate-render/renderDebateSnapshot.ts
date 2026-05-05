import type {
    ClaimAggregatorViz,
    ClaimViz,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    JunctionAggregatorViz,
    JunctionViz,
    RelevanceConnectorViz,
    Snapshot,
    Side,
} from "../../../../app/src/planner/Snapshot.ts";

import { getClaimBounds, renderClaim } from "./renderClaim";
import { getClaimAggregatorBounds, renderClaimAggregator } from "./renderClaimAggregator";
import { getConnectorBounds, renderConnector } from "./renderConnector";
import { getJunctionBounds, renderJunction } from "./renderJunction";
import { getJunctionAggregatorBounds, renderJunctionAggregator } from "./renderJunctionAggregator";
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
    const claimAggregators: ClaimAggregatorViz[] = [];
    const junctions: JunctionViz[] = [];
    const junctionAggregators: JunctionAggregatorViz[] = [];
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

        if (item.type === "claimAggregator") {
            claimAggregators.push(item);
            continue;
        }

        if (item.type === "junction") {
            junctions.push(item);
            continue;
        }

        if (item.type === "junctionAggregator") {
            junctionAggregators.push(item);
            continue;
        }

        connectors.push(item);
    }

    const width = computeSceneWidth({
        claimAggregators,
        claims,
        connectors,
        junctionAggregators,
        junctions,
        snapshot: args.renderState.snapshot,
        stepProgress: args.stepProgress,
    });
    const height = computeSceneHeight({
        claimAggregators,
        claims,
        connectors,
        junctionAggregators,
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
                        ],
                    }),
                    ...claims
                        .map((claim) => renderClaim({
                            claim: args.renderState.debateCore.claims[claim.claimId],
                            item: claim,
                            stepProgress: args.stepProgress,
                        }))
                        .filter((node): node is RenderElementNode => !!node),
                    ...claimAggregators.map((aggregator) => renderClaimAggregator({
                        item: aggregator,
                        stepProgress: args.stepProgress,
                    })),
                    ...junctionAggregators
                        .map((aggregator) => renderJunctionAggregator({
                            item: aggregator,
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
    claimAggregators: ClaimAggregatorViz[];
    claims: ClaimViz[];
    connectors: Array<ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz>;
    junctionAggregators: JunctionAggregatorViz[];
    junctions: JunctionViz[];
    snapshot: Snapshot;
    stepProgress: number;
}): number {
    let maxX = 1920 - GRAPH_PADDING_PX;

    for (const claim of args.claims) {
        maxX = Math.max(maxX, getClaimBounds({
            item: claim,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const aggregator of args.claimAggregators) {
        maxX = Math.max(maxX, getClaimAggregatorBounds({
            item: aggregator,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const junction of args.junctions) {
        maxX = Math.max(maxX, getJunctionBounds({
            item: junction,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const aggregator of args.junctionAggregators) {
        maxX = Math.max(maxX, getJunctionAggregatorBounds({
            item: aggregator,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    for (const connector of args.connectors) {
        maxX = Math.max(maxX, getConnectorBounds({
            item: connector,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxX);
    }

    return Math.max(1920, Math.ceil(maxX + GRAPH_PADDING_PX));
}

function computeSceneHeight(args: {
    claimAggregators: ClaimAggregatorViz[];
    claims: ClaimViz[];
    connectors: Array<ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz>;
    junctionAggregators: JunctionAggregatorViz[];
    junctions: JunctionViz[];
    snapshot: Snapshot;
    stepProgress: number;
}): number {
    let maxY = 1080 - GRAPH_PADDING_PX;

    for (const claim of args.claims) {
        maxY = Math.max(maxY, getClaimBounds({
            item: claim,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const aggregator of args.claimAggregators) {
        maxY = Math.max(maxY, getClaimAggregatorBounds({
            item: aggregator,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const junction of args.junctions) {
        maxY = Math.max(maxY, getJunctionBounds({
            item: junction,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const aggregator of args.junctionAggregators) {
        maxY = Math.max(maxY, getJunctionAggregatorBounds({
            item: aggregator,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    for (const connector of args.connectors) {
        maxY = Math.max(maxY, getConnectorBounds({
            item: connector,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        }).maxY);
    }

    return Math.max(1080, Math.ceil(maxY + GRAPH_PADDING_PX));
}
