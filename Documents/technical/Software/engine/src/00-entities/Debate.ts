// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score, ScoreId } from "./Score.ts";

export interface Debate {
	id: DebateId
	description: string
	name: string
	mainClaimId: ClaimId
	claims: Record<ClaimId, Claim>
	connectors: Record<ConnectorId, Connector>
	scores: Record<ScoreId, Score>
}

export type DebateId = string & { readonly __brand: "DebateId" };
