import type { Impact, Score, ScoreNode } from "./scoreTypes.js";
import { CON_PARENT_SIGN, PRO_PARENT_SIGN } from "./scoringAxioms.js";

/**
 * Converts one scored child into the value it contributes to its parent.
 *
 * The child score says how much the child itself stands.
 * proParent says whether that standing helps or attacks the parent.
 * relevance says how strongly this child should matter to the parent.
 */
export function calculateChildImpact(
  child: ScoreNode,
  childScore: Score,
  relevance: number,
): Impact {
  if (child.proParent === undefined) {
    throw new Error(`Score child is missing proParent: ${child.id}`);
  }

  let value = childScore.value;

  /**
   * A non-reversible child cannot pass negative standing upward.
   *
   * This prevents a defeated attack from becoming support for the thing
   * it originally attacked.
   */
  if (!child.reversible && value < 0) {
    value = 0;
  }

  const sign = child.proParent ? PRO_PARENT_SIGN : CON_PARENT_SIGN;
  const signedValue = value * sign;

  return {
    scoreNodeId: child.id,
    claimId: child.claimId,
    value: signedValue,
    weight: relevance * Math.abs(signedValue),
    relevance,
  };
}
