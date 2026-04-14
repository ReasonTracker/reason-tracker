// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";

export type ClaimId = string & { readonly __brand: "ClaimIdV2" };
export type ClaimSide = "proMain" | "conMain";

export interface Claim {
	id: ClaimId
	content: string
	side: ClaimSide
	forceConfidence?: number
}

export type ClaimCreate = Partial<Claim>;

export function newClaim<T extends ClaimCreate = ClaimCreate>(partialItem: T = {} as T): T & Claim {
	const newItem = {
		...partialItem,
		content: partialItem.content ?? "",
		id: partialItem.id ?? (newId() as ClaimId),
		side: partialItem.side ?? "proMain",
	} satisfies Claim;

	return newItem as T & Claim;
}
