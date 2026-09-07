import type { AddConfidenceClaimCommand } from "@debate-core/Commands.ts";
import type { ConfidenceConnector } from "@debate-core/Connector.ts";
import type { DebateCore } from "@debate-core/Debate.ts";
import type { DebateAnimationPlan } from "@planner/DebateAnimationPlan.ts";
import { applyConfidenceClaimAddCommand } from "@planner/applyDebateCommand.ts";
import { planner } from "@planner/planner.ts";

import {
	episode0005ClaimContent,
	episode0005ClaimId,
	episode0005ConnectorId,
	episode0005GroupedHealthOpeningDebateCore,
	episode0005OpeningDebateCore,
	settleEpisode0005HealthHierarchy,
	type Episode0005ClaimKey,
} from "./scenario";

type Episode0005ChapterDefinition = {
	id: string
	label: string
	source: Episode0005ClaimKey
	target: Episode0005ClaimKey
	targetRelationship: ConfidenceConnector["targetRelationship"]
	resetBefore?: "groupAcuteHealth" | "settleHealthHierarchy"
};

export type Episode0005AnimationChapter = {
	addedClaimId: ReturnType<typeof episode0005ClaimId>
	debateCore: DebateCore
	id: string
	label: string
	plan: DebateAnimationPlan
};

const episode0005ChapterDefinitions: readonly Episode0005ChapterDefinition[] = [
	chapter("cost", "Add substantial cost", "cost", "main", "conTarget"),
	chapter("daylight", "Add useful evening daylight", "daylight", "main", "proTarget"),
	chapter("sleep-top-level", "Add sleep disruption", "sleepChange", "main", "proTarget"),
	chapter("cardiovascular-top-level", "Add cardiovascular events", "cardiovascular", "main", "proTarget"),
	chapter("crashes-top-level", "Add motor-vehicle crashes", "crashes", "main", "proTarget"),
	chapter("injuries-top-level", "Add workplace injuries", "injuries", "main", "proTarget"),
	{
		...chapter("acute-health", "Group acute health and safety", "acuteHealth", "main", "proTarget"),
		resetBefore: "groupAcuteHealth",
	},
	chapter("sleep-grouped", "Restore sleep disruption under acute health", "sleepChange", "acuteHealth", "proTarget"),
	chapter("cardiovascular-grouped", "Restore cardiovascular events under acute health", "cardiovascular", "acuteHealth", "proTarget"),
	chapter("crashes-grouped", "Restore crashes under acute health", "crashes", "acuteHealth", "proTarget"),
	chapter("injuries-grouped", "Restore injuries under acute health", "injuries", "acuteHealth", "proTarget"),
	chapter("circadian", "Add chronic circadian risk", "circadian", "main", "conTarget"),
	chapter("daylight-access", "Add useful evening daylight", "daylightAccess", "daylight", "proTarget"),
	chapter("physical-activity", "Add exercise and recreation", "physicalActivity", "daylightAccess", "proTarget"),
	chapter("children-activity", "Add children's physical activity", "childrenActivity", "physicalActivity", "proTarget"),
	chapter("after-work-activity", "Add after-work recreation", "afterWorkActivity", "physicalActivity", "proTarget"),
	chapter("economic-outcomes", "Add economic and operational outcomes", "economicOutcomes", "main", "proTarget"),
	chapter("economic", "Add consumer activity", "economic", "economicOutcomes", "proTarget"),
	chapter("consumer-spending", "Add consumer spending", "consumerSpending", "economic", "proTarget"),
	chapter("economic-weakness", "Rebut the economic benefit", "economicWeakness", "consumerSpending", "conTarget"),
	{
		...chapter("road-safety", "Add mixed road-safety evidence", "roadSafety", "healthOutcomes", "conTarget"),
		resetBefore: "settleHealthHierarchy",
	},
	chapter("road-shift", "Add the overall road-safety claim", "roadShift", "roadSafety", "proTarget"),
	chapter("pedestrian-safety", "Add pedestrian safety", "pedestrianSafety", "roadShift", "proTarget"),
	chapter("bicyclist-safety", "Add bicyclist safety", "bicyclistSafety", "roadShift", "proTarget"),
	chapter("occupant-safety", "Add occupant safety", "occupantSafety", "roadShift", "proTarget"),
	chapter("occupant-risk", "Rebut occupant safety", "occupantRisk", "occupantSafety", "conTarget"),
	chapter("road-review", "Add the road-safety review", "roadReview", "roadShift", "conTarget"),
	chapter("cardiovascular-evidence", "Rebut cardiovascular events", "cardiovascularEvidence", "cardiovascular", "conTarget"),
	chapter("acute-evidence", "Rebut acute health effects", "acuteEvidence", "cardiovascular", "conTarget"),
	chapter("injury-evidence", "Rebut workplace injuries", "injuryEvidence", "injuries", "conTarget"),
	chapter("circadian-alignment", "Add circadian alignment and sleep", "circadianAlignment", "circadian", "proTarget"),
	chapter("standard-alignment", "Add permanent Standard Time alignment", "standardAlignment", "circadianAlignment", "proTarget"),
	chapter("medical-consensus", "Add medical consensus", "medicalConsensus", "standardAlignment", "proTarget"),
	chapter("circadian-model", "Add the circadian model", "circadianModel", "circadianAlignment", "conTarget"),
	chapter("model-comparison", "Add the model's Standard Time result", "modelComparison", "circadian", "proTarget"),
	chapter("model-critique", "Challenge the circadian model", "modelCritique", "circadianModel", "conTarget"),
	chapter("implementation", "Add implementation costs", "implementation", "main", "conTarget"),
	chapter("coordination", "Add coordination costs", "coordination", "implementation", "proTarget"),
	chapter("airline-coordination", "Add airline coordination", "airlineCoordination", "coordination", "proTarget"),
	chapter("patchwork", "Add jurisdictional complexity", "patchwork", "coordination", "proTarget"),
	chapter("flexibility", "Add reduced state flexibility", "flexibility", "implementation", "proTarget"),
	chapter("state-choice", "Add the state-choice restriction", "stateChoice", "flexibility", "proTarget"),
	chapter("public-preference", "Add public acceptance", "publicPreference", "main", "proTarget"),
	chapter("history", "Add unfavorable historical evidence", "history", "publicPreference", "conTarget"),
	chapter("us-history", "Add the 1974 U.S. experience", "usHistory", "history", "proTarget"),
	chapter("history-limits", "Qualify the historical evidence", "historyLimits", "history", "conTarget"),
	chapter("russia-history", "Add the Russian experience", "russiaHistory", "history", "proTarget"),
	chapter("public-support", "Add distributed public support", "publicSupport", "publicPreference", "proTarget"),
	chapter("state-support", "Add state support", "stateSupport", "publicSupport", "proTarget"),
	chapter("poll-choice", "Rebut public acceptance", "pollChoice", "publicPreference", "conTarget"),
	chapter("schedule-convenience", "Add schedule convenience", "scheduleConvenience", "daylight", "proTarget"),
	chapter("schedule-confusion", "Add schedule confusion", "scheduleConfusion", "scheduleConvenience", "proTarget"),
	chapter("energy", "Add energy and emissions", "energy", "main", "proTarget"),
	chapter("energy-savings", "Add net energy use", "energySavings", "energy", "proTarget"),
	chapter("weak-energy-evidence", "Rebut energy savings", "weakEnergyEvidence", "energySavings", "conTarget"),
	chapter("crime", "Add crime-related safety", "crime", "healthOutcomes", "conTarget"),
	chapter("robberies", "Add robbery reduction", "robberies", "crime", "proTarget"),
	chapter("assaults", "Rebut the crime benefit", "assaults", "crime", "conTarget"),
	chapter("deer-collisions", "Add deer-collision effects", "deerCollisions", "roadSafety", "proTarget"),
	chapter("agriculture", "Add sun-tied work costs", "agriculture", "main", "conTarget"),
	chapter("sun-tied-work", "Add outdoor work schedules", "sunTiedWork", "agriculture", "proTarget"),
	chapter("broadcasting", "Add AM broadcasting costs", "broadcasting", "main", "conTarget"),
	chapter("radio-reach", "Add AM radio reach", "radioReach", "broadcasting", "proTarget"),
	chapter("religious-schedules", "Add religious schedule costs", "religiousSchedules", "daylight", "conTarget"),
];

export const episode0005AnimationChapters = buildAnimationChapters();

function buildAnimationChapters(): readonly Episode0005AnimationChapter[] {
	let debateCore = episode0005OpeningDebateCore;

	return episode0005ChapterDefinitions.map((definition) => {
		if (definition.resetBefore === "groupAcuteHealth") {
			debateCore = episode0005GroupedHealthOpeningDebateCore;
		} else if (definition.resetBefore === "settleHealthHierarchy") {
			debateCore = settleEpisode0005HealthHierarchy(debateCore);
		}

		const command = createAddClaimCommand(definition);
		const plan = planner({ command, debateCore });
		const applied = applyConfidenceClaimAddCommand({ command, debateCore });
		debateCore = applied.debateCore;

		return {
			addedClaimId: applied.claimId,
			debateCore,
			id: definition.id,
			label: definition.label,
			plan,
		};
	});
}

function createAddClaimCommand(
	definition: Episode0005ChapterDefinition,
): AddConfidenceClaimCommand {
	return {
		claim: {
			content: episode0005ClaimContent[definition.source],
			id: episode0005ClaimId(definition.source),
		},
		connector: {
			id: episode0005ConnectorId(definition.source, definition.target),
			targetClaimId: episode0005ClaimId(definition.target),
			targetRelationship: definition.targetRelationship,
			type: "confidence",
		},
		type: "confidence/claim/add",
	};
}

function chapter(
	id: string,
	label: string,
	source: Episode0005ClaimKey,
	target: Episode0005ClaimKey,
	targetRelationship: ConfidenceConnector["targetRelationship"],
): Episode0005ChapterDefinition {
	return { id, label, source, target, targetRelationship };
}