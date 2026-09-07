import type { ClaimId } from "@debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "@debate-core/Connector.ts";
import type { DebateCore } from "@debate-core/Debate.ts";

export const mainClaimId = "claim-main" as ClaimId;
export const c1ClaimId = "claim-c1" as ClaimId;
export const c2ClaimId = "claim-c2" as ClaimId;
export const mainSupportConfidenceConnectorId = "confidence-main-support" as ConfidenceConnectorId;
export const c2ConfidenceConnectorId = "confidence-main-c2" as ConfidenceConnectorId;

export const episode0001OpeningDebateCore: DebateCore = {
	id: "debate-1" as DebateCore["id"],
	description: "Episode 0001 debate scenario.",
	name: "Episode 0001 Debate",
	mainClaimId,
	claims: {
		[mainClaimId]: {
			id: mainClaimId,
			content: "Main claim",
		},
		[c1ClaimId]: {
			id: c1ClaimId,
			content: "C1",
		},
	},
	connectors: {
		[mainSupportConfidenceConnectorId]: {
			id: mainSupportConfidenceConnectorId,
			type: "confidence",
			source: c1ClaimId,
			targetClaimId: mainClaimId,
			targetRelationship: "proTarget",
		},
	},
};