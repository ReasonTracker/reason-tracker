// See 📌README.md in this folder for local coding standards before editing this file.
import type { ClaimId } from "./Claim.ts";
import { PartialExceptId } from "../01-Commands.ts";

interface BaseConnector {
	id: ConnectorId
	source: ClaimId
	affects: Affects
	targetRelationship: TargetRelation
}

type CreateWithOptionalId<T extends { id: unknown }> = Omit<T, "id"> & { id?: T["id"] };

export type Connector = ClaimToClaimConnector | ClaimToConnectorConnector;

export interface ClaimToClaimConnector extends BaseConnector {
	type: "claim-to-claim"
	targetClaimId: ClaimId
}

export interface ClaimToConnectorConnector extends BaseConnector {
	type: "claim-to-connector"
	targetConnectorId: ConnectorId
}

// For creation, require the connector shape except for the optional id.
export type ConnectorCreate =
	| CreateWithOptionalId<ClaimToClaimConnector>
	| CreateWithOptionalId<ClaimToConnectorConnector>;

// For patch/update, allow partial except id
export type ConnectorPatch = PartialExceptId<Connector>;

export type ConnectorId = string & { readonly __brand: "ConnectorId" };
export type TargetRelation = "proTarget" | "conTarget";
export type Affects = "confidence" | "relevance";