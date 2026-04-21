// See 📌README.md in this folder for local coding standards before editing this file.


import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score, ScoreId } from "./Score.ts";
import { PartialExceptId } from "../01--Commands.ts";

export type DebateId = string & { readonly __brand: "DebateId" };

export type DebateCore = {
	id: DebateId
	description: string
	name: string
}

export type DebateDetails = {
	claims: Record<ClaimId, Claim>
	connectors: Record<ConnectorId, Connector>
	scores: Record<ScoreId, Score>
}

export type Debate = DebateCore & DebateDetails

// For patch/update, allow partial except id
export type DebatePatch = PartialExceptId<Debate>;
