import type { Impact, Score, ScoreGraph, ScoreNodeId } from "./scoreTypes.ts";
import { calculateScoreValue } from "./calculateScoreValue.ts";

/**
 * Calculates one ScoreNode's score from its direct score impacts.
 */
export function calculateClaimScore(
  scoreNodeId: ScoreNodeId,
  graph: ScoreGraph,
  impacts: Impact[],
): Score {
  const node = graph.nodes[scoreNodeId];

  if (!node) {
    throw new Error(`Missing score node: ${scoreNodeId}`);
  }

  const value = calculateScoreValue(
    impacts,
    (graph.childrenByParentId?.[scoreNodeId]?.length ?? 0) === 0
      ? node.defaultScore
      : undefined,
    node.reversible,
  );

  return {
    scoreNodeId,
    claimId: node.claimId,
    directedValue: value.directedValue,
    originalValue: value.originalValue,
    reversed: value.reversed,
    value: value.value,
    weightedSum: value.weightedSum,
    totalWeight: value.totalWeight,
  };
}
