import type { AddConfidenceClaimCommand } from "@debate-core/Commands.ts";
import { applyConfidenceClaimAddCommand } from "@planner/applyDebateCommand.ts";
import { planner } from "@planner/planner.ts";
import {
	c2ClaimId,
	c2ConfidenceConnectorId,
	episode0001OpeningDebateCore,
	mainClaimId,
} from "./scenario";

export const episode0001AddClaimCommand: AddConfidenceClaimCommand = {
	claim: {
		content: "C2",
		id: c2ClaimId,
	},
	connector: {
		id: c2ConfidenceConnectorId,
		targetClaimId: mainClaimId,
		targetRelationship: "conTarget",
		type: "confidence",
	},
	type: "confidence/claim/add",
};

export const episode0001AnimationPlan = planner({
	command: episode0001AddClaimCommand,
	debateCore: episode0001OpeningDebateCore,
});

export const episode0001DebateCore = applyConfidenceClaimAddCommand({
	command: episode0001AddClaimCommand,
	debateCore: episode0001OpeningDebateCore,
}).debateCore;