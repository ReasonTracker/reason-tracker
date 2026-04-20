// See 📌README.md in this folder for local coding standards before editing this file.

export interface Claim {
	id: ClaimId
	content: string

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

export type ClaimId = string & { readonly __brand: "ClaimIdV2" };
export type Side = "proMain" | "conMain";

