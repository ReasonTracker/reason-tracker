import type {
    ConfidenceConnector,
    Debate,
    DebateLayout,
    DebateLayoutNode,
    RelevanceConnector,
    ScoreId,
    Score,
} from "@reasontracker/engine";
import {
    BASE_NODE_HEIGHT_PX,
    BASE_NODE_WIDTH_PX,
    toLayoutScale,
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

/** Shortest horizontal run kept before a connector turns into its diagonal middle section. */
const MIN_CONNECTOR_STRAIGHT_PX = 34;

/** Smallest diagonal run preserved between the two horizontal connector stubs. */
const MIN_CONNECTOR_DIAGONAL_PX = 36;

/** Smallest centerline bend radius retained before pipe width is considered. */
const MIN_CONNECTOR_BEND_RADIUS_PX = 12;

/** Minimum inner bend radius as a fraction of the rendered pipe width. */
const MIN_CONNECTOR_INNER_BEND_RADIUS_RATIO = 0.3;

/** Position of a connector junction along its confidence connector, measured from source claim to target claim. */
const CONNECTOR_JUNCTION_PATH_PROGRESS = 1 / 4;

/** Corner radius fraction used by connector junction frames. */
const CONNECTOR_JUNCTION_CORNER_RADIUS_RATIO = 0.08;

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

interface ConfidenceConnectorDraft {
    connector: ConfidenceConnector;
    pipeWidth: number;
    side: Score["connectorSide"];
    sourceNode: RenderNode;
    targetNode: RenderNode;
}

interface ConfidenceConnectorPlan {
    actualConfidenceSlot: ActualConfidenceSlot | undefined;
    draft: ConfidenceConnectorDraft;
    targetPoint: { x: number; y: number };
    junction?: ConnectorJunction;
}

interface RelevanceConnectorDraft {
    connector: RelevanceConnector;
    pipeWidth: number;
    side: Score["connectorSide"];
    sourceNode: RenderNode;
}

interface ActualConfidenceSlot {
    centerY: number;
    fluidWidth: number;
}

interface ConnectorJunction {
    centerX: number;
    centerY: number;
    height: number;
    width: number;
}

interface ConnectorJunctionVisual {
    junction: ConnectorJunction;
    side: Score["connectorSide"];
    visualId: string;
}

interface ConnectorTurnGuide {
    returnTurnX: number;
    turnStartX: number;
}

interface ConfidenceConnectorTarget {
    junction?: ConnectorJunction;
    midpoint: { x: number; y: number };
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
    const nodeByScoreId = new Map<ScoreId, RenderNode>(renderNodes.map((renderNode) => [renderNode.node.scoreId, renderNode]));
    const confidenceTargetsByConnectorId = new Map<string, ConfidenceConnectorTarget>();
    const confidenceConnectorDrafts: ConfidenceConnectorDraft[] = [];
    const relevanceConnectorDrafts: RelevanceConnectorDraft[] = [];

    for (const renderNode of renderNodes) {
        const connector = renderNode.node.connectorId
            ? debate.connectors[renderNode.node.connectorId]
            : undefined;
        if (!connector) {
            continue;
        }

        if (connector.type === "relevance") {
            relevanceConnectorDrafts.push({
                connector,
                pipeWidth: getConnectorPotentialPipeWidth(renderNode.score),
                side: renderNode.score.connectorSide,
                sourceNode: renderNode,
            });
            continue;
        }

        const targetScoreId = renderNode.node.layoutParentScoreId;
        if (!targetScoreId) {
            continue;
        }

        const targetNode = nodeByScoreId.get(targetScoreId);
        if (!targetNode) {
            continue;
        }

        confidenceConnectorDrafts.push({
            connector,
            pipeWidth: getConnectorPotentialPipeWidth(renderNode.score),
            side: renderNode.score.connectorSide,
            sourceNode: renderNode,
            targetNode,
        });
    }

    const actualConfidenceSlotByConnectorId = buildActualConfidenceSlotByConnectorId(
        confidenceConnectorDrafts,
    );
    const relevancePipeWidthByTargetConnectorId = buildRelevancePipeWidthByTargetConnectorId(
        relevanceConnectorDrafts,
    );
    const confidenceConnectorPlans = confidenceConnectorDrafts.map((draft) => {
        const actualConfidenceSlot = actualConfidenceSlotByConnectorId.get(draft.connector.id);
        const targetPoint = {
            x: draft.targetNode.renderX + draft.targetNode.node.width,
            y: actualConfidenceSlot?.centerY ?? getNodeCenterY(draft.targetNode),
        };
        const centerlinePoints = buildConfidenceCenterline(
            draft.sourceNode,
            targetPoint,
            draft.pipeWidth,
        );
        const relevancePipeWidth = relevancePipeWidthByTargetConnectorId.get(draft.connector.id);
        const junction = relevancePipeWidth
            ? buildConnectorJunction({
                center: getPointAtPolylineProgress(centerlinePoints, CONNECTOR_JUNCTION_PATH_PROGRESS),
                confidencePipeWidth: draft.pipeWidth,
                relevancePipeWidth,
            })
            : undefined;

        return {
            actualConfidenceSlot,
            draft,
            targetPoint,
            ...(junction ? { junction } : {}),
        } satisfies ConfidenceConnectorPlan;
    });
    const turnGuideByTargetScoreId = buildTurnGuideByTargetScoreId(confidenceConnectorPlans);
    const confidenceConnectorVisuals = confidenceConnectorPlans.flatMap((plan) => {
        const { actualConfidenceSlot, draft, junction, targetPoint } = plan;
        const centerlinePoints = buildConfidenceCenterline(
            draft.sourceNode,
            targetPoint,
            draft.pipeWidth,
            junction
                ? undefined
                : turnGuideByTargetScoreId.get(draft.targetNode.node.scoreId),
        );

        confidenceTargetsByConnectorId.set(draft.connector.id, {
            midpoint: junction
                ? { x: junction.centerX, y: junction.centerY }
                : getPointAtPolylineProgress(centerlinePoints, 0.5),
            ...(junction ? { junction } : {}),
        });

        if (!junction) {
            return [{
                visualId: draft.connector.id,
                centerlinePoints,
                fluidWidth: actualConfidenceSlot?.fluidWidth ?? 0,
                outlineWidth: getConnectorOutlineWidth(),
                pipeWidth: draft.pipeWidth,
                side: draft.side,
            } satisfies ConnectorVisual];
        }

        const sourceSegmentEndPoint = {
            x: junction.centerX + (junction.width / 2),
            y: junction.centerY,
        };
        const targetSegmentStartPoint = {
            x: junction.centerX - (junction.width / 2),
            y: junction.centerY,
        };

        return [
            {
                visualId: `${draft.connector.id}:source-to-junction`,
                centerlinePoints: buildConfidenceCenterline(draft.sourceNode, sourceSegmentEndPoint, draft.pipeWidth),
                fluidWidth: actualConfidenceSlot?.fluidWidth ?? 0,
                outlineWidth: getConnectorOutlineWidth(),
                pipeWidth: draft.pipeWidth,
                side: draft.side,
            },
            {
                visualId: `${draft.connector.id}:junction-to-target`,
                centerlinePoints: buildAngularConnectorCenterline(
                    targetSegmentStartPoint,
                    targetPoint,
                    draft.pipeWidth,
                ),
                fluidWidth: actualConfidenceSlot?.fluidWidth ?? 0,
                outlineWidth: getConnectorOutlineWidth(),
                pipeWidth: draft.pipeWidth,
                side: draft.side,
            },
        ] satisfies ConnectorVisual[];
    });

    const relevanceConnectorVisuals = relevanceConnectorDrafts.flatMap((draft) => {
        const targetGeometry =
            confidenceTargetsByConnectorId.get(draft.connector.targetConfidenceConnectorId)
            ?? buildConfidenceTargetFromLayout(draft.connector, nodeByScoreId, debate, layout);
        if (!targetGeometry) {
            return [];
        }

        const centerlinePoints = targetGeometry.junction
            ? buildRelevanceCenterlineToConnectorJunction(draft.sourceNode, targetGeometry.junction, draft.pipeWidth)
            : buildAngularConnectorCenterline(
                { x: draft.sourceNode.renderX, y: getNodeCenterY(draft.sourceNode) },
                targetGeometry.midpoint,
                draft.pipeWidth,
            );
        return [
            {
                visualId: draft.connector.id,
                centerlinePoints,
                fluidWidth: getConnectorFluidWidth(draft.sourceNode.score, draft.connector.type),
                outlineWidth: getConnectorOutlineWidth(),
                pipeWidth: draft.pipeWidth,
                side: draft.side,
            },
        ];
    });

    const connectorVisuals = [...confidenceConnectorVisuals, ...relevanceConnectorVisuals];
    const connectorJunctionVisuals: ConnectorJunctionVisual[] = confidenceConnectorPlans.flatMap((plan) => (
        plan.junction
            ? [{
                junction: plan.junction,
                side: plan.draft.side,
                visualId: `${plan.draft.connector.id}:junction`,
            }]
            : []
    ));
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
    const connectorJunctionElements = connectorJunctionVisuals.map(renderConnectorJunction);

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

function renderConnectorJunction(visual: ConnectorJunctionVisual): ReactNode {
    const outlineWidth = getConnectorOutlineWidth();
    const frameWidth = visual.junction.width + outlineWidth;
    const frameHeight = visual.junction.height + outlineWidth;

    return (
        <rect
            key={visual.visualId}
            fill="none"
            height={frameHeight}
            pointerEvents="none"
            rx={Math.min(frameWidth, frameHeight) * CONNECTOR_JUNCTION_CORNER_RADIUS_RATIO}
            ry={Math.min(frameWidth, frameHeight) * CONNECTOR_JUNCTION_CORNER_RADIUS_RATIO}
            stroke={resolveSideStroke(visual.side)}
            strokeWidth={outlineWidth}
            width={frameWidth}
            x={visual.junction.centerX - (frameWidth / 2)}
            y={visual.junction.centerY - (frameHeight / 2)}
        />
    );
}

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
        renderX: Math.round(node.x - layout.bounds.left + GRAPH_PADDING_PX),
        renderY: Math.round(node.y - layout.bounds.top + GRAPH_PADDING_PX),
    };
}

function buildConfidenceTargetFromLayout(
    connector: RelevanceConnector,
    nodeByScoreId: ReadonlyMap<ScoreId, RenderNode>,
    debate: Debate,
    layout: DebateLayout,
): ConfidenceConnectorTarget | undefined {
    for (const node of layout.nodesInOrder) {
        if (node.connectorId !== connector.targetConfidenceConnectorId) {
            continue;
        }

        const sourceNode = nodeByScoreId.get(node.scoreId) ?? buildRenderNode(debate, layout, node);
        const targetScoreId = node.layoutParentScoreId;
        if (!targetScoreId) {
            return undefined;
        }

        const targetNode = nodeByScoreId.get(targetScoreId);
        if (!targetNode) {
            return undefined;
        }

        const pipeWidth = getConnectorPotentialPipeWidth(sourceNode.score);
        const centerlinePoints = buildConfidenceCenterline(sourceNode, {
            x: targetNode.renderX + targetNode.node.width,
            y: getNodeCenterY(targetNode),
        }, pipeWidth);
        return {
            midpoint: getPointAtPolylineProgress(centerlinePoints, 0.5),
        };
    }

    return undefined;
}

function buildConfidenceCenterline(
    sourceNode: RenderNode,
    targetPoint: { x: number; y: number },
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): Waypoint[] {
    return buildAngularConnectorCenterline(
        { x: sourceNode.renderX, y: getNodeCenterY(sourceNode) },
        targetPoint,
        pipeWidth,
        turnGuide,
    );
}

function buildRelevanceCenterlineToConnectorJunction(
    sourceNode: RenderNode,
    junction: ConnectorJunction,
    pipeWidth: number,
): Waypoint[] {
    const startPoint = { x: sourceNode.renderX, y: getNodeCenterY(sourceNode) };
    const targetPoint = {
        x: junction.centerX,
        y: startPoint.y < junction.centerY
            ? junction.centerY - (junction.height / 2)
            : junction.centerY + (junction.height / 2),
    };
    const cornerPoint = {
        x: junction.centerX,
        y: startPoint.y,
        radius: resolveOrthogonalConnectorBendRadius(startPoint, targetPoint, pipeWidth),
    };

    if (Math.abs(startPoint.y - targetPoint.y) <= 1) {
        return [startPoint, targetPoint];
    }

    return [startPoint, cornerPoint, targetPoint];
}

function buildAngularConnectorCenterline(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): Waypoint[] {
    const bendPoints = resolveAngularConnectorBendPoints(
        startPoint,
        endPoint,
        pipeWidth,
        turnGuide,
    );

    if (!bendPoints) {
        return [startPoint, endPoint];
    }

    const diagonalLength = Math.hypot(
        bendPoints.bendStart.x - bendPoints.bendEnd.x,
        bendPoints.bendStart.y - bendPoints.bendEnd.y,
    );
    const bendRadius = resolveDiagonalConnectorBendRadius(
        bendPoints.startStraightLength,
        bendPoints.endStraightLength,
        diagonalLength,
        getMinimumCenterlineBendRadius(pipeWidth),
    );

    if (bendRadius < 8) {
        return [startPoint, bendPoints.bendStart, bendPoints.bendEnd, endPoint];
    }

    return [
        startPoint,
        { x: bendPoints.bendStart.x, y: bendPoints.bendStart.y, radius: bendRadius },
        { x: bendPoints.bendEnd.x, y: bendPoints.bendEnd.y, radius: bendRadius },
        endPoint,
    ];
}

function resolveAngularConnectorBendPoints(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
    turnGuide: ConnectorTurnGuide | undefined,
): {
    bendEnd: { x: number; y: number };
    bendStart: { x: number; y: number };
    endStraightLength: number;
    startStraightLength: number;
} | undefined {
    if (turnGuide) {
        const guidedStartStraightLength = startPoint.x - turnGuide.turnStartX;
        const guidedEndStraightLength = turnGuide.returnTurnX - endPoint.x;
        if (
            guidedStartStraightLength > 1
            && guidedEndStraightLength > 1
            && turnGuide.turnStartX > turnGuide.returnTurnX
        ) {
            return {
                bendEnd: { x: turnGuide.returnTurnX, y: endPoint.y },
                bendStart: { x: turnGuide.turnStartX, y: startPoint.y },
                endStraightLength: guidedEndStraightLength,
                startStraightLength: guidedStartStraightLength,
            };
        }
    }

    const straightSegmentLength = resolveConnectorStraightSegmentLength(
        Math.max(0, startPoint.x - endPoint.x),
        Math.abs(startPoint.y - endPoint.y),
        getMinimumCenterlineBendRadius(pipeWidth),
    );

    if (straightSegmentLength <= 1) {
        return undefined;
    }

    return {
        bendEnd: { x: endPoint.x + straightSegmentLength, y: endPoint.y },
        bendStart: { x: startPoint.x - straightSegmentLength, y: startPoint.y },
        endStraightLength: straightSegmentLength,
        startStraightLength: straightSegmentLength,
    };
}

function resolveConnectorStraightSegmentLength(
    horizontalSpan: number,
    verticalSpan: number,
    minimumCenterlineBendRadius: number,
): number {
    const maximumStraightSegmentLength = Math.max(
        0,
        (horizontalSpan - MIN_CONNECTOR_DIAGONAL_PX) / 2,
    );
    if (maximumStraightSegmentLength <= 0) {
        return 0;
    }

    const preferredStraightSegmentLength = Math.max(
        MIN_CONNECTOR_STRAIGHT_PX,
        minimumCenterlineBendRadius,
        (horizontalSpan - verticalSpan) / 2,
    );

    return Math.min(preferredStraightSegmentLength, maximumStraightSegmentLength);
}

function getAngularConnectorTurnGuide(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
): ConnectorTurnGuide | undefined {
    const bendPoints = resolveAngularConnectorBendPoints(
        startPoint,
        endPoint,
        pipeWidth,
        undefined,
    );

    return bendPoints
        ? {
            returnTurnX: bendPoints.bendEnd.x,
            turnStartX: bendPoints.bendStart.x,
        }
        : undefined;
}

function resolveDiagonalConnectorBendRadius(
    startStraightLength: number,
    endStraightLength: number,
    diagonalLength: number,
    minimumCenterlineBendRadius: number,
): number {
    const maximumBendRadius = Math.min(
        startStraightLength,
        endStraightLength,
        diagonalLength / 2,
    );

    return Math.min(
        Math.max(MIN_CONNECTOR_BEND_RADIUS_PX, minimumCenterlineBendRadius),
        maximumBendRadius,
    );
}

function resolveOrthogonalConnectorBendRadius(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
): number {
    const maximumBendRadius = Math.min(
        Math.abs(startPoint.x - endPoint.x),
        Math.abs(startPoint.y - endPoint.y),
    );

    return Math.min(
        Math.max(MIN_CONNECTOR_BEND_RADIUS_PX, getMinimumCenterlineBendRadius(pipeWidth)),
        maximumBendRadius,
    );
}

function getMinimumCenterlineBendRadius(pipeWidth: number): number {
    return (Math.max(0, pipeWidth) / 2)
        + (Math.max(0, pipeWidth) * MIN_CONNECTOR_INNER_BEND_RADIUS_RATIO);
}

function getPointAtPolylineProgress(
    points: Waypoint[],
    progress: number,
): { x: number; y: number } {
    if (points.length <= 1) {
        return points[0] ? { x: points[0].x, y: points[0].y } : { x: 0, y: 0 };
    }

    const clampedProgress = Math.min(1, Math.max(0, progress));
    const segmentLengths = points.slice(1).map((point, index) => {
        const previousPoint = points[index];
        return Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
    });
    const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
    if (totalLength <= 1e-6) {
        return { x: points[0].x, y: points[0].y };
    }

    const targetLength = totalLength * clampedProgress;
    let traversedLength = 0;

    for (let index = 1; index < points.length; index += 1) {
        const segmentLength = segmentLengths[index - 1] ?? 0;
        if (traversedLength + segmentLength < targetLength) {
            traversedLength += segmentLength;
            continue;
        }

        const segmentStart = points[index - 1];
        const segmentEnd = points[index];
        const segmentProgress = segmentLength <= 1e-6
            ? 0
            : (targetLength - traversedLength) / segmentLength;

        return {
            x: segmentStart.x + ((segmentEnd.x - segmentStart.x) * segmentProgress),
            y: segmentStart.y + ((segmentEnd.y - segmentStart.y) * segmentProgress),
        };
    }

    const finalPoint = points.at(-1)!;
    return { x: finalPoint.x, y: finalPoint.y };
}

function getNodeCenterY(node: RenderNode): number {
    return node.renderY + (node.node.height / 2);
}

function buildTurnGuideByTargetScoreId(
    plans: readonly ConfidenceConnectorPlan[],
): ReadonlyMap<ScoreId, ConnectorTurnGuide> {
    const turnGuideByTargetScoreId = new Map<ScoreId, ConnectorTurnGuide>();

    for (const plan of plans) {
        if (!plan.junction) {
            continue;
        }

        const secondSegmentTurnGuide = getAngularConnectorTurnGuide(
            {
                x: plan.junction.centerX - (plan.junction.width / 2),
                y: plan.junction.centerY,
            },
            plan.targetPoint,
            plan.draft.pipeWidth,
        );
        if (!secondSegmentTurnGuide) {
            continue;
        }

        const targetScoreId = plan.draft.targetNode.node.scoreId;
        const currentTurnGuide = turnGuideByTargetScoreId.get(targetScoreId);
        if (!currentTurnGuide || secondSegmentTurnGuide.turnStartX < currentTurnGuide.turnStartX) {
            turnGuideByTargetScoreId.set(targetScoreId, secondSegmentTurnGuide);
        }
    }

    return turnGuideByTargetScoreId;
}

function buildRelevancePipeWidthByTargetConnectorId(
    drafts: readonly RelevanceConnectorDraft[],
): ReadonlyMap<string, number> {
    const pipeWidthByTargetConnectorId = new Map<string, number>();

    for (const draft of drafts) {
        pipeWidthByTargetConnectorId.set(
            draft.connector.targetConfidenceConnectorId,
            Math.max(
                pipeWidthByTargetConnectorId.get(draft.connector.targetConfidenceConnectorId) ?? 0,
                draft.pipeWidth,
            ),
        );
    }

    return pipeWidthByTargetConnectorId;
}

function buildConnectorJunction(args: {
    center: { x: number; y: number };
    confidencePipeWidth: number;
    relevancePipeWidth: number;
}): ConnectorJunction {
    return {
        centerX: args.center.x,
        centerY: args.center.y,
        height: args.confidencePipeWidth,
        width: args.relevancePipeWidth,
    };
}

function buildActualConfidenceSlotByConnectorId(
    drafts: readonly ConfidenceConnectorDraft[],
): ReadonlyMap<string, ActualConfidenceSlot> {
    const actualConfidenceSlotByConnectorId = new Map<string, ActualConfidenceSlot>();
    const draftsByTarget = new Map<string, ConfidenceConnectorDraft[]>();

    for (const draft of drafts) {
        const existingDrafts = draftsByTarget.get(draft.targetNode.node.scoreId);
        if (existingDrafts) {
            existingDrafts.push(draft);
            continue;
        }

        draftsByTarget.set(draft.targetNode.node.scoreId, [draft]);
    }

    for (const draftsForTarget of draftsByTarget.values()) {
        const orderedDrafts = orderConfidenceConnectorDraftsForTarget(draftsForTarget);
        const targetNode = orderedDrafts[0].targetNode;
        const targetCenterY = getNodeCenterY(targetNode);
        const actualConfidenceSlots = orderedDrafts.map((draft) => ({
            draft,
            fluidWidth: getConfidenceConnectorFluidWidth(draft.sourceNode.score),
        }));
        const totalStackHeight = actualConfidenceSlots.reduce(
            (totalHeight, actualConfidenceSlot) => totalHeight + actualConfidenceSlot.fluidWidth,
            0,
        );
        let currentTop = targetCenterY - (totalStackHeight / 2);

        for (const actualConfidenceSlot of actualConfidenceSlots) {
            actualConfidenceSlotByConnectorId.set(actualConfidenceSlot.draft.connector.id, {
                centerY: currentTop + (actualConfidenceSlot.fluidWidth / 2),
                fluidWidth: actualConfidenceSlot.fluidWidth,
            });
            currentTop += actualConfidenceSlot.fluidWidth;
        }
    }

    return actualConfidenceSlotByConnectorId;
}

function orderConfidenceConnectorDraftsForTarget(
    drafts: readonly ConfidenceConnectorDraft[],
): ConfidenceConnectorDraft[] {
    const targetScore = drafts[0]?.targetNode.score;
    const incomingScoreOrder = new Map<ScoreId, number>(
        targetScore?.incomingScoreIds.map((scoreId, index) => [scoreId, index]) ?? [],
    );

    return [...drafts].sort((left, right) => {
        const orderDelta =
            (incomingScoreOrder.get(left.sourceNode.node.scoreId) ?? Number.POSITIVE_INFINITY)
            - (incomingScoreOrder.get(right.sourceNode.node.scoreId) ?? Number.POSITIVE_INFINITY);
        if (orderDelta !== 0) {
            return orderDelta;
        }

        const verticalDelta = getNodeCenterY(left.sourceNode) - getNodeCenterY(right.sourceNode);
        if (verticalDelta !== 0) {
            return verticalDelta;
        }

        return left.connector.id.localeCompare(right.connector.id);
    });
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

function getConnectorPotentialPipeWidth(score: Score): number {
    return scaleWorldWidth(BASE_NODE_HEIGHT_PX, getConnectorScale(score));
}

function getConfidenceConnectorFluidWidth(score: Score): number {
    return scaleWorldWidth(BASE_NODE_HEIGHT_PX, getConnectorScale(score) * getConnectorConfidenceRatio(score));
}

function getConnectorFluidWidth(
    score: Score,
    type: ConfidenceConnector["type"] | RelevanceConnector["type"],
): number {
    return type === "confidence"
        ? getConfidenceConnectorFluidWidth(score)
        : getRelevanceConnectorFluidWidth(score);
}

function getRelevanceConnectorFluidWidth(score: Score): number {
    return scaleWorldWidth(BASE_NODE_HEIGHT_PX, getConnectorScale(score) * clampUnit(score.relevance));
}

function getConnectorOutlineWidth(): number {
    return CONNECTOR_OUTLINE_WIDTH_PX;
}

function getConnectorScale(score: Score): number {
    return toLayoutScale(score.scaleOfSources);
}

function getConnectorConfidenceRatio(score: Score): number {
    return clampUnit(score.connectorConfidence);
}

function scaleWorldWidth(baseWidth: number, scale: number): number {
    return baseWidth * clampUnit(scale);
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

function clampUnit(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(1, Math.max(0, value));
}

function formatConfidenceLabel(confidence: number): string {
    return `${Math.round(confidence * 100)}% confidence`;
}
