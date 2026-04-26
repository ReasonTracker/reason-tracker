// See 📌README.md in this folder for local coding standards before editing this file.

import type { ClaimCreate, ClaimPatch, ClaimId } from "./Claim.ts";
import type {
	ConfidenceConnectorId,
	RelevanceConnectorId,
	TargetRelation,
} from "./Connector.ts";
import type { DebateCore } from "./Debate.ts";
import type { ScoreId } from "./Score.ts";

export type PartialExceptId<T extends { id: unknown }> = Partial<Omit<T, "id">> & { id?: T["id"] };
export type PatchWithRequiredId<T extends { id: unknown }> = Partial<Omit<T, "id">> & { id: T["id"] };

type CreateDebateInput = Omit<DebateCore, "mainClaimId">;
export type DebateMetadataPatch = PatchWithRequiredId<Pick<DebateCore, "id" | "name" | "description">>;

type ConnectionInputBase<TConnectorId extends ConfidenceConnectorId | RelevanceConnectorId> = {
	id?: TConnectorId
	scoreId?: ScoreId
	targetRelationship: TargetRelation
};

export type ConfidenceConnectionInput = {
	type: "confidence"
} & ConnectionInputBase<ConfidenceConnectorId>;

export type RelevanceConnectionInput = {
	type: "relevance"
} & ConnectionInputBase<RelevanceConnectorId>;

export type ClaimConnectionInput =
	| ConfidenceConnectionInput
	| RelevanceConnectionInput;

type ConnectClaimCommandBase<TConnection extends ClaimConnectionInput> = {
	sourceClaimId: ClaimId
	targetScoreId: ScoreId
	connection: TConnection
};

export type ConnectClaimCommand =
	| ConnectClaimWithConfidenceCommand
	| ConnectClaimWithRelevanceCommand;

export type DisconnectConnectionCommand =
	| DisconnectConfidenceCommand
	| DisconnectRelevanceCommand;

// #region Command union
export type EngineCommand =
	| CreateDebateCommand
	| AddClaimCommand
	| UpdateClaimCommand
	| DeleteClaimCommand
	| ConnectClaimCommand
	| DisconnectConnectionCommand
	| UpdateDebateCommand
// #endregion


// #region Claim commands
export interface AddClaimCommand {
	type: "claim/add"
	claim: ClaimCreate
	targetScoreId: ScoreId
	connection: ClaimConnectionInput
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

// #region Connection commands
export interface ConnectClaimWithConfidenceCommand extends ConnectClaimCommandBase<ConfidenceConnectionInput> {
	type: "confidence/connect"
}

export interface ConnectClaimWithRelevanceCommand extends ConnectClaimCommandBase<RelevanceConnectionInput> {
	type: "relevance/connect"
}

export interface DisconnectConfidenceCommand {
	type: "confidence/disconnect"
	confidenceConnectorId: ConfidenceConnectorId
}

export interface DisconnectRelevanceCommand {
	type: "relevance/disconnect"
	relevanceConnectorId: RelevanceConnectorId
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
