import { calculateRelevance } from "./calculateRelevance.ts";
import { withChildrenByParentId } from "./calculateScores.ts";
import type { ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.ts";

export type SourcesScales = Partial<Record<ScoreNodeId, number>>;

export type SiblingScaleAllocation<TId extends string> = {
	contributionWeights: Partial<Record<TId, number>>
	deliveryScales: Partial<Record<TId, number>>
	parentFluidShares: Partial<Record<TId, number>>
	sharedChildSourcesScale: number
};

export type DirectScoreChildScalePlan = {
	contributionWeights: SourcesScales
	deliveryScales: SourcesScales
	parentFluidShares: SourcesScales
	scoreChildIds: ScoreNodeId[]
	sharedChildSourcesScale: number
};

export function calculateSiblingScaleAllocation<TId extends string>(args: {
	children: ReadonlyArray<{
		contributionWeight: number
		id: TId
		relevanceMultiplier: number
	}>
	parentCapacity: number
}): SiblingScaleAllocation<TId> {
	const parentCapacity = resolveSourcesScale(args.parentCapacity);
	const contributionWeights: Partial<Record<TId, number>> = {};
	let totalContributionWeight = 0;

	for (const child of args.children) {
		const contributionWeight = resolveSourcesScale(child.contributionWeight);
		resolveSourcesScale(child.relevanceMultiplier);
		contributionWeights[child.id] = contributionWeight;
		totalContributionWeight += contributionWeight;
	}

	const denominator = Math.max(1, totalContributionWeight);
	const sharedChildSourcesScale = parentCapacity / denominator;
	const deliveryScales: Partial<Record<TId, number>> = {};
	const parentFluidShares: Partial<Record<TId, number>> = {};

	for (const child of args.children) {
		deliveryScales[child.id] = sharedChildSourcesScale * child.relevanceMultiplier;
		parentFluidShares[child.id] = (contributionWeights[child.id] ?? 0) / denominator;
	}

	return {
		contributionWeights,
		deliveryScales,
		parentFluidShares,
		sharedChildSourcesScale,
	};
}

export function calculateDirectScoreChildScalePlan(args: {
	targetScoreNodeId: ScoreNodeId
	targetSourcesScale: number
	graph: ScoreGraph
	scores: Scores
}): DirectScoreChildScalePlan {
	const graphWithChildren = withChildrenByParentId(args.graph);
	const scoreChildIds = getDirectScoreChildIds(args.targetScoreNodeId, graphWithChildren);

	if (scoreChildIds.length === 0) {
		return {
			contributionWeights: {},
			deliveryScales: {},
			parentFluidShares: {},
			scoreChildIds,
			sharedChildSourcesScale: 0,
		};
	}

	const targetSourcesScale = resolveSourcesScale(args.targetSourcesScale);
	const relevanceByScoreNodeId: SourcesScales = {};

	for (const scoreChildId of scoreChildIds) {
		const relevanceMultiplier = resolveSourcesScale(
			calculateRelevance(scoreChildId, graphWithChildren, args.scores),
		);
		const childScore = args.scores[scoreChildId];
		if (!childScore) {
			throw new Error(`Missing score while assigning source scale: ${scoreChildId}`);
		}
		resolveSourcesScale(childScore.value);

		relevanceByScoreNodeId[scoreChildId] = relevanceMultiplier;
	}

	const allocation = calculateSiblingScaleAllocation({
		children: scoreChildIds.map((scoreChildId) => ({
			contributionWeight: resolveSourcesScale(args.scores[scoreChildId]?.value ?? 0)
				* (relevanceByScoreNodeId[scoreChildId] ?? 0),
			id: scoreChildId,
			relevanceMultiplier: relevanceByScoreNodeId[scoreChildId] ?? 0,
		})),
		parentCapacity: targetSourcesScale,
	});

	return {
		contributionWeights: allocation.contributionWeights,
		deliveryScales: allocation.deliveryScales,
		parentFluidShares: allocation.parentFluidShares,
		scoreChildIds,
		sharedChildSourcesScale: allocation.sharedChildSourcesScale,
	};
}

export function getDirectScoreChildIds(
	targetScoreNodeId: ScoreNodeId,
	graph: ScoreGraph,
): ScoreNodeId[] {
	const childIds = graph.childrenByParentId?.[targetScoreNodeId] ?? [];
	return childIds.filter((childId: ScoreNodeId) => graph.nodes[childId]?.affects === "Score");
}

export function resolveSourcesScale(sourcesScale: number): number {
	if (!Number.isFinite(sourcesScale) || sourcesScale < 0) {
		throw new Error(`Source scale must be a finite non-negative number: ${sourcesScale}`);
	}

	return sourcesScale;
}
