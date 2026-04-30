import type { Claim, ClaimId } from "../debate-core/Claim.ts";
import type {
    ConfidenceConnector,
    ConfidenceConnectorId,
    RelevanceConnector,
    RelevanceConnectorId,
} from "../debate-core/Connector.ts";
import { withChildrenByParentId } from "../math/calculateScores.ts";
import type { ScoreGraph, ScoreNodeId, Scores } from "../math/scoreTypes.ts";
import type { TweenBoolean, TweenNumber, TweenPoint } from "../utils.ts";
import type {
    ClaimAggregatorViz,
    ClaimAggregatorVizId,
    ClaimViz,
    ClaimVizId,
    ConfidenceConnectorViz,
    ConfidenceConnectorVizId,
    DeliveryConnectorViz,
    DeliveryConnectorVizId,
    JunctionAggregatorViz,
    JunctionAggregatorVizId,
    JunctionViz,
    JunctionVizId,
    RelevanceConnectorViz,
    RelevanceConnectorVizId,
    SnapshotWaypoint,
    Side,
    Snapshot,
} from "./Snapshot.ts";

// AGENT NOTE: Keep the first-pass projection geometry constants together so
// later layout work can replace or tune them in one obvious place.
/** Horizontal distance between adjacent depth columns. */
const DEFAULT_COLUMN_SPACING = 500;
/** Vertical distance between adjacent projected rows. */
const DEFAULT_ROW_SPACING = 140;
/** Horizontal offset from a claim to its local claim aggregator. */
const DEFAULT_CLAIM_AGGREGATOR_OFFSET_X = 36;
/** Fraction of the source-to-target route kept between the source claim and its junction. */
const DEFAULT_JUNCTION_SOURCE_FRACTION = 0.2;
/** Vertical spacing between stacked confidence lanes into the same target claim. */
const DEFAULT_JUNCTION_LANE_SPACING = 36;
/** Base claim span from the old layout engine before source-scale attenuation is applied. */
const DEFAULT_CLAIM_SPAN = 360;
/** Base claim height from the old layout engine before score scaling is applied. */
const DEFAULT_CLAIM_HEIGHT = 176;
/** Extra room reserved before depths that host confidence-connected claims. */
const CONNECTOR_JUNCTION_LAYER_HORIZONTAL_GAP_MULTIPLIER = 2;
/** Preferred share of the horizontal connector span kept as a straight stub before each bend. */
const CONNECTOR_STUB_SHARE_OF_HORIZONTAL_SPAN = 0.2;
/** Preferred share of the geometry-allowed bend radius for diagonal connectors. */
const CONNECTOR_BEND_RADIUS_SHARE_OF_AVAILABLE_MAX = 1;
/** Shortest horizontal run kept before a connector turns into its diagonal middle section. */
const MIN_CONNECTOR_STRAIGHT_PX = 34;
/** Smallest diagonal run preserved between the two connector stubs. */
const MIN_CONNECTOR_DIAGONAL_PX = 36;
/** Smallest centerline bend radius retained before pipe width is considered. */
const MIN_CONNECTOR_BEND_RADIUS_PX = 12;
/** Minimum inner bend radius as a fraction of the rendered pipe width. */
const MIN_CONNECTOR_INNER_BEND_RADIUS_RATIO = 0.3;
/** Position of a connector junction along its confidence connector, measured from source claim to target claim. */
const CONNECTOR_JUNCTION_PATH_PROGRESS = 0.2;
/** Radius applied to routed relevance elbows when there is room for a turn. */
const RELEVANCE_CONNECTOR_CORNER_RADIUS_PX = 24;

type ConnectorTurnGuide = {
    preferredBendRadius: number;
    returnTurnX: number;
    turnStartX: number;
};

type ProjectedJunctionGeometry = {
    centerX: number;
    centerY: number;
    leftHeight: number;
    rightHeight: number;
    width: number;
};

type ProjectedConfidencePlan = {
    childCenter: TweenPoint;
    childScale: number;
    confidenceConnector?: ConfidenceConnector;
    confidenceConnectorId?: ConfidenceConnectorId;
    deliveryPipeWidth: number;
    hasTargetingRelevance: boolean;
    junction: ProjectedJunctionGeometry;
    parentScale: number;
    relevancePipeWidth: number;
    scoreNodeId: ScoreNodeId;
    side: Side;
    sourcePipeWidth: number;
    sourcePoint: TweenPoint;
    targetPoint: TweenPoint;
    targetScoreNodeId: ScoreNodeId;
    visible: boolean;
};

export type ScoreProjectionLayoutOptions = {
    columnSpacing?: number;
    rowSpacing?: number;
    claimAggregatorOffsetX?: number;
    junctionSourceFraction?: number;
    junctionLaneSpacing?: number;
};

export type ScoreProjectionSnapshotOptions = {
    layout?: ScoreProjectionLayoutOptions;
    claimById?: Partial<Record<ClaimId, Claim>>;
    confidenceConnectorIdByScoreNodeId?: Partial<Record<ScoreNodeId, ConfidenceConnectorId>>;
    confidenceConnectorById?: Partial<Record<ConfidenceConnectorId, ConfidenceConnector>>;
    relevanceConnectorIdByScoreNodeId?: Partial<Record<ScoreNodeId, RelevanceConnectorId>>;
    relevanceConnectorById?: Partial<Record<RelevanceConnectorId, RelevanceConnector>>;
};

/**
 * Projects an acyclic score graph into a deterministic snapshot skeleton.
 *
 * This gives the planner real projected occurrences with `scoreNodeId`
 * bindings before the richer layout and command-specific reveal steps exist.
 */
export function buildScoreProjectionSnapshot(args: {
    graph: ScoreGraph;
    scores: Scores;
    options?: ScoreProjectionSnapshotOptions;
}): Snapshot {
    const graph = withChildrenByParentId(args.graph);
    const layout = normalizeLayoutOptions(args.options?.layout);
    const rootScoreNodeIds = findRootScoreNodeIds(graph);
    const visualDepthByScoreNodeId = buildVisualDepthByScoreNodeId(graph, rootScoreNodeIds);
    const scoreScaleByScoreNodeId = buildScoreScaleByScoreNodeId(graph, rootScoreNodeIds);
    const columnCenterXByDepth = buildColumnCenterXByDepth(
        visualDepthByScoreNodeId,
        graph,
        layout.columnSpacing,
        scoreScaleByScoreNodeId,
    );
    const subtreeHeightByScoreNodeId = buildSubtreeHeightByScoreNodeId(graph, rootScoreNodeIds);
    const rowCenterByScoreNodeId = buildRowCenterByScoreNodeId(
        graph,
        rootScoreNodeIds,
        subtreeHeightByScoreNodeId,
    );
    const sideByScoreNodeId = buildSideByScoreNodeId(graph, rootScoreNodeIds);
    const junctionLaneYByScoreNodeId = buildJunctionLaneYByScoreNodeId(
        graph,
        rootScoreNodeIds,
        rowCenterByScoreNodeId,
        layout.junctionLaneSpacing,
        scoreScaleByScoreNodeId,
    );

    const snapshot: Snapshot = {
        claims: {},
        claimAggregators: {},
        junctions: {},
        junctionAggregators: {},
        confidenceConnectors: {},
        deliveryConnectors: {},
        relevanceConnectors: {},
    };

    const claimPositionByScoreNodeId = new Map<ScoreNodeId, TweenPoint>();
    const claimAggregatorPositionByScoreNodeId = new Map<ScoreNodeId, TweenPoint>();
    const junctionPositionByScoreNodeId = new Map<ScoreNodeId, TweenPoint>();
    const junctionAggregatorPositionByScoreNodeId = new Map<ScoreNodeId, TweenPoint>();
    const deliveryConnectorIdsByParentScoreNodeId = new Map<ScoreNodeId, DeliveryConnectorVizId[]>();
    const confidencePlans: ProjectedConfidencePlan[] = [];
    const junctionGeometryByScoreNodeId = new Map<ScoreNodeId, ProjectedJunctionGeometry>();
    const relevanceConnectorIdsByTargetScoreNodeId = new Map<ScoreNodeId, RelevanceConnectorVizId[]>();

    for (const scoreNodeId of orderScoreNodeIds(graph, rootScoreNodeIds)) {
        const scoreNode = graph.nodes[scoreNodeId];

        if (!scoreNode) {
            continue;
        }

        const scoreScale = scoreScaleByScoreNodeId[scoreNodeId] ?? 1;

        const claimPosition = createPoint({
            x: columnCenterXByDepth[visualDepthByScoreNodeId[scoreNodeId] ?? 0] ?? 0,
            y: (rowCenterByScoreNodeId[scoreNodeId] ?? 0) * layout.rowSpacing,
        });
        const claimAggregatorPosition = createPoint({
            x: readPointX(claimPosition) - layout.claimAggregatorOffsetX * scoreScale,
            y: readPointY(claimPosition),
        });

        claimPositionByScoreNodeId.set(scoreNodeId, claimPosition);
        claimAggregatorPositionByScoreNodeId.set(scoreNodeId, claimAggregatorPosition);

        snapshot.claims[toClaimVizId(scoreNodeId)] = buildClaimViz({
            scoreNodeId,
            claimId: scoreNode.claimId,
            claim: args.options?.claimById?.[scoreNode.claimId],
            position: claimPosition,
            scale: scoreScale,
            score: readScoreValue(args.scores, scoreNodeId),
            side: sideByScoreNodeId[scoreNodeId] ?? "proMain",
        });

        snapshot.claimAggregators[toClaimAggregatorVizId(scoreNodeId)] = buildClaimAggregatorViz({
            scoreNodeId,
            claimId: scoreNode.claimId,
            claim: args.options?.claimById?.[scoreNode.claimId],
            position: claimAggregatorPosition,
            scale: scoreScale,
            score: readScoreValue(args.scores, scoreNodeId),
            deliveryConnectorVizIds: [],
        });
    }

    for (const scoreNodeId of orderScoreNodeIds(graph, rootScoreNodeIds)) {
        const scoreNode = graph.nodes[scoreNodeId];

        if (!scoreNode || !scoreNode.parentId || scoreNode.affects !== "Score") {
            continue;
        }

        const childPosition = requirePoint(claimPositionByScoreNodeId.get(scoreNodeId), scoreNodeId, "claim");
        const parentPosition = requirePoint(claimPositionByScoreNodeId.get(scoreNode.parentId), scoreNode.parentId, "claim");
        const childX = readPointX(childPosition);
        const parentX = readPointX(parentPosition);
        const childScale = scoreScaleByScoreNodeId[scoreNodeId] ?? 1;
        const parentScale = scoreScaleByScoreNodeId[scoreNode.parentId] ?? 1;
        const confidenceConnectorId = args.options?.confidenceConnectorIdByScoreNodeId?.[scoreNodeId];
        const confidenceConnector = confidenceConnectorId
            ? args.options?.confidenceConnectorById?.[confidenceConnectorId]
            : undefined;
        const childClaimLeftX = childX - readClaimSpan(childScale) / 2;
        const parentClaimRightX = parentX + readClaimSpan(parentScale) / 2;
        const relevanceChildScoreNodeIds = getOrderedChildScoreNodeIds(graph, scoreNodeId).filter(
            (childScoreNodeId) => graph.nodes[childScoreNodeId]?.affects === "Relevance",
        );
        const visible = relevanceChildScoreNodeIds.length > 0;
        const sourcePoint = createPoint({
            x: childClaimLeftX,
            y: readPointY(childPosition),
        });
        const targetPoint = createPoint({
            x: parentClaimRightX,
            y: junctionLaneYByScoreNodeId[scoreNodeId] ?? readPointY(parentPosition),
        });
        const sourcePipeWidth = readPipeWidth(childScale);
        const deliveryPipeWidth = readPipeWidth(childScale);
        const relevancePipeWidth = relevanceChildScoreNodeIds.reduce(
            (maximumWidth, relevanceChildScoreNodeId) => Math.max(
                maximumWidth,
                readPipeWidth(scoreScaleByScoreNodeId[relevanceChildScoreNodeId] ?? 1),
            ),
            0,
        );
        const fullConfidenceCenterline = buildConfidenceCenterlinePoints(sourcePoint, targetPoint, sourcePipeWidth);
        const junctionGeometry = buildProjectedConnectorJunction({
            center: getPointAtWaypointProgress(fullConfidenceCenterline, CONNECTOR_JUNCTION_PATH_PROGRESS),
            deliveryPipeWidth,
            relevancePipeWidth,
            sourcePipeWidth,
        });
        const junctionPosition = createPoint({
            x: junctionGeometry.centerX,
            y: junctionGeometry.centerY,
        });
        const junctionAggregatorPosition = createPoint({
            x: junctionGeometry.centerX,
            y: junctionGeometry.centerY,
        });

        junctionPositionByScoreNodeId.set(scoreNodeId, junctionPosition);
        junctionAggregatorPositionByScoreNodeId.set(scoreNodeId, junctionAggregatorPosition);
        junctionGeometryByScoreNodeId.set(scoreNodeId, junctionGeometry);

        confidencePlans.push({
            childCenter: childPosition,
            childScale,
            confidenceConnectorId,
            confidenceConnector,
            deliveryPipeWidth,
            hasTargetingRelevance: visible,
            junction: junctionGeometry,
            parentScale,
            relevancePipeWidth,
            scoreNodeId,
            side: sideByScoreNodeId[scoreNodeId] ?? "proMain",
            sourcePipeWidth,
            sourcePoint,
            targetPoint,
            targetScoreNodeId: scoreNode.parentId,
            visible,
        });

        snapshot.junctions[toJunctionVizId(scoreNodeId)] = buildJunctionViz({
            scoreNodeId,
            confidenceConnectorId,
            confidenceConnector,
            junctionAggregatorVizId: toJunctionAggregatorVizId(scoreNodeId),
            position: junctionPosition,
            leftHeight: junctionGeometry.leftHeight,
            rightHeight: junctionGeometry.rightHeight,
            scale: childScale,
            visible,
            width: junctionGeometry.width,
        });

        snapshot.junctionAggregators[toJunctionAggregatorVizId(scoreNodeId)] = buildJunctionAggregatorViz({
            scoreNodeId,
            confidenceConnectorId,
            confidenceConnector,
            position: junctionAggregatorPosition,
            scale: childScale,
            score: readScoreValue(args.scores, scoreNodeId),
            relevanceConnectorVizIds: [],
            visible,
        });
    }

    const turnGuideByTargetScoreNodeId = buildTurnGuideByTargetScoreNodeId(confidencePlans);

    for (const plan of confidencePlans) {
        const sourceSegmentEndPoint = createPoint({
            x: plan.junction.centerX + (plan.junction.width / 2),
            y: plan.junction.centerY,
        });
        const deliverySource = plan.hasTargetingRelevance
            ? createPoint({
                x: plan.junction.centerX - (plan.junction.width / 2),
                y: plan.junction.centerY,
            })
            : plan.sourcePoint;
        const deliveryCenterlinePoints = plan.hasTargetingRelevance
            ? buildAngularConnectorCenterlinePoints(deliverySource, plan.targetPoint, plan.deliveryPipeWidth)
            : buildConfidenceCenterlinePoints(
                plan.sourcePoint,
                plan.targetPoint,
                plan.deliveryPipeWidth,
                turnGuideByTargetScoreNodeId.get(plan.targetScoreNodeId),
            );

        snapshot.confidenceConnectors[toConfidenceConnectorVizId(plan.scoreNodeId)] = buildConfidenceConnectorViz({
            scoreNodeId: plan.scoreNodeId,
            confidenceConnectorId: plan.confidenceConnectorId,
            confidenceConnector: plan.confidenceConnector,
            source: plan.sourcePoint,
            target: sourceSegmentEndPoint,
            centerlinePoints: buildConfidenceCenterlinePoints(
                plan.sourcePoint,
                sourceSegmentEndPoint,
                plan.sourcePipeWidth,
            ),
            side: plan.side,
            scale: plan.childScale,
            score: readScoreValue(args.scores, plan.scoreNodeId),
            sourceClaimVizId: toClaimVizId(plan.scoreNodeId),
            targetJunctionVizId: toJunctionVizId(plan.scoreNodeId),
            visible: plan.visible,
        });

        snapshot.deliveryConnectors[toDeliveryConnectorVizId(plan.scoreNodeId)] = buildDeliveryConnectorViz({
            scoreNodeId: plan.scoreNodeId,
            confidenceConnectorId: plan.confidenceConnectorId,
            confidenceConnector: plan.confidenceConnector,
            source: deliverySource,
            target: plan.targetPoint,
            centerlinePoints: deliveryCenterlinePoints,
            side: plan.side,
            scale: plan.childScale,
            score: readScoreValue(args.scores, plan.scoreNodeId),
            sourceJunctionVizId: toJunctionVizId(plan.scoreNodeId),
            targetClaimVizId: toClaimVizId(plan.targetScoreNodeId),
        });

        deliveryConnectorIdsByParentScoreNodeId.set(plan.targetScoreNodeId, [
            ...(deliveryConnectorIdsByParentScoreNodeId.get(plan.targetScoreNodeId) ?? []),
            toDeliveryConnectorVizId(plan.scoreNodeId),
        ]);
    }

    for (const scoreNodeId of orderScoreNodeIds(graph, rootScoreNodeIds)) {
        const scoreNode = graph.nodes[scoreNodeId];

        if (!scoreNode || !scoreNode.parentId || scoreNode.affects !== "Relevance") {
            continue;
        }

        const claimPosition = requirePoint(claimPositionByScoreNodeId.get(scoreNodeId), scoreNodeId, "claim");
        const source = createPoint({
            x: readPointX(claimPosition) - readClaimSpan(scoreScaleByScoreNodeId[scoreNodeId] ?? 1) / 2,
            y: readPointY(claimPosition),
        });
        const scoreScale = scoreScaleByScoreNodeId[scoreNodeId] ?? 1;
        const relevanceConnectorId = args.options?.relevanceConnectorIdByScoreNodeId?.[scoreNodeId];
        const relevanceConnector = relevanceConnectorId
            ? args.options?.relevanceConnectorById?.[relevanceConnectorId]
            : undefined;
        const junctionGeometry = junctionGeometryByScoreNodeId.get(scoreNode.parentId);

        if (!junctionGeometry) {
            continue;
        }

        const target = createPoint(
            getProjectedJunctionRelevanceTargetPoint(
                junctionGeometry,
                readPointY(source) < junctionGeometry.centerY,
            ),
        );
        const relevanceCenterlinePoints = buildRelevanceConnectorCenterlinePoints(source, target, junctionGeometry, scoreScale);

        snapshot.relevanceConnectors[toRelevanceConnectorVizId(scoreNodeId)] = buildRelevanceConnectorViz({
            scoreNodeId,
            relevanceConnectorId,
            relevanceConnector,
            source,
            target,
            centerlinePoints: relevanceCenterlinePoints,
            side: sideByScoreNodeId[scoreNodeId] ?? "proMain",
            scale: scoreScale,
            score: readScoreValue(args.scores, scoreNodeId),
            sourceClaimVizId: toClaimVizId(scoreNodeId),
            targetJunctionAggregatorVizId: toJunctionAggregatorVizId(scoreNode.parentId),
        });

        relevanceConnectorIdsByTargetScoreNodeId.set(scoreNode.parentId, [
            ...(relevanceConnectorIdsByTargetScoreNodeId.get(scoreNode.parentId) ?? []),
            toRelevanceConnectorVizId(scoreNodeId),
        ]);
    }

    for (const scoreNodeId of orderScoreNodeIds(graph, rootScoreNodeIds)) {
        const claimAggregator = snapshot.claimAggregators[toClaimAggregatorVizId(scoreNodeId)];

        if (claimAggregator) {
            snapshot.claimAggregators[toClaimAggregatorVizId(scoreNodeId)] = {
                ...claimAggregator,
                deliveryConnectorVizIds: sortIds(deliveryConnectorIdsByParentScoreNodeId.get(scoreNodeId) ?? []),
            };
        }

        const junctionAggregator = snapshot.junctionAggregators[toJunctionAggregatorVizId(scoreNodeId)];

        if (junctionAggregator) {
            snapshot.junctionAggregators[toJunctionAggregatorVizId(scoreNodeId)] = {
                ...junctionAggregator,
                relevanceConnectorVizIds: sortIds(relevanceConnectorIdsByTargetScoreNodeId.get(scoreNodeId) ?? []),
            };
        }
    }

    return snapshot;
}

function normalizeLayoutOptions(
    options: ScoreProjectionLayoutOptions | undefined,
): Required<ScoreProjectionLayoutOptions> {
    return {
        columnSpacing: options?.columnSpacing ?? DEFAULT_COLUMN_SPACING,
        rowSpacing: options?.rowSpacing ?? DEFAULT_ROW_SPACING,
        claimAggregatorOffsetX: options?.claimAggregatorOffsetX ?? DEFAULT_CLAIM_AGGREGATOR_OFFSET_X,
        junctionSourceFraction: options?.junctionSourceFraction ?? DEFAULT_JUNCTION_SOURCE_FRACTION,
        junctionLaneSpacing: options?.junctionLaneSpacing ?? DEFAULT_JUNCTION_LANE_SPACING,
    };
}

function findRootScoreNodeIds(graph: ScoreGraph): ScoreNodeId[] {
    return (Object.keys(graph.nodes) as ScoreNodeId[]).filter(
        (scoreNodeId) => !graph.nodes[scoreNodeId]?.parentId,
    );
}

function buildScoreScaleByScoreNodeId(
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
): Partial<Record<ScoreNodeId, number>> {
    const scoreScaleByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};

    for (const rootScoreNodeId of rootScoreNodeIds) {
        visit(rootScoreNodeId, 1);
    }

    return scoreScaleByScoreNodeId;

    function visit(scoreNodeId: ScoreNodeId, scale: number): void {
        scoreScaleByScoreNodeId[scoreNodeId] = clampProjectedScale(scale);

        const childScoreNodeIds = getOrderedChildScoreNodeIds(graph, scoreNodeId);
        const confidenceChildCount = childScoreNodeIds.filter(
            (childScoreNodeId) => graph.nodes[childScoreNodeId]?.affects === "Score",
        ).length;
        const confidenceChildScale = scale / Math.max(1, confidenceChildCount);

        for (const childScoreNodeId of childScoreNodeIds) {
            const child = graph.nodes[childScoreNodeId];

            if (!child) {
                continue;
            }

            visit(
                childScoreNodeId,
                child.affects === "Score" ? confidenceChildScale : scale,
            );
        }
    }
}

function buildVisualDepthByScoreNodeId(
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
): Partial<Record<ScoreNodeId, number>> {
    const visualDepthByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};

    for (const rootScoreNodeId of rootScoreNodeIds) {
        visit(rootScoreNodeId, 0);
    }

    return visualDepthByScoreNodeId;

    function visit(scoreNodeId: ScoreNodeId, depth: number): void {
        visualDepthByScoreNodeId[scoreNodeId] = depth;

        for (const childScoreNodeId of getOrderedChildScoreNodeIds(graph, scoreNodeId)) {
            const child = graph.nodes[childScoreNodeId];
            const childDepth = child?.affects === "Relevance" ? depth : depth + 1;
            visit(childScoreNodeId, childDepth);
        }
    }
}

function buildColumnCenterXByDepth(
    visualDepthByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
    graph: ScoreGraph,
    columnSpacing: number,
    scoreScaleByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
): Record<number, number> {
    const maxDepth = Math.max(
        0,
        ...Object.values(visualDepthByScoreNodeId).filter((depth): depth is number => depth !== undefined),
    );
    const maxClaimSpanByDepth: Record<number, number> = {};
    const maxScaleByDepth: Record<number, number> = {};
    const hasConfidenceNodeByDepth: Record<number, boolean> = {};

    for (const scoreNodeId of Object.keys(graph.nodes) as ScoreNodeId[]) {
        const depth = visualDepthByScoreNodeId[scoreNodeId] ?? 0;
        const scale = scoreScaleByScoreNodeId[scoreNodeId] ?? 1;
        const scoreNode = graph.nodes[scoreNodeId];

        maxClaimSpanByDepth[depth] = Math.max(maxClaimSpanByDepth[depth] ?? 0, readClaimSpan(scale));
        maxScaleByDepth[depth] = Math.max(maxScaleByDepth[depth] ?? 0, scale);

        if (scoreNode?.parentId && scoreNode.affects === "Score") {
            hasConfidenceNodeByDepth[depth] = true;
        }
    }

    const columnCenterXByDepth: Record<number, number> = { 0: 0 };

    for (let depth = 1; depth <= maxDepth; depth += 1) {
        const previousSpan = maxClaimSpanByDepth[depth - 1] ?? DEFAULT_CLAIM_SPAN;
        const currentSpan = maxClaimSpanByDepth[depth] ?? DEFAULT_CLAIM_SPAN;
        const depthGapScale = maxScaleByDepth[depth - 1] ?? 1;
        const horizontalGapMultiplier = hasConfidenceNodeByDepth[depth]
            ? CONNECTOR_JUNCTION_LAYER_HORIZONTAL_GAP_MULTIPLIER
            : 1;

        columnCenterXByDepth[depth] =
            (columnCenterXByDepth[depth - 1] ?? 0)
            + previousSpan / 2
            + columnSpacing * depthGapScale * horizontalGapMultiplier
            + currentSpan / 2;
    }

    return columnCenterXByDepth;
}

function buildSubtreeHeightByScoreNodeId(
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
): Partial<Record<ScoreNodeId, number>> {
    const subtreeHeightByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};

    for (const rootScoreNodeId of rootScoreNodeIds) {
        visit(rootScoreNodeId);
    }

    return subtreeHeightByScoreNodeId;

    function visit(scoreNodeId: ScoreNodeId): number {
        const childScoreNodeIds = getOrderedChildScoreNodeIds(graph, scoreNodeId);

        if (childScoreNodeIds.length === 0) {
            subtreeHeightByScoreNodeId[scoreNodeId] = 1;
            return 1;
        }

        let subtreeHeight = 0;

        for (const childScoreNodeId of childScoreNodeIds) {
            subtreeHeight += visit(childScoreNodeId);
        }

        subtreeHeightByScoreNodeId[scoreNodeId] = Math.max(1, subtreeHeight);
        return subtreeHeightByScoreNodeId[scoreNodeId] ?? 1;
    }
}

function buildRowCenterByScoreNodeId(
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
    subtreeHeightByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
): Partial<Record<ScoreNodeId, number>> {
    const rowCenterByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};
    let nextRowStart = 0;

    for (const rootScoreNodeId of rootScoreNodeIds) {
        assign(rootScoreNodeId, nextRowStart);
        nextRowStart += subtreeHeightByScoreNodeId[rootScoreNodeId] ?? 1;
    }

    return rowCenterByScoreNodeId;

    function assign(scoreNodeId: ScoreNodeId, startRow: number): void {
        const subtreeHeight = subtreeHeightByScoreNodeId[scoreNodeId] ?? 1;
        rowCenterByScoreNodeId[scoreNodeId] = startRow + (subtreeHeight - 1) / 2;

        let childRowStart = startRow;

        for (const childScoreNodeId of getOrderedChildScoreNodeIds(graph, scoreNodeId)) {
            assign(childScoreNodeId, childRowStart);
            childRowStart += subtreeHeightByScoreNodeId[childScoreNodeId] ?? 1;
        }
    }
}

function buildJunctionLaneYByScoreNodeId(
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
    rowCenterByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
    laneSpacing: number,
    scoreScaleByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
): Partial<Record<ScoreNodeId, number>> {
    const junctionLaneYByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};

    for (const scoreNodeId of orderScoreNodeIds(graph, rootScoreNodeIds)) {
        const scoreChildNodeIds = getOrderedChildScoreNodeIds(graph, scoreNodeId).filter(
            (childScoreNodeId) => graph.nodes[childScoreNodeId]?.affects === "Score",
        );

        if (scoreChildNodeIds.length === 0) {
            continue;
        }

        const targetCenterY = rowCenterByScoreNodeId[scoreNodeId] ?? 0;
        const laneHeights = scoreChildNodeIds.map((childScoreNodeId) =>
            laneSpacing * Math.max(
                scoreScaleByScoreNodeId[scoreNodeId] ?? 1,
                scoreScaleByScoreNodeId[childScoreNodeId] ?? 1,
            ),
        );
        const totalLaneHeight = laneHeights.reduce((sum, laneHeight) => sum + laneHeight, 0);
        let nextLaneStartY = targetCenterY - totalLaneHeight / 2;

        scoreChildNodeIds.forEach((childScoreNodeId, index) => {
            const laneHeight = laneHeights[index] ?? laneSpacing;

            junctionLaneYByScoreNodeId[childScoreNodeId] = nextLaneStartY + laneHeight / 2;
            nextLaneStartY += laneHeight;
        });
    }

    return junctionLaneYByScoreNodeId;
}

function buildSideByScoreNodeId(
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
): Partial<Record<ScoreNodeId, Side>> {
    const sideByScoreNodeId: Partial<Record<ScoreNodeId, Side>> = {};

    for (const rootScoreNodeId of rootScoreNodeIds) {
        visit(rootScoreNodeId, "proMain");
    }

    return sideByScoreNodeId;

    function visit(scoreNodeId: ScoreNodeId, side: Side): void {
        sideByScoreNodeId[scoreNodeId] = side;

        for (const childScoreNodeId of getOrderedChildScoreNodeIds(graph, scoreNodeId)) {
            const child = graph.nodes[childScoreNodeId];
            const childSide = child?.proParent === false ? flipSide(side) : side;
            visit(childScoreNodeId, childSide);
        }
    }
}

function flipSide(side: Side): Side {
    return side === "proMain" ? "conMain" : "proMain";
}

function getOrderedChildScoreNodeIds(graph: ScoreGraph, scoreNodeId: ScoreNodeId): ScoreNodeId[] {
    return [...(graph.childrenByParentId?.[scoreNodeId] ?? [])];
}

function orderScoreNodeIds(graph: ScoreGraph, rootScoreNodeIds: readonly ScoreNodeId[]): ScoreNodeId[] {
    const ordered: ScoreNodeId[] = [];

    for (const rootScoreNodeId of rootScoreNodeIds) {
        visit(rootScoreNodeId);
    }

    return ordered;

    function visit(scoreNodeId: ScoreNodeId): void {
        ordered.push(scoreNodeId);

        for (const childScoreNodeId of getOrderedChildScoreNodeIds(graph, scoreNodeId)) {
            visit(childScoreNodeId);
        }
    }
}

function buildClaimViz(args: {
    scoreNodeId: ScoreNodeId;
    claimId: ClaimViz["claimId"];
    claim?: Claim;
    position: TweenPoint;
    scale: number;
    score: number;
    side: Side;
}): ClaimViz {
    return {
        type: "claim",
        id: toClaimVizId(args.scoreNodeId),
        claimId: args.claimId,
        claim: args.claim,
        scoreNodeId: args.scoreNodeId,
        position: args.position,
        scale: args.scale,
        score: args.score,
        side: args.side,
    };
}

function buildClaimAggregatorViz(args: {
    scoreNodeId: ScoreNodeId;
    claimId: ClaimAggregatorViz["claimId"];
    claim?: Claim;
    position: TweenPoint;
    scale: number;
    score: number;
    deliveryConnectorVizIds: DeliveryConnectorVizId[];
}): ClaimAggregatorViz {
    return {
        type: "claimAggregator",
        id: toClaimAggregatorVizId(args.scoreNodeId),
        animationType: "uniform",
        claimId: args.claimId,
        claim: args.claim,
        scoreNodeId: args.scoreNodeId,
        deliveryConnectorVizIds: args.deliveryConnectorVizIds,
        position: args.position,
        scale: args.scale,
        score: args.score,
    };
}

function buildJunctionViz(args: {
    scoreNodeId: ScoreNodeId;
    confidenceConnectorId?: ConfidenceConnectorId;
    confidenceConnector?: ConfidenceConnector;
    junctionAggregatorVizId: JunctionAggregatorVizId;
    leftHeight: number;
    position: TweenPoint;
    rightHeight: number;
    scale: number;
    visible: boolean;
    width: number;
}): JunctionViz {
    return {
        type: "junction",
        id: toJunctionVizId(args.scoreNodeId),
        animationType: "uniform",
        confidenceConnectorId: args.confidenceConnectorId,
        confidenceConnector: args.confidenceConnector,
        scoreNodeId: args.scoreNodeId,
        junctionAggregatorVizId: args.junctionAggregatorVizId,
        position: args.position,
        leftHeight: args.leftHeight,
        rightHeight: args.rightHeight,
        scale: args.scale,
        visible: toTweenBoolean(args.visible),
        width: args.width,
    };
}

function buildJunctionAggregatorViz(args: {
    scoreNodeId: ScoreNodeId;
    confidenceConnectorId?: ConfidenceConnectorId;
    confidenceConnector?: ConfidenceConnector;
    position: TweenPoint;
    scale: number;
    score: number;
    relevanceConnectorVizIds: RelevanceConnectorVizId[];
    visible: boolean;
}): JunctionAggregatorViz {
    return {
        type: "junctionAggregator",
        id: toJunctionAggregatorVizId(args.scoreNodeId),
        animationType: "uniform",
        confidenceConnectorId: args.confidenceConnectorId,
        confidenceConnector: args.confidenceConnector,
        scoreNodeId: args.scoreNodeId,
        position: args.position,
        relevanceConnectorVizIds: args.relevanceConnectorVizIds,
        scale: args.scale,
        score: args.score,
        visible: toTweenBoolean(args.visible),
    };
}

function buildConfidenceConnectorViz(args: {
    scoreNodeId: ScoreNodeId;
    confidenceConnectorId?: ConfidenceConnectorId;
    confidenceConnector?: ConfidenceConnector;
    source: TweenPoint;
    target: TweenPoint;
    centerlinePoints: SnapshotWaypoint[];
    side: Side;
    scale: number;
    score: number;
    sourceClaimVizId: ClaimVizId;
    targetJunctionVizId: JunctionVizId;
    visible: boolean;
}): ConfidenceConnectorViz {
    return {
        type: "confidenceConnector",
        id: toConfidenceConnectorVizId(args.scoreNodeId),
        animationType: "uniform",
        confidenceConnectorId: args.confidenceConnectorId,
        confidenceConnector: args.confidenceConnector,
        scoreNodeId: args.scoreNodeId,
        sourceClaimVizId: args.sourceClaimVizId,
        targetJunctionVizId: args.targetJunctionVizId,
        visible: toTweenBoolean(args.visible),
        scale: args.scale,
        score: args.score,
        side: args.side,
        source: args.source,
        target: args.target,
        centerlinePoints: args.centerlinePoints,
        direction: "sourceToTarget",
    };
}

function buildDeliveryConnectorViz(args: {
    scoreNodeId: ScoreNodeId;
    confidenceConnectorId?: ConfidenceConnectorId;
    confidenceConnector?: ConfidenceConnector;
    source: TweenPoint;
    target: TweenPoint;
    centerlinePoints: SnapshotWaypoint[];
    side: Side;
    scale: number;
    score: number;
    sourceJunctionVizId: JunctionVizId;
    targetClaimVizId: ClaimVizId;
}): DeliveryConnectorViz {
    return {
        type: "deliveryConnector",
        id: toDeliveryConnectorVizId(args.scoreNodeId),
        confidenceConnectorId: args.confidenceConnectorId,
        confidenceConnector: args.confidenceConnector,
        scoreNodeId: args.scoreNodeId,
        sourceJunctionVizId: args.sourceJunctionVizId,
        targetClaimVizId: args.targetClaimVizId,
        scale: args.scale,
        score: args.score,
        side: args.side,
        source: args.source,
        target: args.target,
        centerlinePoints: args.centerlinePoints,
        direction: "sourceToTarget",
    };
}

function buildRelevanceConnectorViz(args: {
    scoreNodeId: ScoreNodeId;
    relevanceConnectorId?: RelevanceConnectorId;
    relevanceConnector?: RelevanceConnector;
    source: TweenPoint;
    target: TweenPoint;
    centerlinePoints: SnapshotWaypoint[];
    side: Side;
    scale: number;
    score: number;
    sourceClaimVizId: ClaimVizId;
    targetJunctionAggregatorVizId: JunctionAggregatorVizId;
}): RelevanceConnectorViz {
    return {
        type: "relevanceConnector",
        id: toRelevanceConnectorVizId(args.scoreNodeId),
        relevanceConnectorId: args.relevanceConnectorId,
        relevanceConnector: args.relevanceConnector,
        scoreNodeId: args.scoreNodeId,
        sourceClaimVizId: args.sourceClaimVizId,
        targetJunctionAggregatorVizId: args.targetJunctionAggregatorVizId,
        scale: args.scale,
        score: args.score,
        side: args.side,
        source: args.source,
        target: args.target,
        centerlinePoints: args.centerlinePoints,
        direction: "sourceToTarget",
    };
}

function clampProjectedScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1;
    }

    return Math.min(1, Math.max(0, scale));
}

function readClaimSpan(scale: number): number {
    return DEFAULT_CLAIM_SPAN * scale;
}

function readPipeWidth(scale: number): number {
    return DEFAULT_CLAIM_HEIGHT * Math.max(0, scale);
}

function readScoreValue(scores: Scores, scoreNodeId: ScoreNodeId): number {
    return scores[scoreNodeId]?.value ?? 0;
}

function createPoint(args: { x: number; y: number }): TweenPoint {
    return { x: args.x, y: args.y };
}

function createWaypoint(args: { x: number; y: number; radius?: number }): SnapshotWaypoint {
    return args.radius === undefined
        ? { x: args.x, y: args.y }
        : { x: args.x, y: args.y, radius: args.radius };
}

function buildRelevanceConnectorCenterlinePoints(
    source: TweenPoint,
    target: TweenPoint,
    junction: ProjectedJunctionGeometry,
    scale: number,
): SnapshotWaypoint[] {
    const sourceX = readPointX(source);
    const sourceY = readPointY(source);
    const targetX = readPointX(target);
    const targetY = readPointY(target);
    const pipeWidth = readPipeWidth(scale);
    const fromAbove = sourceY < junction.centerY;
    const edgeDeltaY = getProjectedJunctionRelevanceEdgeDeltaY(junction, fromAbove);
    const cornerX = targetX + ((edgeDeltaY * (targetY - sourceY)) / Math.max(1e-6, junction.width));

    if (Math.abs(sourceY - targetY) <= 1 || cornerX >= sourceX - 1) {
        return [
            createWaypoint({ x: sourceX, y: sourceY }),
            createWaypoint({ x: targetX, y: targetY }),
        ];
    }

    return [
        createWaypoint({ x: sourceX, y: sourceY }),
        createWaypoint({
            x: cornerX,
            y: sourceY,
            radius: resolveOrthogonalConnectorBendRadius(
                { x: sourceX, y: sourceY },
                { x: cornerX, y: targetY },
                pipeWidth,
            ),
        }),
        createWaypoint({ x: targetX, y: targetY }),
    ];
}

function buildConfidenceCenterlinePoints(
    source: TweenPoint,
    target: TweenPoint,
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): SnapshotWaypoint[] {
    return buildAngularConnectorCenterlinePoints(source, target, pipeWidth, turnGuide);
}

function buildAngularConnectorCenterlinePoints(
    source: TweenPoint,
    target: TweenPoint,
    pipeWidth: number,
    turnGuide?: ConnectorTurnGuide,
): SnapshotWaypoint[] {
    const startPoint = { x: readPointX(source), y: readPointY(source) };
    const endPoint = { x: readPointX(target), y: readPointY(target) };
    const bendPoints = resolveAngularConnectorBendPoints(startPoint, endPoint, pipeWidth, turnGuide);

    if (!bendPoints) {
        return [createWaypoint(startPoint), createWaypoint(endPoint)];
    }

    const diagonalDeltaX = Math.abs(bendPoints.bendStart.x - bendPoints.bendEnd.x);
    const diagonalDeltaY = Math.abs(bendPoints.bendStart.y - bendPoints.bendEnd.y);
    const diagonalLength = Math.hypot(diagonalDeltaX, diagonalDeltaY);
    const bendRadius = resolveDiagonalConnectorBendRadius(
        bendPoints.startStraightLength,
        bendPoints.endStraightLength,
        diagonalLength,
        Math.atan2(diagonalDeltaY, diagonalDeltaX),
        getMinimumCenterlineBendRadius(pipeWidth),
        turnGuide?.preferredBendRadius,
    );

    if (bendRadius < 8) {
        return [
            createWaypoint(startPoint),
            createWaypoint(bendPoints.bendStart),
            createWaypoint(bendPoints.bendEnd),
            createWaypoint(endPoint),
        ];
    }

    return [
        createWaypoint(startPoint),
        createWaypoint({ ...bendPoints.bendStart, radius: bendRadius }),
        createWaypoint({ ...bendPoints.bendEnd, radius: bendRadius }),
        createWaypoint(endPoint),
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
        horizontalSpan * CONNECTOR_STUB_SHARE_OF_HORIZONTAL_SPAN,
    );

    return Math.min(preferredStraightSegmentLength, maximumStraightSegmentLength);
}

function resolveDiagonalConnectorBendRadius(
    startStraightLength: number,
    endStraightLength: number,
    diagonalLength: number,
    diagonalTurnAngleRadians: number,
    minimumCenterlineBendRadius: number,
    preferredBendRadius?: number,
): number {
    const maximumBendRadius = getMaximumDiagonalCornerBendRadius(
        startStraightLength,
        endStraightLength,
        diagonalLength,
        diagonalTurnAngleRadians,
    );
    const defaultPreferredBendRadius = maximumBendRadius * CONNECTOR_BEND_RADIUS_SHARE_OF_AVAILABLE_MAX;

    return Math.min(
        Math.max(
            MIN_CONNECTOR_BEND_RADIUS_PX,
            minimumCenterlineBendRadius,
            preferredBendRadius ?? defaultPreferredBendRadius,
        ),
        maximumBendRadius,
    );
}

function getMaximumDiagonalCornerBendRadius(
    startStraightLength: number,
    endStraightLength: number,
    diagonalLength: number,
    diagonalTurnAngleRadians: number,
): number {
    const tangentFactor = Math.tan(diagonalTurnAngleRadians / 2);

    if (tangentFactor <= 1e-6) {
        return 0;
    }

    return Math.min(startStraightLength, endStraightLength, diagonalLength) / tangentFactor;
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

function getPointAtWaypointProgress(
    waypoints: readonly SnapshotWaypoint[],
    progress: number,
): { x: number; y: number } {
    if (waypoints.length <= 1) {
        const firstWaypoint = waypoints[0];
        return firstWaypoint
            ? { x: readTweenNumber(firstWaypoint.x), y: readTweenNumber(firstWaypoint.y) }
            : { x: 0, y: 0 };
    }

    const clampedProgress = Math.min(1, Math.max(0, progress));
    const segmentLengths = waypoints.slice(1).map((point, index) => {
        const previousPoint = waypoints[index];
        return Math.hypot(
            readTweenNumber(point.x) - readTweenNumber(previousPoint.x),
            readTweenNumber(point.y) - readTweenNumber(previousPoint.y),
        );
    });
    const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);

    if (totalLength <= 1e-6) {
        return {
            x: readTweenNumber(waypoints[0]!.x),
            y: readTweenNumber(waypoints[0]!.y),
        };
    }

    const targetLength = totalLength * clampedProgress;
    let traversedLength = 0;

    for (let index = 1; index < waypoints.length; index += 1) {
        const segmentLength = segmentLengths[index - 1] ?? 0;

        if (traversedLength + segmentLength < targetLength) {
            traversedLength += segmentLength;
            continue;
        }

        const segmentStart = waypoints[index - 1]!;
        const segmentEnd = waypoints[index]!;
        const segmentProgress = segmentLength <= 1e-6
            ? 0
            : (targetLength - traversedLength) / segmentLength;

        return {
            x: readTweenNumber(segmentStart.x)
                + ((readTweenNumber(segmentEnd.x) - readTweenNumber(segmentStart.x)) * segmentProgress),
            y: readTweenNumber(segmentStart.y)
                + ((readTweenNumber(segmentEnd.y) - readTweenNumber(segmentStart.y)) * segmentProgress),
        };
    }

    const finalWaypoint = waypoints.at(-1)!;
    return {
        x: readTweenNumber(finalWaypoint.x),
        y: readTweenNumber(finalWaypoint.y),
    };
}

function buildProjectedConnectorJunction(args: {
    center: { x: number; y: number };
    deliveryPipeWidth: number;
    relevancePipeWidth: number;
    sourcePipeWidth: number;
}): ProjectedJunctionGeometry {
    return {
        centerX: args.center.x,
        centerY: args.center.y,
        leftHeight: args.deliveryPipeWidth,
        rightHeight: args.sourcePipeWidth,
        width: args.relevancePipeWidth,
    };
}

function getProjectedJunctionRelevanceTargetPoint(
    junction: ProjectedJunctionGeometry,
    fromAbove: boolean,
): { x: number; y: number } {
    return {
        x: junction.centerX,
        y: fromAbove
            ? ((junction.centerY - (junction.leftHeight / 2)) + (junction.centerY - (junction.rightHeight / 2))) / 2
            : ((junction.centerY + (junction.leftHeight / 2)) + (junction.centerY + (junction.rightHeight / 2))) / 2,
    };
}

function getProjectedJunctionRelevanceEdgeDeltaY(
    junction: ProjectedJunctionGeometry,
    fromAbove: boolean,
): number {
    return fromAbove
        ? (junction.centerY - (junction.rightHeight / 2)) - (junction.centerY - (junction.leftHeight / 2))
        : (junction.centerY + (junction.rightHeight / 2)) - (junction.centerY + (junction.leftHeight / 2));
}

function buildTurnGuideByTargetScoreNodeId(
    plans: readonly ProjectedConfidencePlan[],
): ReadonlyMap<ScoreNodeId, ConnectorTurnGuide> {
    const turnGuideByTargetScoreNodeId = new Map<ScoreNodeId, ConnectorTurnGuide>();

    for (const plan of plans) {
        const secondSegmentTurnGuide = getAngularConnectorTurnGuide(
            {
                x: plan.junction.centerX - (plan.junction.width / 2),
                y: plan.junction.centerY,
            },
            {
                x: readPointX(plan.targetPoint),
                y: readPointY(plan.targetPoint),
            },
            plan.deliveryPipeWidth,
        );

        if (!secondSegmentTurnGuide) {
            continue;
        }

        const currentTurnGuide = turnGuideByTargetScoreNodeId.get(plan.targetScoreNodeId);
        const nextTurnGuide = !currentTurnGuide
            || secondSegmentTurnGuide.turnStartX < currentTurnGuide.turnStartX
            ? secondSegmentTurnGuide
            : currentTurnGuide;

        turnGuideByTargetScoreNodeId.set(plan.targetScoreNodeId, {
            preferredBendRadius: Math.max(
                currentTurnGuide?.preferredBendRadius ?? 0,
                secondSegmentTurnGuide.preferredBendRadius,
            ),
            returnTurnX: nextTurnGuide.returnTurnX,
            turnStartX: nextTurnGuide.turnStartX,
        });
    }

    return turnGuideByTargetScoreNodeId;
}

function getAngularConnectorTurnGuide(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
): ConnectorTurnGuide | undefined {
    const bendPoints = resolveAngularConnectorBendPoints(startPoint, endPoint, pipeWidth, undefined);

    return bendPoints
        ? {
            preferredBendRadius: resolveDiagonalConnectorBendRadius(
                bendPoints.startStraightLength,
                bendPoints.endStraightLength,
                Math.hypot(
                    bendPoints.bendStart.x - bendPoints.bendEnd.x,
                    bendPoints.bendStart.y - bendPoints.bendEnd.y,
                ),
                Math.atan2(
                    Math.abs(bendPoints.bendStart.y - bendPoints.bendEnd.y),
                    Math.abs(bendPoints.bendStart.x - bendPoints.bendEnd.x),
                ),
                getMinimumCenterlineBendRadius(pipeWidth),
            ),
            returnTurnX: bendPoints.bendEnd.x,
            turnStartX: bendPoints.bendStart.x,
        }
        : undefined;
}

function readPointX(point: TweenPoint): number {
    return readTweenNumber(point.x);
}

function readPointY(point: TweenPoint): number {
    return readTweenNumber(point.y);
}

function readTweenNumber(value: TweenNumber): number {
    return typeof value === "number" ? value : value.to;
}

function toTweenBoolean(value: boolean): TweenBoolean {
    return value;
}

function requirePoint(
    point: TweenPoint | undefined,
    scoreNodeId: ScoreNodeId,
    kind: string,
): TweenPoint {
    if (!point) {
        throw new Error(`Missing ${kind} position for score node: ${scoreNodeId}`);
    }

    return point;
}

function sortIds<TId extends string>(ids: readonly TId[]): TId[] {
    return [...ids].sort((left, right) => String(left).localeCompare(String(right)));
}

function toClaimVizId(scoreNodeId: ScoreNodeId): ClaimVizId {
    return `claim:${scoreNodeId}` as ClaimVizId;
}

function toClaimAggregatorVizId(scoreNodeId: ScoreNodeId): ClaimAggregatorVizId {
    return `claim-aggregator:${scoreNodeId}` as ClaimAggregatorVizId;
}

function toJunctionVizId(scoreNodeId: ScoreNodeId): JunctionVizId {
    return `junction:${scoreNodeId}` as JunctionVizId;
}

function toJunctionAggregatorVizId(scoreNodeId: ScoreNodeId): JunctionAggregatorVizId {
    return `junction-aggregator:${scoreNodeId}` as JunctionAggregatorVizId;
}

function toConfidenceConnectorVizId(scoreNodeId: ScoreNodeId): ConfidenceConnectorVizId {
    return `confidence-connector:${scoreNodeId}` as ConfidenceConnectorVizId;
}

function toDeliveryConnectorVizId(scoreNodeId: ScoreNodeId): DeliveryConnectorVizId {
    return `delivery-connector:${scoreNodeId}` as DeliveryConnectorVizId;
}

function toRelevanceConnectorVizId(scoreNodeId: ScoreNodeId): RelevanceConnectorVizId {
    return `relevance-connector:${scoreNodeId}` as RelevanceConnectorVizId;
}