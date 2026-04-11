import { newId } from "./newId.ts";
import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score } from "./Score.ts";

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

    claims: Record<ClaimId, Claim>
    connectors: Record<ConnectorId, Connector>
}

export type CalculatedDebate = Debate & {
    scores: Record<ClaimId, Score>
};

export type ProtoDebate = Partial<Debate> & Pick<Debate, 'mainClaimId'>;

/** Populates defaults */
export function newDebate<T extends ProtoDebate>(partialItem: T): T & Debate {
    const newItem = {
        ...partialItem,
        name: partialItem.name ?? "",
        description: partialItem.description ?? "",
        id: partialItem.id ?? (newId() as DebateId),
        claims: partialItem.claims ?? {},
        connectors: partialItem.connectors ?? {},
    } satisfies Debate;
    return newItem as T & Debate
}

export function isCalculated(item: Debate | CalculatedDebate): item is CalculatedDebate {
    return "scores" in item && item.scores !== undefined
}
