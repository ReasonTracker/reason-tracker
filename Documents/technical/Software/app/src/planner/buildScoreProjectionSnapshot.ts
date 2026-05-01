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
    ConnectorBandPlacement,
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
    Side,
    Snapshot,
} from "./Snapshot.ts";
import {
    clampPlannerVisualScale,
    getPlannerClaimAggregatorOffsetX,
    getPlannerClaimHeight,
    getPlannerClaimWidth,
    getPlannerHorizontalGap,
    getPlannerPipeWidth,
    getPlannerVerticalGap,
} from "./plannerVisualGeometry.ts";
import { buildDeliveryStackLayout } from "./deliveryStackLayout.ts";
import {
    resolveDefaultConnectorBandPlacement,
    resolveDeliveryTargetStackEnvelope,
} from "./connectorBandGeometry.ts";
import {
    type ProjectedJunctionGeometry,
    PROJECTED_CONNECTOR_JUNCTION_PATH_PROGRESS,
    buildConfidenceCenterlinePoints,
    buildProjectedConnectorJunction,
    getPointAtWaypointProgress,
} from "./projectedConnectorGeometry.ts";

// AGENT NOTE: Keep the first-pass projection geometry constants together so
// later layout work can replace or tune them in one obvious place.
/** Extra room reserved before depths that host confidence-connected claims. */
const CONNECTOR_JUNCTION_LAYER_HORIZONTAL_GAP_MULTIPLIER = 2;

type ProjectedConfidencePlan = {
    childScale: number;
    confidenceConnector?: ConfidenceConnector;
    confidenceConnectorId?: ConfidenceConnectorId;
    hasTargetingRelevance: boolean;
    junction: ProjectedJunctionGeometry;
    scoreNodeId: ScoreNodeId;
    side: Side;
    sourcePipeWidth: number;
    sourcePoint: TweenPoint;
    targetScoreNodeId: ScoreNodeId;
    visible: boolean;
};

type ClaimLaneMemberPlan = {
    childFamilies: ClaimLaneFamilyPlan[];
    scoreNodeId: ScoreNodeId;
};

type ClaimLaneFamilyPlan = {
    depth: number;
    members: ClaimLaneMemberPlan[];
};

type ClaimLanePlan = {
    claimLaneDepthByScoreNodeId: Partial<Record<ScoreNodeId, number>>;
    rootFamilies: ClaimLaneFamilyPlan[];
};

export type ScoreProjectionConnectorBandPolicy = {
    mainBySide?: Partial<Record<Side, ConnectorBandPlacement>>;
};

export type ScoreProjectionSnapshotOptions = {
    claimById?: Partial<Record<ClaimId, Claim>>;
    connectorBandPolicy?: ScoreProjectionConnectorBandPolicy;
    confidenceConnectorIdByScoreNodeId?: Partial<Record<ScoreNodeId, ConfidenceConnectorId>>;
    confidenceConnectorById?: Partial<Record<ConfidenceConnectorId, ConfidenceConnector>>;
    relevanceConnectorIdByScoreNodeId?: Partial<Record<ScoreNodeId, RelevanceConnectorId>>;
    relevanceConnectorById?: Partial<Record<RelevanceConnectorId, RelevanceConnector>>;
    scaleState?: ScoreProjectionScaleState;
};

export type ScoreProjectionScaleState = {
    sourceScaleByScoreNodeId?: Partial<Record<ScoreNodeId, number>>;
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
    const rootScoreNodeIds = findRootScoreNodeIds(graph);
    const claimLanePlan = buildClaimLanePlan(graph, rootScoreNodeIds);
    const sourceScaleByScoreNodeId = resolveScoreProjectionScaleByScoreNodeId(
        buildScoreScaleByScoreNodeId(graph, rootScoreNodeIds),
        args.options?.scaleState?.sourceScaleByScoreNodeId,
    );
    const columnLeftByDepth = buildColumnLeftByDepth(
        claimLanePlan.claimLaneDepthByScoreNodeId,
        graph,
        sourceScaleByScoreNodeId,
    );
    const centerYByScoreNodeId = buildCenterYByScoreNodeId(
        claimLanePlan,
        sourceScaleByScoreNodeId,
    );
    const sideByScoreNodeId = buildSideByScoreNodeId(graph, rootScoreNodeIds);
    const deliveryStackLayout = buildScoreDeliveryStackLayout(
        args.options?.connectorBandPolicy,
        graph,
        rootScoreNodeIds,
        centerYByScoreNodeId,
        sourceScaleByScoreNodeId,
        sideByScoreNodeId,
        args.scores,
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
    const confidencePlans: ProjectedConfidencePlan[] = [];
    const relevanceConnectorIdsByTargetScoreNodeId = new Map<ScoreNodeId, RelevanceConnectorVizId[]>();

    for (const scoreNodeId of orderScoreNodeIds(graph, rootScoreNodeIds)) {
        const scoreNode = graph.nodes[scoreNodeId];

        if (!scoreNode) {
            continue;
        }

        const scoreScale = sourceScaleByScoreNodeId[scoreNodeId] ?? 1;
        const claimLeftX = columnLeftByDepth[claimLanePlan.claimLaneDepthByScoreNodeId[scoreNodeId] ?? 0] ?? 0;

        const claimPosition = createPoint({
            x: claimLeftX + readClaimSpan(scoreScale) / 2,
            y: centerYByScoreNodeId[scoreNodeId] ?? 0,
        });
        const claimAggregatorPosition = createPoint({
            x: readPointX(claimPosition) - getPlannerClaimAggregatorOffsetX(scoreScale),
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
        const childScale = sourceScaleByScoreNodeId[scoreNodeId] ?? 1;
        const parentScale = sourceScaleByScoreNodeId[scoreNode.parentId] ?? 1;
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
        const targetCenterY = deliveryStackLayout.centerYById.get(scoreNodeId)
            ?? readPointY(parentPosition);
        const targetPoint = createPoint({
            x: parentClaimRightX,
            y: targetCenterY,
        });
        const sourcePipeWidth = readPipeWidth(childScale);
        const deliveryPipeWidth = readPipeWidth(childScale);
        const relevancePipeWidth = relevanceChildScoreNodeIds.reduce(
            (maximumWidth, relevanceChildScoreNodeId) => Math.max(
                maximumWidth,
                readPipeWidth(sourceScaleByScoreNodeId[relevanceChildScoreNodeId] ?? 1),
            ),
            0,
        );
        const fullConfidenceCenterline = buildConfidenceCenterlinePoints(sourcePoint, targetPoint, sourcePipeWidth);
        const junctionGeometry = buildProjectedConnectorJunction({
            center: getPointAtWaypointProgress(fullConfidenceCenterline, PROJECTED_CONNECTOR_JUNCTION_PATH_PROGRESS),
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
        confidencePlans.push({
            childScale,
            confidenceConnectorId,
            confidenceConnector,
            hasTargetingRelevance: visible,
            junction: junctionGeometry,
            scoreNodeId,
            side: sideByScoreNodeId[scoreNodeId] ?? "proMain",
            sourcePipeWidth,
            sourcePoint,
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

    for (const plan of confidencePlans) {
        snapshot.confidenceConnectors[toConfidenceConnectorVizId(plan.scoreNodeId)] = buildConfidenceConnectorViz({
            bandPlacement: readMainConnectorBandPlacement(plan.side, args.options?.connectorBandPolicy),
            scoreNodeId: plan.scoreNodeId,
            confidenceConnectorId: plan.confidenceConnectorId,
            confidenceConnector: plan.confidenceConnector,
            side: plan.side,
            scale: plan.childScale,
            score: readScoreValue(args.scores, plan.scoreNodeId),
            sourceClaimVizId: toClaimVizId(plan.scoreNodeId),
            targetJunctionVizId: toJunctionVizId(plan.scoreNodeId),
            visible: plan.visible,
        });

        snapshot.deliveryConnectors[toDeliveryConnectorVizId(plan.scoreNodeId)] = buildDeliveryConnectorViz({
            bandPlacement: readMainConnectorBandPlacement(plan.side, args.options?.connectorBandPolicy),
            scoreNodeId: plan.scoreNodeId,
            confidenceConnectorId: plan.confidenceConnectorId,
            confidenceConnector: plan.confidenceConnector,
            side: plan.side,
            scale: plan.childScale,
            score: readScoreValue(args.scores, plan.scoreNodeId),
            sourceClaimVizId: toClaimVizId(plan.scoreNodeId),
            sourceJunctionVizId: toJunctionVizId(plan.scoreNodeId),
            targetClaimVizId: toClaimVizId(plan.targetScoreNodeId),
        });
    }

    for (const scoreNodeId of orderScoreNodeIds(graph, rootScoreNodeIds)) {
        const scoreNode = graph.nodes[scoreNodeId];

        if (!scoreNode || !scoreNode.parentId || scoreNode.affects !== "Relevance") {
            continue;
        }

        const scoreScale = sourceScaleByScoreNodeId[scoreNodeId] ?? 1;
        const relevanceConnectorId = args.options?.relevanceConnectorIdByScoreNodeId?.[scoreNodeId];
        const relevanceConnector = relevanceConnectorId
            ? args.options?.relevanceConnectorById?.[relevanceConnectorId]
            : undefined;

        snapshot.relevanceConnectors[toRelevanceConnectorVizId(scoreNodeId)] = buildRelevanceConnectorViz({
            bandPlacement: resolveDefaultConnectorBandPlacement(sideByScoreNodeId[scoreNodeId] ?? "proMain"),
            scoreNodeId,
            relevanceConnectorId,
            relevanceConnector,
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
                deliveryConnectorVizIds: (
                    deliveryStackLayout.orderedIdsByTargetId.get(scoreNodeId)
                    ?? []
                ).map(toDeliveryConnectorVizId),
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
        scoreScaleByScoreNodeId[scoreNodeId] = clampPlannerVisualScale(scale);

        const childScoreNodeIds = getOrderedChildScoreNodeIds(graph, scoreNodeId);
        const childScale = scale / Math.max(1, childScoreNodeIds.length);

        for (const childScoreNodeId of childScoreNodeIds) {
            visit(childScoreNodeId, childScale);
        }
    }
}

function resolveScoreProjectionScaleByScoreNodeId(
    projectedScaleByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
    overrideScaleByScoreNodeId?: Partial<Record<ScoreNodeId, number>>,
): Partial<Record<ScoreNodeId, number>> {
    if (!overrideScaleByScoreNodeId) {
        return projectedScaleByScoreNodeId;
    }

    const scaleByScoreNodeId = { ...projectedScaleByScoreNodeId };

    for (const scoreNodeId of Object.keys(overrideScaleByScoreNodeId) as ScoreNodeId[]) {
        const overrideScale = overrideScaleByScoreNodeId[scoreNodeId];

        if (overrideScale === undefined) {
            continue;
        }

        scaleByScoreNodeId[scoreNodeId] = clampPlannerVisualScale(overrideScale);
    }

    return scaleByScoreNodeId;
}

function buildClaimLanePlan(
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
): ClaimLanePlan {
    const claimLaneDepthByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};
    const rootFamilies = rootScoreNodeIds.map((rootScoreNodeId) => buildClaimLaneFamily(rootScoreNodeId, 0));

    return {
        claimLaneDepthByScoreNodeId,
        rootFamilies,
    };

    function buildClaimLaneFamily(scoreNodeId: ScoreNodeId, depth: number): ClaimLaneFamilyPlan {
        const members: ClaimLaneMemberPlan[] = [];
        collectClaimLaneMembers(scoreNodeId, depth, members);
        return {
            depth,
            members,
        };
    }

    function collectClaimLaneMembers(
        scoreNodeId: ScoreNodeId,
        depth: number,
        members: ClaimLaneMemberPlan[],
    ): void {
        claimLaneDepthByScoreNodeId[scoreNodeId] = depth;

        const member: ClaimLaneMemberPlan = {
            childFamilies: [],
            scoreNodeId,
        };

        members.push(member);

        for (const childScoreNodeId of getOrderedChildScoreNodeIds(graph, scoreNodeId)) {
            const childScoreNode = graph.nodes[childScoreNodeId];

            if (!childScoreNode) {
                continue;
            }

            if (childScoreNode.affects === "Score") {
                member.childFamilies.push(buildClaimLaneFamily(childScoreNodeId, depth + 1));
                continue;
            }

            collectClaimLaneMembers(childScoreNodeId, depth, members);
        }
    }
}

function buildColumnLeftByDepth(
    claimLaneDepthByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
    graph: ScoreGraph,
    scoreScaleByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
): Record<number, number> {
    const maxDepth = Math.max(
        0,
        ...Object.values(claimLaneDepthByScoreNodeId).filter((depth): depth is number => depth !== undefined),
    );
    const scoreNodeIdsByDepth = new Map<number, ScoreNodeId[]>();

    for (const scoreNodeId of Object.keys(graph.nodes) as ScoreNodeId[]) {
        const depth = claimLaneDepthByScoreNodeId[scoreNodeId] ?? 0;
        const scoreNodeIds = scoreNodeIdsByDepth.get(depth) ?? [];
        scoreNodeIds.push(scoreNodeId);
        scoreNodeIdsByDepth.set(depth, scoreNodeIds);
    }

    const columnLeftByDepth: Record<number, number> = { 0: 0 };

    for (let depth = 1; depth <= maxDepth; depth += 1) {
        const previousColumnLeft = columnLeftByDepth[depth - 1] ?? 0;
        const horizontalGapMultiplier = hasConfidenceConnectorInDepth(scoreNodeIdsByDepth, depth, graph)
            ? CONNECTOR_JUNCTION_LAYER_HORIZONTAL_GAP_MULTIPLIER
            : 1;
        let nextColumnLeft = previousColumnLeft;

        for (const previousScoreNodeId of scoreNodeIdsByDepth.get(depth - 1) ?? []) {
            const previousScale = scoreScaleByScoreNodeId[previousScoreNodeId] ?? 1;

            nextColumnLeft = Math.max(
                nextColumnLeft,
                previousColumnLeft
                + readClaimSpan(previousScale)
                + getPlannerHorizontalGap(previousScale, horizontalGapMultiplier),
            );
        }

        columnLeftByDepth[depth] = nextColumnLeft;
    }

    return columnLeftByDepth;
}

function hasConfidenceConnectorInDepth(
    scoreNodeIdsByDepth: ReadonlyMap<number, readonly ScoreNodeId[]>,
    depth: number,
    graph: ScoreGraph,
): boolean {
    return (scoreNodeIdsByDepth.get(depth) ?? []).some(
        (scoreNodeId) => graph.nodes[scoreNodeId]?.parentId && graph.nodes[scoreNodeId]?.affects === "Score",
    );
}

function buildCenterYByScoreNodeId(
    claimLanePlan: ClaimLanePlan,
    scoreScaleByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
): Partial<Record<ScoreNodeId, number>> {
    const centerYByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};
    const familySpanByRootScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};
    const memberSpanByScoreNodeId: Partial<Record<ScoreNodeId, number>> = {};

    for (const rootFamily of claimLanePlan.rootFamilies) {
        measureFamily(rootFamily);
    }

    let nextRootTop = 0;
    let previousRootFamily: ClaimLaneFamilyPlan | undefined;

    for (const rootFamily of claimLanePlan.rootFamilies) {
        const rootScoreNodeId = getClaimLaneFamilyRootScoreNodeId(rootFamily);

        if (previousRootFamily) {
            nextRootTop += getPlannerVerticalGap(
                scoreScaleByScoreNodeId[getClaimLaneFamilyRootScoreNodeId(previousRootFamily)] ?? 1,
            );
        }

        assignFamily(rootFamily, nextRootTop);
        nextRootTop += familySpanByRootScoreNodeId[rootScoreNodeId]
            ?? getPlannerClaimHeight(scoreScaleByScoreNodeId[rootScoreNodeId] ?? 1);
        previousRootFamily = rootFamily;
    }

    return centerYByScoreNodeId;

    function measureFamily(family: ClaimLaneFamilyPlan): number {
        const familyGap = readClaimLaneFamilyGap(family);
        const familySpan = family.members.reduce((totalSpan, member, memberIndex) => {
            const memberSpan = measureMember(member);
            return totalSpan + memberSpan + (memberIndex > 0 ? familyGap : 0);
        }, 0);

        familySpanByRootScoreNodeId[getClaimLaneFamilyRootScoreNodeId(family)] = familySpan;
        return familySpan;
    }

    function measureMember(member: ClaimLaneMemberPlan): number {
        const layoutScale = scoreScaleByScoreNodeId[member.scoreNodeId] ?? 1;
        const ownSpan = getPlannerClaimHeight(layoutScale);
        const childGap = getPlannerVerticalGap(layoutScale);
        const childStackSpan = member.childFamilies.reduce((totalSpan, childFamily, childIndex) => {
            const childFamilySpan = measureFamily(childFamily);
            return totalSpan + childFamilySpan + (childIndex > 0 ? childGap : 0);
        }, 0);
        const memberSpan = Math.max(ownSpan, childStackSpan);

        memberSpanByScoreNodeId[member.scoreNodeId] = memberSpan;
        return memberSpan;
    }

    function assignFamily(family: ClaimLaneFamilyPlan, topY: number): void {
        const familyGap = readClaimLaneFamilyGap(family);
        let nextMemberTop = topY;

        for (const member of family.members) {
            assignMember(member, nextMemberTop);
            nextMemberTop += memberSpanByScoreNodeId[member.scoreNodeId]
                ?? getPlannerClaimHeight(scoreScaleByScoreNodeId[member.scoreNodeId] ?? 1);
            nextMemberTop += familyGap;
        }
    }

    function assignMember(member: ClaimLaneMemberPlan, topY: number): void {
        const memberSpan = memberSpanByScoreNodeId[member.scoreNodeId]
            ?? getPlannerClaimHeight(scoreScaleByScoreNodeId[member.scoreNodeId] ?? 1);
        centerYByScoreNodeId[member.scoreNodeId] = topY + memberSpan / 2;

        if (member.childFamilies.length === 0) {
            return;
        }

        const childGap = getPlannerVerticalGap(scoreScaleByScoreNodeId[member.scoreNodeId] ?? 1);
        const childStackSpan = member.childFamilies.reduce((totalSpan, childFamily, childIndex) => (
            totalSpan
            + (familySpanByRootScoreNodeId[getClaimLaneFamilyRootScoreNodeId(childFamily)]
                ?? getPlannerClaimHeight(
                    scoreScaleByScoreNodeId[getClaimLaneFamilyRootScoreNodeId(childFamily)] ?? 1,
                ))
            + (childIndex > 0 ? childGap : 0)
        ), 0);
        let childTop = topY + (memberSpan - childStackSpan) / 2;

        for (const childFamily of member.childFamilies) {
            assignFamily(childFamily, childTop);
            childTop += familySpanByRootScoreNodeId[getClaimLaneFamilyRootScoreNodeId(childFamily)]
                ?? getPlannerClaimHeight(
                    scoreScaleByScoreNodeId[getClaimLaneFamilyRootScoreNodeId(childFamily)] ?? 1,
                );
            childTop += childGap;
        }
    }

    function readClaimLaneFamilyGap(family: ClaimLaneFamilyPlan): number {
        return getPlannerVerticalGap(
            scoreScaleByScoreNodeId[getClaimLaneFamilyRootScoreNodeId(family)] ?? 1,
        );
    }
}

function getClaimLaneFamilyRootScoreNodeId(family: ClaimLaneFamilyPlan): ScoreNodeId {
    const rootScoreNodeId = family.members[0]?.scoreNodeId;

    if (!rootScoreNodeId) {
        throw new Error("Claim lane family is missing its root member.");
    }

    return rootScoreNodeId;
}

function buildScoreDeliveryStackLayout(
    connectorBandPolicy: ScoreProjectionConnectorBandPolicy | undefined,
    graph: ScoreGraph,
    rootScoreNodeIds: readonly ScoreNodeId[],
    centerYByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
    scoreScaleByScoreNodeId: Partial<Record<ScoreNodeId, number>>,
    sideByScoreNodeId: Partial<Record<ScoreNodeId, Side>>,
    scores: Scores,
): {
    centerYById: ReadonlyMap<ScoreNodeId, number>;
    orderedIdsByTargetId: ReadonlyMap<ScoreNodeId, readonly ScoreNodeId[]>;
} {
    const members = orderScoreNodeIds(graph, rootScoreNodeIds).flatMap((scoreNodeId) => {
        const targetCenterY = centerYByScoreNodeId[scoreNodeId] ?? 0;
        const scoreChildNodeIds = getOrderedChildScoreNodeIds(graph, scoreNodeId).filter(
            (childScoreNodeId) => graph.nodes[childScoreNodeId]?.affects === "Score",
        );

        return scoreChildNodeIds.map((childScoreNodeId, index) => ({
            id: childScoreNodeId,
            sourceCenterY: centerYByScoreNodeId[childScoreNodeId] ?? targetCenterY,
            ...resolveDeliveryTargetStackEnvelope(
                readPipeWidth(scoreScaleByScoreNodeId[childScoreNodeId] ?? 1),
                readDeliveryStackHeight(
                    scoreScaleByScoreNodeId[childScoreNodeId] ?? 1,
                    readScoreValue(scores, childScoreNodeId),
                ),
                readMainConnectorBandPlacement(
                    sideByScoreNodeId[childScoreNodeId] ?? "proMain",
                    connectorBandPolicy,
                ),
            ),
            stackHeight: readDeliveryStackHeight(
                scoreScaleByScoreNodeId[childScoreNodeId] ?? 1,
                readScoreValue(scores, childScoreNodeId),
            ),
            stableOrder: index,
            targetCenterY,
            targetId: scoreNodeId,
        }));
    });

    return buildDeliveryStackLayout(members);
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
    bandPlacement: ConnectorBandPlacement;
    scoreNodeId: ScoreNodeId;
    confidenceConnectorId?: ConfidenceConnectorId;
    confidenceConnector?: ConfidenceConnector;
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
        bandPlacement: args.bandPlacement,
        scale: args.scale,
        score: args.score,
        side: args.side,
        direction: "sourceToTarget",
    };
}

function buildDeliveryConnectorViz(args: {
    bandPlacement: ConnectorBandPlacement;
    scoreNodeId: ScoreNodeId;
    confidenceConnectorId?: ConfidenceConnectorId;
    confidenceConnector?: ConfidenceConnector;
    side: Side;
    scale: number;
    score: number;
    sourceClaimVizId: ClaimVizId;
    sourceJunctionVizId: JunctionVizId;
    targetClaimVizId: ClaimVizId;
}): DeliveryConnectorViz {
    return {
        type: "deliveryConnector",
        id: toDeliveryConnectorVizId(args.scoreNodeId),
        animationType: "uniform",
        confidenceConnectorId: args.confidenceConnectorId,
        confidenceConnector: args.confidenceConnector,
        scoreNodeId: args.scoreNodeId,
        sourceClaimVizId: args.sourceClaimVizId,
        sourceJunctionVizId: args.sourceJunctionVizId,
        targetClaimVizId: args.targetClaimVizId,
        bandPlacement: args.bandPlacement,
        scale: args.scale,
        score: args.score,
        side: args.side,
        direction: "sourceToTarget",
    };
}

function buildRelevanceConnectorViz(args: {
    bandPlacement: ConnectorBandPlacement;
    scoreNodeId: ScoreNodeId;
    relevanceConnectorId?: RelevanceConnectorId;
    relevanceConnector?: RelevanceConnector;
    side: Side;
    scale: number;
    score: number;
    sourceClaimVizId: ClaimVizId;
    targetJunctionAggregatorVizId: JunctionAggregatorVizId;
}): RelevanceConnectorViz {
    return {
        type: "relevanceConnector",
        id: toRelevanceConnectorVizId(args.scoreNodeId),
        animationType: "uniform",
        relevanceConnectorId: args.relevanceConnectorId,
        relevanceConnector: args.relevanceConnector,
        scoreNodeId: args.scoreNodeId,
        sourceClaimVizId: args.sourceClaimVizId,
        targetJunctionAggregatorVizId: args.targetJunctionAggregatorVizId,
        bandPlacement: args.bandPlacement,
        scale: args.scale,
        score: args.score,
        side: args.side,
        direction: "sourceToTarget",
    };
}

function readMainConnectorBandPlacement(
    side: Side,
    connectorBandPolicy: ScoreProjectionConnectorBandPolicy | undefined,
): ConnectorBandPlacement {
    return connectorBandPolicy?.mainBySide?.[side] ?? resolveDefaultConnectorBandPlacement(side);
}

function readClaimSpan(scale: number): number {
    return getPlannerClaimWidth(scale);
}

function readPipeWidth(scale: number): number {
    return getPlannerPipeWidth(scale);
}

function readDeliveryStackHeight(scale: number, score: number): number {
    return readPipeWidth(scale) * clampDeliveryStackScore(score);
}

function readScoreValue(scores: Scores, scoreNodeId: ScoreNodeId): number {
    return scores[scoreNodeId]?.value ?? 0;
}

function clampDeliveryStackScore(score: number): number {
    if (!Number.isFinite(score)) {
        return 0;
    }

    return Math.min(1, Math.max(0, score));
}

function createPoint(args: { x: number; y: number }): TweenPoint {
    return { x: args.x, y: args.y };
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