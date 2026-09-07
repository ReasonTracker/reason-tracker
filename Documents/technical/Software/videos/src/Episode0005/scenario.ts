import type { Claim, ClaimId } from "@debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConfidenceConnectorId,
} from "@debate-core/Connector.ts";
import type { DebateCore } from "@debate-core/Debate.ts";

export const episode0005ClaimContent = {
	main: "The United States would experience a net benefit from enacting the Sunshine Protection Act of 2025.",
	cost: "The legislation would have a substantial cost.",
	daylight: "The Sunshine Protection Act would improve everyday schedule convenience and use of daylight on balance.",
	healthOutcomes: "The Sunshine Protection Act would worsen health and safety outcomes on balance.",
	acuteHealth: "Ending seasonal clock changes would improve acute health and safety on balance.",
	acuteHealthEffects: "Seasonal clock changes have net adverse acute-health effects.",
	acuteSafetyEffects: "Seasonal clock changes have net adverse acute safety and injury effects.",
	sleepChange: "The twice-yearly clock changes acutely disrupt sleep schedules.",
	cardiovascular: "The spring clock change is associated with increased acute cardiovascular events.",
	crashes: "The spring clock change is associated with increased motor-vehicle crashes.",
	injuries: "The spring clock change is associated with increased injuries or workplace accidents.",
	circadian: "Permanent Daylight Saving Time would worsen circadian alignment, sleep, and related health or performance outcomes on balance.",
	circadianAlignment: "Permanent Daylight Saving Time would worsen circadian alignment and sleep on balance.",
	standardAlignment: "Permanent Standard Time aligns better with human circadian biology than permanent Daylight Saving Time.",
	medicalConsensus: "A broad set of medical, sleep, safety, and parent organizations endorse permanent Standard Time rather than permanent Daylight Saving Time.",
	daylightAccess: "Permanent Daylight Saving Time would improve everyday access to useful evening daylight and recreation on balance.",
	physicalActivity: "Permanent Daylight Saving Time would improve physical-activity and recreation opportunities on balance.",
	childrenActivity: "More evening daylight can increase children's physical activity.",
	afterWorkActivity: "More evening daylight makes outdoor exercise and recreation after work or school more available.",
	economicOutcomes: "The Sunshine Protection Act would improve economic and operational outcomes on balance.",
	economic: "Permanent Daylight Saving Time would benefit consumer activity and affected businesses on balance.",
	consumerSpending: "Permanent Daylight Saving Time would increase consumer spending and general economic activity by extending evening daylight.",
	economicWeakness: "Evidence for a large national economic boost from permanent Daylight Saving Time is weak.",
	roadSafety: "Permanent Daylight Saving Time would improve road and travel safety on balance.",
	roadShift: "Permanent Daylight Saving Time may reduce overall fatal crashes by aligning daylight with higher-traffic evening periods.",
	pedestrianSafety: "Year-round Daylight Saving Time could reduce pedestrian fatalities by shifting daylight to busier evening travel periods.",
	bicyclistSafety: "Shifting daylight later can reduce bicyclist fatal crashes.",
	occupantSafety: "Year-round Daylight Saving Time could reduce motor-vehicle occupant fatalities.",
	occupantRisk: "Recent U.S. data suggest that shifting daylight later can increase motor-vehicle occupant fatal crashes.",
	roadReview: "A systematic review found the road-safety evidence insufficient to support or refute a net benefit from permanently shifting daylight later.",
	cardiovascularEvidence: "A large contemporary study found no significant increase in acute myocardial infarction during daylight-saving-time transition weeks.",
	acuteEvidence: "A large English cohort study found little evidence that the spring clock change increases several acute mental and physical health events.",
	injuryEvidence: "An Ontario worker-compensation study found no increase in work-injury claims immediately after the spring clock change.",
	circadianModel: "A recent circadian model projected that either permanent clock would reduce circadian burden compared with biannual switching.",
	modelComparison: "The same model projected better health outcomes under permanent Standard Time than under permanent Daylight Saving Time.",
	modelCritique: "Methodological criticism challenges the recent U.S. circadian-health model.",
	implementation: "The Sunshine Protection Act would create net implementation, coordination, and legal-flexibility costs.",
	coordination: "The Sunshine Protection Act would create net implementation and coordination costs.",
	airlineCoordination: "A permanent U.S. time-policy change could disrupt airline schedules, passenger travel, and international coordination.",
	patchwork: "A patchwork of neighboring jurisdictions with different clock observances can create scheduling and travel complexity.",
	flexibility: "The Sunshine Protection Act would reduce future jurisdictional flexibility over time policy on balance.",
	stateChoice: "States may lose the ability to choose permanent Standard Time without another federal-law change.",
	publicPreference: "Permanent Daylight Saving Time would be broadly acceptable to the public on balance.",
	history: "Historical experiences with permanent Daylight Saving Time or permanent summer time are unfavorable on balance.",
	usHistory: "The 1974 U.S. year-round Daylight Saving Time experiment became unpopular largely because of dark winter mornings.",
	historyLimits: "The 1974 U.S. experience may be a weaker guide today because school and commuting patterns have changed.",
	russiaHistory: "Russia adopted permanent summer time in 2011 and reversed it in 2014 after the policy became widely unpopular.",
	publicSupport: "Support for permanent Daylight Saving Time is broadly distributed across populations and jurisdictions.",
	stateSupport: "Nineteen states have enacted laws or trigger provisions supporting year-round Daylight Saving Time if federal law permits it.",
	pollChoice: "A 2025 three-choice poll preferred permanent Standard Time over permanent Daylight Saving Time.",
	scheduleConvenience: "Ending seasonal clock changes would reduce recurring household and schedule disruption.",
	scheduleConfusion: "Twice-yearly clock changes create recurring schedule confusion and inconvenience.",
	energy: "The Sunshine Protection Act would improve energy and emissions outcomes on balance.",
	energySavings: "Permanent Daylight Saving Time would reduce net energy use.",
	weakEnergyEvidence: "Modern electricity savings from Daylight Saving Time may be negligible.",
	crime: "Permanent Daylight Saving Time would improve crime-related public safety on balance.",
	robberies: "Added evening daylight reduces robberies.",
	assaults: "Added evening daylight can increase aggravated assaults around sunset.",
	deerCollisions: "Year-round Daylight Saving Time could reduce deer-vehicle collisions.",
	agriculture: "The Sunshine Protection Act would worsen outcomes for agriculture and other sun-tied work on balance.",
	sunTiedWork: "Permanent Daylight Saving Time would worsen sun-tied outdoor work schedules on balance.",
	broadcasting: "Permanent Daylight Saving Time would harm AM broadcasting and the services it provides on balance.",
	radioReach: "Extended reduced-power hours during winter mornings can reduce AM station audience reach and advertising revenue.",
	religiousSchedules: "Permanent Daylight Saving Time would push sunrise-based morning prayer times later, creating conflicts with work or school schedules.",
} as const;

export type Episode0005ClaimKey = keyof typeof episode0005ClaimContent;

export type Episode0005Relationship = {
	source: Episode0005ClaimKey
	target: Episode0005ClaimKey
	targetRelationship: ConfidenceConnector["targetRelationship"]
};

export const episode0005OpeningDebateCore = createEpisode0005DebateCore({
	claimKeys: ["main"],
	relationships: [],
});

export const episode0005GroupedHealthOpeningDebateCore = createEpisode0005DebateCore({
	claimKeys: ["main", "cost", "daylight"],
	relationships: [
		{ source: "cost", target: "main", targetRelationship: "conTarget" },
		{ source: "daylight", target: "main", targetRelationship: "proTarget" },
	],
});

export function settleEpisode0005HealthHierarchy(debateCore: DebateCore): DebateCore {
	const healthClaimKeys: readonly Episode0005ClaimKey[] = [
		"healthOutcomes",
		"acuteHealthEffects",
		"acuteSafetyEffects",
	];
	const healthRelationships: readonly Episode0005Relationship[] = [
		{ source: "healthOutcomes", target: "main", targetRelationship: "conTarget" },
		{ source: "acuteHealth", target: "healthOutcomes", targetRelationship: "conTarget" },
		{ source: "acuteHealthEffects", target: "acuteHealth", targetRelationship: "proTarget" },
		{ source: "acuteSafetyEffects", target: "acuteHealth", targetRelationship: "proTarget" },
		{ source: "sleepChange", target: "acuteHealthEffects", targetRelationship: "proTarget" },
		{ source: "cardiovascular", target: "acuteHealthEffects", targetRelationship: "proTarget" },
		{ source: "crashes", target: "acuteSafetyEffects", targetRelationship: "proTarget" },
		{ source: "injuries", target: "acuteSafetyEffects", targetRelationship: "proTarget" },
		{ source: "circadian", target: "healthOutcomes", targetRelationship: "proTarget" },
	];
	const replacedClaimIds = new Set([
		episode0005ClaimId("acuteHealth"),
		episode0005ClaimId("sleepChange"),
		episode0005ClaimId("cardiovascular"),
		episode0005ClaimId("crashes"),
		episode0005ClaimId("injuries"),
		episode0005ClaimId("circadian"),
	]);
	const retainedConnectors = Object.fromEntries(
		Object.entries(debateCore.connectors).filter(([, connector]) =>
			!replacedClaimIds.has(connector.source)
		),
	) as DebateCore["connectors"];
	const settledHealth = createEpisode0005DebateCore({
		claimKeys: healthClaimKeys,
		relationships: healthRelationships,
	});

	return {
		...debateCore,
		claims: {
			...debateCore.claims,
			...settledHealth.claims,
		},
		connectors: {
			...retainedConnectors,
			...settledHealth.connectors,
		},
	};
}

export function createEpisode0005DebateCore(args: {
	claimKeys: readonly Episode0005ClaimKey[]
	relationships: readonly Episode0005Relationship[]
}): DebateCore {
	const claims = Object.fromEntries(args.claimKeys.map((key) => {
		const claim: Claim = {
			content: episode0005ClaimContent[key],
			id: episode0005ClaimId(key),
		};

		return [claim.id, claim];
	})) as DebateCore["claims"];

	const connectors = Object.fromEntries(args.relationships.map((relationship) => {
		const connector: ConfidenceConnector = {
			id: episode0005ConnectorId(relationship.source, relationship.target),
			source: episode0005ClaimId(relationship.source),
			targetClaimId: episode0005ClaimId(relationship.target),
			targetRelationship: relationship.targetRelationship,
			type: "confidence",
		};

		return [connector.id, connector];
	})) as DebateCore["connectors"];

	return {
		claims,
		connectors,
		description: "Sunshine Protection Act claim graph for Episode 0005.",
		id: "episode-0005-debate" as DebateCore["id"],
		mainClaimId: episode0005ClaimId("main"),
		name: "Sunshine Protection Act",
	};
}

export function episode0005ClaimId(key: Episode0005ClaimKey): ClaimId {
	return `episode-0005-claim-${key}` as ClaimId;
}

export function episode0005ConnectorId(
	source: Episode0005ClaimKey,
	target: Episode0005ClaimKey,
): ConfidenceConnectorId {
	return `episode-0005-confidence-${source}-${target}` as ConfidenceConnectorId;
}