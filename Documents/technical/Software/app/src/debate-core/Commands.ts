// See 📌README.md in this folder for local coding standards before editing this file.

import { PatchWithRequiredId } from "../utils.ts";
import type { ClaimCreate, ClaimPatch, ClaimId } from "./Claim.ts";
import type {
	ConfidenceConnectorCreate,
	ConfidenceConnectorId,
	RelevanceConnectorCreate,
	RelevanceConnectorId,
} from "./Connector.ts";
import type { DebateBase } from "./Debate.ts";

type CreateDebateInput = Omit<DebateBase, "mainClaimId">;
export type DebateMetadataPatch = PatchWithRequiredId<Pick<DebateBase, "id" | "name" | "description">>;

type AddClaimCommandBase<TConnector extends ConfidenceConnectorCreate | RelevanceConnectorCreate> = {
	claim: ClaimCreate
	connector: Omit<TConnector, "source">
};

export type ConnectClaimCommand =
	| ConnectClaimWithConfidenceCommand
	| ConnectClaimWithRelevanceCommand;

export type DisconnectConnectionCommand =
	| DisconnectConfidenceCommand
	| DisconnectRelevanceCommand;

// #region Command union
export type DebateCommand =
	| CreateDebateCommand
	| AddClaimCommand
	| UpdateClaimCommand
	| DeleteClaimCommand
	| ConnectClaimCommand
	| DisconnectConnectionCommand
	| UpdateDebateCommand
// #endregion


// #region Claim commands
export type AddClaimCommand =
	| AddConfidenceClaimCommand
	| AddRelevanceClaimCommand;

export interface AddConfidenceClaimCommand extends AddClaimCommandBase<ConfidenceConnectorCreate> {
	type: "confidence/claim/add"
}

export interface AddRelevanceClaimCommand extends AddClaimCommandBase<RelevanceConnectorCreate> {
	type: "relevance/claim/add"
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
export interface ConnectClaimWithConfidenceCommand {
	type: "confidence/connect"
	connector: ConfidenceConnectorCreate
}

export interface ConnectClaimWithRelevanceCommand {
	type: "relevance/connect"
	connector: RelevanceConnectorCreate
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
}

export interface UpdateDebateCommand {
	type: "debate/update"
	patch: DebateMetadataPatch
}

// #endregion
