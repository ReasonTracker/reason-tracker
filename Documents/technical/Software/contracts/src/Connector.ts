// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";
import type { ClaimSide } from "./Claim.ts";

export type ConnectorId = string & { readonly __brand: "ConnectorId" };
export type TargetRelation = "proTarget" | "conTarget";

/**
 * A connector establishes a relationship between two distinct claims (target and source).
 * A source claim can either attack or support the confidence or relevance of a target claim.
 * A connector can only appear in one graph and only once in that graph.
 */
export interface Connector {
    
    id: ConnectorId

    /** the id of the claim that is being attacked or supported. */
    target: string

    /** the id of the claim that is doing the attacking or supporting of the target claim. */
    source: string

    /** indicates if the source claim is affecting the target claim's confidence or relevance */
    affects: Affects
}

export type ProtoConnector = Partial<Connector> & Pick<Connector, 'target' | 'source'>;

/** Populates defaults */
export function newConnector<T extends ProtoConnector>(partialItem: T): T & Connector {
    const newItem = {
        ...partialItem,
        id: partialItem.id ?? (newId() as ConnectorId),
        affects: partialItem.affects ?? "confidence",
    } satisfies Connector;
    return newItem as T & Connector
}

export function deriveTargetRelation(sourceSide: ClaimSide, targetSide: ClaimSide): TargetRelation {
    return sourceSide === targetSide ? "proTarget" : "conTarget";
}

export type Affects =
    "confidence" |
    "relevance";

