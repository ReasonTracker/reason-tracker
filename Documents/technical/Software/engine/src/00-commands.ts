// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim, ClaimId } from "./00-entities/Claim.ts";
import type {
	ClaimToClaimConnector,
	ClaimToConnectorConnector,
	ConnectorCreate,
	ConnectorId,
} from "./00-entities/Connector.ts";
import type { Debate } from "./00-entities/Debate.ts";

// #region Command union
export type EngineCommand =
	| CreateDebateCommand
	| AddClaimCommand
	| UpdateClaimCommand
	| DeleteClaimCommand
	| ConnectClaimToClaimCommand
	| ConnectClaimToConnectorCommand
	| DeleteConnectorCommand
	| UpdateDebateCommand
// #endregion

// #region Claim commands
export type AddClaimCommand<TClaimId extends ClaimId = ClaimId> = {
	type: "claim/add"
	claim: Claim & { id: TClaimId }
	connector?: Omit<ConnectorCreate, "id" | "source"> & (
		| {
			id?: undefined
			source?: undefined
		}
		| {
			id?: ConnectorId
			source: TClaimId
		}
	)
};

export interface UpdateClaimCommand {
	type: "claim/update"
	patch: Partial<Omit<Claim, "id">>
}

export interface DeleteClaimCommand {
	type: "claim/delete"
	claimId: ClaimId
}
// #endregion

// #region Connector commands
export interface ConnectClaimToClaimCommand {
	type: "claims/connect-to-claim"
	connector: Omit<ClaimToClaimConnector, "id"> & { id?: ConnectorId }
}

export interface ConnectClaimToConnectorCommand {
	type: "claims/connect-to-connector"
	connector: Omit<ClaimToConnectorConnector, "id"> & { id?: ConnectorId }
}

export interface DeleteConnectorCommand {
	type: "connector/delete"
	connectorId: ConnectorId
}
// #endregion

// #region Debate commands
export type CreateDebateCommand<TClaimId extends ClaimId = ClaimId> =
	| {
		type: "debate/create"
		debate: Omit<Debate, "claims" | "connectors" | "scores" | "mainClaimId"> & {
			mainClaimId?: undefined
		}
		mainClaim?: undefined
	}
	| {
		type: "debate/create"
		debate: Omit<Debate, "claims" | "connectors" | "scores" | "mainClaimId"> & {
			mainClaimId: TClaimId
		}
		mainClaim: Claim & { id: TClaimId }
	};

export interface UpdateDebateCommand {
	type: "debate/update"
	patch: Partial<Omit<Debate, "id" | "claims" | "connectors" | "scores">>
}

// #endregion