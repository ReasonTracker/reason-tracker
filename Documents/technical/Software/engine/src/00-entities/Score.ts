/**
 * CHANGE-GUARD
 * Explicit approval required before changing this area.
 * Reason: core engine entity contract.
 */
// See 📌README.md in this folder for local coding standards before editing this file.

import type { ClaimId, Side } from "./Claim.ts";
import type { ConnectorId } from "./Connector.ts";

export interface Score {
	id: ScoreId
	claimId: ClaimId
	claimSide: Side
	connectorSide: Side
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

