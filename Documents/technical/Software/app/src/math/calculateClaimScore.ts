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

  const value = calculateScoreValue(impacts);

  return {
    scoreNodeId,
    claimId: node.claimId,
    value: value.value,
    rawValue: value.rawValue,
    weightedSum: value.weightedSum,
    totalWeight: value.totalWeight,
  };
}
