import type { ClaimId } from "../debate-core/Claim.ts";
import type {
    ConfidenceConnector,
    ConfidenceConnectorId,
    RelevanceConnector,
    RelevanceConnectorId,
} from "../debate-core/Connector.ts";
import { calculateSourcesScalesFromDebateCore } from "../math/calculateSourcesScalesFromDebateCore.ts";
import { calculateSides } from "../math/calculateSides.ts";
import { calculateScoresFromDebateCore } from "../math/calculateScoresFromDebateCore.ts";
import { withChildrenByParentId } from "../math/calculateScores.ts";
import type { ScoreNodeId } from "../math/scoreTypes.ts";
import { applyConfidenceClaimAddCommand } from "./applyDebateCommand.ts";
import { resolvePlannerOptions, type Planner, type PlannerInput, type PlannerOptions } from "./contracts.ts";
import type {
    ClaimViz,
    ClaimVizId,
    ConfidenceConnectorViz,
    ConfidenceConnectorVizId,
    DeliveryAggregatorViz,
    DeliveryAggregatorVizId,
    DeliveryConnectorViz,
    DeliveryConnectorLayoutIssueCode,
    DeliveryConnectorVizId,
    JunctionViz,
    JunctionVizId,
    RelevanceAggregatorViz,
    RelevanceAggregatorVizId,
    RelevanceConnectorVizId,
    Snapshot,
    Side,
    VizItem,
} from "./Snapshot.ts";

const plannersByCommandType: Partial<Record<PlannerInput["command"]["type"], Planner>> = {
    "confidence/claim/add": planAddConfidenceClaim,
};

export const planner: Planner = (input) => {
    const commandPlanner = plannersByCommandType[input.command.type];

    if (!commandPlanner) {
        throw new Error(`Missing planner implementation for command type: ${input.command.type}`);
    }

    return commandPlanner(input);
};

type SortedConfidenceChild = {
    confidenceConnector: ConfidenceConnector;
    scoreNodeId: ScoreNodeId;
};

type SortedRelevanceChild = {
    relevanceConnector: RelevanceConnector;
    scoreNodeId: ScoreNodeId;
};

type ClaimLaneMember =
    | {
        kind: "confidence";
        confidenceConnector: ConfidenceConnector;
        scoreNodeId: ScoreNodeId;
        targetRelationship: ConfidenceConnector["targetRelationship"];
    }
    | {
        kind: "relevance";
        relevanceConnector: RelevanceConnector;
        scoreNodeId: ScoreNodeId;
        targetRelationship: RelevanceConnector["targetRelationship"];
    };

type IncomingConfidenceLayout = {
    confidenceConnector: ConfidenceConnector;
    deliveryRoute: ResolvedDeliveryRouteLayout;
    junctionCenterX: number;
    targetClaimVizId: ClaimVizId;
    targetSideOffset: number;
};

type LayoutPoint = {
    x: number;
    y: number;
};

type ResolvedDeliveryRouteLayout = {
    centerlineWaypoints: LayoutPoint[];
    issueCodes: DeliveryConnectorLayoutIssueCode[];
};

type ResolvedOutgoingConfidenceMemberLayout = {
    claimCenterY: number;
    claimLaneMember: ClaimLaneMember;
    incomingConfidenceLayout?: IncomingConfidenceLayout;
};

type ResolvedOutgoingConfidenceLayout = {
    members: ResolvedOutgoingConfidenceMemberLayout[];
    sourceLaneLeftEdgeX: number;
};

type SettledSnapshotBuildContext = {
    confidenceConnectorIdByScoreNodeId: Partial<Record<ScoreNodeId, ConfidenceConnectorId>>;
    debateCore: PlannerInput["debateCore"];
    deliveryScales: ReturnType<typeof calculateSourcesScalesFromDebateCore>["deliveryScales"];
    graph: ReturnType<typeof withChildrenByParentId>;
    options: PlannerOptions;
    relevanceConnectorIdByScoreNodeId: Partial<Record<ScoreNodeId, RelevanceConnectorId>>;
    scored: ReturnType<typeof calculateScoresFromDebateCore>;
    sides: ReturnType<typeof calculateSides>;
    snapshot: Snapshot;
    sourcesScales: ReturnType<typeof calculateSourcesScalesFromDebateCore>["sourcesScales"];
};

export function buildSnapshotFromDebateCore(args: {
    debateCore: PlannerInput["debateCore"];
    options?: Partial<PlannerOptions>;
}): Snapshot {
    const options = resolvePlannerOptions(args.options);
    const scored = calculateScoresFromDebateCore(args.debateCore);
    const calculatedScales = calculateSourcesScalesFromDebateCore({
        debateCore: args.debateCore,
        rootSourcesScale: 1,
    });
    const graph = withChildrenByParentId(scored.graph);

    assertUniqueVisibleClaimOccurrences(graph.nodes);

    const context: SettledSnapshotBuildContext = {
        confidenceConnectorIdByScoreNodeId: invertScoreNodeMapping(scored.scoreNodeIdByConfidenceConnectorId),
        debateCore: args.debateCore,
        deliveryScales: calculatedScales.deliveryScales,
        graph,
        options,
        relevanceConnectorIdByScoreNodeId: invertScoreNodeMapping(scored.scoreNodeIdByRelevanceConnectorId),
        scored,
        sides: calculateSides({
            graph,
            rootScoreNodeId: scored.rootScoreNodeId,
        }),
        snapshot: {},
        sourcesScales: calculatedScales.sourcesScales,
    };

    buildSettledClaimOccurrence({
        claimCenterY: 0,
        claimLeftEdgeX: 0,
        context,
        scoreNodeId: scored.rootScoreNodeId,
    });
    normalizeSnapshotToTopLeft({
        options,
        snapshot: context.snapshot,
    });

    return context.snapshot;
}

function assertUniqueVisibleClaimOccurrences(
    nodes: Record<ScoreNodeId, { claimId: ClaimId }>,
): void {
    const occurrencesByClaimId: Partial<Record<ClaimId, number>> = {};

    for (const node of Object.values(nodes)) {
        occurrencesByClaimId[node.claimId] = (occurrencesByClaimId[node.claimId] ?? 0) + 1;
    }

    for (const [rawClaimId, count] of Object.entries(occurrencesByClaimId) as Array<[ClaimId, number]>) {
        if (count > 1) {
            throw new Error(`Current planner scope requires one visible occurrence per claim: ${rawClaimId}`);
        }
    }
}

function invertScoreNodeMapping<TId extends string>(
    mapping: Partial<Record<TId, ScoreNodeId>>,
): Partial<Record<ScoreNodeId, TId>> {
    const inverted: Partial<Record<ScoreNodeId, TId>> = {};

    for (const [rawId, scoreNodeId] of Object.entries(mapping) as Array<[TId, ScoreNodeId | undefined]>) {
        if (!scoreNodeId) {
            continue;
        }

        inverted[scoreNodeId] = rawId;
    }

    return inverted;
}

function buildSettledClaimOccurrence(args: {
    claimCenterY: number;
    claimLeftEdgeX: number;
    context: SettledSnapshotBuildContext;
    incomingConfidenceLayout?: IncomingConfidenceLayout;
    scoreNodeId: ScoreNodeId;
}): void {
    const scoreNode = args.context.graph.nodes[args.scoreNodeId];

    if (!scoreNode) {
        throw new Error(`Missing score node while building settled snapshot: ${args.scoreNodeId}`);
    }

    const claimSourcesScale = resolveOccurrenceScale(args.context.sourcesScales, args.scoreNodeId);
    const claimViz: ClaimViz = {
        type: "claim",
        id: resolveClaimVizId(args.scoreNodeId),
        claimId: scoreNode.claimId,
        position: {
            x: args.claimLeftEdgeX + ((args.context.options.claimWidth * claimSourcesScale) / 2),
            y: args.claimCenterY,
        },
        scale: claimSourcesScale,
        sourcesScale: claimSourcesScale,
        score: resolveScoreValue(args.context.scored.scores[args.scoreNodeId]?.value),
        side: args.context.sides[args.scoreNodeId] ?? "proMain",
    };

    args.context.snapshot[claimViz.id] = claimViz;

    if (args.incomingConfidenceLayout) {
        buildIncomingConfidenceStructures({
            claimViz,
            context: args.context,
            incomingConfidenceLayout: args.incomingConfidenceLayout,
            scoreNodeId: args.scoreNodeId,
        });
    }

    buildOutgoingConfidenceStructures({
        claimViz,
        context: args.context,
        scoreNodeId: args.scoreNodeId,
    });
}

function buildIncomingConfidenceStructures(args: {
    claimViz: ClaimViz;
    context: SettledSnapshotBuildContext;
    incomingConfidenceLayout: IncomingConfidenceLayout;
    scoreNodeId: ScoreNodeId;
}): void {
    const directRelevanceChildren = getDirectRelevanceChildren(args.context, args.scoreNodeId);
    const sourceSideScale = resolveStaticTweenNumber(args.claimViz.sourcesScale);
    const deliveryScale = resolveOccurrenceScale(args.context.deliveryScales, args.scoreNodeId);
    const relevanceChildren = directRelevanceChildren.map(({ relevanceConnector, scoreNodeId }) => ({
        edge: relevanceConnector.targetRelationship === "proTarget" ? "top" as const : "bottom" as const,
        relevanceConnector,
        scoreNodeId,
        sourcesScale: resolveOccurrenceScale(args.context.sourcesScales, scoreNodeId),
    }));
    const relevanceConnectorVizIds = relevanceChildren.map((placement) => resolveRelevanceConnectorVizId(placement.relevanceConnector.id));
    const targetSideOffsetByConnectorId: Partial<Record<RelevanceConnectorId, number>> = {};
    const topChildren = relevanceChildren.filter((placement) => placement.edge === "top");
    const bottomChildren = relevanceChildren.filter((placement) => placement.edge === "bottom");
    const topOffsets = resolveTargetSideOffsets({
        placements: topChildren.map((placement) => ({
            envelope: resolveConnectorEnvelope({
                context: args.context,
                sourcesScale: placement.sourcesScale,
                scoreNodeId: placement.scoreNodeId,
            }),
        })),
    });
    const bottomOffsets = resolveTargetSideOffsets({
        placements: bottomChildren.map((placement) => ({
            envelope: resolveConnectorEnvelope({
                context: args.context,
                sourcesScale: placement.sourcesScale,
                scoreNodeId: placement.scoreNodeId,
            }),
        })),
    });

    topChildren.forEach((placement, index) => {
        targetSideOffsetByConnectorId[placement.relevanceConnector.id] = topOffsets[index] ?? 0;
    });
    bottomChildren.forEach((placement, index) => {
        targetSideOffsetByConnectorId[placement.relevanceConnector.id] = bottomOffsets[index] ?? 0;
    });

    const relevanceAggregatorVizId = resolveRelevanceAggregatorVizId(args.incomingConfidenceLayout.confidenceConnector.id);
    const junctionVizId = resolveJunctionVizId(args.incomingConfidenceLayout.confidenceConnector.id);
    const confidenceConnectorVizId = resolveConfidenceConnectorVizId(args.incomingConfidenceLayout.confidenceConnector.id);
    const deliveryConnectorVizId = resolveDeliveryConnectorVizId(args.incomingConfidenceLayout.confidenceConnector.id);
    const incomingRelevanceScale = Math.max(
        resolveTotalEnvelopeHeight({
            context: args.context,
            placements: topChildren,
        }),
        resolveTotalEnvelopeHeight({
            context: args.context,
            placements: bottomChildren,
        }),
    );

    for (const placement of relevanceChildren) {
        const relevanceConnectorVizId = resolveRelevanceConnectorVizId(placement.relevanceConnector.id);

        args.context.snapshot[relevanceConnectorVizId] = {
            type: "relevanceConnector",
            id: relevanceConnectorVizId,
            animationType: "progressive",
            relevanceConnectorId: placement.relevanceConnector.id,
            sourceClaimVizId: resolveClaimVizId(placement.scoreNodeId),
            targetRelevanceAggregatorVizId: relevanceAggregatorVizId,
            scale: placement.sourcesScale,
            score: resolveScoreValue(args.context.scored.scores[placement.scoreNodeId]?.value),
            side: args.context.sides[placement.scoreNodeId] ?? "proMain",
            direction: "sourceToTarget",
            targetSideOffset: targetSideOffsetByConnectorId[placement.relevanceConnector.id] ?? 0,
        };
    }

    args.context.snapshot[relevanceAggregatorVizId] = {
        type: "relevanceAggregator",
        id: relevanceAggregatorVizId,
        animationType: "uniform",
        confidenceConnectorId: args.incomingConfidenceLayout.confidenceConnector.id,
        relevanceConnectorVizIds,
        scale: sourceSideScale,
        score: resolveStaticTweenNumber(args.claimViz.score),
        visible: relevanceConnectorVizIds.length >= 2,
    };
    args.context.snapshot[junctionVizId] = {
        type: "junction",
        id: junctionVizId,
        animationType: "uniform",
        confidenceConnectorId: args.incomingConfidenceLayout.confidenceConnector.id,
        relevanceAggregatorVizId,
        position: {
            x: args.incomingConfidenceLayout.junctionCenterX,
            y: resolveStaticTweenPoint(args.claimViz.position).y,
        },
        incomingConfidenceScale: resolvePipeWidth(sourceSideScale, args.context.options),
        incomingRelevanceScale,
        outgoingDeliveryScale: resolvePipeWidth(deliveryScale, args.context.options),
        visible: relevanceConnectorVizIds.length > 0,
    };
    args.context.snapshot[confidenceConnectorVizId] = {
        type: "confidenceConnector",
        id: confidenceConnectorVizId,
        animationType: "progressive",
        confidenceConnectorId: args.incomingConfidenceLayout.confidenceConnector.id,
        sourceClaimVizId: args.claimViz.id,
        targetJunctionVizId: junctionVizId,
        visible: relevanceConnectorVizIds.length > 0,
        scale: sourceSideScale,
        score: resolveStaticTweenNumber(args.claimViz.score),
        side: args.claimViz.side,
        direction: "sourceToTarget",
    };
    args.context.snapshot[deliveryConnectorVizId] = {
        type: "deliveryConnector",
        id: deliveryConnectorVizId,
        animationType: "progressive",
        confidenceConnectorId: args.incomingConfidenceLayout.confidenceConnector.id,
        centerlineWaypoints: args.incomingConfidenceLayout.deliveryRoute.centerlineWaypoints,
        layoutIssueCodes: args.incomingConfidenceLayout.deliveryRoute.issueCodes,
        sourceJunctionVizId: junctionVizId,
        targetClaimVizId: args.incomingConfidenceLayout.targetClaimVizId,
        scale: deliveryScale,
        score: resolveStaticTweenNumber(args.claimViz.score),
        side: args.claimViz.side,
        direction: "sourceToTarget",
        targetSideOffset: args.incomingConfidenceLayout.targetSideOffset,
    };
}

function buildOutgoingConfidenceStructures(args: {
    claimViz: ClaimViz;
    context: SettledSnapshotBuildContext;
    scoreNodeId: ScoreNodeId;
}): void {
    const directConfidenceChildren = getDirectConfidenceChildren(args.context, args.scoreNodeId);
    const deliveryAggregatorVizId = resolveOrCreateDeliveryAggregatorVizId(args.context.snapshot, args.claimViz.claimId);
    const targetDeliveryAggregator = resolveOrCreateDeliveryAggregator({
        claimId: args.claimViz.claimId,
        snapshot: args.context.snapshot,
        targetDeliveryAggregatorVizId: deliveryAggregatorVizId,
        targetScale: resolveStaticTweenNumber(args.claimViz.sourcesScale),
        targetScore: resolveStaticTweenNumber(args.claimViz.score),
    });

    targetDeliveryAggregator.deliveryConnectorVizIds = directConfidenceChildren.map(({ confidenceConnector }) => resolveDeliveryConnectorVizId(confidenceConnector.id));
    args.context.snapshot[targetDeliveryAggregator.id] = targetDeliveryAggregator;

    if (directConfidenceChildren.length === 0) {
        return;
    }

    const outgoingConfidenceLayout = resolveOutgoingConfidenceLayout({
        claimViz: args.claimViz,
        context: args.context,
        directConfidenceChildren,
    });

    for (const member of outgoingConfidenceLayout.members) {
        if (member.claimLaneMember.kind === "relevance") {
            buildSettledClaimOccurrence({
                claimCenterY: member.claimCenterY,
                claimLeftEdgeX: outgoingConfidenceLayout.sourceLaneLeftEdgeX,
                context: args.context,
                scoreNodeId: member.claimLaneMember.scoreNodeId,
            });
            continue;
        }

        buildSettledClaimOccurrence({
            claimCenterY: member.claimCenterY,
            claimLeftEdgeX: outgoingConfidenceLayout.sourceLaneLeftEdgeX,
            context: args.context,
            incomingConfidenceLayout: member.incomingConfidenceLayout,
            scoreNodeId: member.claimLaneMember.scoreNodeId,
        });
    }
}

function resolveOutgoingConfidenceLayout(args: {
    claimViz: ClaimViz;
    context: SettledSnapshotBuildContext;
    directConfidenceChildren: SortedConfidenceChild[];
}): ResolvedOutgoingConfidenceLayout {
    const siblingConnectors = args.directConfidenceChildren.map(({ confidenceConnector }) => confidenceConnector);
    const usesSourceJunctionLane = resolveSiblingSetUsesSourceJunctionLane({
        debateCoreAfter: args.context.debateCore,
        siblingConnectors,
    });
    const siblingDeliveryPlacementBasis = resolveSiblingDeliveryPlacementBasis({
        childDeliveryScales: args.context.deliveryScales,
        options: args.context.options,
        scored: args.context.scored,
        siblingConnectors,
    });
    const targetSideOffsets = resolveTargetSideOffsets({
        placements: siblingDeliveryPlacementBasis.map((placement) => ({
            envelope: placement.envelope,
        })),
    });
    const targetSideOffsetByConfidenceConnectorId = Object.fromEntries(
        siblingDeliveryPlacementBasis.map((placement, index) => [placement.connector.id, targetSideOffsets[index] ?? 0]),
    ) as Partial<Record<ConfidenceConnectorId, number>>;
    const maximumTargetSideOffsetMagnitude = resolveMaximumTargetSideOffsetMagnitude(targetSideOffsets);
    const junctionAllowance = usesSourceJunctionLane
        ? resolveMaximumIncomingConfidenceJunctionAllowance({
            context: args.context,
            directConfidenceChildren: args.directConfidenceChildren,
        })
        : 0;
    const sourceLaneLeftEdgeX = resolveSourceLaneLeftEdgeX({
        junctionAllowance,
        maximumTargetSideOffsetMagnitude,
        options: args.context.options,
        targetClaimViz: args.claimViz,
    });
    const sourceJunctionCenterX = resolveSourceJunctionCenterX({
        junctionAllowance,
        sourceLaneLeftEdgeX,
    });
    const claimLaneMembers = resolveClaimLaneMembers({
        context: args.context,
        directConfidenceChildren: args.directConfidenceChildren,
    });
    const claimLanePlacements = resolveClaimPlacements({
        options: args.context.options,
        placements: claimLaneMembers.map((member) => ({
            placementId: resolveClaimLaneMemberPlacementId(member),
            sourcesScale: resolveOccurrenceScale(args.context.sourcesScales, member.scoreNodeId),
        })),
        targetClaimViz: args.claimViz,
    });
    const claimCenterYByMemberId = Object.fromEntries(
        claimLanePlacements.map((placement) => [placement.placementId, placement.centerY]),
    ) as Partial<Record<string, number>>;

    return {
        members: claimLaneMembers.map((claimLaneMember) => {
            const claimCenterY = claimCenterYByMemberId[resolveClaimLaneMemberPlacementId(claimLaneMember)]
                ?? resolveStaticTweenPoint(args.claimViz.position).y;

            if (claimLaneMember.kind === "relevance") {
                return {
                    claimCenterY,
                    claimLaneMember,
                };
            }

            const sourceJunctionSpan = resolveIncomingConfidenceJunctionSpan({
                context: args.context,
                scoreNodeId: claimLaneMember.scoreNodeId,
            });
            const targetSideOffset = targetSideOffsetByConfidenceConnectorId[claimLaneMember.confidenceConnector.id] ?? 0;

            return {
                claimCenterY,
                claimLaneMember,
                incomingConfidenceLayout: {
                    confidenceConnector: claimLaneMember.confidenceConnector,
                    deliveryRoute: resolveDeliveryRouteLayout({
                        claimCenterY,
                        deliveryConnectorCount: args.directConfidenceChildren.length,
                        options: args.context.options,
                        sourceJunctionCenterX,
                        sourceJunctionSpan,
                        sourceLaneLeftEdgeX,
                        targetClaimViz: args.claimViz,
                        targetSideOffset,
                    }),
                    junctionCenterX: sourceJunctionCenterX,
                    targetClaimVizId: args.claimViz.id,
                    targetSideOffset,
                },
            };
        }),
        sourceLaneLeftEdgeX,
    };
}

function resolveDeliveryRouteLayout(args: {
    claimCenterY: number;
    deliveryConnectorCount: number;
    options: PlannerOptions;
    sourceJunctionCenterX: number;
    sourceJunctionSpan: number;
    sourceLaneLeftEdgeX: number;
    targetClaimViz: ClaimViz;
    targetSideOffset: number;
}): ResolvedDeliveryRouteLayout {
    const sourcePoint = resolveDeliveryRouteSourcePoint(args);
    const targetPoint = resolveDeliveryRouteTargetPoint(args);
    const localSourcesScale = resolveStaticTweenNumber(args.targetClaimViz.sourcesScale);
    const minimumTurnAllowance = resolveMinimumTurnAllowance(localSourcesScale, args.options);
    const availableForwardDistance = Math.max(0, sourcePoint.x - targetPoint.x);
    const resolvedTurnAllowance = Math.min(minimumTurnAllowance, availableForwardDistance / 2);
    const issueCodes: DeliveryConnectorLayoutIssueCode[] = resolvedTurnAllowance + 1e-6 < minimumTurnAllowance
        ? ["delivery-route-tightened"]
        : [];

    if (Math.abs(sourcePoint.y - targetPoint.y) <= 1e-6 || resolvedTurnAllowance <= 1e-6) {
        return {
            centerlineWaypoints: [sourcePoint, targetPoint],
            issueCodes,
        };
    }

    return {
        centerlineWaypoints: [
            sourcePoint,
            { x: sourcePoint.x - resolvedTurnAllowance, y: sourcePoint.y },
            { x: targetPoint.x + resolvedTurnAllowance, y: targetPoint.y },
            targetPoint,
        ],
        issueCodes,
    };
}

function resolveDeliveryRouteSourcePoint(args: {
    claimCenterY: number;
    sourceJunctionCenterX: number;
    sourceJunctionSpan: number;
    sourceLaneLeftEdgeX: number;
    targetClaimViz: ClaimViz;
}): LayoutPoint {
    if (args.sourceJunctionSpan > 1e-6) {
        return {
            x: args.sourceJunctionCenterX - (args.sourceJunctionSpan / 2),
            y: resolveStaticTweenPoint(args.targetClaimViz.position).y,
        };
    }

    return {
        x: args.sourceLaneLeftEdgeX,
        y: args.claimCenterY,
    };
}

function resolveDeliveryRouteTargetPoint(args: {
    deliveryConnectorCount: number;
    options: PlannerOptions;
    targetClaimViz: ClaimViz;
    targetSideOffset: number;
}): LayoutPoint {
    const targetPosition = resolveStaticTweenPoint(args.targetClaimViz.position);
    const targetScale = resolveStaticTweenNumber(args.targetClaimViz.scale);
    const aggregatorDepth = args.deliveryConnectorCount >= 2
        ? args.options.aggregatorDepth * resolveStaticTweenNumber(args.targetClaimViz.sourcesScale)
        : 0;

    return {
        x: targetPosition.x + ((args.options.claimWidth * targetScale) / 2) + aggregatorDepth,
        y: targetPosition.y + args.targetSideOffset,
    };
}

function getDirectConfidenceChildren(
    context: SettledSnapshotBuildContext,
    scoreNodeId: ScoreNodeId,
): SortedConfidenceChild[] {
    return (context.graph.childrenByParentId?.[scoreNodeId] ?? [])
        .filter((childScoreNodeId) => context.graph.nodes[childScoreNodeId]?.affects === "Score")
        .map((childScoreNodeId) => {
            const confidenceConnectorId = context.confidenceConnectorIdByScoreNodeId[childScoreNodeId];
            const confidenceConnector = confidenceConnectorId
                ? context.debateCore.connectors[confidenceConnectorId]
                : undefined;

            if (!confidenceConnector || confidenceConnector.type !== "confidence") {
                throw new Error(`Missing confidence connector for score node while building settled snapshot: ${childScoreNodeId}`);
            }

            return {
                confidenceConnector,
                scoreNodeId: childScoreNodeId,
            };
        })
        .sort((left, right) => {
            if (left.confidenceConnector.targetRelationship !== right.confidenceConnector.targetRelationship) {
                return left.confidenceConnector.targetRelationship === "proTarget" ? -1 : 1;
            }

            return String(left.confidenceConnector.id).localeCompare(String(right.confidenceConnector.id));
        });
}

function getDirectRelevanceChildren(
    context: SettledSnapshotBuildContext,
    scoreNodeId: ScoreNodeId,
): SortedRelevanceChild[] {
    return (context.graph.childrenByParentId?.[scoreNodeId] ?? [])
        .filter((childScoreNodeId) => context.graph.nodes[childScoreNodeId]?.affects === "Relevance")
        .map((childScoreNodeId) => {
            const relevanceConnectorId = context.relevanceConnectorIdByScoreNodeId[childScoreNodeId];
            const relevanceConnector = relevanceConnectorId
                ? context.debateCore.connectors[relevanceConnectorId]
                : undefined;

            if (!relevanceConnector || relevanceConnector.type !== "relevance") {
                throw new Error(`Missing relevance connector for score node while building settled snapshot: ${childScoreNodeId}`);
            }

            return {
                relevanceConnector,
                scoreNodeId: childScoreNodeId,
            };
        })
        .sort((left, right) => {
            if (left.relevanceConnector.targetRelationship !== right.relevanceConnector.targetRelationship) {
                return left.relevanceConnector.targetRelationship === "proTarget" ? -1 : 1;
            }

            return String(left.relevanceConnector.id).localeCompare(String(right.relevanceConnector.id));
        });
}

function resolveClaimLaneMembers(args: {
    context: SettledSnapshotBuildContext;
    directConfidenceChildren: SortedConfidenceChild[];
}): ClaimLaneMember[] {
    const members: ClaimLaneMember[] = [];

    for (const directConfidenceChild of args.directConfidenceChildren) {
        members.push({
            kind: "confidence",
            confidenceConnector: directConfidenceChild.confidenceConnector,
            scoreNodeId: directConfidenceChild.scoreNodeId,
            targetRelationship: directConfidenceChild.confidenceConnector.targetRelationship,
        });

        for (const directRelevanceChild of getDirectRelevanceChildren(args.context, directConfidenceChild.scoreNodeId)) {
            members.push({
                kind: "relevance",
                relevanceConnector: directRelevanceChild.relevanceConnector,
                scoreNodeId: directRelevanceChild.scoreNodeId,
                targetRelationship: directRelevanceChild.relevanceConnector.targetRelationship,
            });
        }
    }

    return members.sort((left, right) => {
        if (left.targetRelationship !== right.targetRelationship) {
            return left.targetRelationship === "proTarget" ? -1 : 1;
        }

        return resolveClaimLaneMemberPlacementId(left).localeCompare(resolveClaimLaneMemberPlacementId(right));
    });
}

function resolveClaimLaneMemberPlacementId(member: ClaimLaneMember): string {
    if (member.kind === "confidence") {
        return `confidence:${String(member.confidenceConnector.id)}`;
    }

    return `relevance:${String(member.relevanceConnector.id)}`;
}

function resolveClaimLeftEdgeX(claimViz: ClaimViz, options: PlannerOptions): number {
    return resolveStaticTweenPoint(claimViz.position).x - ((options.claimWidth * resolveStaticTweenNumber(claimViz.sourcesScale)) / 2);
}

function resolveOccurrenceScale(
    sourcesScales: Partial<Record<ScoreNodeId, number>>,
    scoreNodeId: ScoreNodeId,
): number {
    return resolveScoreValue(sourcesScales[scoreNodeId]);
}

function resolveConnectorEnvelopeHeight(args: {
    context: SettledSnapshotBuildContext;
    sourcesScale: number;
    scoreNodeId: ScoreNodeId;
}): number {
    const envelope = resolveConnectorEnvelope(args);

    return envelope.bottomOffset - envelope.topOffset;
}

function resolveConnectorEnvelope(args: {
    context: SettledSnapshotBuildContext;
    sourcesScale: number;
    scoreNodeId: ScoreNodeId;
}): {
    bottomOffset: number;
    topOffset: number;
} {
    const pipeWidth = resolvePipeWidth(args.sourcesScale, args.context.options);
    const fluidWidth = Math.max(0, Math.min(pipeWidth, pipeWidth * resolveScoreValue(args.context.scored.scores[args.scoreNodeId]?.value)));

    return resolveBandEnvelope(
        pipeWidth,
        fluidWidth,
        args.context.sides[args.scoreNodeId] ?? "proMain",
    );
}

function resolveTotalEnvelopeHeight(args: {
    context: SettledSnapshotBuildContext;
    placements: Array<{
        sourcesScale: number;
        scoreNodeId: ScoreNodeId;
    }>;
}): number {
    return args.placements.reduce(
        (sum, placement) => sum + resolveConnectorEnvelopeHeight({
            context: args.context,
            sourcesScale: placement.sourcesScale,
            scoreNodeId: placement.scoreNodeId,
        }),
        0,
    );
}

function normalizeSnapshotToTopLeft(args: {
    options: PlannerOptions;
    snapshot: Snapshot;
}): void {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;

    for (const item of Object.values(args.snapshot as Partial<Record<string, VizItem>>)) {
        if (!item) {
            continue;
        }

        if (item.type === "claim") {
            const position = resolveStaticTweenPoint(item.position);
            const scale = resolveStaticTweenNumber(item.scale);

            minX = Math.min(minX, position.x - ((args.options.claimWidth * scale) / 2));
            minY = Math.min(minY, position.y - ((args.options.claimHeight * scale) / 2));
            continue;
        }

        if (item.type === "junction") {
            const position = resolveStaticTweenPoint(item.position);

            if (resolveStaticTweenBoolean(item.visible)) {
                minX = Math.min(minX, position.x - (resolveStaticTweenNumber(item.incomingRelevanceScale) / 2));
                minY = Math.min(
                    minY,
                    position.y - (Math.max(
                        resolveStaticTweenNumber(item.incomingConfidenceScale),
                        resolveStaticTweenNumber(item.outgoingDeliveryScale),
                    ) / 2),
                );
            } else {
                minX = Math.min(minX, position.x);
                minY = Math.min(minY, position.y);
            }
        }
    }

    const shiftX = Number.isFinite(minX) ? Math.max(0, -minX) : 0;
    const shiftY = Number.isFinite(minY) ? Math.max(0, -minY) : 0;

    if (shiftX === 0 && shiftY === 0) {
        return;
    }

    for (const item of Object.values(args.snapshot as Partial<Record<string, VizItem>>)) {
        if (!item || !("position" in item)) {
            continue;
        }

        const position = resolveStaticTweenPoint(item.position);

        args.snapshot[item.id] = {
            ...item,
            position: {
                x: position.x + shiftX,
                y: position.y + shiftY,
            },
        } as VizItem;
    }
}

function planAddConfidenceClaim(input: PlannerInput): Snapshot[] {
    if (input.command.type !== "confidence/claim/add") {
        throw new Error(`Planner routed unsupported command type to confidence add planner: ${input.command.type}`);
    }

    const options = resolvePlannerOptions(input.options);
    const openingSnapshot = buildSnapshotFromDebateCore({
        debateCore: input.debateCore,
        options,
    });
    const applied = applyConfidenceClaimAddCommand({
        command: input.command,
        debateCore: input.debateCore,
    });

    const settledSnapshot = buildSnapshotFromDebateCore({
        debateCore: applied.debateCore,
        options,
    });

    return buildConfidenceClaimAddSequence({
        confidenceConnectorId: applied.confidenceConnectorId,
        openingSnapshot,
        options,
        settledSnapshot,
        targetClaimId: input.command.connector.targetClaimId,
    });
}

function buildConfidenceClaimAddSequence(args: {
    confidenceConnectorId: ConfidenceConnectorId;
    openingSnapshot: Snapshot;
    options: PlannerOptions;
    settledSnapshot: Snapshot;
    targetClaimId: ClaimId;
}): Snapshot[] {
    const voilaSnapshot = buildVoilaSnapshot(args);
    const sproutSnapshot = buildSproutSnapshot(args);
    const firstFillSnapshot = buildFirstFillSnapshot(args);

    return [voilaSnapshot, sproutSnapshot, firstFillSnapshot];
}

function buildVoilaSnapshot(args: {
    confidenceConnectorId: ConfidenceConnectorId;
    openingSnapshot: Snapshot;
    options: PlannerOptions;
    settledSnapshot: Snapshot;
    targetClaimId: ClaimId;
}): Snapshot {
    const snapshot: Snapshot = { ...args.openingSnapshot };
    const targetDeliveryAggregatorVizId = resolveOrCreateDeliveryAggregatorVizId(args.settledSnapshot, args.targetClaimId);
    const siblingDeliveryConnectorVizIds = getRequiredDeliveryAggregator(
        args.settledSnapshot,
        targetDeliveryAggregatorVizId,
    ).deliveryConnectorVizIds;
    const newConfidenceConnectorVizId = resolveOrCreateConfidenceConnectorVizId(args.settledSnapshot, args.confidenceConnectorId);
    const newConfidenceConnector = getRequiredConfidenceConnector(args.settledSnapshot, newConfidenceConnectorVizId);
    const newClaimVizId = newConfidenceConnector.sourceClaimVizId;
    const newClaimViz = getRequiredClaimViz(args.settledSnapshot, newClaimVizId);
    const newDeliveryAggregatorVizId = resolveOrCreateDeliveryAggregatorVizId(args.settledSnapshot, newClaimViz.claimId);
    const newDeliveryAggregator = getRequiredDeliveryAggregator(args.settledSnapshot, newDeliveryAggregatorVizId);
    const newJunctionVizId = resolveOrCreateJunctionVizId(args.settledSnapshot, args.confidenceConnectorId);
    const newRelevanceAggregatorVizId = resolveOrCreateRelevanceAggregatorVizId(args.settledSnapshot, args.confidenceConnectorId);
    const newDeliveryConnectorVizId = resolveOrCreateDeliveryConnectorVizId(args.settledSnapshot, args.confidenceConnectorId);

    snapshot[targetDeliveryAggregatorVizId] = getRequiredDeliveryAggregator(args.settledSnapshot, targetDeliveryAggregatorVizId);
    snapshot[newClaimVizId] = {
        ...newClaimViz,
        scale: buildTweenNumber(0, resolveStaticTweenNumber(newClaimViz.scale)),
    };
    snapshot[newDeliveryAggregatorVizId] = newDeliveryAggregator;
    snapshot[newJunctionVizId] = getRequiredJunction(args.settledSnapshot, newJunctionVizId);
    snapshot[newRelevanceAggregatorVizId] = getRequiredRelevanceAggregator(args.settledSnapshot, newRelevanceAggregatorVizId);
    snapshot[newConfidenceConnectorVizId] = getRequiredConfidenceConnector(args.settledSnapshot, newConfidenceConnectorVizId);
    snapshot[newDeliveryConnectorVizId] = {
        ...getRequiredDeliveryConnector(args.settledSnapshot, newDeliveryConnectorVizId),
        scale: 0,
        score: 0,
    };

    const voilaClaimPlacements = resolveVoilaClaimPlacements({
        openingSnapshot: args.openingSnapshot,
        options: args.options,
        settledSnapshot: args.settledSnapshot,
        targetClaimId: args.targetClaimId,
    });

    for (const deliveryConnectorVizId of siblingDeliveryConnectorVizIds) {
        if (deliveryConnectorVizId === newDeliveryConnectorVizId) {
            continue;
        }

        const settledDeliveryConnector = getRequiredDeliveryConnector(args.settledSnapshot, deliveryConnectorVizId);
        const confidenceConnectorVizId = resolveOrCreateConfidenceConnectorVizId(
            args.settledSnapshot,
            settledDeliveryConnector.confidenceConnectorId,
        );
        const confidenceConnector = args.openingSnapshot[confidenceConnectorVizId]
            ?? args.settledSnapshot[confidenceConnectorVizId];

        if (confidenceConnector?.type !== "confidenceConnector") {
            continue;
        }

        if (!args.openingSnapshot[confidenceConnector.sourceClaimVizId]) {
            continue;
        }
    }

    for (const voilaClaimPlacement of voilaClaimPlacements) {
        const currentClaimViz = args.openingSnapshot[voilaClaimPlacement.claimVizId];

        if (currentClaimViz?.type === "claim") {
            snapshot[voilaClaimPlacement.claimVizId] = {
                ...currentClaimViz,
                position: buildTweenPoint(
                    resolveStaticTweenPoint(currentClaimViz.position),
                    voilaClaimPlacement.position,
                ),
            };
            continue;
        }

        const stagedClaimViz = snapshot[voilaClaimPlacement.claimVizId];

        if (stagedClaimViz?.type === "claim") {
            snapshot[voilaClaimPlacement.claimVizId] = {
                ...stagedClaimViz,
                position: voilaClaimPlacement.position,
            };
        }
    }

    return snapshot;
}

function buildSproutSnapshot(args: {
    confidenceConnectorId: ConfidenceConnectorId;
    openingSnapshot: Snapshot;
    options: PlannerOptions;
    settledSnapshot: Snapshot;
    targetClaimId: ClaimId;
}): Snapshot {
    const snapshot: Snapshot = { ...args.settledSnapshot };
    const targetDeliveryAggregatorVizId = resolveOrCreateDeliveryAggregatorVizId(args.settledSnapshot, args.targetClaimId);
    const siblingDeliveryConnectorVizIds = getRequiredDeliveryAggregator(
        args.settledSnapshot,
        targetDeliveryAggregatorVizId,
    ).deliveryConnectorVizIds;
    const newDeliveryConnectorVizId = resolveOrCreateDeliveryConnectorVizId(args.settledSnapshot, args.confidenceConnectorId);
    const settledNewDeliveryConnector = getRequiredDeliveryConnector(args.settledSnapshot, newDeliveryConnectorVizId);
    const voilaClaimPlacements = resolveVoilaClaimPlacements({
        openingSnapshot: args.openingSnapshot,
        options: args.options,
        settledSnapshot: args.settledSnapshot,
        targetClaimId: args.targetClaimId,
    });
    const localAnimatedItemIds = new Set<string>([
        targetDeliveryAggregatorVizId,
        ...siblingDeliveryConnectorVizIds,
        ...voilaClaimPlacements.map((placement) => placement.claimVizId),
    ]);

    snapshot[newDeliveryConnectorVizId] = {
        ...settledNewDeliveryConnector,
        scale: buildTweenNumber(0, resolveStaticTweenNumber(settledNewDeliveryConnector.scale)),
        score: 0,
    };

    for (const deliveryConnectorVizId of siblingDeliveryConnectorVizIds) {
        if (deliveryConnectorVizId === newDeliveryConnectorVizId) {
            continue;
        }

        const currentDeliveryConnector = args.openingSnapshot[deliveryConnectorVizId];
        const settledDeliveryConnector = getRequiredDeliveryConnector(args.settledSnapshot, deliveryConnectorVizId);

        if (currentDeliveryConnector?.type === "deliveryConnector") {
            snapshot[deliveryConnectorVizId] = {
                ...settledDeliveryConnector,
                direction: "targetToSource",
                scale: buildTweenNumber(
                    resolveStaticTweenNumber(currentDeliveryConnector.scale),
                    resolveStaticTweenNumber(settledDeliveryConnector.scale),
                    { endPct: 0.7, startPct: 0.5 },
                ),
                targetSideOffset: buildTweenNumber(
                    resolveOptionalTweenNumber(currentDeliveryConnector.targetSideOffset),
                    resolveOptionalTweenNumber(settledDeliveryConnector.targetSideOffset),
                    { endPct: 0.7, startPct: 0.5 },
                ),
            };
        }

    }

    for (const voilaClaimPlacement of voilaClaimPlacements) {
        const settledClaimViz = getRequiredClaimViz(args.settledSnapshot, voilaClaimPlacement.claimVizId);
        const currentClaimViz = args.openingSnapshot[voilaClaimPlacement.claimVizId];

        snapshot[voilaClaimPlacement.claimVizId] = {
            ...settledClaimViz,
            position: buildTweenPoint(
                voilaClaimPlacement.position,
                resolveStaticTweenPoint(settledClaimViz.position),
                { endPct: 1, startPct: 0.7 },
            ),
            scale: currentClaimViz?.type === "claim"
                ? buildTweenNumber(
                    resolveStaticTweenNumber(currentClaimViz.scale),
                    resolveStaticTweenNumber(settledClaimViz.scale),
                    { endPct: 1, startPct: 0.7 },
                )
                : settledClaimViz.scale,
        };
    }

    restoreOpeningItemsOutsideLocalAnimation({
        localAnimatedItemIds,
        openingSnapshot: args.openingSnapshot,
        snapshot,
    });

    copyOpeningScoresToMatchingItems({
        openingSnapshot: args.openingSnapshot,
        snapshot,
    });

    return snapshot;
}

function buildFirstFillSnapshot(args: {
    confidenceConnectorId: ConfidenceConnectorId;
    openingSnapshot: Snapshot;
    options: PlannerOptions;
    settledSnapshot: Snapshot;
    targetClaimId: ClaimId;
}): Snapshot {
    const snapshot: Snapshot = { ...args.settledSnapshot };
    const targetDeliveryAggregatorVizId = resolveOrCreateDeliveryAggregatorVizId(args.settledSnapshot, args.targetClaimId);
    const siblingDeliveryConnectorVizIds = getRequiredDeliveryAggregator(
        args.settledSnapshot,
        targetDeliveryAggregatorVizId,
    ).deliveryConnectorVizIds;
    const newDeliveryConnectorVizId = resolveOrCreateDeliveryConnectorVizId(args.settledSnapshot, args.confidenceConnectorId);
    const settledNewDeliveryConnector = getRequiredDeliveryConnector(args.settledSnapshot, newDeliveryConnectorVizId);
    const voilaClaimPlacements = resolveVoilaClaimPlacements({
        openingSnapshot: args.openingSnapshot,
        options: args.options,
        settledSnapshot: args.settledSnapshot,
        targetClaimId: args.targetClaimId,
    });
    const localAnimatedItemIds = new Set<string>([
        targetDeliveryAggregatorVizId,
        ...siblingDeliveryConnectorVizIds,
        ...voilaClaimPlacements.map((placement) => placement.claimVizId),
    ]);

    snapshot[newDeliveryConnectorVizId] = {
        ...settledNewDeliveryConnector,
        score: buildTweenNumber(0, resolveStaticTweenNumber(settledNewDeliveryConnector.score)),
    };

    restoreOpeningItemsOutsideLocalAnimation({
        localAnimatedItemIds,
        openingSnapshot: args.openingSnapshot,
        snapshot,
    });

    copyOpeningScoresToMatchingItems({
        openingSnapshot: args.openingSnapshot,
        snapshot,
    });

    return snapshot;
}

function restoreOpeningItemsOutsideLocalAnimation(args: {
    localAnimatedItemIds: ReadonlySet<string>;
    openingSnapshot: Snapshot;
    snapshot: Snapshot;
}): void {
    for (const [rawItemId, openingItem] of Object.entries(args.openingSnapshot as Partial<Record<string, VizItem>>)) {
        if (!openingItem || args.localAnimatedItemIds.has(rawItemId)) {
            continue;
        }

        args.snapshot[openingItem.id] = openingItem;
    }
}

function copyOpeningScoresToMatchingItems(args: {
    openingSnapshot: Snapshot;
    snapshot: Snapshot;
}): void {
    for (const openingItem of Object.values(args.openingSnapshot as Partial<Record<string, VizItem>>)) {
        if (!openingItem || !("score" in openingItem)) {
            continue;
        }

        const snapshotItem = args.snapshot[openingItem.id];

        if (!snapshotItem || !("score" in snapshotItem)) {
            continue;
        }

        args.snapshot[snapshotItem.id] = {
            ...snapshotItem,
            score: openingItem.score,
        } as VizItem;
    }
}

function resolveSiblingDeliveryPlacementBasis(args: {
    childDeliveryScales: Partial<Record<ScoreNodeId, number>>;
    options: PlannerOptions;
    scored: ReturnType<typeof calculateScoresFromDebateCore>;
    siblingConnectors: ConfidenceConnector[];
}): Array<{
    connector: ConfidenceConnector;
    deliveryScale: number;
    envelope: {
        bottomOffset: number;
        topOffset: number;
    };
    scoreNodeId: ScoreNodeId;
}> {
    return args.siblingConnectors.map((connector) => {
        const scoreNodeId = args.scored.scoreNodeIdByConfidenceConnectorId[connector.id];

        if (!scoreNodeId) {
            throw new Error(`Missing score node id for confidence connector: ${connector.id}`);
        }

        const deliveryScale = resolveScoreValue(args.childDeliveryScales[scoreNodeId]);
        const score = resolveScoreValue(args.scored.scores[scoreNodeId]?.value);
        const side = resolveSide(args.scored.graph.nodes[scoreNodeId]?.proParent);
        const pipeWidth = resolvePipeWidth(deliveryScale, args.options);
        const fluidWidth = Math.max(0, Math.min(pipeWidth, pipeWidth * score));

        return {
            connector,
            deliveryScale,
            envelope: resolveBandEnvelope(pipeWidth, fluidWidth, side),
            scoreNodeId,
        };
    });
}

function resolveClaimPlacements<TPlacementId extends string>(args: {
    options: PlannerOptions;
    placements: Array<{
        placementId: TPlacementId;
        sourcesScale: number;
    }>;
    pinnedPlacement?: {
        centerY: number;
        placementId: TPlacementId;
    };
    targetClaimViz: ClaimViz;
}): Array<{
    centerY: number;
    placementId: TPlacementId;
    sourcesScale: number;
}> {
    if (args.placements.length === 0) {
        return [];
    }

    const pinnedIndex = args.pinnedPlacement
        ? args.placements.findIndex((placement) => placement.placementId === args.pinnedPlacement?.placementId)
        : -1;

    if (pinnedIndex >= 0 && args.pinnedPlacement) {
        const centerYs: Array<number | undefined> = Array.from({ length: args.placements.length });
        centerYs[pinnedIndex] = args.pinnedPlacement.centerY;

        for (let placementIndex = pinnedIndex - 1; placementIndex >= 0; placementIndex -= 1) {
            const belowPlacement = args.placements[placementIndex + 1];
            const currentPlacement = args.placements[placementIndex];
            const belowCenterY = centerYs[placementIndex + 1];

            if (belowCenterY === undefined) {
                throw new Error(`Missing below placement center while resolving claim placements: ${placementIndex + 1}`);
            }

            centerYs[placementIndex] = belowCenterY
                - ((args.options.claimHeight * belowPlacement.sourcesScale) / 2)
                - (args.options.claimLaneAxisGap * ((currentPlacement.sourcesScale + belowPlacement.sourcesScale) / 2))
                - ((args.options.claimHeight * currentPlacement.sourcesScale) / 2);
        }

        for (let placementIndex = pinnedIndex + 1; placementIndex < args.placements.length; placementIndex += 1) {
            const abovePlacement = args.placements[placementIndex - 1];
            const currentPlacement = args.placements[placementIndex];
            const aboveCenterY = centerYs[placementIndex - 1];

            if (aboveCenterY === undefined) {
                throw new Error(`Missing above placement center while resolving claim placements: ${placementIndex - 1}`);
            }

            centerYs[placementIndex] = aboveCenterY
                + ((args.options.claimHeight * abovePlacement.sourcesScale) / 2)
                + (args.options.claimLaneAxisGap * ((abovePlacement.sourcesScale + currentPlacement.sourcesScale) / 2))
                + ((args.options.claimHeight * currentPlacement.sourcesScale) / 2);
        }

        return args.placements.map((placement, placementIndex) => ({
            centerY: centerYs[placementIndex] ?? args.pinnedPlacement!.centerY,
            placementId: placement.placementId,
            sourcesScale: placement.sourcesScale,
        }));
    }

    const totalHeight = args.placements.reduce((sum, placement, index) => {
        const claimHeight = args.options.claimHeight * placement.sourcesScale;

        if (index === 0) {
            return claimHeight;
        }

        const previous = args.placements[index - 1];
        return sum + claimHeight + (args.options.claimLaneAxisGap * ((placement.sourcesScale + previous.sourcesScale) / 2));
    }, 0);
    let nextTop = resolveStaticTweenPoint(args.targetClaimViz.position).y - (totalHeight / 2);

    return args.placements.map((placement, placementIndex) => {
        const claimHeight = args.options.claimHeight * placement.sourcesScale;
        const centerY = nextTop + (claimHeight / 2);

        nextTop += claimHeight;
        const nextPlacement = args.placements[placementIndex + 1];
        if (nextPlacement) {
            nextTop += args.options.claimLaneAxisGap * ((placement.sourcesScale + nextPlacement.sourcesScale) / 2);
        }

        return {
            centerY,
            placementId: placement.placementId,
            sourcesScale: placement.sourcesScale,
        };
    });
}

function resolveTargetSideOffsets(args: {
    placements: Array<{
        envelope: {
            bottomOffset: number;
            topOffset: number;
        };
    }>;
}): number[] {
    const totalEnvelope = args.placements.reduce(
        (sum, placement) => sum + (placement.envelope.bottomOffset - placement.envelope.topOffset),
        0,
    );
    let nextEnvelopeTop = -(totalEnvelope / 2);

    return args.placements.map((placement) => {
        const targetSideOffset = nextEnvelopeTop - placement.envelope.topOffset;
        nextEnvelopeTop += placement.envelope.bottomOffset - placement.envelope.topOffset;
        return targetSideOffset;
    });
}

function resolveVoilaClaimPlacements(args: {
    openingSnapshot: Snapshot;
    options: PlannerOptions;
    settledSnapshot: Snapshot;
    targetClaimId: ClaimId;
}): Array<{
    claimVizId: ClaimVizId;
    position: { x: number; y: number };
    scale: number;
}> {
    const targetClaimVizId = findUniqueClaimVizId(args.settledSnapshot, args.targetClaimId);
    const settledTargetClaimViz = getRequiredClaimViz(args.settledSnapshot, targetClaimVizId);
    const displayedTargetClaimViz = args.openingSnapshot[targetClaimVizId]?.type === "claim"
        ? args.openingSnapshot[targetClaimVizId]
        : settledTargetClaimViz;
    const sourceClusterClaimVizIds = resolveOrderedSourceClusterClaimVizIds({
        snapshot: args.settledSnapshot,
        targetClaimId: args.targetClaimId,
    });
    const claimPlacements = resolveClaimPlacements({
        options: args.options,
        placements: sourceClusterClaimVizIds.map((claimVizId) => {
            const currentClaimViz = args.openingSnapshot[claimVizId];
            const settledClaimViz = getRequiredClaimViz(args.settledSnapshot, claimVizId);

            return {
                placementId: claimVizId,
                sourcesScale: currentClaimViz?.type === "claim"
                    ? resolveStaticTweenNumber(currentClaimViz.scale)
                    : resolveStaticTweenNumber(settledClaimViz.scale),
            };
        }),
        targetClaimViz: displayedTargetClaimViz,
    });
    const settledSourceLaneLeftEdgeX = Math.min(
        ...sourceClusterClaimVizIds.map((claimVizId) => resolveClaimLeftEdgeX(
            getRequiredClaimViz(args.settledSnapshot, claimVizId),
            args.options,
        )),
    );
    const sourceLaneLeftEdgeOffset = settledSourceLaneLeftEdgeX - resolveTargetClaimRightEdgeX(settledTargetClaimViz, args.options);
    const sourceLaneLeftEdgeX = resolveTargetClaimRightEdgeX(displayedTargetClaimViz, args.options) + sourceLaneLeftEdgeOffset;

    return claimPlacements.map((placement) => ({
        claimVizId: placement.placementId,
        position: {
            x: sourceLaneLeftEdgeX + ((args.options.claimWidth * placement.sourcesScale) / 2),
            y: placement.centerY,
        },
        scale: placement.sourcesScale,
    }));
}

function resolveOrderedSourceClusterClaimVizIds(args: {
    snapshot: Snapshot;
    targetClaimId: ClaimId;
}): ClaimVizId[] {
    const targetDeliveryAggregatorVizId = resolveOrCreateDeliveryAggregatorVizId(args.snapshot, args.targetClaimId);
    const targetDeliveryAggregator = getRequiredDeliveryAggregator(args.snapshot, targetDeliveryAggregatorVizId);
    const claimVizIds = new Set<ClaimVizId>();

    for (const deliveryConnectorVizId of targetDeliveryAggregator.deliveryConnectorVizIds) {
        const deliveryConnector = getRequiredDeliveryConnector(args.snapshot, deliveryConnectorVizId);
        const confidenceConnectorViz = getRequiredConfidenceConnector(
            args.snapshot,
            resolveOrCreateConfidenceConnectorVizId(args.snapshot, deliveryConnector.confidenceConnectorId),
        );

        claimVizIds.add(confidenceConnectorViz.sourceClaimVizId);

        const relevanceAggregator = getRequiredRelevanceAggregator(
            args.snapshot,
            resolveOrCreateRelevanceAggregatorVizId(args.snapshot, deliveryConnector.confidenceConnectorId),
        );

        for (const relevanceConnectorVizId of relevanceAggregator.relevanceConnectorVizIds) {
            const relevanceConnector = args.snapshot[relevanceConnectorVizId];

            if (!relevanceConnector || relevanceConnector.type !== "relevanceConnector") {
                throw new Error(`Missing relevance connector viz: ${relevanceConnectorVizId}`);
            }

            claimVizIds.add(relevanceConnector.sourceClaimVizId);
        }
    }

    return [...claimVizIds].sort((left, right) => {
        const leftClaimViz = getRequiredClaimViz(args.snapshot, left);
        const rightClaimViz = getRequiredClaimViz(args.snapshot, right);
        const yDelta = resolveStaticTweenPoint(leftClaimViz.position).y - resolveStaticTweenPoint(rightClaimViz.position).y;

        if (yDelta !== 0) {
            return yDelta;
        }

        return String(left).localeCompare(String(right));
    });
}

function resolveSourceLaneLeftEdgeX(args: {
    junctionAllowance: number;
    maximumTargetSideOffsetMagnitude: number;
    options: PlannerOptions;
    targetClaimViz: ClaimViz;
}): number {
    const targetRightEdgeX = resolveTargetClaimRightEdgeX(args.targetClaimViz, args.options);
    const crossLaneDistance = resolveDeliveryConnectorCorridorWidth({
        maximumTargetSideOffsetMagnitude: args.maximumTargetSideOffsetMagnitude,
        options: args.options,
        targetClaimViz: args.targetClaimViz,
    }) + args.junctionAllowance;

    return targetRightEdgeX + crossLaneDistance;
}

function resolveSourceJunctionCenterX(args: {
    junctionAllowance: number;
    sourceLaneLeftEdgeX: number;
}): number {
    if (args.junctionAllowance <= 1e-6) {
        return args.sourceLaneLeftEdgeX;
    }

    return args.sourceLaneLeftEdgeX - (args.junctionAllowance / 2);
}

function resolveDeliveryConnectorCorridorWidth(args: {
    maximumTargetSideOffsetMagnitude: number;
    options: PlannerOptions;
    targetClaimViz: ClaimViz;
}): number {
    const localSourcesScale = resolveStaticTweenNumber(args.targetClaimViz.sourcesScale);
    const requiredCrossLaneWidth = resolveRequiredCrossLaneWidth({
        localSourcesScale,
        maximumTargetSideOffsetMagnitude: args.maximumTargetSideOffsetMagnitude,
        options: args.options,
    });

    return requiredCrossLaneWidth + resolveScaledCrossLaneWidth(args.options.crossLaneExtraGap, localSourcesScale);
}

function resolveRequiredCrossLaneWidth(args: {
    localSourcesScale: number;
    maximumTargetSideOffsetMagnitude: number;
    options: PlannerOptions;
}): number {
    const minimumTurnAllowance = resolveMinimumTurnAllowance(args.localSourcesScale, args.options);

    return (minimumTurnAllowance * 2) + Math.max(0, args.maximumTargetSideOffsetMagnitude);
}

function resolveMinimumTurnAllowance(localSourcesScale: number, options: PlannerOptions): number {
    return resolvePipeWidth(localSourcesScale, options) / 2;
}

function resolveMaximumTargetSideOffsetMagnitude(targetSideOffsets: number[]): number {
    return targetSideOffsets.reduce(
        (maximumMagnitude, targetSideOffset) => Math.max(maximumMagnitude, Math.abs(targetSideOffset)),
        0,
    );
}

function resolveMaximumIncomingConfidenceJunctionAllowance(args: {
    context: SettledSnapshotBuildContext;
    directConfidenceChildren: SortedConfidenceChild[];
}): number {
    return args.directConfidenceChildren.reduce((maximumAllowance, child) => {
        const junctionSpan = resolveIncomingConfidenceJunctionSpan({
            context: args.context,
            scoreNodeId: child.scoreNodeId,
        });

        return Math.max(maximumAllowance, junctionSpan);
    }, 0);
}

function resolveIncomingConfidenceJunctionSpan(args: {
    context: SettledSnapshotBuildContext;
    scoreNodeId: ScoreNodeId;
}): number {
    const directRelevanceChildren = getDirectRelevanceChildren(args.context, args.scoreNodeId);
    const relevanceChildren = directRelevanceChildren.map(({ relevanceConnector, scoreNodeId }) => ({
        edge: relevanceConnector.targetRelationship === "proTarget" ? "top" as const : "bottom" as const,
        scoreNodeId,
        sourcesScale: resolveOccurrenceScale(args.context.sourcesScales, scoreNodeId),
    }));
    const topChildren = relevanceChildren.filter((placement) => placement.edge === "top");
    const bottomChildren = relevanceChildren.filter((placement) => placement.edge === "bottom");

    return Math.max(
        resolveTotalEnvelopeHeight({
            context: args.context,
            placements: topChildren,
        }),
        resolveTotalEnvelopeHeight({
            context: args.context,
            placements: bottomChildren,
        }),
    );
}

function resolveScaledCrossLaneWidth(width: number, sourcesScale: number): number {
    return width * sourcesScale;
}

function resolveTargetClaimRightEdgeX(targetClaimViz: ClaimViz, options: PlannerOptions): number {
    const targetPosition = resolveStaticTweenPoint(targetClaimViz.position);
    const targetScale = resolveStaticTweenNumber(targetClaimViz.scale);

    return targetPosition.x + ((options.claimWidth * targetScale) / 2);
}

function resolveSiblingSetUsesSourceJunctionLane(args: {
    debateCoreAfter: PlannerInput["debateCore"];
    siblingConnectors: ConfidenceConnector[];
}): boolean {
    const siblingConnectorIds = new Set(args.siblingConnectors.map((connector) => connector.id));

    return Object.values(args.debateCoreAfter.connectors).some(
        (connector) => connector.type === "relevance" && siblingConnectorIds.has(connector.targetConfidenceConnectorId),
    );
}

function findUniqueClaimVizId(snapshot: Snapshot, claimId: ClaimId): ClaimVizId {
    const matchingClaimVizIds = Object.values(snapshot as Partial<Record<string, VizItem>>)
        .filter((item): item is ClaimViz => item?.type === "claim" && item.claimId === claimId)
        .map((item) => item.id);

    if (matchingClaimVizIds.length !== 1) {
        throw new Error(`Current planner scope requires exactly one claim viz for claim: ${claimId}`);
    }

    return matchingClaimVizIds[0];
}

function getRequiredClaimViz(snapshot: Snapshot, claimVizId: ClaimVizId): ClaimViz {
    const item = snapshot[claimVizId];

    if (!item || item.type !== "claim") {
        throw new Error(`Missing claim viz: ${claimVizId}`);
    }

    return item;
}


function resolveOrCreateDeliveryAggregatorVizId(snapshot: Snapshot, claimId: ClaimId): DeliveryAggregatorVizId {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "deliveryAggregator" && item.claimId === claimId) {
            return item.id;
        }
    }

    return (`delivery-aggregator-viz:${String(claimId)}`) as DeliveryAggregatorVizId;
}

function resolveOrCreateDeliveryAggregator(args: {
    claimId: ClaimId;
    snapshot: Snapshot;
    targetDeliveryAggregatorVizId: DeliveryAggregatorVizId;
    targetScale: number;
    targetScore: number;
}): DeliveryAggregatorViz {
    const existing = args.snapshot[args.targetDeliveryAggregatorVizId];

    if (existing?.type === "deliveryAggregator") {
        return {
            ...existing,
            scale: args.targetScale,
            score: args.targetScore,
        };
    }

    return {
        type: "deliveryAggregator",
        id: args.targetDeliveryAggregatorVizId,
        animationType: "uniform",
        claimId: args.claimId,
        deliveryConnectorVizIds: [],
        scale: args.targetScale,
        score: args.targetScore,
    };
}

function resolveClaimVizId(scoreNodeId: ScoreNodeId): ClaimVizId {
    return (`claim-viz:${String(scoreNodeId)}`) as ClaimVizId;
}

function resolveConfidenceConnectorVizId(confidenceConnectorId: ConfidenceConnectorId): ConfidenceConnectorVizId {
    return (`confidence-connector-viz:${String(confidenceConnectorId)}`) as ConfidenceConnectorVizId;
}

function resolveOrCreateConfidenceConnectorVizId(
    snapshot: Snapshot,
    confidenceConnectorId: ConfidenceConnectorId,
): ConfidenceConnectorVizId {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "confidenceConnector" && item.confidenceConnectorId === confidenceConnectorId) {
            return item.id;
        }
    }

    return resolveConfidenceConnectorVizId(confidenceConnectorId);
}

function resolveDeliveryConnectorVizId(confidenceConnectorId: ConfidenceConnectorId): DeliveryConnectorVizId {
    return (`delivery-connector-viz:${String(confidenceConnectorId)}`) as DeliveryConnectorVizId;
}

function resolveOrCreateDeliveryConnectorVizId(
    snapshot: Snapshot,
    confidenceConnectorId: ConfidenceConnectorId,
): DeliveryConnectorVizId {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "deliveryConnector" && item.confidenceConnectorId === confidenceConnectorId) {
            return item.id;
        }
    }

    return resolveDeliveryConnectorVizId(confidenceConnectorId);
}

function resolveJunctionVizId(confidenceConnectorId: ConfidenceConnectorId): JunctionVizId {
    return (`junction-viz:${String(confidenceConnectorId)}`) as JunctionVizId;
}

function resolveOrCreateJunctionVizId(snapshot: Snapshot, confidenceConnectorId: ConfidenceConnectorId): JunctionVizId {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "junction" && item.confidenceConnectorId === confidenceConnectorId) {
            return item.id;
        }
    }

    return resolveJunctionVizId(confidenceConnectorId);
}

function resolveRelevanceAggregatorVizId(confidenceConnectorId: ConfidenceConnectorId): RelevanceAggregatorVizId {
    return (`relevance-aggregator-viz:${String(confidenceConnectorId)}`) as RelevanceAggregatorVizId;
}

function resolveRelevanceConnectorVizId(relevanceConnectorId: RelevanceConnectorId): RelevanceConnectorVizId {
    return (`relevance-connector-viz:${String(relevanceConnectorId)}`) as RelevanceConnectorVizId;
}

function resolveOrCreateRelevanceAggregatorVizId(
    snapshot: Snapshot,
    confidenceConnectorId: ConfidenceConnectorId,
): RelevanceAggregatorVizId {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "relevanceAggregator" && item.confidenceConnectorId === confidenceConnectorId) {
            return item.id;
        }
    }

    return resolveRelevanceAggregatorVizId(confidenceConnectorId);
}

function resolveStaticTweenNumber(value: number | { from: number; to: number }): number {
    if (typeof value === "number") {
        return value;
    }

    return value.to;
}

function resolveStaticTweenBoolean(value: boolean | { from: boolean; to: boolean }): boolean {
    if (typeof value === "boolean") {
        return value;
    }

    return value.to;
}

function resolveStaticTweenPoint(value: { x: number | { from: number; to: number }; y: number | { from: number; to: number } }): { x: number; y: number } {
    return {
        x: resolveStaticTweenNumber(value.x),
        y: resolveStaticTweenNumber(value.y),
    };
}

function resolveScoreValue(value: number | undefined): number {
    if (!Number.isFinite(value)) {
        return 1;
    }

    return Math.max(0, value ?? 1);
}

function resolvePipeWidth(scale: number, options: PlannerOptions): number {
    return options.claimHeight * Math.max(0, scale);
}

function resolveSide(proParent: boolean | undefined): Side {
    return proParent === false ? "conMain" : "proMain";
}

function resolveBandEnvelope(pipeWidth: number, bandWidth: number, side: Side): {
    bottomOffset: number;
    topOffset: number;
} {
    const safePipeWidth = Math.max(0, pipeWidth);
    const safeBandWidth = Math.min(safePipeWidth, Math.max(0, bandWidth));

    if (side === "conMain") {
        return {
            bottomOffset: -(safePipeWidth / 2) + safeBandWidth,
            topOffset: -(safePipeWidth / 2),
        };
    }

    return {
        bottomOffset: safePipeWidth / 2,
        topOffset: (safePipeWidth / 2) - safeBandWidth,
    };
}


function getRequiredDeliveryAggregator(snapshot: Snapshot, vizId: DeliveryAggregatorVizId): DeliveryAggregatorViz {
    const item = snapshot[vizId];

    if (!item || item.type !== "deliveryAggregator") {
        throw new Error(`Missing delivery aggregator viz: ${vizId}`);
    }

    return item;
}

function getRequiredJunction(snapshot: Snapshot, vizId: JunctionVizId): JunctionViz {
    const item = snapshot[vizId];

    if (!item || item.type !== "junction") {
        throw new Error(`Missing junction viz: ${vizId}`);
    }

    return item;
}

function getRequiredRelevanceAggregator(snapshot: Snapshot, vizId: RelevanceAggregatorVizId): RelevanceAggregatorViz {
    const item = snapshot[vizId];

    if (!item || item.type !== "relevanceAggregator") {
        throw new Error(`Missing relevance aggregator viz: ${vizId}`);
    }

    return item;
}

function getRequiredConfidenceConnector(snapshot: Snapshot, vizId: ConfidenceConnectorVizId): ConfidenceConnectorViz {
    const item = snapshot[vizId];

    if (!item || item.type !== "confidenceConnector") {
        throw new Error(`Missing confidence connector viz: ${vizId}`);
    }

    return item;
}

function getRequiredDeliveryConnector(snapshot: Snapshot, vizId: DeliveryConnectorVizId): DeliveryConnectorViz {
    const item = snapshot[vizId];

    if (!item || item.type !== "deliveryConnector") {
        throw new Error(`Missing delivery connector viz: ${vizId}`);
    }

    return item;
}

function buildTweenNumber(
    from: number,
    to: number,
    range?: { endPct?: number; startPct?: number },
): { endPct?: number; from: number; startPct?: number; to: number; type: "tween/number" } {
    return {
        type: "tween/number",
        from,
        to,
        ...range,
    };
}

function buildTweenPoint(
    from: { x: number; y: number },
    to: { x: number; y: number },
    range?: { endPct?: number; startPct?: number },
): {
    endPct?: number;
    startPct?: number;
    type?: never;
    x: number | { from: number; to: number; type: "tween/number" };
    y: number | { from: number; to: number; type: "tween/number" };
} {
    return {
        x: from.x === to.x ? to.x : buildTweenNumber(from.x, to.x),
        y: from.y === to.y ? to.y : buildTweenNumber(from.y, to.y),
        ...range,
    };
}

function resolveOptionalTweenNumber(value: number | { from: number; to: number } | undefined): number {
    if (value === undefined) {
        return 0;
    }

    return resolveStaticTweenNumber(value);
}