import { newId } from "./newId.ts";
import type { ClaimId } from "./Claim.ts";

export type ScoreId = string & { readonly __brand: "ScoreId" };

export interface Score {

    id: ScoreId

    /** the claim this score belongs to */
    claimId: ClaimId

    /** how confident we should be in the claim (how true) based on the child claims so far. Ranges from 0 to 1 */
    confidence: number

    /** how confident we should be in the claim (how true) based on the child claims so far. Ranges from -1 to 1 */
    reversibleConfidence: number

    /** How relevant this claim is to its parent claim. Ranges from 0 to infinity.
     * A multiplier set by all the child edges that affect 'relevance'. */
    relevance: number
}

export type ProtoScore = Partial<Score> & Pick<Score, "claimId">;

/** Populates defaults */
export function newScore<T extends ProtoScore>(partialItem: T): T & Score {
    const newItem = {
        ...partialItem,
        id: partialItem.id ?? (newId() as ScoreId),
        relevance: partialItem.relevance ?? 1,
        confidence: partialItem.confidence ?? 1,
        reversibleConfidence: partialItem.reversibleConfidence ?? 1,
    } satisfies Score;
    return newItem as T & Score
}
