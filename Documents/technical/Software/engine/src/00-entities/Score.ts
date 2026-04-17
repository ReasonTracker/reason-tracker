// See 📌README.md in this folder for local coding standards before editing this file.

import type { ClaimId } from "./Claim.ts";
import type { ConnectorId } from "./Connector.ts";

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

export type ScoreId = string & { readonly __brand: "ScoreIdV2" };

