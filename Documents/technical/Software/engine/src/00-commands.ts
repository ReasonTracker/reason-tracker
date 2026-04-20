// See 📌README.md in this folder for local coding standards before editing this file.

import type { ClaimId, Side } from "./00-entities/Claim.ts";
import type { ConnectorId } from "./00-entities/Connector.ts";
import type { DebateId } from "./00-entities/Debate.ts";

// #region Command union
export type EngineCommand =
	| AddClaimCommand
	| UpdateClaimCommand
	| DeleteClaimCommand
	| ConnectClaimToClaimCommand
	| ConnectClaimToConnectorCommand
	| DeleteConnectorCommand
	| UpdateDebateCommand
	| SetMainClaimCommand;
// #endregion

// #region Claim commands
export interface AddClaimCommand {
	type: "claim/add"
	claimId: ClaimId
	content: string
	side?: Side
	forceConfidence?: number
	connectToClaimId?: ClaimId
	connectorId?: ConnectorId
}

export interface UpdateClaimCommand {
	type: "claim/update"
	claimId: ClaimId
	patch: {
		content?: string
		side?: Side
		forceConfidence?: number | null
	}
}

export interface DeleteClaimCommand {
	type: "claim/delete"
	claimId: ClaimId
}
// #endregion

// #region Connector commands
export interface ConnectClaimToClaimCommand {
	type: "claims/connect-to-claim"
	connectorId?: ConnectorId
	sourceClaimId: ClaimId
	targetClaimId: ClaimId
}

export interface ConnectClaimToConnectorCommand {
	type: "claims/connect-to-connector"
	connectorId?: ConnectorId
	sourceClaimId: ClaimId
	targetConnectorId: ConnectorId
}

export interface DeleteConnectorCommand {
	type: "connector/delete"
	connectorId: ConnectorId
}
// #endregion

// #region Debate commands
export interface UpdateDebateCommand {
	type: "debate/update"
	debateId: DebateId
	patch: {
		name?: string
		description?: string
	}
}

export interface SetMainClaimCommand {
	type: "debate/set-main-claim"
	debateId: DebateId
	claimId: ClaimId
}
// #endregion