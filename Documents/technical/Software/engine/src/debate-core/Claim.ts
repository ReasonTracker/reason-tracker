import type { PatchWithRequiredId } from "../typeUtils.ts";
import type { CreateWithOptionalId } from "../typeUtils.ts";

export interface Claim {
	id: ClaimId
	content: string
	reversible?: boolean
	reversedContent?: string

	/**
	 * This is an optional default confidence value for this specific claim 
	 * overriding the standard default of 1. This is usually used to lower it manually until claims can be added to it.
	 * Once a claim is added this score will no longer be used.
	 */
	defaultConfidence?: number

	/** This is an optional default relevance value for this specific claim 
	 * overriding the standard default of 1. This is usually used to lower it manually until claims can be added to it.
	 * Once a claim is added this score will no longer be used.
	 */
	defaultRelevance?: number
}

export type ClaimCreate = CreateWithOptionalId<Claim>;
export type ClaimPatch = PatchWithRequiredId<Claim>;

export type ClaimId = string & { readonly __brand: "ClaimId" };
