import type { ClaimId } from "./00-entities/Claim.ts";
import type { ConnectorId } from "./00-entities/Connector.ts";
import type { Debate } from "./00-entities/Debate.ts";
import type { Score, ScoreId } from "./00-entities/Score.ts";

// AGENT NOTE: Keep layout sizing and spacing tunables grouped here so future tuning stays in one place.
/** Full-size claim box width before score scaling is applied. */
export const BASE_NODE_WIDTH_PX = 360;
/** Full-size claim box height before score scaling is applied; connector potential width uses this same base unit. */
export const BASE_NODE_HEIGHT_PX = 176;
/** Full-size horizontal distance between one depth column and the next. */
const BASE_HORIZONTAL_GAP_PX = 700;
/** Extra horizontal room reserved before a layer that contains relevance connectors. */
const RELEVANCE_LAYER_HORIZONTAL_GAP_MULTIPLIER = 2;
/** Full-size vertical distance between sibling subtree blocks. */
const BASE_VERTICAL_GAP_PX = 50;
/** Minimum vertical distance retained for dense groups of small source scores. */
const MIN_VERTICAL_GAP_PX = 28;
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
/** Default left offset for exported layout coordinates. */
const DEFAULT_ORIGIN_X_PX = 96;
/** Default top offset for exported layout coordinates. */
const DEFAULT_ORIGIN_Y_PX = 96;

export interface DebateLayoutOptions {
    originX?: number
    originY?: number
}

export interface LayoutBounds {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
}

export interface DebateLayoutNode {
    scoreId: ScoreId
    claimId: ClaimId
    claimContent: string
    structuralParentScoreId: ScoreId | null
    layoutParentScoreId: ScoreId | null
    connectorId?: ConnectorId
    connectorType: "root" | "confidence" | "relevance"
    depth: number
    x: number
    y: number
    width: number
    height: number
    scaleOfSources: number
    deliveryScaleOfSources: number
    layoutScale: number
}

export interface DebateLayoutWaypoint {
    x: number
    y: number
    radius?: number
}

export type DebateLayoutConnectorSpanType = "confidenceSource" | "confidenceDelivery" | "relevance";

export interface DebateLayoutConnectorSpan {
    visualId: string
    connectorId: ConnectorId
    connectorType: "confidence" | "relevance"
    spanType: DebateLayoutConnectorSpanType
    centerlinePoints: DebateLayoutWaypoint[]
    fluidWidth: number
    pipeWidth: number
    side: Score["connectorSide"]
}

export interface DebateLayoutConnectorJunction {
    visualId: string
    targetConfidenceConnectorId: ConnectorId
    centerX: number
    centerY: number
    leftHeight: number
    rightHeight: number
    width: number
    side: Score["connectorSide"]
}

export interface DebateLayout {
    rootScoreId: ScoreId
    nodesInOrder: DebateLayoutNode[]
    connectorSpansInOrder: DebateLayoutConnectorSpan[]
    connectorJunctionsInOrder: DebateLayoutConnectorJunction[]
    bounds: LayoutBounds
}

type LayoutParentScoreId = ScoreId | null;

interface LayoutRecord {
    scoreId: ScoreId
    structuralParentScoreId: ScoreId | null
    layoutParentScoreId: LayoutParentScoreId
    connectorId?: ConnectorId
    connectorType: DebateLayoutNode["connectorType"]
    depth: number
}

interface DerivedLayoutTree {
    recordByScoreId: ReadonlyMap<ScoreId, LayoutRecord>
    childScoreIdsByLayoutParentScoreId: ReadonlyMap<LayoutParentScoreId, readonly ScoreId[]>
}

type DraftLayoutNode = Omit<DebateLayoutNode, "x" | "y"> & {
    children: DraftLayoutNode[]
    childrenBlockHeight: number
    subtreeHeight: number
};

interface ConfidenceConnectorDraft {
    connectorId: ConnectorId
    sourceNode: DebateLayoutNode
    targetNode: DebateLayoutNode
    side: Score["connectorSide"]
    sourcePipeWidth: number
    sourceFluidWidth: number
    deliveryPipeWidth: number
    deliveryFluidWidth: number
}

interface ConfidenceConnectorPlan {
    actualConfidenceSlot: ActualConfidenceSlot | undefined
    draft: ConfidenceConnectorDraft
    targetPoint: { x: number; y: number }
    junction?: DebateLayoutConnectorJunction
}

interface RelevanceConnectorDraft {
    connectorId: ConnectorId
    sourceNode: DebateLayoutNode
    targetConfidenceConnectorId: ConnectorId
    pipeWidth: number
    fluidWidth: number
    side: Score["connectorSide"]
}

interface ActualConfidenceSlot {
    centerY: number
    fluidWidth: number
}

interface ConnectorTurnGuide {
    returnTurnX: number
    turnStartX: number
}

export function layoutDebate(debate: Debate, options: DebateLayoutOptions = {}): DebateLayout {
    const originX = options.originX ?? DEFAULT_ORIGIN_X_PX;
    const originY = options.originY ?? DEFAULT_ORIGIN_Y_PX;
    const rootScore = getRequiredMainClaimRootScore(debate);
    const derivedLayoutTree = deriveLayoutTree(debate, rootScore.id);
    const nodesByDepth = new Map<number, DraftLayoutNode[]>();
    const rootNode = buildDraftLayoutNode({
        debate,
        scoreId: rootScore.id,
        derivedLayoutTree,
        nodesByDepth,
    });
    const columnLeftByDepth = buildColumnLeftByDepth(nodesByDepth, originX);
    const nodesInOrder: DebateLayoutNode[] = [];

    positionDraftLayoutNode(rootNode, originY);
    const connectorGeometry = buildConnectorGeometry(debate, nodesInOrder);

    return {
        rootScoreId: rootScore.id,
        nodesInOrder,
        connectorSpansInOrder: connectorGeometry.connectorSpansInOrder,
        connectorJunctionsInOrder: connectorGeometry.connectorJunctionsInOrder,
        bounds: buildLayoutBounds({
            connectorJunctions: connectorGeometry.connectorJunctionsInOrder,
            connectorSpans: connectorGeometry.connectorSpansInOrder,
            nodes: nodesInOrder,
        }),
    };

    function positionDraftLayoutNode(node: DraftLayoutNode, top: number): void {
        nodesInOrder.push({
            ...node,
            x: columnLeftByDepth[node.depth] ?? originX,
            y: Math.round(top + ((node.subtreeHeight - node.height) / 2)),
        });

        if (node.children.length < 1) {
            return;
        }

        const childGap = getVerticalGap(node.layoutScale);
        let childTop = top + ((node.subtreeHeight - node.childrenBlockHeight) / 2);
        for (const child of node.children) {
            positionDraftLayoutNode(child, childTop);
            childTop += child.subtreeHeight + childGap;
        }
    }
}

function buildDraftLayoutNode(args: {
    debate: Debate
    scoreId: ScoreId
    derivedLayoutTree: DerivedLayoutTree
    nodesByDepth: Map<number, DraftLayoutNode[]>
}): DraftLayoutNode {
    const layoutRecord = args.derivedLayoutTree.recordByScoreId.get(args.scoreId);
    if (!layoutRecord) {
        throw new Error(`Layout record for score ${args.scoreId} was not found.`);
    }

    const score = getRequiredScore(args.debate, args.scoreId);
    const claim = args.debate.claims[score.claimId];
    if (!claim) {
        throw new Error(`Claim ${score.claimId} was not found for score ${score.id}.`);
    }

    const layoutScale = toLayoutScale(score.scaleOfSources);
    const children = (args.derivedLayoutTree.childScoreIdsByLayoutParentScoreId.get(score.id) ?? []).map((childScoreId) => buildDraftLayoutNode({
        debate: args.debate,
        scoreId: childScoreId,
        derivedLayoutTree: args.derivedLayoutTree,
        nodesByDepth: args.nodesByDepth,
    }));
    const childGap = getVerticalGap(layoutScale);
    const childrenBlockHeight = children.reduce(
        (totalHeight, child, childIndex) => totalHeight + child.subtreeHeight + (childIndex > 0 ? childGap : 0),
        0,
    );
    const node: DraftLayoutNode = {
        scoreId: score.id,
        claimId: score.claimId,
        claimContent: claim.content,
        structuralParentScoreId: layoutRecord.structuralParentScoreId,
        layoutParentScoreId: layoutRecord.layoutParentScoreId,
        connectorId: layoutRecord.connectorId,
        connectorType: layoutRecord.connectorType,
        depth: layoutRecord.depth,
        width: Math.round(BASE_NODE_WIDTH_PX * layoutScale),
        height: Math.round(BASE_NODE_HEIGHT_PX * layoutScale),
        scaleOfSources: score.scaleOfSources,
        deliveryScaleOfSources: score.deliveryScaleOfSources,
        layoutScale,
        children,
        childrenBlockHeight,
        subtreeHeight: Math.max(Math.round(BASE_NODE_HEIGHT_PX * layoutScale), childrenBlockHeight),
    };
    const depthNodes = args.nodesByDepth.get(layoutRecord.depth);
    if (depthNodes) {
        depthNodes.push(node);
    } else {
        args.nodesByDepth.set(layoutRecord.depth, [node]);
    }

    return node;
}

function deriveLayoutTree(debate: Debate, rootScoreId: ScoreId): DerivedLayoutTree {
    const recordByScoreId = new Map<ScoreId, LayoutRecord>();
    const childScoreIdsByLayoutParentScoreId = new Map<LayoutParentScoreId, ScoreId[]>();

    visitScore({
        scoreId: rootScoreId,
        structuralParentScoreId: null,
        layoutParentScoreId: null,
        depth: 0,
        pathScoreIds: new Set<ScoreId>(),
    });

    return {
        recordByScoreId,
        childScoreIdsByLayoutParentScoreId,
    };

    function visitScore(args: {
        scoreId: ScoreId
        structuralParentScoreId: ScoreId | null
        layoutParentScoreId: LayoutParentScoreId
        depth: number
        pathScoreIds: Set<ScoreId>
    }): void {
        if (args.pathScoreIds.has(args.scoreId)) {
            throw new Error(`Cycle detected while laying out score ${args.scoreId}.`);
        }

        if (recordByScoreId.has(args.scoreId)) {
            throw new Error(`Score ${args.scoreId} was encountered more than once while deriving layout parents.`);
        }

        const score = getRequiredScore(debate, args.scoreId);
        const connectorDescriptor = describeConnector(debate, score);
        recordByScoreId.set(args.scoreId, {
            scoreId: args.scoreId,
            structuralParentScoreId: args.structuralParentScoreId,
            layoutParentScoreId: args.layoutParentScoreId,
            connectorId: connectorDescriptor.connectorId,
            connectorType: connectorDescriptor.connectorType,
            depth: args.depth,
        });

        if (args.layoutParentScoreId !== null) {
            const existingChildScoreIds = childScoreIdsByLayoutParentScoreId.get(args.layoutParentScoreId);
            if (existingChildScoreIds) {
                existingChildScoreIds.push(args.scoreId);
            } else {
                childScoreIdsByLayoutParentScoreId.set(args.layoutParentScoreId, [args.scoreId]);
            }
        }

        const nextPathScoreIds = new Set(args.pathScoreIds);
        nextPathScoreIds.add(args.scoreId);

        for (const incomingScoreId of score.incomingScoreIds) {
            const incomingScore = getRequiredScore(debate, incomingScoreId);
            const incomingConnectorDescriptor = describeConnector(debate, incomingScore);
            const nextDepth = incomingConnectorDescriptor.connectorType === "relevance"
                ? args.depth
                : args.depth + 1;
            const nextLayoutParentScoreId = incomingConnectorDescriptor.connectorType === "relevance"
                ? args.layoutParentScoreId
                : score.id;

            visitScore({
                scoreId: incomingScoreId,
                structuralParentScoreId: score.id,
                layoutParentScoreId: nextLayoutParentScoreId,
                depth: nextDepth,
                pathScoreIds: nextPathScoreIds,
            });
        }
    }
}

function buildColumnLeftByDepth(nodesByDepth: ReadonlyMap<number, readonly DraftLayoutNode[]>, originX: number): number[] {
    const depths = [...nodesByDepth.keys()];
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    const columnLeftByDepth: number[] = [originX];

    for (let depth = 1; depth <= maxDepth; depth += 1) {
        const previousColumnLeft = columnLeftByDepth[depth - 1] ?? originX;
        const horizontalGapMultiplier = hasRelevanceConnectorInDepth(nodesByDepth, depth)
            ? RELEVANCE_LAYER_HORIZONTAL_GAP_MULTIPLIER
            : 1;
        let nextColumnLeft = previousColumnLeft;

        for (const node of nodesByDepth.get(depth - 1) ?? []) {
            nextColumnLeft = Math.max(
                nextColumnLeft,
                previousColumnLeft + node.width + getHorizontalGap(node.scaleOfSources, horizontalGapMultiplier),
            );
        }

        columnLeftByDepth[depth] = nextColumnLeft;
    }

    return columnLeftByDepth;
}

function hasRelevanceConnectorInDepth(
    nodesByDepth: ReadonlyMap<number, readonly DraftLayoutNode[]>,
    depth: number,
): boolean {
    return (nodesByDepth.get(depth) ?? []).some((node) => node.connectorType === "relevance");
}

function buildConnectorGeometry(
    debate: Debate,
    nodesInOrder: readonly DebateLayoutNode[],
): {
    connectorJunctionsInOrder: DebateLayoutConnectorJunction[]
    connectorSpansInOrder: DebateLayoutConnectorSpan[]
} {
    const nodeByScoreId = new Map<ScoreId, DebateLayoutNode>(
        nodesInOrder.map((node) => [node.scoreId, node]),
    );
    const confidenceDrafts: ConfidenceConnectorDraft[] = [];
    const relevanceDrafts: RelevanceConnectorDraft[] = [];

    for (const node of nodesInOrder) {
        if (!node.connectorId) {
            continue;
        }

        const score = getRequiredScore(debate, node.scoreId);
        const connector = debate.connectors[node.connectorId];
        if (!connector) {
            throw new Error(`Connector ${node.connectorId} was not found while building connector layout.`);
        }

        if (connector.type === "relevance") {
            relevanceDrafts.push({
                connectorId: connector.id,
                fluidWidth: getRelevanceConnectorFluidWidth(score),
                pipeWidth: getSourceSpanPipeWidth(score),
                side: score.connectorSide,
                sourceNode: node,
                targetConfidenceConnectorId: connector.targetConfidenceConnectorId,
            });
            continue;
        }

        const targetScoreId = node.layoutParentScoreId;
        if (!targetScoreId) {
            continue;
        }

        const targetNode = nodeByScoreId.get(targetScoreId);
        if (!targetNode) {
            continue;
        }

        confidenceDrafts.push({
            connectorId: connector.id,
            deliveryFluidWidth: getDeliverySpanFluidWidth(score),
            deliveryPipeWidth: getDeliverySpanPipeWidth(score),
            side: score.connectorSide,
            sourceFluidWidth: getSourceSpanFluidWidth(score),
            sourceNode: node,
            sourcePipeWidth: getSourceSpanPipeWidth(score),
            targetNode,
        });
    }

    const actualConfidenceSlotByConnectorId = buildActualConfidenceSlotByConnectorId(confidenceDrafts, debate);
    const relevancePipeWidthByTargetConnectorId = buildRelevancePipeWidthByTargetConnectorId(relevanceDrafts);
    const confidencePlans = confidenceDrafts.map((draft) => {
        const actualConfidenceSlot = actualConfidenceSlotByConnectorId.get(draft.connectorId);
        const targetPoint = {
            x: draft.targetNode.x + draft.targetNode.width,
            y: actualConfidenceSlot?.centerY ?? getNodeCenterY(draft.targetNode),
        };
        const centerlinePoints = buildConfidenceCenterline(
            draft.sourceNode,
            targetPoint,
            draft.sourcePipeWidth,
        );
        const relevancePipeWidth = relevancePipeWidthByTargetConnectorId.get(draft.connectorId);
        const junction = relevancePipeWidth
            ? buildConnectorJunction({
                center: getPointAtPolylineProgress(centerlinePoints, CONNECTOR_JUNCTION_PATH_PROGRESS),
                connectorId: draft.connectorId,
                deliveryPipeWidth: draft.deliveryPipeWidth,
                relevancePipeWidth,
                side: draft.side,
                sourcePipeWidth: draft.sourcePipeWidth,
            })
            : undefined;

        return {
            actualConfidenceSlot,
            draft,
            targetPoint,
            ...(junction ? { junction } : {}),
        } satisfies ConfidenceConnectorPlan;
    });
    const turnGuideByTargetScoreId = buildTurnGuideByTargetScoreId(confidencePlans);
    const confidenceTargetByConnectorId = new Map<ConnectorId, {
        junction?: DebateLayoutConnectorJunction
        midpoint: { x: number; y: number }
    }>();
    const confidenceConnectorSpans = confidencePlans.flatMap((plan) => {
        const { actualConfidenceSlot, draft, junction, targetPoint } = plan;
        const centerlinePoints = buildConfidenceCenterline(
            draft.sourceNode,
            targetPoint,
            draft.deliveryPipeWidth,
            junction ? undefined : turnGuideByTargetScoreId.get(draft.targetNode.scoreId),
        );

        confidenceTargetByConnectorId.set(draft.connectorId, {
            midpoint: junction
                ? { x: junction.centerX, y: junction.centerY }
                : getPointAtPolylineProgress(centerlinePoints, 0.5),
            ...(junction ? { junction } : {}),
        });

        if (!junction) {
            return [{
                centerlinePoints,
                connectorId: draft.connectorId,
                connectorType: "confidence",
                fluidWidth: actualConfidenceSlot?.fluidWidth ?? draft.deliveryFluidWidth,
                pipeWidth: draft.deliveryPipeWidth,
                side: draft.side,
                spanType: "confidenceDelivery",
                visualId: draft.connectorId,
            } satisfies DebateLayoutConnectorSpan];
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
                centerlinePoints: buildConfidenceCenterline(
                    draft.sourceNode,
                    sourceSegmentEndPoint,
                    draft.sourcePipeWidth,
                ),
                connectorId: draft.connectorId,
                connectorType: "confidence",
                fluidWidth: draft.sourceFluidWidth,
                pipeWidth: draft.sourcePipeWidth,
                side: draft.side,
                spanType: "confidenceSource",
                visualId: `${draft.connectorId}:source-span`,
            },
            {
                centerlinePoints: buildAngularConnectorCenterline(
                    targetSegmentStartPoint,
                    targetPoint,
                    draft.deliveryPipeWidth,
                ),
                connectorId: draft.connectorId,
                connectorType: "confidence",
                fluidWidth: actualConfidenceSlot?.fluidWidth ?? draft.deliveryFluidWidth,
                pipeWidth: draft.deliveryPipeWidth,
                side: draft.side,
                spanType: "confidenceDelivery",
                visualId: `${draft.connectorId}:delivery-span`,
            },
        ] satisfies DebateLayoutConnectorSpan[];
    });
    const relevanceConnectorSpans = relevanceDrafts.flatMap((draft) => {
        const targetGeometry = confidenceTargetByConnectorId.get(draft.targetConfidenceConnectorId);
        if (!targetGeometry) {
            return [];
        }

        const centerlinePoints = targetGeometry.junction
            ? buildRelevanceCenterlineToConnectorJunction(draft.sourceNode, targetGeometry.junction, draft.pipeWidth)
            : buildAngularConnectorCenterline(
                { x: draft.sourceNode.x, y: getNodeCenterY(draft.sourceNode) },
                targetGeometry.midpoint,
                draft.pipeWidth,
            );

        return [{
            centerlinePoints,
            connectorId: draft.connectorId,
            connectorType: "relevance",
            fluidWidth: draft.fluidWidth,
            pipeWidth: draft.pipeWidth,
            side: draft.side,
            spanType: "relevance",
            visualId: draft.connectorId,
        } satisfies DebateLayoutConnectorSpan];
    });

    return {
        connectorJunctionsInOrder: confidencePlans.flatMap((plan) => (
            plan.junction ? [plan.junction] : []
        )),
        connectorSpansInOrder: [...confidenceConnectorSpans, ...relevanceConnectorSpans],
    };
}

function buildLayoutBounds(args: {
    connectorJunctions: readonly DebateLayoutConnectorJunction[]
    connectorSpans: readonly DebateLayoutConnectorSpan[]
    nodes: readonly DebateLayoutNode[]
}): LayoutBounds {
    const nodes = args.nodes;
    if (nodes.length < 1) {
        return {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
        };
    }

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
        left = Math.min(left, node.x);
        top = Math.min(top, node.y);
        right = Math.max(right, node.x + node.width);
        bottom = Math.max(bottom, node.y + node.height);
    }

    for (const connectorSpan of args.connectorSpans) {
        const inset = connectorSpan.pipeWidth / 2;
        for (const point of connectorSpan.centerlinePoints) {
            left = Math.min(left, point.x - inset);
            top = Math.min(top, point.y - inset);
            right = Math.max(right, point.x + inset);
            bottom = Math.max(bottom, point.y + inset);
        }
    }

    for (const junction of args.connectorJunctions) {
        left = Math.min(left, getConnectorJunctionLeftX(junction));
        top = Math.min(top, getConnectorJunctionTopY(junction));
        right = Math.max(right, getConnectorJunctionRightX(junction));
        bottom = Math.max(bottom, getConnectorJunctionBottomY(junction));
    }

    return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
    };
}

function buildConfidenceCenterline(
    sourceNode: DebateLayoutNode,
    targetPoint: { x: number; y: number },
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): DebateLayoutWaypoint[] {
    return buildAngularConnectorCenterline(
        { x: sourceNode.x, y: getNodeCenterY(sourceNode) },
        targetPoint,
        pipeWidth,
        turnGuide,
    );
}

function buildRelevanceCenterlineToConnectorJunction(
    sourceNode: DebateLayoutNode,
    junction: DebateLayoutConnectorJunction,
    pipeWidth: number,
): DebateLayoutWaypoint[] {
    const startPoint = { x: sourceNode.x, y: getNodeCenterY(sourceNode) };
    const fromAbove = startPoint.y < junction.centerY;
    const targetPoint = getConnectorJunctionRelevanceTargetPoint(
        junction,
        fromAbove,
    );
    const edgeDeltaY = getConnectorJunctionRelevanceEdgeDeltaY(junction, fromAbove);
    const cornerX = targetPoint.x + (
        (edgeDeltaY * (targetPoint.y - startPoint.y))
        / Math.max(1e-6, junction.width)
    );

    if (
        Math.abs(startPoint.y - targetPoint.y) <= 1
        || cornerX >= startPoint.x - 1
    ) {
        return [startPoint, targetPoint];
    }

    const cornerPoint = {
        x: cornerX,
        y: startPoint.y,
        radius: resolveOrthogonalConnectorBendRadius(
            startPoint,
            { x: cornerX, y: targetPoint.y },
            pipeWidth,
        ),
    };

    return [startPoint, cornerPoint, targetPoint];
}

function buildAngularConnectorCenterline(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): DebateLayoutWaypoint[] {
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
    points: DebateLayoutWaypoint[],
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

function getNodeCenterY(node: DebateLayoutNode): number {
    return node.y + (node.height / 2);
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
            plan.draft.deliveryPipeWidth,
        );
        if (!secondSegmentTurnGuide) {
            continue;
        }

        const targetScoreId = plan.draft.targetNode.scoreId;
        const currentTurnGuide = turnGuideByTargetScoreId.get(targetScoreId);
        if (!currentTurnGuide || secondSegmentTurnGuide.turnStartX < currentTurnGuide.turnStartX) {
            turnGuideByTargetScoreId.set(targetScoreId, secondSegmentTurnGuide);
        }
    }

    return turnGuideByTargetScoreId;
}

function buildRelevancePipeWidthByTargetConnectorId(
    drafts: readonly RelevanceConnectorDraft[],
): ReadonlyMap<ConnectorId, number> {
    const pipeWidthByTargetConnectorId = new Map<ConnectorId, number>();

    for (const draft of drafts) {
        pipeWidthByTargetConnectorId.set(
            draft.targetConfidenceConnectorId,
            Math.max(
                pipeWidthByTargetConnectorId.get(draft.targetConfidenceConnectorId) ?? 0,
                draft.pipeWidth,
            ),
        );
    }

    return pipeWidthByTargetConnectorId;
}

function buildConnectorJunction(args: {
    center: { x: number; y: number };
    connectorId: ConnectorId;
    deliveryPipeWidth: number;
    relevancePipeWidth: number;
    side: Score["connectorSide"];
    sourcePipeWidth: number;
}): DebateLayoutConnectorJunction {
    return {
        centerX: args.center.x,
        centerY: args.center.y,
        leftHeight: args.deliveryPipeWidth,
        rightHeight: args.sourcePipeWidth,
        side: args.side,
        targetConfidenceConnectorId: args.connectorId,
        visualId: `${args.connectorId}:junction`,
        width: args.relevancePipeWidth,
    };
}

function getConnectorJunctionLeftX(junction: DebateLayoutConnectorJunction): number {
    return junction.centerX - (junction.width / 2);
}

function getConnectorJunctionRightX(junction: DebateLayoutConnectorJunction): number {
    return junction.centerX + (junction.width / 2);
}

function getConnectorJunctionLeftTopY(junction: DebateLayoutConnectorJunction): number {
    return junction.centerY - (junction.leftHeight / 2);
}

function getConnectorJunctionRightTopY(junction: DebateLayoutConnectorJunction): number {
    return junction.centerY - (junction.rightHeight / 2);
}

function getConnectorJunctionLeftBottomY(junction: DebateLayoutConnectorJunction): number {
    return junction.centerY + (junction.leftHeight / 2);
}

function getConnectorJunctionRightBottomY(junction: DebateLayoutConnectorJunction): number {
    return junction.centerY + (junction.rightHeight / 2);
}

function getConnectorJunctionTopY(junction: DebateLayoutConnectorJunction): number {
    return Math.min(
        getConnectorJunctionLeftTopY(junction),
        getConnectorJunctionRightTopY(junction),
    );
}

function getConnectorJunctionBottomY(junction: DebateLayoutConnectorJunction): number {
    return Math.max(
        getConnectorJunctionLeftBottomY(junction),
        getConnectorJunctionRightBottomY(junction),
    );
}

function getConnectorJunctionRelevanceTargetPoint(
    junction: DebateLayoutConnectorJunction,
    fromAbove: boolean,
): { x: number; y: number } {
    return {
        x: junction.centerX,
        y: fromAbove
            ? (getConnectorJunctionLeftTopY(junction) + getConnectorJunctionRightTopY(junction)) / 2
            : (getConnectorJunctionLeftBottomY(junction) + getConnectorJunctionRightBottomY(junction)) / 2,
    };
}

function getConnectorJunctionRelevanceEdgeDeltaY(
    junction: DebateLayoutConnectorJunction,
    fromAbove: boolean,
): number {
    return fromAbove
        ? getConnectorJunctionRightTopY(junction) - getConnectorJunctionLeftTopY(junction)
        : getConnectorJunctionRightBottomY(junction) - getConnectorJunctionLeftBottomY(junction);
}

function buildActualConfidenceSlotByConnectorId(
    drafts: readonly ConfidenceConnectorDraft[],
    debate: Debate,
): ReadonlyMap<ConnectorId, ActualConfidenceSlot> {
    const actualConfidenceSlotByConnectorId = new Map<ConnectorId, ActualConfidenceSlot>();
    const draftsByTarget = new Map<ScoreId, ConfidenceConnectorDraft[]>();

    for (const draft of drafts) {
        const existingDrafts = draftsByTarget.get(draft.targetNode.scoreId);
        if (existingDrafts) {
            existingDrafts.push(draft);
            continue;
        }

        draftsByTarget.set(draft.targetNode.scoreId, [draft]);
    }

    for (const draftsForTarget of draftsByTarget.values()) {
        const orderedDrafts = orderConfidenceConnectorDraftsForTarget(draftsForTarget, debate);
        const targetNode = orderedDrafts[0].targetNode;
        const targetCenterY = getNodeCenterY(targetNode);
        const actualConfidenceSlots = orderedDrafts.map((draft) => ({
            draft,
            fluidWidth: draft.deliveryFluidWidth,
        }));
        const totalStackHeight = actualConfidenceSlots.reduce(
            (totalHeight, actualConfidenceSlot) => totalHeight + actualConfidenceSlot.fluidWidth,
            0,
        );
        let currentTop = targetCenterY - (totalStackHeight / 2);

        for (const actualConfidenceSlot of actualConfidenceSlots) {
            actualConfidenceSlotByConnectorId.set(actualConfidenceSlot.draft.connectorId, {
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
    debate: Debate,
): ConfidenceConnectorDraft[] {
    const targetScore = debate.scores[drafts[0]?.targetNode.scoreId];
    const incomingScoreOrder = new Map<ScoreId, number>(
        targetScore?.incomingScoreIds.map((scoreId, index) => [scoreId, index]) ?? [],
    );

    return [...drafts].sort((left, right) => {
        const orderDelta =
            (incomingScoreOrder.get(left.sourceNode.scoreId) ?? Number.POSITIVE_INFINITY)
            - (incomingScoreOrder.get(right.sourceNode.scoreId) ?? Number.POSITIVE_INFINITY);
        if (orderDelta !== 0) {
            return orderDelta;
        }

        const verticalDelta = getNodeCenterY(left.sourceNode) - getNodeCenterY(right.sourceNode);
        if (verticalDelta !== 0) {
            return verticalDelta;
        }

        return left.connectorId.localeCompare(right.connectorId);
    });
}

function getSourceSpanPipeWidth(score: Score): number {
    return scaleWorldWidth(BASE_NODE_HEIGHT_PX, toLayoutScale(score.scaleOfSources));
}

function getSourceSpanFluidWidth(score: Score): number {
    return scaleWorldWidth(BASE_NODE_HEIGHT_PX, toLayoutScale(score.scaleOfSources) * getConnectorConfidenceRatio(score));
}

function getDeliverySpanPipeWidth(score: Score): number {
    return scaleWorldWidth(BASE_NODE_HEIGHT_PX, toPositiveScale(score.deliveryScaleOfSources));
}

function getDeliverySpanFluidWidth(score: Score): number {
    return scaleWorldWidth(
        BASE_NODE_HEIGHT_PX,
        toPositiveScale(score.deliveryScaleOfSources) * getConnectorConfidenceRatio(score),
    );
}

function getRelevanceConnectorFluidWidth(score: Score): number {
    return scaleWorldWidth(BASE_NODE_HEIGHT_PX, toLayoutScale(score.scaleOfSources) * getConnectorConfidenceRatio(score));
}

function getConnectorConfidenceRatio(score: Score): number {
    return clamp(Number.isFinite(score.connectorConfidence) ? score.connectorConfidence : 0, 0, 1);
}

function scaleWorldWidth(baseWidth: number, scale: number): number {
    return baseWidth * toPositiveScale(scale);
}

function toPositiveScale(scale: number): number {
    return Number.isFinite(scale) ? Math.max(0, scale) : 0;
}

function describeConnector(debate: Debate, score: Score): {
    connectorId?: ConnectorId
    connectorType: DebateLayoutNode["connectorType"]
} {
    if (!score.connectorId) {
        return {
            connectorType: "root",
        };
    }

    const connector = debate.connectors[score.connectorId];
    if (!connector) {
        throw new Error(`Connector ${score.connectorId} was not found for score ${score.id}.`);
    }

    return {
        connectorId: connector.id,
        connectorType: connector.type,
    };
}

function getRequiredMainClaimRootScore(debate: Debate): Score {
    const parentedScoreIds = new Set<ScoreId>();
    for (const score of Object.values(debate.scores)) {
        for (const incomingScoreId of score.incomingScoreIds) {
            parentedScoreIds.add(incomingScoreId);
        }
    }

    const rootCandidates = Object.values(debate.scores).filter(
        (score) => score.claimId === debate.mainClaimId && !parentedScoreIds.has(score.id),
    );
    if (rootCandidates.length !== 1) {
        throw new Error(
            `Expected exactly one unparented root score for main claim ${debate.mainClaimId}, found ${rootCandidates.length}.`,
        );
    }

    return rootCandidates[0];
}

function getRequiredScore(debate: Debate, scoreId: ScoreId): Score {
    const score = debate.scores[scoreId];
    if (!score) {
        throw new Error(`Score ${scoreId} was not found in the debate.`);
    }

    return score;
}

export function toLayoutScale(scaleOfSources: number): number {
    return clamp(Number.isFinite(scaleOfSources) ? scaleOfSources : 1, 0, 1);
}

function getHorizontalGap(scaleOfSources: number, multiplier: number): number {
    return Math.round(BASE_HORIZONTAL_GAP_PX * scaleOfSources * multiplier);
}

function getVerticalGap(layoutScale: number): number {
    return Math.round(interpolate(layoutScale, MIN_VERTICAL_GAP_PX, BASE_VERTICAL_GAP_PX));
}

function interpolate(multiplier: number, minimum: number, maximum: number): number {
    return minimum + ((maximum - minimum) * clamp(multiplier, 0, 1));
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
