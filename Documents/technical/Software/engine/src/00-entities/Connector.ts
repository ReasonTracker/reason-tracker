// See 📌README.md in this folder for local coding standards before editing this file.
import type { ClaimId } from "./Claim.ts";
import { PartialExceptId } from "../00-commands.ts";

interface BaseConnector {
	id: ConnectorId
	source: ClaimId
	affects: Affects
}

export type Connector = ClaimToClaimConnector | ClaimToConnectorConnector;

export interface ClaimToClaimConnector extends BaseConnector {
	type: "claim-to-claim"
	targetClaimId: ClaimId
}

export interface ClaimToConnectorConnector extends BaseConnector {
	type: "claim-to-connector"
	targetConnectorId: ConnectorId
}

// For creation, allow all fields except id to be partial, but require type and target/source as appropriate
export type ConnectorCreate =
	| (Omit<ClaimToClaimConnector, "id"> | PartialExceptId<ClaimToClaimConnector>)
	| (Omit<ClaimToConnectorConnector, "id"> | PartialExceptId<ClaimToConnectorConnector>);

// For patch/update, allow partial except id
export type ConnectorPatch = PartialExceptId<Connector>;

export type ConnectorId = string & { readonly __brand: "ConnectorId" };
export type TargetRelation = "proTarget" | "conTarget";
export type Affects = "confidence" | "relevance";