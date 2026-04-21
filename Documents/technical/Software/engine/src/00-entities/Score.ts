// See 📌README.md in this folder for local coding standards before editing this file.

import type { ClaimId, Side } from "./Claim.ts";
import type { ConnectorId } from "./Connector.ts";

export interface claimScores {
	claimConfidence: number
	reversibleClaimConfidence: number
	claimSide: Side
}

export interface connectorScores {
	connectorConfidence: number
	reversibleConnectorConfidence: number
	connectorSide: Side
}

export interface Score extends claimScores, connectorScores {
	id: ScoreId
	claimId: ClaimId
	connectorId?: ConnectorId
	incomingScoreIds: ScoreId[]
	relevance: number
	scaleOfSources: number
};

export type ScoreId = string & { readonly __brand: "ScoreId" };

