/**
 * A claim starts fully standing.
 *
 * This does not mean the claim is proven.
 * It means no entered attack has successfully reduced it.
 */
export const UNCHALLENGED_CLAIM_SCORE = 1;

/**
 * Relevance is a multiplier.
 *
 * 1 means normal impact.
 * Above 1 increases impact.
 * Below 1 decreases impact.
 */
export const NEUTRAL_RELEVANCE = 1;

/**
 * Direction of a child claim's effect on its parent.
 */
export const PRO_PARENT_SIGN = 1;
export const CON_PARENT_SIGN = -1;

export type ParentImpactSign =
	| typeof PRO_PARENT_SIGN
	| typeof CON_PARENT_SIGN;
