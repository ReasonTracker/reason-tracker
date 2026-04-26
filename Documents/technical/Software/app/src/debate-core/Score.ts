// See 📌README.md in this folder for local coding standards before editing this file.


import type { ClaimId } from "./Claim.ts";
import type { ConnectorId } from "./Connector.ts";
import type { PatchWithRequiredId } from "../utils.ts";


export interface claimScores {
	id: ScoreId
	claimConfidence: number
	reversibleClaimConfidence: number
	claimSide: Side
}

export interface connectorScores {
	id: ScoreId
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
	deliveryScaleOfSources: number
};

export type ScorePatch = PatchWithRequiredId<Omit<Score, "incomingScoreIds" | "scaleOfSources" | "deliveryScaleOfSources"> & {
	incomingScoreIds?: never
	scaleOfSources?: never
	deliveryScaleOfSources?: never
}>;

export interface ScoreIncomingPatch {
	id: ScoreId
	incomingScoreIds: ScoreId[]
}

export interface ScoreScalePatch {
	id: ScoreId
	scaleOfSources: number
	deliveryScaleOfSources: number
}

export type ScoreId = string & { readonly __brand: "ScoreId" };
export type Side = "proMain" | "conMain";

