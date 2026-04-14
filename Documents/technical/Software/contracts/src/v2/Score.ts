// See 📌README.md in this folder for local coding standards before editing this file.

import { newId } from "./newId.ts";
import type { ClaimId } from "./Claim.ts";
import type { ConnectorId } from "./Connector.ts";

export type ScoreId = string & { readonly __brand: "ScoreIdV2" };

export interface Score {
	id: ScoreId
	claimId: ClaimId
	connectorId?: ConnectorId
	incomingScoreIds: ScoreId[]
	claimConfidence: number
	reversibleClaimConfidence: number
	connectorConfidence: number
	reversibleConnectorConfidence: number
	relevance: number
	scaleOfSources: number
}

export type ScoreCreate = Partial<Score> & Pick<Score, "claimId">;

export function newScore<T extends ScoreCreate>(partialItem: T): T & Score {
	const newItem = {
		...partialItem,
		id: partialItem.id ?? (newId() as ScoreId),
		incomingScoreIds: partialItem.incomingScoreIds ?? [],
		claimConfidence: partialItem.claimConfidence ?? 1,
		reversibleClaimConfidence: partialItem.reversibleClaimConfidence ?? 1,
		connectorConfidence: partialItem.connectorConfidence ?? 1,
		reversibleConnectorConfidence: partialItem.reversibleConnectorConfidence ?? 1,
		relevance: partialItem.relevance ?? 1,
		scaleOfSources: partialItem.scaleOfSources ?? 0,
	} satisfies Score;

	return newItem as T & Score;
}
