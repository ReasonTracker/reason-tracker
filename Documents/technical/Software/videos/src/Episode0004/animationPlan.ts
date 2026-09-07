import type { AddConfidenceClaimCommand } from "@debate-core/Commands.ts";
import type { ClaimId } from "@debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "@debate-core/Connector.ts";
import { applyConfidenceClaimAddCommand } from "@planner/applyDebateCommand.ts";
import { planner } from "@planner/planner.ts";
import { c1ClaimId, episode0002DebateCore } from "../Episode0002/scenario";

const episode0004ClaimId = "episode-0004-claim-c7" as ClaimId;
const episode0004ConfidenceConnectorId = "episode-0004-confidence-c1-c7" as ConfidenceConnectorId;

export const episode0004AddClaimCommand: AddConfidenceClaimCommand = {
	claim: {
		content: "C7",
		id: episode0004ClaimId,
	},
	connector: {
		id: episode0004ConfidenceConnectorId,
		targetClaimId: c1ClaimId,
		targetRelationship: "conTarget",
		type: "confidence",
	},
	type: "confidence/claim/add",
};

export const episode0004AnimationPlan = planner({
	command: episode0004AddClaimCommand,
	debateCore: episode0002DebateCore,
});

export const episode0004DebateCore = applyConfidenceClaimAddCommand({
	command: episode0004AddClaimCommand,
	debateCore: episode0002DebateCore,
}).debateCore;