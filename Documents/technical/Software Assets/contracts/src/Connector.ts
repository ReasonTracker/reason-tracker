import { newId } from "./newId";

export type ConnectorId = string & { readonly __brand: "ConnectorId" };

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

    /** indicates if the source claim is attacking (pro:false) or supporting (pro:true) */
    proTarget: boolean

    /** indicates if the source claim is affecting the target claim's confidence or relevance */
    affects: Affects
}

export type ProtoConnector = Partial<Connector> & Pick<Connector, 'target' | 'source'>;

/** Populates defaults */
export function newConnector<T extends ProtoConnector>(partialItem: T): T & Connector {
    const newItem = {
        ...partialItem,
        id: partialItem.id ?? (newId() as ConnectorId),
        proTarget: partialItem.proTarget ?? true,
        affects: partialItem.affects ?? "confidence",
    } satisfies Connector;
    return newItem as T & Connector
}

export type Affects =
    "confidence" |
    "relevance";

