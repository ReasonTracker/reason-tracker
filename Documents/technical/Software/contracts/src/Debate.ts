// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";
import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score, ScoreId } from "./Score.ts";

export type DebateId = string & { readonly __brand: "DebateId" };

/**
 * A Debate is a group of claims and connectors where:
 * - All claims are connected to at least one other claim (except possibly scratch-pad claims)
 * - There is only one main claim
 */
export interface Debate {

    id: DebateId

    /** A general description of the debate. As markdown. */
    description: string

    /** a short name for the debate. Often similar to the main claim. As markdown. */
    name: string

    /** the id of the main claim the debate is about. */
    mainClaimId: ClaimId

    /** The source data for nodes of the graph but not actually what is displayed. */
    claims: Record<ClaimId, Claim>

    /** The source data for connectors of the graph but not actually what is displayed. */
    connectors: Record<ConnectorId, Connector>

    /** The calculated scores for each displayed score location in the debate.
     * This includes the calculations and the connection between the displayed nodes of the graph.
     * And some display information */
    scores: Record<ScoreId, Score>

}

export type ProtoDebate = Partial<Debate> & Pick<Debate, "mainClaimId">;

/** Populates defaults */
export function newDebate<T extends ProtoDebate>(partialItem: T): T & Debate {
    const newItem = {
        ...partialItem,
        name: partialItem.name ?? "",
        description: partialItem.description ?? "",
        id: partialItem.id ?? (newId() as DebateId),
        claims: partialItem.claims ?? {},
        connectors: partialItem.connectors ?? {},
        scores: partialItem.scores ?? {},
    } satisfies Debate;
    return newItem as T & Debate
}