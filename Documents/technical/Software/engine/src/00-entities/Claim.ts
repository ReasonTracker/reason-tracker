/**
 * CHANGE-GUARD
 * Explicit approval required before changing this area.
 * Reason: core engine entity contract.
 */
// See 📌README.md in this folder for local coding standards before editing this file.

export interface Claim {
	id: ClaimId
	content: string
	side: ClaimSide
	forceConfidence?: number
}

export type ClaimId = string & { readonly __brand: "ClaimIdV2" };
export type ClaimSide = "proMain" | "conMain";

