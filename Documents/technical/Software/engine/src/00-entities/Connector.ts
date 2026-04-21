// See 📌README.md in this folder for local coding standards before editing this file.
import type { ClaimId } from "./Claim.ts";

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

export type ConnectorCreate =
	| (Partial<ClaimToClaimConnector> & Pick<ClaimToClaimConnector, "source" | "type" | "targetClaimId">)
	| (Partial<ClaimToConnectorConnector> & Pick<ClaimToConnectorConnector, "source" | "type" | "targetConnectorId">);

export type ConnectorId = string & { readonly __brand: "ConnectorId" };
export type TargetRelation = "proTarget" | "conTarget";
export type Affects = "confidence" | "relevance";