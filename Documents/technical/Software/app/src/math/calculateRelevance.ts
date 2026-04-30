import type { ScoreGraph, ScoreNode, ScoreNodeId, Scores } from "./scoreTypes.ts";
import { NEUTRAL_RELEVANCE } from "./scoringAxioms.ts";
import { claimChildrenIdsByParentId } from "./claimChildrenIdsByParentId.ts";

/**
 * Calculates the relevance multiplier for one direct score child.
 *
 * Relevance children do not directly score the parent. They change how much
 * their attached score child matters to the parent.
 */
export function calculateRelevance(
  scoreNodeId: ScoreNodeId,
  graph: ScoreGraph,
  scores: Scores,
): number {
  const childrenByParentId = graph.childrenByParentId ?? claimChildrenIdsByParentId(graph);
  const relevanceChildIds = (childrenByParentId[scoreNodeId] ?? [])
    .filter((childId: ScoreNodeId) => graph.nodes[childId]?.affects === "Relevance");

  let relevance = NEUTRAL_RELEVANCE;

  for (const relevanceChildId of relevanceChildIds) {
    const child = graph.nodes[relevanceChildId];
    const childScore = scores[relevanceChildId];

    if (!child || !childScore) {
      throw new Error(`Missing relevance child score: ${relevanceChildId}`);
    }

    const signedValue = calculateRelevanceValue(child, childScore.value);

    if (signedValue >= 0) {
      relevance *= 1 + signedValue;
    } else {
      relevance *= 1 / (1 + Math.abs(signedValue));
    }
  }

  return relevance;
}

function calculateRelevanceValue(child: ScoreNode, scoreValue: number): number {
  if (child.proParent === undefined) {
    throw new Error(`Relevance child is missing proParent: ${child.id}`);
  }

  let value = scoreValue;

  if (!child.reversible && value < 0) {
    value = 0;
  }

  return child.proParent ? value : -value;
}
