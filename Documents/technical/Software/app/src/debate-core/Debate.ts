// See 📌README.md in this folder for local coding standards before editing this file.


import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { PatchWithRequiredId } from "../utils.ts";

export type DebateId = string & { readonly __brand: "DebateId" };

export type DebateBase = {
	id: DebateId
	description: string
	name: string
	mainClaimId: ClaimId
}

export type DebateDetails = {
	claims: Record<ClaimId, Claim>
	connectors: Record<ConnectorId, Connector>
}

export type DebateCore = DebateBase & DebateDetails

// For patch/update, allow partial except id
export type DebatePatch = PatchWithRequiredId<DebateCore>;
