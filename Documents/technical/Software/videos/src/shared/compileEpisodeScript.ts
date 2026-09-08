import type { AddConfidenceClaimCommand } from "@debate-core/Commands.ts";
import type { Claim, ClaimId } from "@debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConfidenceConnectorId,
	RelevanceConnector,
	RelevanceConnectorId,
	TargetRelation,
} from "@debate-core/Connector.ts";
import type { DebateCore } from "@debate-core/Debate.ts";
import { applyConfidenceClaimAddCommand } from "@planner/applyDebateCommand.ts";
import type { AnimationStepId, DebateAnimationPlan } from "@planner/DebateAnimationPlan.ts";
import { planDebateAnimationBatch, planStaticDebate } from "@planner/planner.ts";

import {
	episodeScriptSpecSchema,
	type ClaimSide,
	type EpisodeAction,
	type EpisodeScriptSpec,
	type GraphClaimState,
} from "./episodeScriptSpec";

const DEFAULT_DURATION_SECONDS: Readonly<Record<EpisodeAction["type"], number>> = {
	"camera.cut": 0,
	"camera.follow": 0.65,
	"camera.move": 1.2,
	"captions.show": 0,
	"graph.addClaim": 4,
	"graph.create": 0,
	"graph.patch": 0,
	"graph.set": 0,
};

const GRAPH_PHASES = [
	["opening", 0.3],
	["voila", 0.175],
	["sprout", 0.2],
	["firstFill", 0.1625],
	["wave", 0.1625],
] as const;

type ClaimTarget = string | { relevanceOf: string };
type GraphAction = Extract<EpisodeAction, { type: `graph.${string}` }>;

type ClaimDefinition = {
	key: string
	side: ClaimSide
	target?: ClaimTarget
	text: string
	textReveal?: true
};

type GraphCompilerState = {
	claimDefinitions: Map<string, ClaimDefinition>
	debateCore?: DebateCore
	key: string
	lastAnimationEndFrame: number
};

export type ScheduledEpisodeAction = {
	action: EpisodeAction
	durationInFrames: number
	endFrame: number
	from: number
	index: number
	label: string
};

export type CompiledGraphAnimation = {
	addedClaimIds: readonly ClaimId[]
	debateCore: DebateCore
	durationInFrames: number
	from: number
	graph: string
	label: string
	plan: DebateAnimationPlan
	sourceActionIndexes: readonly number[]
};

export type ClaimTextReveal = {
	durationInFrames: number
	from: number
};

export type GraphPlayback = {
	animation: CompiledGraphAnimation
	stepId?: AnimationStepId
	stepProgress: number
};

export type CompiledEpisodeScript = {
	actions: readonly ScheduledEpisodeAction[]
	composition: EpisodeScriptSpec["settings"]["composition"]
	durationInFrames: number
	graphAnimations: readonly CompiledGraphAnimation[]
	claimTextReveals: Readonly<Record<ClaimId, ClaimTextReveal>>
	spec: EpisodeScriptSpec
};

export function compileEpisodeScript(input: unknown): CompiledEpisodeScript {
	const spec = episodeScriptSpecSchema.parse(input);
	const actions = scheduleActions(spec);
	const graphAnimations = compileGraphActions(spec, actions);
	const claimTextReveals = compileClaimTextReveals(actions);

	return {
		actions,
		claimTextReveals,
		composition: spec.settings.composition,
		durationInFrames: Math.max(1, ...actions.map((action) => action.endFrame)),
		graphAnimations,
		spec,
	};
}

function compileClaimTextReveals(
	actions: readonly ScheduledEpisodeAction[],
): Readonly<Record<ClaimId, ClaimTextReveal>> {
	const reveals: Record<ClaimId, ClaimTextReveal> = {};
	for (const scheduled of actions) {
		const action = scheduled.action;
		if (action.type === "graph.create") {
			if (action.mainClaim.textReveal) {
				reveals[claimId(action.key, action.mainClaim.key)] = requireClaimTextReveal(
					scheduled,
				);
			}
			for (const claim of action.claims ?? []) {
				if (claim.textReveal) {
					reveals[claimId(action.key, claim.key)] = requireClaimTextReveal(scheduled);
				}
			}
			continue;
		}
		if (action.type === "graph.addClaim" && action.textReveal) {
			reveals[claimId(action.graph, action.key)] = requireClaimTextReveal(scheduled);
		}
	}
	return reveals;
}

function requireClaimTextReveal(action: ScheduledEpisodeAction): ClaimTextReveal {
	if (action.durationInFrames < 1) {
		throw new Error(`Action ${action.index} enables textReveal but has no duration.`);
	}
	return { durationInFrames: action.durationInFrames, from: action.from };
}

export function resolveGraphPlayback(
	episode: CompiledEpisodeScript,
	frame: number,
): GraphPlayback | undefined {
	let animation: CompiledGraphAnimation | undefined;
	for (const candidate of episode.graphAnimations) {
		if (candidate.from <= frame) {
			animation = candidate;
		}
	}
	if (!animation) {
		return undefined;
	}

	if (frame >= animation.from + animation.durationInFrames) {
		return { animation, stepId: "wave", stepProgress: 1 };
	}

	const progress = animation.durationInFrames <= 1
		? 1
		: (frame - animation.from) / (animation.durationInFrames - 1);
	let phaseStart = 0;
	for (const [step, weight] of GRAPH_PHASES) {
		const phaseEnd = phaseStart + weight;
		if (progress < phaseEnd || step === "wave") {
			return {
				animation,
				stepId: step === "opening" ? undefined : step,
				stepProgress: step === "opening"
					? 0
					: Math.min(1, Math.max(0, (progress - phaseStart) / weight)),
			};
		}
		phaseStart = phaseEnd;
	}

	return { animation, stepId: "wave", stepProgress: 1 };
}

function scheduleActions(spec: EpisodeScriptSpec): readonly ScheduledEpisodeAction[] {
	const { fps } = spec.settings.composition;
	let cursorFrame = 0;

	return spec.script.map((action, index) => {
		const durationSeconds = resolveDurationSeconds(spec, action);
		const durationInFrames = Math.max(0, Math.round(durationSeconds * fps));
		const from = cursorFrame + signedSecondsToFrames(action.offsetSeconds ?? 0, fps);
		if (from < 0) {
			throw new Error(`Action ${index} (${action.type}) starts before frame zero.`);
		}

		const endFrame = from + durationInFrames;
		if (action.blocking ?? true) {
			cursorFrame = Math.max(cursorFrame, endFrame);
		}

		return {
			action,
			durationInFrames,
			endFrame,
			from,
			index,
			label: action.label ?? describeAction(action),
		};
	});
}

function signedSecondsToFrames(seconds: number, fps: number): number {
	return Math.sign(seconds) * Math.round(Math.abs(seconds) * fps);
}

function resolveDurationSeconds(spec: EpisodeScriptSpec, action: EpisodeAction): number {
	if (action.durationSeconds !== undefined) {
		return action.durationSeconds;
	}

	const defaults = spec.settings.defaults;
	switch (action.type) {
		case "graph.create":
			return defaults?.["graph.create"]?.durationSeconds
				?? DEFAULT_DURATION_SECONDS[action.type];
		case "graph.addClaim":
			return defaults?.["graph.addClaim"]?.durationSeconds
				?? DEFAULT_DURATION_SECONDS[action.type];
		case "camera.move":
			return defaults?.["camera.move"]?.durationSeconds
				?? DEFAULT_DURATION_SECONDS[action.type];
		case "camera.follow":
			return defaults?.["camera.follow"]?.durationSeconds
				?? DEFAULT_DURATION_SECONDS[action.type];
		default:
			return DEFAULT_DURATION_SECONDS[action.type];
	}
}

function describeAction(action: EpisodeAction): string {
	switch (action.type) {
		case "graph.create":
			return `Create ${action.key}`;
		case "graph.addClaim":
			return `Add ${action.key}`;
		case "graph.set":
			return `Set ${action.graph}`;
		case "graph.patch":
			return `Patch ${action.graph}`;
		case "camera.cut":
			return "Camera cut";
		case "camera.move":
			return "Camera move";
		case "camera.follow":
			return `Camera follow ${action.routeFrom}`;
		case "captions.show":
			return "Show closed captions";
	}
}

function compileGraphActions(
	spec: EpisodeScriptSpec,
	actions: readonly ScheduledEpisodeAction[],
): readonly CompiledGraphAnimation[] {
	const graphStates = new Map<string, GraphCompilerState>();
	const animations: CompiledGraphAnimation[] = [];
	const graphActions = actions
		.filter(isScheduledGraphAction);
	graphActions.sort((left, right) => left.from - right.from || left.index - right.index);

	for (let actionIndex = 0; actionIndex < graphActions.length;) {
		const scheduled = graphActions[actionIndex]!;
		const action = scheduled.action;

		if (action.type === "graph.create") {
			if (graphStates.has(action.key)) {
				throw new Error(`Action ${scheduled.index} creates duplicate graph: ${action.key}`);
			}
			const state: GraphCompilerState = {
				claimDefinitions: new Map(),
				key: action.key,
				lastAnimationEndFrame: 0,
			};
			state.claimDefinitions.set(action.mainClaim.key, {
				key: action.mainClaim.key,
				side: "pro-main",
				text: action.mainClaim.text,
				textReveal: action.mainClaim.textReveal,
			});
			for (const claim of action.claims ?? []) {
				setClaimDefinition(state, claim, scheduled.index);
			}
			state.debateCore = createDebateCore(
				spec,
				state,
				[action.mainClaim.key, ...(action.claims ?? []).map((claim) => claim.key)],
				action.mainClaim.key,
			);
			graphStates.set(action.key, state);
			animations.push({
				addedClaimIds: [],
				debateCore: state.debateCore,
				durationInFrames: Math.max(1, scheduled.durationInFrames),
				from: scheduled.from,
				graph: action.key,
				label: scheduled.label,
				plan: planStaticDebate({ debateCore: state.debateCore }),
				sourceActionIndexes: [scheduled.index],
			});
			state.lastAnimationEndFrame = scheduled.endFrame;
			actionIndex += 1;
			continue;
		}

		const graphKey = action.graph;
		const state = requireGraphState(graphStates, graphKey, scheduled.index);
		if (action.type === "graph.set") {
			applyGraphSet(spec, state, action.claims, scheduled.index);
			actionIndex += 1;
			continue;
		}
		if (action.type === "graph.patch") {
			applyGraphPatch(state, action.claims, action.removeConnectionsFrom, scheduled.index);
			actionIndex += 1;
			continue;
		}
		if (action.type !== "graph.addClaim") {
			throw new Error("Unsupported graph action.");
		}

		const batch: ScheduledEpisodeAction[] = [scheduled];
		let nextIndex = actionIndex + 1;
		while (nextIndex < graphActions.length) {
			const next = graphActions[nextIndex]!;
			if (
				next.from !== scheduled.from
				|| next.action.type !== "graph.addClaim"
				|| next.action.graph !== graphKey
			) {
				break;
			}
			batch.push(next);
			nextIndex += 1;
		}
		compileGraphAddBatch(state, batch, animations);
		actionIndex = nextIndex;
	}

	return animations;
}

function isScheduledGraphAction(
	action: ScheduledEpisodeAction,
): action is ScheduledEpisodeAction & { action: GraphAction } {
	return action.action.type.startsWith("graph.");
}

function compileGraphAddBatch(
	state: GraphCompilerState,
	batch: readonly ScheduledEpisodeAction[],
	animations: CompiledGraphAnimation[],
): void {
	const first = batch[0]!;
	if (first.from < state.lastAnimationEndFrame) {
		throw new Error(
			`Graph ${state.key} action ${first.index} overlaps a graph mutation already in progress.`,
		);
	}
	if (batch.some((item) => item.durationInFrames !== first.durationInFrames)) {
		throw new Error(`Same-start graph additions on ${state.key} must use the same duration.`);
	}
	if (!state.debateCore) {
		throw new Error(`Graph ${state.key} must be created before claims are added.`);
	}

	const commands = batch.map((scheduled): AddConfidenceClaimCommand => {
		if (scheduled.action.type !== "graph.addClaim") {
			throw new Error("Internal graph batch contains a non-add action.");
		}
		const action = scheduled.action;
		if (state.debateCore?.claims[claimId(state.key, action.key)]) {
			throw new Error(`Action ${scheduled.index} adds duplicate claim key: ${action.key}`);
		}
		const target = requireClaimDefinition(state, action.target, scheduled.index);
		const definition: ClaimDefinition = {
			key: action.key,
			side: action.side,
			target: action.target,
			text: action.text,
			textReveal: action.textReveal,
		};
		state.claimDefinitions.set(action.key, definition);

		return createAddCommand(state, definition, target);
	});
	const plan = planDebateAnimationBatch({
		commands,
		debateCore: state.debateCore,
	});
	const addedClaimIds: ClaimId[] = [];
	for (const command of commands) {
		const applied = applyConfidenceClaimAddCommand({
			command,
			debateCore: state.debateCore,
		});
		state.debateCore = applied.debateCore;
		addedClaimIds.push(applied.claimId);
	}
	state.lastAnimationEndFrame = first.endFrame;
	animations.push({
		addedClaimIds,
		debateCore: state.debateCore,
		durationInFrames: Math.max(1, first.durationInFrames),
		from: first.from,
		graph: state.key,
		label: batch.map((item) => item.label).join(" + "),
		plan,
		sourceActionIndexes: batch.map((item) => item.index),
	});
}

function applyGraphSet(
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

function applyGraphPatch(
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

function createDebateCore(
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

function createAddCommand(
	state: GraphCompilerState,
	definition: ClaimDefinition,
	target: ClaimDefinition,
): AddConfidenceClaimCommand {
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
	return {
		content: definition.text,
		id: claimId(graphKey, definition.key),
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

function setClaimDefinition(
	state: GraphCompilerState,
	claim: { key: string; side: ClaimSide; target: ClaimTarget; text: string },
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
		key: claim.key,
		side: claim.side ?? existing!.side,
		target: claim.target ?? existing?.target,
		text: claim.text ?? existing!.text,
	});
}

function requireGraphState(
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

function requireClaimDefinition(
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

function claimId(graphKey: string, claimKey: string): ClaimId {
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
