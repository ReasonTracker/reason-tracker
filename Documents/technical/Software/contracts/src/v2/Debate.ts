// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";
import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score, ScoreId } from "./Score.ts";

export type DebateId = string & { readonly __brand: "DebateIdV2" };

export interface Debate {
	id: DebateId
	description: string
	name: string
	mainClaimId: ClaimId
	claims: Record<ClaimId, Claim>
	connectors: Record<ConnectorId, Connector>
	scores: Record<ScoreId, Score>
}

export type DebateCreate = Partial<Debate> & Pick<Debate, "mainClaimId">;

export function newDebate<T extends DebateCreate>(partialItem: T): T & Debate {
	const newItem = {
		...partialItem,
		name: partialItem.name ?? "",
		description: partialItem.description ?? "",
		id: partialItem.id ?? (newId() as DebateId),
		claims: partialItem.claims ?? {},
		connectors: partialItem.connectors ?? {},
		scores: partialItem.scores ?? {},
	} satisfies Debate;

	return newItem as T & Debate;
}
