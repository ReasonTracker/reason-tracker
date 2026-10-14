import type { Impact } from "./scoreTypes.ts";
import { UNCHALLENGED_CLAIM_SCORE } from "./scoringAxioms.ts";

export type ScoreValue = {
  directedValue: number;
  originalValue: number;
  reversed: boolean;
  value: number;
  weightedSum: number;
  totalWeight: number;
};

/**
 * Combines child impacts into one score value.
 *
 * With no score-affecting children, the claim remains fully standing.
 * Non-reversible claims clamp negative standing to 0. Reversible claims retain
 * the magnitude while exposing their direction through `directedValue`.
 */
export function calculateScoreValue(
  impacts: Impact[],
  defaultScore = UNCHALLENGED_CLAIM_SCORE,
  reversible = false,
): ScoreValue {
  if (!Number.isFinite(defaultScore)) {
    throw new Error(`Default claim score must be finite: ${defaultScore}`);
  }

  if (impacts.length === 0) {
    return resolveScoreValue(defaultScore, 0, 0, reversible);
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const impact of impacts) {
    weightedSum += impact.value * impact.weight;
    totalWeight += impact.weight;
  }

  const originalValue = totalWeight === 0 ? 0 : weightedSum / totalWeight;

  return resolveScoreValue(originalValue, weightedSum, totalWeight, reversible);
}

function resolveScoreValue(
  originalValue: number,
  weightedSum: number,
  totalWeight: number,
  reversible: boolean,
): ScoreValue {
  const reversed = reversible && originalValue < 0;
  const value = reversible ? Math.abs(originalValue) : Math.max(0, originalValue);

  return {
    directedValue: reversible ? originalValue : value,
    originalValue,
    reversed,
    value,
    weightedSum,
    totalWeight,
  };
}
