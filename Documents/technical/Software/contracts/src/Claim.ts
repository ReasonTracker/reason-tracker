// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";

export type ClaimId = string & { readonly __brand: "ClaimId" };
export type ClaimSide = "proMain" | "conMain";

/**
 * A claim is a statement about reality we are learning about hoe confident we should be about.
 * It is usually not a statement someone has made at a point in time but is instead a claim about reality.
 */
export interface Claim{
    
    id: ClaimId,

    /** the clearest description of the claim. As markdown.   */
    content: string

    /** The side of the claim relative to the main claim. */
    side: ClaimSide

    /** Used to set the confidence in the claim instead of being calculated. Only works if there are no children*/
    forceConfidence?: number
}

export type ProtoClaim = Partial<Claim>;

/** Populates defaults */
export function newClaim<T extends ProtoClaim = ProtoClaim>(partialItem: T = {} as T): T & Claim {
    const newItem = {
        ...partialItem,
        content: partialItem.content ?? "",
        id: partialItem.id ?? (newId() as ClaimId),
        side: partialItem.side ?? "proMain",
    } satisfies Claim;
    return newItem as T & Claim
}


