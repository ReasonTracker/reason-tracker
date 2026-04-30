import type { Impact, ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.ts";
import type { ScoreCalculationStep } from "./calculateScores.ts";
import { calculateScoresWithSteps, withChildrenByParentId } from "./calculateScores.ts";
import { sortClaimsLeavesToRoot } from "./sortClaimsLeavesToRoot.ts";

// AGENT NOTE: Keep cycle-resolution limits grouped here so reviewers can
// inspect and tune the trust/performance tradeoff in one place.
/**
 * Maximum number of score nodes that may participate in detected cycles
 * before score calculation fails fast.
 */
const DEFAULT_MAX_CYCLE_NODE_COUNT = 24;

/**
 * Maximum number of cycle-break variants to evaluate before score
 * calculation fails fast.
 */
const DEFAULT_MAX_VARIANT_COUNT = 1024;

export type ScoreCycleResolutionOptions = {
    maxCycleNodeCount?: number;
    maxVariantCount?: number;
};

export type ScoreCalculationGroup = {
    id: string;
    type: "node" | "cycle";
    scoreNodeIds: ScoreNodeId[];
};

export type ScoreCalculationAudit = {
    cycleResolution?: ScoreCycleResolutionAudit;
};

export type ScoreCycleEdge = {
    fromScoreNodeId: ScoreNodeId;
    toScoreNodeId: ScoreNodeId;
};

export type ScoreCycleComponent = {
    id: string;
    scoreNodeIds: ScoreNodeId[];
    cycleEdges: ScoreCycleEdge[];
};

export type ScoreCycleBreakVariant = {
    id: string;
    removedCycleEdges: ScoreCycleEdge[];
    scores: Scores;
};

export type ScoreCycleResolutionAudit = {
    limits: Required<ScoreCycleResolutionOptions>;
    totalCycleNodeCount: number;
    totalVariantCount: number;
    components: ScoreCycleComponent[];
    variants: ScoreCycleBreakVariant[];
};

export type ScoreCalculationRun = {
    scores: Scores;
    impactsByScoreNodeId: Partial<Record<ScoreNodeId, Impact[]>>;
    groups: ScoreCalculationGroup[];
    audit: ScoreCalculationAudit;
    impactMode: "direct" | "variant-average";
};

type CycleVariantCalculation = {
    id: string;
    removedCycleEdges: ScoreCycleEdge[];
    scores: Scores;
    impactsByScoreNodeId: Partial<Record<ScoreNodeId, Impact[]>>;
};

export class ScoreCycleResolutionLimitError extends Error {
    readonly audit: ScoreCycleResolutionAudit;

    constructor(message: string, audit: ScoreCycleResolutionAudit) {
        super(message);
        this.name = "ScoreCycleResolutionLimitError";
        this.audit = audit;
    }
}

/**
 * Calculates scores for a graph that may contain cycles.
 *
 * Acyclic graphs pass straight through the small math kernel.
 * Cyclic graphs are resolved by enumerating cycle breaks, scoring each
 * acyclic variant, and averaging the results.
 */
export function calculateScoreRun(
    graph: ScoreGraph,
    options: ScoreCycleResolutionOptions = {},
): ScoreCalculationRun {
    const graphWithChildren = withChildrenByParentId(graph);
    const cycleComponents = findCycleComponents(graphWithChildren);

    if (cycleComponents.length === 0) {
        return calculateAcyclicScoreRun(graphWithChildren);
    }

    const limits = normalizeCycleResolutionOptions(options);
    const preflightAudit = createCycleResolutionAudit(cycleComponents, limits, []);
    enforceCycleResolutionLimits(preflightAudit);

    const variants = enumerateCycleBreakVariants(cycleComponents).map((variant, index) =>
        calculateCycleBreakVariant({
            graph: graphWithChildren,
            removedCycleEdges: variant.removedCycleEdges,
            variantIndex: index,
        }),
    );

    return {
        scores: averageScores(graphWithChildren, variants),
        impactsByScoreNodeId: averageImpacts(graphWithChildren, variants),
        groups: buildCycleCalculationGroups(graphWithChildren, cycleComponents),
        audit: {
            cycleResolution: createCycleResolutionAudit(
                cycleComponents,
                limits,
                variants.map(({ id, removedCycleEdges, scores }) => ({
                    id,
                    removedCycleEdges,
                    scores,
                })),
            ),
        },
        impactMode: "variant-average",
    };
}

function calculateAcyclicScoreRun(graph: ScoreGraph): ScoreCalculationRun {
    const calculation = calculateScoresWithSteps(graph);
    const groups = sortClaimsLeavesToRoot(graph).map((scoreNodeId) => ({
        id: `node:${scoreNodeId}`,
        type: "node" as const,
        scoreNodeIds: [scoreNodeId],
    }));

    return {
        scores: calculation.scores,
        impactsByScoreNodeId: buildImpactsByScoreNodeId(calculation.steps),
        groups,
        audit: {},
        impactMode: "direct",
    };
}

function normalizeCycleResolutionOptions(
    options: ScoreCycleResolutionOptions,
): Required<ScoreCycleResolutionOptions> {
    return {
        maxCycleNodeCount: options.maxCycleNodeCount ?? DEFAULT_MAX_CYCLE_NODE_COUNT,
        maxVariantCount: options.maxVariantCount ?? DEFAULT_MAX_VARIANT_COUNT,
    };
}

function createCycleResolutionAudit(
    components: ScoreCycleComponent[],
    limits: Required<ScoreCycleResolutionOptions>,
    variants: ScoreCycleBreakVariant[],
): ScoreCycleResolutionAudit {
    return {
        limits,
        totalCycleNodeCount: components.reduce(
            (total, component) => total + component.scoreNodeIds.length,
            0,
        ),
        totalVariantCount: countTotalVariants(components),
        components,
        variants,
    };
}

function countTotalVariants(components: ScoreCycleComponent[]): number {
    let totalVariantCount = 1;

    for (const component of components) {
        if (totalVariantCount > Number.MAX_SAFE_INTEGER / component.cycleEdges.length) {
            return Number.POSITIVE_INFINITY;
        }

        totalVariantCount *= component.cycleEdges.length;
    }

    return totalVariantCount;
}

function enforceCycleResolutionLimits(audit: ScoreCycleResolutionAudit): void {
    if (audit.totalCycleNodeCount > audit.limits.maxCycleNodeCount) {
        throw new ScoreCycleResolutionLimitError(
            [
                "Score cycle resolution exceeded the configured cycle-node limit.",
                `Detected cycle nodes: ${audit.totalCycleNodeCount}.`,
                `Configured limit: ${audit.limits.maxCycleNodeCount}.`,
            ].join(" "),
            audit,
        );
    }

    if (audit.totalVariantCount > audit.limits.maxVariantCount) {
        throw new ScoreCycleResolutionLimitError(
            [
                "Score cycle resolution exceeded the configured variant limit.",
                `Detected cycle-break variants: ${audit.totalVariantCount}.`,
                `Configured limit: ${audit.limits.maxVariantCount}.`,
            ].join(" "),
            audit,
        );
    }
}

function findCycleComponents(graph: ScoreGraph): ScoreCycleComponent[] {
    const settled = new Set<ScoreNodeId>();
    const components: ScoreCycleComponent[] = [];
    const scoreNodeIds = Object.keys(graph.nodes).sort() as ScoreNodeId[];

    for (const startId of scoreNodeIds) {
        if (settled.has(startId)) {
            continue;
        }

        const walk: ScoreNodeId[] = [];
        const walkIndexById = new Map<ScoreNodeId, number>();
        let currentId: ScoreNodeId | undefined = startId;

        while (currentId && graph.nodes[currentId] && !settled.has(currentId)) {
            const existingIndex = walkIndexById.get(currentId);

            if (existingIndex !== undefined) {
                const cycleNodeIds = stabilizeCycleOrder(walk.slice(existingIndex));
                components.push(createCycleComponent(graph, cycleNodeIds));
                break;
            }

            walkIndexById.set(currentId, walk.length);
            walk.push(currentId);

            const parentId: ScoreNodeId | undefined = graph.nodes[currentId]?.parentId;
            currentId = parentId && graph.nodes[parentId] ? parentId : undefined;
        }

        for (const scoreNodeId of walk) {
            settled.add(scoreNodeId);
        }
    }

    return components.sort((left, right) => left.id.localeCompare(right.id));
}

function stabilizeCycleOrder(scoreNodeIds: ScoreNodeId[]): ScoreNodeId[] {
    if (scoreNodeIds.length <= 1) {
        return scoreNodeIds;
    }

    let bestIndex = 0;

    for (let index = 1; index < scoreNodeIds.length; index += 1) {
        if (String(scoreNodeIds[index]).localeCompare(String(scoreNodeIds[bestIndex])) < 0) {
            bestIndex = index;
        }
    }

    return [...scoreNodeIds.slice(bestIndex), ...scoreNodeIds.slice(0, bestIndex)];
}

function createCycleComponent(graph: ScoreGraph, scoreNodeIds: ScoreNodeId[]): ScoreCycleComponent {
    const cycleNodeIdSet = new Set(scoreNodeIds);
    const cycleEdges = scoreNodeIds.map((scoreNodeId) => {
        const parentId = graph.nodes[scoreNodeId]?.parentId;

        if (!parentId || !cycleNodeIdSet.has(parentId)) {
            throw new Error(`Cycle node is missing an in-cycle parent: ${scoreNodeId}`);
        }

        return {
            fromScoreNodeId: scoreNodeId,
            toScoreNodeId: parentId,
        };
    });

    return {
        id: `cycle:${scoreNodeIds[0]}`,
        scoreNodeIds,
        cycleEdges,
    };
}

function enumerateCycleBreakVariants(components: ScoreCycleComponent[]): Array<{
    removedCycleEdges: ScoreCycleEdge[];
}> {
    const variants: Array<{ removedCycleEdges: ScoreCycleEdge[] }> = [];
    const currentEdges: ScoreCycleEdge[] = [];

    function visit(componentIndex: number): void {
        if (componentIndex >= components.length) {
            variants.push({ removedCycleEdges: [...currentEdges] });
            return;
        }

        for (const cycleEdge of components[componentIndex].cycleEdges) {
            currentEdges.push(cycleEdge);
            visit(componentIndex + 1);
            currentEdges.pop();
        }
    }

    visit(0);
    return variants;
}

function calculateCycleBreakVariant(args: {
    graph: ScoreGraph;
    removedCycleEdges: ScoreCycleEdge[];
    variantIndex: number;
}): CycleVariantCalculation {
    const acyclicGraph = breakCycleEdges(args.graph, args.removedCycleEdges);
    const calculation = calculateScoresWithSteps(acyclicGraph);

    return {
        id: `variant:${args.variantIndex + 1}`,
        removedCycleEdges: args.removedCycleEdges,
        scores: calculation.scores,
        impactsByScoreNodeId: buildImpactsByScoreNodeId(calculation.steps),
    };
}

function breakCycleEdges(graph: ScoreGraph, removedCycleEdges: ScoreCycleEdge[]): ScoreGraph {
    const nodes = { ...graph.nodes };

    for (const removedEdge of removedCycleEdges) {
        const scoreNode = nodes[removedEdge.fromScoreNodeId];

        if (!scoreNode) {
            throw new Error(`Missing cycle-break source node: ${removedEdge.fromScoreNodeId}`);
        }

        if (scoreNode.parentId !== removedEdge.toScoreNodeId) {
            throw new Error(
                `Cycle-break edge no longer matches the graph: ${removedEdge.fromScoreNodeId}`,
            );
        }

        nodes[removedEdge.fromScoreNodeId] = {
            ...scoreNode,
            parentId: undefined,
        };
    }

    return { nodes };
}

function averageScores(graph: ScoreGraph, variants: CycleVariantCalculation[]): Scores {
    const averagedScores: Scores = {};
    const scoreNodeIds = Object.keys(graph.nodes) as ScoreNodeId[];
    const variantCount = variants.length;

    for (const scoreNodeId of scoreNodeIds) {
        const firstScore = variants[0]?.scores[scoreNodeId];

        if (!firstScore) {
            throw new Error(`Missing score for averaged cycle variant node: ${scoreNodeId}`);
        }

        let value = 0;
        let rawValue = 0;
        let weightedSum = 0;
        let totalWeight = 0;

        for (const variant of variants) {
            const score = variant.scores[scoreNodeId];

            if (!score) {
                throw new Error(`Missing score for cycle variant node: ${scoreNodeId}`);
            }

            value += score.value;
            rawValue += score.rawValue;
            weightedSum += score.weightedSum;
            totalWeight += score.totalWeight;
        }

        averagedScores[scoreNodeId] = {
            scoreNodeId,
            claimId: firstScore.claimId,
            value: value / variantCount,
            rawValue: rawValue / variantCount,
            weightedSum: weightedSum / variantCount,
            totalWeight: totalWeight / variantCount,
        };
    }

    return averagedScores;
}

function averageImpacts(
    graph: ScoreGraph,
    variants: CycleVariantCalculation[],
): Partial<Record<ScoreNodeId, Impact[]>> {
    const averagedImpacts: Partial<Record<ScoreNodeId, Impact[]>> = {};
    const scoreNodeIds = Object.keys(graph.nodes) as ScoreNodeId[];
    const variantCount = variants.length;

    for (const scoreNodeId of scoreNodeIds) {
        const totalsByImpactId = new Map<
            ScoreNodeId,
            {
                scoreNodeId: ScoreNodeId;
                claimId: Impact["claimId"];
                value: number;
                weight: number;
                relevance: number;
            }
        >();

        for (const variant of variants) {
            for (const impact of variant.impactsByScoreNodeId[scoreNodeId] ?? []) {
                const total = totalsByImpactId.get(impact.scoreNodeId) ?? {
                    scoreNodeId: impact.scoreNodeId,
                    claimId: impact.claimId,
                    value: 0,
                    weight: 0,
                    relevance: 0,
                };

                total.value += impact.value;
                total.weight += impact.weight;
                total.relevance += impact.relevance;
                totalsByImpactId.set(impact.scoreNodeId, total);
            }
        }

        averagedImpacts[scoreNodeId] = [...totalsByImpactId.values()]
            .sort((left, right) => String(left.scoreNodeId).localeCompare(String(right.scoreNodeId)))
            .map((impact) => ({
                scoreNodeId: impact.scoreNodeId,
                claimId: impact.claimId,
                value: impact.value / variantCount,
                weight: impact.weight / variantCount,
                relevance: impact.relevance / variantCount,
            }));
    }

    return averagedImpacts;
}

function buildImpactsByScoreNodeId(
    steps: ScoreCalculationStep[],
): Partial<Record<ScoreNodeId, Impact[]>> {
    const impactsByScoreNodeId: Partial<Record<ScoreNodeId, Impact[]>> = {};

    for (const step of steps) {
        impactsByScoreNodeId[step.scoreNodeId] = step.impacts;
    }

    return impactsByScoreNodeId;
}

function buildCycleCalculationGroups(
    graph: ScoreGraph,
    cycleComponents: ScoreCycleComponent[],
): ScoreCalculationGroup[] {
    const scoreNodeIdsInCycles = new Set<ScoreNodeId>();
    const groupIdByScoreNodeId = new Map<ScoreNodeId, string>();
    const groupsById = new Map<string, ScoreCalculationGroup>();

    for (const component of cycleComponents) {
        groupsById.set(component.id, {
            id: component.id,
            type: "cycle",
            scoreNodeIds: component.scoreNodeIds,
        });

        for (const scoreNodeId of component.scoreNodeIds) {
            scoreNodeIdsInCycles.add(scoreNodeId);
            groupIdByScoreNodeId.set(scoreNodeId, component.id);
        }
    }

    for (const scoreNodeId of Object.keys(graph.nodes).sort() as ScoreNodeId[]) {
        if (scoreNodeIdsInCycles.has(scoreNodeId)) {
            continue;
        }

        const groupId = `node:${scoreNodeId}`;
        groupsById.set(groupId, {
            id: groupId,
            type: "node",
            scoreNodeIds: [scoreNodeId],
        });
        groupIdByScoreNodeId.set(scoreNodeId, groupId);
    }

    const childrenByParentGroupId: Record<string, string[]> = {};

    for (const group of groupsById.values()) {
        const parentGroupId = findParentGroupId(graph, group, groupIdByScoreNodeId);

        if (!parentGroupId) {
            continue;
        }

        childrenByParentGroupId[parentGroupId] ??= [];
        childrenByParentGroupId[parentGroupId]?.push(group.id);
    }

    for (const childGroupIds of Object.values(childrenByParentGroupId)) {
        childGroupIds.sort((left, right) => left.localeCompare(right));
    }

    const orderedGroups: ScoreCalculationGroup[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const groupIds = [...groupsById.keys()].sort((left, right) => left.localeCompare(right));

    function visit(groupId: string): void {
        if (visited.has(groupId)) {
            return;
        }

        if (visiting.has(groupId)) {
            throw new Error(`Cycle found while sorting score groups: ${groupId}`);
        }

        visiting.add(groupId);

        for (const childGroupId of childrenByParentGroupId[groupId] ?? []) {
            visit(childGroupId);
        }

        visiting.delete(groupId);
        visited.add(groupId);
        orderedGroups.push(assertDefined(groupsById.get(groupId), `Missing score group: ${groupId}`));
    }

    for (const groupId of groupIds) {
        visit(groupId);
    }

    return orderedGroups;
}

function findParentGroupId(
    graph: ScoreGraph,
    group: ScoreCalculationGroup,
    groupIdByScoreNodeId: Map<ScoreNodeId, string>,
): string | undefined {
    for (const scoreNodeId of group.scoreNodeIds) {
        const parentId = graph.nodes[scoreNodeId]?.parentId;

        if (!parentId) {
            continue;
        }

        const parentGroupId = groupIdByScoreNodeId.get(parentId);

        if (parentGroupId && parentGroupId !== group.id) {
            return parentGroupId;
        }
    }

    return undefined;
}

function assertDefined<T>(value: T | undefined, message: string): T {
    if (value === undefined) {
        throw new Error(message);
    }

    return value;
}