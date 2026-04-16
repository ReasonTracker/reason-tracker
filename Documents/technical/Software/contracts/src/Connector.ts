// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";
import type { ClaimId, ClaimSide } from "./Claim.ts";

export type ConnectorId = string & { readonly __brand: "ConnectorIdV2" };
export type TargetRelation = "proTarget" | "conTarget";
export type Affects = "confidence" | "relevance";

export interface Connector {
	id: ConnectorId
	target: ClaimId
	source: ClaimId
	affects: Affects
}

export type ConnectorCreate = Partial<Connector> & Pick<Connector, "target" | "source">;

export function newConnector<T extends ConnectorCreate>(partialItem: T): T & Connector {
	const newItem = {
		...partialItem,
		id: partialItem.id ?? (newId() as ConnectorId),
		affects: partialItem.affects ?? "confidence",
	} satisfies Connector;

	return newItem as T & Connector;
}

export function deriveTargetRelation(sourceSide: ClaimSide, targetSide: ClaimSide): TargetRelation {
	return sourceSide === targetSide ? "proTarget" : "conTarget";
}
