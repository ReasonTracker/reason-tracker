// See 📌README.md in this folder for local coding standards before editing this file.

import type { ClaimCreate, ClaimPatch, ClaimId } from "./00-entities/Claim.ts";
import type { ConnectorId, TargetRelation } from "./00-entities/Connector.ts";
import type { DebateCore } from "./00-entities/Debate.ts";
import type { ScoreId } from "./00-entities/Score.ts";

export type PartialExceptId<T extends { id: unknown }> = Partial<Omit<T, "id">> & { id?: T["id"] };
export type PatchWithRequiredId<T extends { id: unknown }> = Partial<Omit<T, "id">> & { id: T["id"] };

type CreateDebateInput = Omit<DebateCore, "mainClaimId">;
export type DebateMetadataPatch = PatchWithRequiredId<Pick<DebateCore, "id" | "name" | "description">>;

type ConnectionInputBase<TConnectorId extends ConnectorId = ConnectorId> = {
	id?: TConnectorId
	scoreId?: ScoreId
	targetRelationship: TargetRelation
};

export type ClaimToScoreConnectionInput<TConnectorId extends ConnectorId = ConnectorId> =
	| ({ type: "claim-to-claim" } & ConnectionInputBase<TConnectorId>)
	| ({ type: "claim-to-connector" } & ConnectionInputBase<TConnectorId>);

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
export interface AddClaimCommand {
	type: "claim/add"
	claim: ClaimCreate
	targetScoreId: ScoreId
	connector: ClaimToScoreConnectionInput
}

export interface UpdateClaimCommand {
	type: "claim/update"
	patch: ClaimPatch
}

export interface DeleteClaimCommand {
	type: "claim/delete"
	claimId: ClaimId
}
// #endregion

// #region Connector commands
export interface CreateConnectorCommand {
	type: "connector/create"
	sourceClaimId: ClaimId
	targetScoreId: ScoreId
	connector: ClaimToScoreConnectionInput
}

export interface DeleteConnectorCommand {
	type: "connector/delete"
	connectorId: ConnectorId
}
// #endregion

// #region Debate commands
export interface CreateDebateCommand {
	type: "debate/create"
	debate: CreateDebateInput
	mainClaim: ClaimCreate
	mainScoreId?: ScoreId
}

export interface UpdateDebateCommand {
	type: "debate/update"
	patch: DebateMetadataPatch
}

// #endregion