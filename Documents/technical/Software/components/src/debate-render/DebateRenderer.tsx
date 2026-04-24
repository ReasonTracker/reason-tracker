import type {
    Debate,
    DebateLayout,
    DebateLayoutConnectorJunction,
    DebateLayoutConnectorSpan,
    DebateLayoutNode,
    Score,
    ScoreId,
} from "@reasontracker/engine";
import {
    BASE_NODE_HEIGHT_PX,
    BASE_NODE_WIDTH_PX,
} from "@reasontracker/engine";
import type { ReactNode } from "react";

import {
    type Waypoint,
} from "../path-geometry";
import { DebateConnector, type DebateConnectorLayer } from "./DebateConnector";

// AGENT NOTE: Keep tunable render constants grouped here so visual tuning stays localized.
/** Padding inserted between the graph bounds and the visible scene edge. */
const GRAPH_PADDING_PX = 96;

/** Outer inset retained so the centered graph does not touch the frame edge. */
const FRAME_PADDING_PX = 40;

/** Outline width shared by connector walls and connector junction frames. */
const CONNECTOR_OUTLINE_WIDTH_PX = 4;

export interface DebateRendererProps {
    debate: Debate;
    layout: DebateLayout;
    viewportHeightPx?: number;
    viewportWidthPx?: number;
}

interface RenderNode {
    node: DebateLayoutNode;
    score: Score;
    renderX: number;
    renderY: number;
}

interface ConnectorVisual {
    visualId: string;
    centerlinePoints: Waypoint[];
    fluidWidth: number;
    outlineWidth: number;
    pipeWidth: number;
    side: Score["connectorSide"];
}

interface RenderConnectorJunction {
    centerX: number;
    centerY: number;
    leftHeight: number;
    rightHeight: number;
    side: Score["connectorSide"];
    visualId: string;
    width: number;
}

export const DebateRenderer = ({
    debate,
    layout,
    viewportHeightPx,
    viewportWidthPx,
}: DebateRendererProps) => {
    const graphWidth = Math.max(1, Math.ceil(layout.bounds.width + (GRAPH_PADDING_PX * 2)));
    const graphHeight = Math.max(1, Math.ceil(layout.bounds.height + (GRAPH_PADDING_PX * 2)));
    const graphScale = getGraphScale({
        graphHeight,
        graphWidth,
        viewportHeightPx,
        viewportWidthPx,
    });
    const scaledGraphHeight = Math.max(1, Math.ceil(graphHeight * graphScale));
    const scaledGraphWidth = Math.max(1, Math.ceil(graphWidth * graphScale));
    const renderNodes = layout.nodesInOrder.map((node) => buildRenderNode(debate, layout, node));
    const connectorVisuals = layout.connectorSpansInOrder.map((span) => buildRenderConnectorVisual(layout, span));
    const connectorJunctions = layout.connectorJunctionsInOrder.map((junction) => buildRenderConnectorJunction(layout, junction));
    const connectorLayerElements: ReactNode[] = (["pipeWalls", "pipeInterior", "fluid"] satisfies DebateConnectorLayer[]).flatMap((layer) => (
        connectorVisuals.map((connector) => (
            <DebateConnector
                key={`${layer}:${connector.visualId}`}
                centerlinePoints={connector.centerlinePoints}
                fluidWidth={connector.fluidWidth}
                layer={layer}
                outlineWidth={connector.outlineWidth}
                pipeWidth={connector.pipeWidth}
                side={connector.side}
            />
        ))
    ));
    const connectorJunctionElements = connectorJunctions.map(renderConnectorJunction);

    return (
        <div
            style={{
                background: "#000000",
                boxSizing: "border-box",
                color: "#ffffff",
                display: "flex",
                fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
                height: "100%",
                justifyContent: "center",
                overflow: "hidden",
                padding: FRAME_PADDING_PX,
                width: "100%",
            }}
        >
            <div
                style={{
                    alignSelf: "center",
                    flex: "0 0 auto",
                    height: scaledGraphHeight,
                    position: "relative",
                    width: scaledGraphWidth,
                }}
            >
                <div
                    style={{
                        height: graphHeight,
                        left: 0,
                        position: "absolute",
                        top: 0,
                        transform: `scale(${graphScale})`,
                        transformOrigin: "top left",
                        width: graphWidth,
                    }}
                >
                    <svg
                        aria-hidden="true"
                        style={{
                            inset: 0,
                            overflow: "visible",
                            position: "absolute",
                        }}
                        viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                    >
                        {connectorLayerElements}
                        {connectorJunctionElements}
                    </svg>
                    {renderNodes.map((renderNode) => {
                        const cardScale = Math.min(
                            renderNode.node.width / BASE_NODE_WIDTH_PX,
                            renderNode.node.height / BASE_NODE_HEIGHT_PX,
                        );
                        const cardFill = resolveSideFill(renderNode.score.claimSide, 0.3);
                        const cardStroke = resolveSideStroke(renderNode.score.claimSide);
                        const labelText = formatConfidenceLabel(renderNode.score.claimConfidence);

                        return (
                            <article
                                key={renderNode.node.scoreId}
                                style={{
                                    boxSizing: "border-box",
                                    height: renderNode.node.height,
                                    left: renderNode.renderX,
                                    overflow: "visible",
                                    position: "absolute",
                                    top: renderNode.renderY,
                                    width: renderNode.node.width,
                                }}
                            >
                                <div
                                    style={{
                                        height: BASE_NODE_HEIGHT_PX,
                                        left: "50%",
                                        position: "absolute",
                                        top: "50%",
                                        transform: `translate(-50%, -50%) scale(${cardScale})`,
                                        transformOrigin: "center center",
                                        width: BASE_NODE_WIDTH_PX,
                                    }}
                                >
                                    <div
                                        style={{
                                            background: cardFill,
                                            border: `4px solid ${cardStroke}`,
                                            boxSizing: "border-box",
                                            display: "flex",
                                            flexDirection: "column",
                                            height: "100%",
                                            justifyContent: "space-between",
                                            overflow: "hidden",
                                            padding: "16px 20px 14px",
                                            width: "100%",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "-webkit-box",
                                                fontSize: 18,
                                                fontWeight: 600,
                                                lineClamp: 4,
                                                lineHeight: 1.08,
                                                overflow: "hidden",
                                                WebkitBoxOrient: "vertical",
                                                WebkitLineClamp: 4,
                                            }}
                                        >
                                            {renderNode.node.claimContent}
                                        </div>
                                        <small
                                            style={{
                                                color: "#d1d5db",
                                                fontSize: 14,
                                                fontWeight: 600,
                                                letterSpacing: "0.03em",
                                                marginTop: 10,
                                            }}
                                        >
                                            {labelText}
                                        </small>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

function buildRenderNode(
    debate: Debate,
    layout: DebateLayout,
    node: DebateLayoutNode,
): RenderNode {
    const score = debate.scores[node.scoreId];
    if (!score) {
        throw new Error(`Score ${node.scoreId} was not found while rendering.`);
    }

    return {
        node,
        score,
        renderX: mapLayoutX(layout, node.x),
        renderY: mapLayoutY(layout, node.y),
    };
}

function buildRenderConnectorVisual(
    layout: DebateLayout,
    span: DebateLayoutConnectorSpan,
): ConnectorVisual {
    return {
        centerlinePoints: span.centerlinePoints.map((point) => ({
            ...point,
            x: mapLayoutX(layout, point.x),
            y: mapLayoutY(layout, point.y),
        })),
        fluidWidth: span.fluidWidth,
        outlineWidth: getConnectorOutlineWidth(),
        pipeWidth: span.pipeWidth,
        side: span.side,
        visualId: span.visualId,
    };
}

function buildRenderConnectorJunction(
    layout: DebateLayout,
    junction: DebateLayoutConnectorJunction,
): RenderConnectorJunction {
    return {
        centerX: mapLayoutX(layout, junction.centerX),
        centerY: mapLayoutY(layout, junction.centerY),
        leftHeight: junction.leftHeight,
        rightHeight: junction.rightHeight,
        side: junction.side,
        visualId: junction.visualId,
        width: junction.width,
    };
}

function renderConnectorJunction(visual: RenderConnectorJunction): ReactNode {
    const leftX = visual.centerX - (visual.width / 2);
    const rightX = visual.centerX + (visual.width / 2);
    const leftTopY = visual.centerY - (visual.leftHeight / 2);
    const rightTopY = visual.centerY - (visual.rightHeight / 2);
    const rightBottomY = visual.centerY + (visual.rightHeight / 2);
    const leftBottomY = visual.centerY + (visual.leftHeight / 2);
    const pathData = [
        `M ${leftX} ${leftTopY}`,
        `L ${rightX} ${rightTopY}`,
        `L ${rightX} ${rightBottomY}`,
        `L ${leftX} ${leftBottomY}`,
        "Z",
    ].join(" ");

    return (
        <path
            key={visual.visualId}
            d={pathData}
            fill="none"
            pointerEvents="none"
            stroke={resolveSideStroke(visual.side)}
            strokeLinejoin="round"
            strokeWidth={getConnectorOutlineWidth()}
        />
    );
}

function mapLayoutX(layout: DebateLayout, x: number): number {
    return Math.round(x - layout.bounds.left + GRAPH_PADDING_PX);
}

function mapLayoutY(layout: DebateLayout, y: number): number {
    return Math.round(y - layout.bounds.top + GRAPH_PADDING_PX);
}

function getGraphScale(args: {
    graphHeight: number;
    graphWidth: number;
    viewportHeightPx: number | undefined;
    viewportWidthPx: number | undefined;
}): number {
    const availableWidth = args.viewportWidthPx === undefined
        ? args.graphWidth
        : Math.max(1, args.viewportWidthPx - (FRAME_PADDING_PX * 2));
    const availableHeight = args.viewportHeightPx === undefined
        ? args.graphHeight
        : Math.max(1, args.viewportHeightPx - (FRAME_PADDING_PX * 2));

    return Math.min(1, availableWidth / args.graphWidth, availableHeight / args.graphHeight);
}

function getConnectorOutlineWidth(): number {
    return CONNECTOR_OUTLINE_WIDTH_PX;
}

function resolveSideStroke(side: Score["claimSide"]): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}

function resolveSideFill(side: Score["claimSide"], alpha: number): string {
    if (side === "proMain") {
        return `hsl(var(--pro-h) 100% var(--pro-l) / ${alpha})`;
    }

    return `hsl(var(--con-h) 100% var(--con-l) / ${alpha})`;
}

function formatConfidenceLabel(confidence: number): string {
    return `${Math.round(confidence * 100)}% confidence`;
}
