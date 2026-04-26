// See 📌README.md in this folder for local coding standards before editing this file.


import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { PatchWithRequiredId } from "../utils.ts";

export type DebateId = string & { readonly __brand: "DebateId" };

export type DebateCore = {
	id: DebateId
	description: string
	name: string
	mainClaimId: ClaimId
}

export type DebateDetails = {
	claims: Record<ClaimId, Claim>
	connectors: Record<ConnectorId, Connector>
}

export type Debate = DebateCore & DebateDetails

// For patch/update, allow partial except id
export type DebatePatch = PatchWithRequiredId<Debate>;
