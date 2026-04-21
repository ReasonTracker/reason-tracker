// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim, ClaimId } from "./00-entities/Claim.ts";
import type {
	ClaimToClaimConnector,
	ClaimToConnectorConnector,
	ConnectorCreate,
	ConnectorId,
} from "./00-entities/Connector.ts";
import type { DebateCore, Debate } from "./00-entities/Debate.ts";

export type PartialExceptId<T extends { id: unknown }> = Partial<Omit<T, "id">> & { id?: T["id"] };

// #region Command union
export type EngineCommand =
	| CreateDebateCommand
	| AddClaimCommand
	| UpdateClaimCommand
	| DeleteClaimCommand
	| CreateConnectorCommand
	| DeleteConnectorCommand
	| UpdateDebateCommand
// #endregion

// #region Claim commands
export type AddClaimCommand<TClaimId extends ClaimId = ClaimId> =
	| {
		type: "claim/add"
		// Caller provided an id for the new claim.
		claim: Claim & { id: TClaimId }
		// If a connector is provided and it includes an id, its `source` MUST be the same id type.
		connector?: Omit<ConnectorCreate, "id" | "source"> & (
			| {
				id?: never
				source?: never
			}
			| {
				id?: ConnectorId
				source: TClaimId
			}
		)
	}
	| {
		type: "claim/add"
		// Caller did NOT provide an id; one will be created.
		claim: Omit<Claim, "id">
		// Connector must not include a source (it will be filled in by the translator).
		connector?: Omit<ConnectorCreate, "id" | "source">
	};

export interface UpdateClaimCommand {
	type: "claim/update"
	patch: PartialExceptId<Claim>
}

export interface DeleteClaimCommand {
	type: "claim/delete"
	claimId: ClaimId
}
// #endregion

// #region Connector commands
export interface CreateConnectorCommand {
	type: "connector/create"
	connector: PartialExceptId<ClaimToClaimConnector> | PartialExceptId<ClaimToConnectorConnector>
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
		debate: DebateCore
		mainClaim?: never
	}
	| {
		type: "debate/create"
		debate: DebateCore
		mainClaim: Claim & { id: TClaimId }
	};

export interface UpdateDebateCommand {
	type: "debate/update"
	patch: DebateCore
}

// #endregion