import type { Impact } from "./scoreTypes.ts";
import { UNCHALLENGED_CLAIM_SCORE } from "./scoringAxioms.ts";

export type ScoreValue = {
  value: number;
  rawValue: number;
  weightedSum: number;
  totalWeight: number;
};

/**
 * Combines child impacts into one score value.
 *
 * With no score-affecting children, the claim remains fully standing.
 * Negative raw values are reported but do not reduce standing below 0.
 */
export function calculateScoreValue(impacts: Impact[]): ScoreValue {
  if (impacts.length === 0) {
    return {
      value: UNCHALLENGED_CLAIM_SCORE,
      rawValue: UNCHALLENGED_CLAIM_SCORE,
      weightedSum: 0,
      totalWeight: 0,
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const impact of impacts) {
    weightedSum += impact.value * impact.weight;
    totalWeight += impact.weight;
  }

  const rawValue = totalWeight === 0 ? 0 : weightedSum / totalWeight;

  return {
    value: Math.max(0, rawValue),
    rawValue,
    weightedSum,
    totalWeight,
  };
}
