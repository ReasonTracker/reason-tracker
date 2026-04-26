// See 📌README.md in this folder for local coding standards before editing this file.
import type { ClaimId } from "./Claim.ts";
import type { PatchWithRequiredId } from "../utils.ts";

interface BaseConnector<TConnectorId extends ConnectorId> {
	id: TConnectorId
	source: ClaimId
	targetRelationship: TargetRelation
}

type CreateWithOptionalId<T extends { id: unknown }> = Omit<T, "id"> & { id?: T["id"] };

export type Connector = ConfidenceConnector | RelevanceConnector;

export interface ConfidenceConnector extends BaseConnector<ConfidenceConnectorId> {
	type: "confidence"
	targetClaimId: ClaimId
}

export interface RelevanceConnector extends BaseConnector<RelevanceConnectorId> {
	type: "relevance"
	targetConfidenceConnectorId: ConfidenceConnectorId
}

// For creation, require the connector shape except for the optional id.
export type ConfidenceConnectorCreate = CreateWithOptionalId<ConfidenceConnector>;
export type RelevanceConnectorCreate = CreateWithOptionalId<RelevanceConnector>;
export type ConnectorCreate = ConfidenceConnectorCreate | RelevanceConnectorCreate;

// For patch/update, allow partial except id
export type ConnectorPatch = PatchWithRequiredId<Connector>;

export type ConnectorId = string & { readonly __brand: "ConnectorId" };
export type ConfidenceConnectorId = ConnectorId & { readonly __connectorType: "confidence" };
export type RelevanceConnectorId = ConnectorId & { readonly __connectorType: "relevance" };
export type TargetRelation = "proTarget" | "conTarget";
