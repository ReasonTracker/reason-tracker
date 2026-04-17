// See 📌README.md in this folder for local coding standards before editing this file.
import type { ClaimId, ClaimSide } from "./Claim.ts";

export interface Connector {
	id: ConnectorId
	target: ClaimId
	source: ClaimId
	affects: Affects
}

export type ConnectorCreate = Partial<Connector> & Pick<Connector, "target" | "source">;

export type ConnectorId = string & { readonly __brand: "ConnectorIdV2" };
export type TargetRelation = "proTarget" | "conTarget";
export type Affects = "confidence" | "relevance";