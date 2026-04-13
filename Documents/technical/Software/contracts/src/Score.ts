// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";
import type { ClaimId } from "./Claim.ts";
import type { ConnectorId } from "./Connector.ts";

export type ScoreId = string & { readonly __brand: "ScoreId" };

/**
 * A Score is the calculated state for one displayed location of a Claim in the graph.
 *
 * A single Claim may appear in more than one displayed location, so Claim data is shared,
 * but each displayed location has its own Score.
 *
 * This type stores the score values and the display-structure data that belong to that
 * one displayed location. Lookup shapes in the opposite direction should be derived
 * from indexes rather than stored here as another source of truth.
 */
export interface Score {

    id: ScoreId

    /** The Claim shown by this displayed location. */
    claimId: ClaimId

    /**
     * The connector that places this displayed location into the graph.
     *
     * Root or detached scores may omit this.
     */
    connectorId?: ConnectorId

    /**
     * The ordered scores feeding into this displayed location.
     *
     * This is the single stored owner of incoming display order for this Score.
     * Reverse lookup structures should be built as derived indexes rather than
     * duplicated in stored contract data.
     */
    incomingScoreIds: ScoreId[]

    /** How confident we should be in this displayed Claim. Ranges from 0 to 1. */
    confidence: number

    /** How confident we should be in this displayed Claim. Ranges from -1 to 1. */
    reversibleConfidence: number

    /**
     * How relevant this displayed Claim is to the Claim it feeds into.
     * Ranges from 0 to infinity.
     *
     * This is a multiplier set by the child links that affect relevance.
     */
    relevance: number

    /**
     * The scale of the Scores feeding into this Score as a fraction.
     * Ranges from 1 to 0.
     */
    scaleOfSources: number
}

export type ScoreCreate = Partial<Score> & Pick<Score, "claimId">;

/** Populates defaults */
export function newScore<T extends ScoreCreate>(partialItem: T): T & Score {
    const newItem = {
        ...partialItem,
        id: partialItem.id ?? (newId() as ScoreId),
        incomingScoreIds: partialItem.incomingScoreIds ?? [],
        relevance: partialItem.relevance ?? 1,
        confidence: partialItem.confidence ?? 1,
        reversibleConfidence: partialItem.reversibleConfidence ?? 1,
        scaleOfSources: partialItem.scaleOfSources ?? 0,
    } satisfies Score;
    return newItem as T & Score
}
