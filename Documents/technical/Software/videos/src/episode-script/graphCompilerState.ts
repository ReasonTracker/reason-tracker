import type { AddClaimCommand } from "@reasontracker/engine/debate-core/Commands.ts";
import type { Claim, ClaimId } from "@reasontracker/engine/debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConfidenceConnectorId,
	RelevanceConnector,
	RelevanceConnectorId,
	TargetRelation,
} from "@reasontracker/engine/debate-core/Connector.ts";
import type { DebateCore } from "@reasontracker/engine/debate-core/Debate.ts";
import { planStaticDebate } from "@reasontracker/engine/animation/planDebateAnimation.ts";

import type {
	CompiledGraphAnimation,
	ScheduledEpisodeAction,
} from "./compileEpisodeScript";
import type {
	Anchor,
	ClaimSide,
	EpisodeClaim,
	EpisodeScriptSpec,
	GraphClaimState,
	GraphLayout,
	ScoreboardLayout,
} from "./episodeScriptSpec";

type ClaimTarget = string | { relevanceOf: string };

export type ClaimDefinition = EpisodeClaim & {
	side: ClaimSide
	showScore?: boolean
	target?: ClaimTarget
	textReveal?: boolean
};

export type GraphCompilerState = {
	anchor: Anchor
	claimDefinitions: Map<string, ClaimDefinition>
	debateCore?: DebateCore
	hideScores: boolean
	key: string
	lastAnimationAction?: ScheduledEpisodeAction
	lastAnimationEndFrame: number
	layout: GraphLayout
	scoreboard?: ScoreboardLayout
};

export function createStaticGraphAnimation(
	state: GraphCompilerState,
	scheduled: ScheduledEpisodeAction,
): CompiledGraphAnimation {
	if (!state.debateCore) {
		throw new Error(`Graph ${state.key} must be created before it is displayed.`);
	}
	return {
		addedClaimIds: [],
		anchor: state.anchor,
		claimScoreVisibility: resolveClaimScoreVisibility(state),
		debateCore: state.debateCore,
		durationInFrames: 1,
		from: scheduled.from,
		graph: state.key,
		hideScores: state.hideScores,
		label: scheduled.label,
		plan: planStaticDebate({
			debateCore: state.debateCore,
			origin: state.layout,
		}),
		scoreboard: state.scoreboard,
		sourceActionIndexes: [scheduled.index],
	};
}

export function resolveClaimScoreVisibility(
	state: GraphCompilerState,
): Readonly<Record<ClaimId, boolean>> {
	return Object.fromEntries(
		[...state.claimDefinitions.values()].map((definition) => [
			claimId(state.key, definition.key),
			!state.hideScores && (definition.showScore ?? true),
		]),
	) as Record<ClaimId, boolean>;
}

export function applyGraphSet(
	spec: EpisodeScriptSpec,
	state: GraphCompilerState,
	claims: readonly GraphClaimState[],
	actionIndex: number,
): void {
	for (const claim of claims) {
		mergeClaimDefinition(state, claim, actionIndex);
	}
	const mainClaimKey = requireMainClaimKey(state, actionIndex);
	state.debateCore = createDebateCore(
		spec,
		state,
		claims.map((claim) => claim.key),
		mainClaimKey,
	);
}

export function applyGraphPatch(
	state: GraphCompilerState,
	claims: readonly GraphClaimState[],
	removeConnectionsFrom: readonly string[],
	actionIndex: number,
): void {
	if (!state.debateCore) {
		throw new Error(`Graph ${state.key} must be created before it is patched.`);
	}
	for (const claim of claims) {
		mergeClaimDefinition(state, claim, actionIndex);
	}
	const removedClaimIds = new Set(
		removeConnectionsFrom.map((key) => claimId(state.key, key)),
	);
	const connectors = Object.fromEntries(
		Object.entries(state.debateCore.connectors).filter(([, connector]) =>
			!removedClaimIds.has(connector.source)
		),
	) as DebateCore["connectors"];
	const debateCore: DebateCore = {
		...state.debateCore,
		claims: { ...state.debateCore.claims },
		connectors,
	};
	for (const claim of claims) {
		const definition = requireClaimDefinition(state, claim.key, actionIndex);
		debateCore.claims[claimId(state.key, claim.key)] = createClaim(state.key, definition);
		if (definition.target) {
			const connector = createConnector(state, definition, actionIndex);
			debateCore.connectors[connector.id] = connector;
		}
	}
	state.debateCore = debateCore;
}

export function createDebateCore(
	spec: EpisodeScriptSpec,
	state: GraphCompilerState,
	claimKeys: readonly string[],
	mainClaimKey: string,
): DebateCore {
	const includedKeys = new Set(claimKeys);
	if (!includedKeys.has(mainClaimKey)) {
		throw new Error(`Graph ${state.key} state must include main claim ${mainClaimKey}.`);
	}
	const claims = Object.fromEntries(claimKeys.map((key) => {
		const definition = requireClaimDefinition(state, key, -1);
		const claim = createClaim(state.key, definition);
		return [claim.id, claim];
	})) as DebateCore["claims"];
	const connectors = Object.fromEntries(claimKeys.flatMap((key) => {
		const definition = requireClaimDefinition(state, key, -1);
		if (!definition.target) {
			return [];
		}
		const targetKey = typeof definition.target === "string"
			? definition.target
			: definition.target.relevanceOf;
		if (!includedKeys.has(targetKey)) {
			throw new Error(`Graph ${state.key} claim ${key} targets omitted claim ${targetKey}.`);
		}
		const connector = createConnector(state, definition, -1);
		return [[connector.id, connector] as const];
	})) as DebateCore["connectors"];

	return {
		claims,
		connectors,
		description: `${spec.settings.composition.id} ${state.key}`,
		id: `${spec.settings.composition.id}:${state.key}` as DebateCore["id"],
		mainClaimId: claimId(state.key, mainClaimKey),
		name: state.key,
	};
}

export function createAddCommand(
	state: GraphCompilerState,
	definition: ClaimDefinition,
	target: ClaimDefinition,
): AddClaimCommand {
	const claimTarget = definition.target;
	if (!claimTarget) {
		throw new Error(`Claim ${definition.key} has no target.`);
	}

	if (typeof claimTarget !== "string") {
		return {
			claim: createClaim(state.key, definition),
			connector: {
				targetConfidenceConnectorId: confidenceConnectorId(state.key, claimTarget.relevanceOf),
				targetRelationship: toTargetRelation(definition.side, target.side),
				type: "relevance",
			},
			type: "relevance/claim/add",
		};
	}

	return {
		claim: createClaim(state.key, definition),
		connector: {
			id: confidenceConnectorId(state.key, definition.key),
			targetClaimId: claimId(state.key, target.key),
			targetRelationship: toTargetRelation(definition.side, target.side),
			type: "confidence",
		},
		type: "confidence/claim/add",
	};
}

function createClaim(graphKey: string, definition: ClaimDefinition): Claim {
	if (definition.reversedContent !== undefined && definition.reversible !== true) {
		throw new Error(`Claim ${definition.key} provides reversedContent without reversible: true.`);
	}

	return {
		content: definition.text,
		defaultConfidence: definition.defaultConfidence,
		defaultRelevance: definition.defaultRelevance,
		id: claimId(graphKey, definition.key),
		reversible: definition.reversible,
		reversedContent: definition.reversedContent,
	};
}

function createConnector(
	state: GraphCompilerState,
	definition: ClaimDefinition,
	actionIndex: number,
): ConfidenceConnector | RelevanceConnector {
	const target = definition.target;
	if (!target) {
		throw new Error(`Claim ${definition.key} has no target at action ${actionIndex}.`);
	}
	const targetKey = typeof target === "string" ? target : target.relevanceOf;
	const targetDefinition = requireClaimDefinition(state, targetKey, actionIndex);
	const targetRelationship = toTargetRelation(definition.side, targetDefinition.side);

	if (typeof target === "string") {
		return {
			id: confidenceConnectorId(state.key, definition.key),
			source: claimId(state.key, definition.key),
			targetClaimId: claimId(state.key, target),
			targetRelationship,
			type: "confidence",
		};
	}

	return {
		id: relevanceConnectorId(state.key, definition.key),
		source: claimId(state.key, definition.key),
		targetConfidenceConnectorId: confidenceConnectorId(state.key, target.relevanceOf),
		targetRelationship,
		type: "relevance",
	};
}

export function setClaimDefinition(
	state: GraphCompilerState,
	claim: ClaimDefinition,
	actionIndex: number,
): void {
	if (state.claimDefinitions.has(claim.key)) {
		throw new Error(`Action ${actionIndex} defines duplicate claim key: ${claim.key}`);
	}
	state.claimDefinitions.set(claim.key, claim);
}

function mergeClaimDefinition(
	state: GraphCompilerState,
	claim: GraphClaimState,
	actionIndex: number,
): void {
	const existing = state.claimDefinitions.get(claim.key);
	if (!existing && (!claim.side || !claim.target || !claim.text)) {
		throw new Error(
			`Action ${actionIndex} must fully define new claim ${claim.key}.`,
		);
	}
	state.claimDefinitions.set(claim.key, {
		defaultConfidence: claim.defaultConfidence ?? existing?.defaultConfidence,
		defaultRelevance: claim.defaultRelevance ?? existing?.defaultRelevance,
		key: claim.key,
		reversible: claim.reversible ?? existing?.reversible,
		reversedContent: claim.reversedContent ?? existing?.reversedContent,
		side: claim.side ?? existing!.side,
		showScore: claim.showScore ?? existing?.showScore,
		target: claim.target ?? existing?.target,
		text: claim.text ?? existing!.text,
		textReveal: claim.textReveal ?? existing?.textReveal,
	});
}

export function requireGraphState(
	states: ReadonlyMap<string, GraphCompilerState>,
	key: string,
	actionIndex: number,
): GraphCompilerState {
	const state = states.get(key);
	if (!state) {
		throw new Error(`Action ${actionIndex} references missing graph: ${key}`);
	}
	return state;
}

export function requireClaimDefinition(
	state: GraphCompilerState,
	key: string,
	actionIndex: number,
): ClaimDefinition {
	const definition = state.claimDefinitions.get(key);
	if (!definition) {
		throw new Error(`Action ${actionIndex} references missing claim: ${state.key}.${key}`);
	}
	return definition;
}

function requireMainClaimKey(state: GraphCompilerState, actionIndex: number): string {
	if (!state.debateCore) {
		throw new Error(`Graph ${state.key} must be created before action ${actionIndex}.`);
	}
	const mainClaimId = state.debateCore.mainClaimId;
	const mainClaim = [...state.claimDefinitions.values()].find(
		(definition) => claimId(state.key, definition.key) === mainClaimId,
	);
	if (!mainClaim) {
		throw new Error(`Graph ${state.key} has no main claim definition.`);
	}
	return mainClaim.key;
}

export function claimId(graphKey: string, claimKey: string): ClaimId {
	return `${graphKey}:claim:${claimKey}` as ClaimId;
}

function confidenceConnectorId(graphKey: string, claimKey: string): ConfidenceConnectorId {
	return `${graphKey}:confidence:${claimKey}` as ConfidenceConnectorId;
}

function relevanceConnectorId(graphKey: string, claimKey: string): RelevanceConnectorId {
	return `${graphKey}:relevance:${claimKey}` as RelevanceConnectorId;
}

function toTargetRelation(sourceSide: ClaimSide, targetSide: ClaimSide): TargetRelation {
	return sourceSide === targetSide ? "proTarget" : "conTarget";
}
