import type { Waypoint } from "@reasontracker/components";
import {
    layoutDebate,
    type ClaimId,
    type ConnectorId,
    type Debate,
    type DebateLayout,
    type DebateLayoutConnectorJunction,
    type DebateLayoutConnectorSpan,
    type DebateLayoutNode,
    type Score,
    type ScoreId,
} from "../../../engine/src/index.ts";

// AGENT NOTE: Keep graph snapshot layout tunables grouped here so render-space mapping stays easy to tune.
/** World-space padding added around engine layout bounds when mapping graph coordinates into render space. */
const GRAPH_PADDING_PX = 96;

export type GraphTransitionDirection = "sourceToTarget" | "targetToSource";

export type GraphNodeVisual = {
    scoreId: ScoreId;
    claimId: ClaimId;
    content: string;
    side: Score["claimSide"];
    confidence: number;
    relevance: number;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    insertScale: number;
};

export type GraphConnectorSpanVisual = {
    visualId: string;
    connectorId: ConnectorId;
    spanType: DebateLayoutConnectorSpan["spanType"];
    centerlinePoints: Waypoint[];
    fluidWidth: number;
    pipeWidth: number;
    side: Score["connectorSide"];
    opacity: number;
    fluidProgress: number;
    pipeProgress: number;
    direction: GraphTransitionDirection;
    updateTransition?: {
        fromFluidWidth: number;
        fromPipeWidth: number;
        toFluidWidth: number;
        toPipeWidth: number;
        progress: number;
        direction: GraphTransitionDirection;
    };
};

export type GraphConnectorJunctionVisual = {
    visualId: string;
    targetConfidenceConnectorId: ConnectorId;
    centerX: number;
    centerY: number;
    leftHeight: number;
    rightHeight: number;
    side: Score["connectorSide"];
    width: number;
    opacity: number;
};

export type GraphRenderState = {
    width: number;
    height: number;
    nodeRenderOrder: ScoreId[];
    connectorSpanRenderOrder: string[];
    connectorJunctionRenderOrder: string[];
    nodeByScoreId: Record<ScoreId, GraphNodeVisual>;
    connectorSpanByVisualId: Record<string, GraphConnectorSpanVisual>;
    connectorJunctionByVisualId: Record<string, GraphConnectorJunctionVisual>;
};

export type GraphSnapshot = {
    debate: Debate;
    layout: DebateLayout;
    renderState: GraphRenderState;
};

export function buildGraphSnapshot(debate: Debate): GraphSnapshot {
    const layout = layoutDebate(debate);

    return {
        debate,
        layout,
        renderState: buildRenderState(debate, layout),
    };
}

function buildRenderState(debate: Debate, layout: DebateLayout): GraphRenderState {
    const graphWidth = Math.max(1, Math.ceil(layout.bounds.width + GRAPH_PADDING_PX * 2));
    const graphHeight = Math.max(1, Math.ceil(layout.bounds.height + GRAPH_PADDING_PX * 2));
    const nodeByScoreId = {} as Record<ScoreId, GraphNodeVisual>;
    const connectorSpanByVisualId: Record<string, GraphConnectorSpanVisual> = {};
    const connectorJunctionByVisualId: Record<string, GraphConnectorJunctionVisual> = {};

    for (const node of layout.nodesInOrder) {
        nodeByScoreId[node.scoreId] = buildNodeVisual(debate, layout, node);
    }

    for (const span of layout.connectorSpansInOrder) {
        connectorSpanByVisualId[span.visualId] = buildConnectorSpanVisual(layout, span);
    }

    for (const junction of layout.connectorJunctionsInOrder) {
        connectorJunctionByVisualId[junction.visualId] = buildConnectorJunctionVisual(layout, junction);
    }

    return {
        width: graphWidth,
        height: graphHeight,
        nodeRenderOrder: layout.nodesInOrder.map((node) => node.scoreId),
        connectorSpanRenderOrder: layout.connectorSpansInOrder.map((span) => span.visualId),
        connectorJunctionRenderOrder: layout.connectorJunctionsInOrder.map((junction) => junction.visualId),
        nodeByScoreId,
        connectorSpanByVisualId,
        connectorJunctionByVisualId,
    };
}

function buildNodeVisual(
    debate: Debate,
    layout: DebateLayout,
    node: DebateLayoutNode,
): GraphNodeVisual {
    const score = debate.scores[node.scoreId];
    if (!score) {
        throw new Error(`Score ${node.scoreId} was not found while building graph render state.`);
    }

    return {
        scoreId: node.scoreId,
        claimId: node.claimId,
        content: node.claimContent,
        side: score.claimSide,
        confidence: score.claimConfidence,
        relevance: score.relevance,
        x: mapLayoutX(layout, node.x),
        y: mapLayoutY(layout, node.y),
        width: node.width,
        height: node.height,
        opacity: 1,
        insertScale: 1,
    };
}

function buildConnectorSpanVisual(
    layout: DebateLayout,
    span: DebateLayoutConnectorSpan,
): GraphConnectorSpanVisual {
    return {
        visualId: span.visualId,
        connectorId: span.connectorId,
        spanType: span.spanType,
        centerlinePoints: span.centerlinePoints.map((point) => ({
            ...point,
            x: mapLayoutX(layout, point.x),
            y: mapLayoutY(layout, point.y),
        })),
        fluidWidth: span.fluidWidth,
        pipeWidth: span.pipeWidth,
        side: span.side,
        opacity: 1,
        fluidProgress: 1,
        pipeProgress: 1,
        direction: "sourceToTarget",
    };
}

function buildConnectorJunctionVisual(
    layout: DebateLayout,
    junction: DebateLayoutConnectorJunction,
): GraphConnectorJunctionVisual {
    return {
        visualId: junction.visualId,
        targetConfidenceConnectorId: junction.targetConfidenceConnectorId,
        centerX: mapLayoutX(layout, junction.centerX),
        centerY: mapLayoutY(layout, junction.centerY),
        leftHeight: junction.leftHeight,
        rightHeight: junction.rightHeight,
        side: junction.side,
        width: junction.width,
        opacity: junction.width > 0.0001 ? 1 : 0,
    };
}

function mapLayoutX(layout: DebateLayout, x: number): number {
    return Math.round(x - layout.bounds.left + GRAPH_PADDING_PX);
}

function mapLayoutY(layout: DebateLayout, y: number): number {
    return Math.round(y - layout.bounds.top + GRAPH_PADDING_PX);
}
