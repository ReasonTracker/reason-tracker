import type { AddConfidenceClaimCommand } from "@debate-core/Commands.ts";
import type { ClaimId } from "@debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "@debate-core/Connector.ts";
import { applyConfidenceClaimAddCommand } from "@planner/applyDebateCommand.ts";
import { planner } from "@planner/planner.ts";
import { c1ClaimId, episode0002DebateCore } from "./scenario";

const c7ClaimId = "episode-0002-claim-c7" as ClaimId;
const c7ConfidenceConnectorId = "episode-0002-confidence-c1-c7" as ConfidenceConnectorId;

export const episode0002AddClaimCommand: AddConfidenceClaimCommand = {
	claim: {
		content: "C7",
		id: c7ClaimId,
	},
	connector: {
		id: c7ConfidenceConnectorId,
		targetClaimId: c1ClaimId,
		targetRelationship: "conTarget",
		type: "confidence",
	},
	type: "confidence/claim/add",
};

export const episode0002AnimationPlan = planner({
	command: episode0002AddClaimCommand,
	debateCore: episode0002DebateCore,
});

export const episode0002ResolvedDebateCore = applyConfidenceClaimAddCommand({
	command: episode0002AddClaimCommand,
	debateCore: episode0002DebateCore,
}).debateCore;