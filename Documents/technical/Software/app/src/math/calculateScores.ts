import type { Impact, Score, ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.ts";
import { calculateChildImpact } from "./calculateChildImpact.ts";
import { calculateClaimScore } from "./calculateClaimScore.ts";
import { calculateRelevance } from "./calculateRelevance.ts";
import { claimChildrenIdsByParentId } from "./claimChildrenIdsByParentId.ts";
import { sortClaimsLeavesToRoot } from "./sortClaimsLeavesToRoot.ts";

export type ScoreCalculationStep = {
  scoreNodeId: ScoreNodeId;
  before?: Score;
  after: Score;
  impacts: Impact[];
};

export type ScoresWithSteps = {
  scores: Scores;
  steps: ScoreCalculationStep[];
};

/**
 * Calculates scores from a complete acyclic scoring graph.
 */
export function calculateScores(graph: ScoreGraph): Scores {
  return calculateScoresWithSteps(graph).scores;
}

/**
 * Calculates scores and records the score calculation for each ScoreNode.
 *
 * The steps are math-level propagation data. They are not display instructions.
 */
export function calculateScoresWithSteps(graph: ScoreGraph): ScoresWithSteps {
  const graphWithChildren = withChildrenByParentId(graph);
  const scoreNodeIds = sortClaimsLeavesToRoot(graphWithChildren);
  const scores: Scores = {};
  const steps: ScoreCalculationStep[] = [];

  for (const scoreNodeId of scoreNodeIds) {
    const impacts = calculateScoreImpacts(scoreNodeId, graphWithChildren, scores);
    const after = calculateClaimScore(scoreNodeId, graphWithChildren, impacts);

    scores[scoreNodeId] = after;
    steps.push({ scoreNodeId, after, impacts });
  }

  return { scores, steps };
}

/**
 * Recreates the calculation inputs for one ScoreNode from already calculated
 * child scores.
 */
export function calculateScoreImpacts(
  scoreNodeId: ScoreNodeId,
  graph: ScoreGraph,
  scores: Scores,
): Impact[] {
  const graphWithChildren = withChildrenByParentId(graph);
  const childIds = graphWithChildren.childrenByParentId?.[scoreNodeId] ?? [];
  const impacts: Impact[] = [];

  for (const childId of childIds) {
    const child = graphWithChildren.nodes[childId];

    if (!child || child.affects !== "Score") {
      continue;
    }

    const childScore = scores[childId];

    if (!childScore) {
      throw new Error(`Missing score for child: ${childId}`);
    }

    const relevance = calculateRelevance(childId, graphWithChildren, scores);
    impacts.push(calculateChildImpact(child, childScore, relevance));
  }

  return impacts;
}

export function withChildrenByParentId(graph: ScoreGraph): ScoreGraph {
  return {
    ...graph,
    // Rebuild from nodes so command adapters can freely spread prior graphs
    // without carrying a stale parent-child index forward.
    childrenByParentId: claimChildrenIdsByParentId(graph),
  };
}
