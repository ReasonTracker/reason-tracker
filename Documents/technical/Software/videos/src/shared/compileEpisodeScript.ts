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
	type ScoreboardLayout,
	type CssStyle,
	type ObjectAdd,
	type ObjectUpdate,
} from "./episodeScriptSpec";

const DEFAULT_DURATION_SECONDS: Readonly<Record<EpisodeAction["type"], number>> = {
	"camera.cut": 0,
	"camera.follow": 0.65,
	"camera.move": 1.2,
	"media.add": 0,
	"media.update": 0,
	"balance.add": 0,
	"balance.update": 0,
	"captions.show": 0,
	"graph.addClaim": 4,
	"graph.create": 0,
	"graph.patch": 0,
	"graph.set": 0,
	"wait": 0,
};

const GRAPH_PHASES = [
	["voila", 1 / 4],
	["sprout", 2 / 7],
	["firstFill", 13 / 56],
	["wave", 13 / 56],
] as const satisfies readonly (readonly [AnimationStepId, number])[];

const SUPPORTED_ACTION_TYPES = [
	"balance.add",
	"balance.update",
	"camera.cut",
	"camera.follow",
	"camera.move",
	"captions.show",
	"graph.addClaim",
	"graph.create",
	"graph.patch",
	"graph.set",
	"media.add",
	"media.update",
	"wait",
] as const;

const DEFAULT_SCREEN_OBJECT_STYLE: CssStyle = {
	opacity: 1,
};

type ClaimTarget = string | { relevanceOf: string };
type GraphAction = Extract<EpisodeAction, { type: `graph.${string}` }>;
type ScreenObjectAddAction = Extract<EpisodeAction, {
	type: "media.add" | "balance.add"
}> & ObjectAdd;
type ScreenObjectUpdateAction = Extract<EpisodeAction, {
	type: "media.update" | "balance.update"
}> & ObjectUpdate;
type ScreenObjectAction = ScreenObjectAddAction | ScreenObjectUpdateAction;
type ScreenObject =
	| { source: string; type: "media" }
	| { scorePercent: number; type: "balance" };

type ClaimDefinition = {
	key: string
	side: ClaimSide
	showScore?: boolean
	target?: ClaimTarget
	text: string
	textReveal?: boolean
};

type GraphCompilerState = {
	claimDefinitions: Map<string, ClaimDefinition>
	debateCore?: DebateCore
	hideScores: boolean
	key: string
	lastAnimationAction?: ScheduledEpisodeAction
	lastAnimationEndFrame: number
	scoreboard?: ScoreboardLayout
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
	claimScoreVisibility: Readonly<Record<ClaimId, boolean>>
	debateCore: DebateCore
	durationInFrames: number
	from: number
	graph: string
	hideScores: boolean
	label: string
	plan: DebateAnimationPlan
	scoreboard?: ScoreboardLayout
	sourceActionIndexes: readonly number[]
};

export type ClaimTextReveal = {
	durationInFrames: number
	from: number
};

export type ResolvedScreenObjectState = {
	object: ScreenObject
	style: CssStyle
};

export type CompiledScreenObjectTransition = {
	durationInFrames: number
	from: number
	initialState: ResolvedScreenObjectState
	targetState: ResolvedScreenObjectState
};

export type CompiledScreenObject = {
	from: number
	initialState: ResolvedScreenObjectState
	key: string
	transitions: readonly CompiledScreenObjectTransition[]
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
	screenObjects: readonly CompiledScreenObject[]
	spec: EpisodeScriptSpec
};

export function compileEpisodeScript(input: unknown): CompiledEpisodeScript {
	const result = episodeScriptSpecSchema.safeParse(input);
	if (!result.success) {
		throw new Error(formatEpisodeScriptValidationError(input, result.error.issues));
	}
	const spec = result.data;
	const actions = scheduleActions(spec);
	const graphAnimations = compileGraphActions(spec, actions);
	const claimTextReveals = compileClaimTextReveals(actions);
	const screenObjects = compileScreenObjects(actions);

	return {
		actions,
		claimTextReveals,
		composition: spec.settings.composition,
		durationInFrames: Math.max(1, ...actions.map((action) => action.endFrame)),
		graphAnimations,
		screenObjects,
		spec,
	};
}

function formatEpisodeScriptValidationError(
	input: unknown,
	issues: readonly { message: string; path: readonly PropertyKey[] }[],
): string {
	return ["Invalid episode script:", ...issues.map((issue) => formatEpisodeScriptIssue(input, issue))]
		.join("\n");
}

function formatEpisodeScriptIssue(
	input: unknown,
	issue: { message: string; path: readonly PropertyKey[] },
): string {
	const [root, actionIndex, field] = issue.path;
	if (root === "script" && typeof actionIndex === "number" && field === "type") {
		const actionType = getEpisodeActionType(input, actionIndex);
		return `- script[${actionIndex}].type is ${JSON.stringify(actionType)}. Expected one of: ${SUPPORTED_ACTION_TYPES.join(", ")}.`;
	}
	const path = issue.path.length > 0 ? issue.path.join(".") : "root";
	return `- ${path}: ${issue.message}`;
}

function getEpisodeActionType(input: unknown, actionIndex: number): unknown {
	if (!input || typeof input !== "object") {
		return undefined;
	}
	const script = (input as { script?: unknown }).script;
	if (!Array.isArray(script)) {
		return undefined;
	}
	const action = script[actionIndex];
	return action && typeof action === "object" ? (action as { type?: unknown }).type : undefined;
}

export function resolveScreenObjectStates(
	episode: CompiledEpisodeScript,
	frame: number,
): readonly (ResolvedScreenObjectState & Pick<CompiledScreenObject, "key">)[] {
	return episode.screenObjects
		.filter((screenObject) => screenObject.from <= frame)
		.map((screenObject) => ({
			...resolveScreenObjectState(screenObject, frame),
			key: screenObject.key,
		}));
}

function compileScreenObjects(
	actions: readonly ScheduledEpisodeAction[],
): readonly CompiledScreenObject[] {
	type ScreenObjectCompilerState = {
		compiled: {
			from: number
			initialState: ResolvedScreenObjectState
			key: string
			transitions: CompiledScreenObjectTransition[]
		}
		lastTransitionEndFrame: number
		state: ResolvedScreenObjectState
	};

	const states = new Map<string, ScreenObjectCompilerState>();
	const objectActions = actions
		.filter(isScheduledScreenObjectAction)
		.sort((left, right) => left.from - right.from || left.index - right.index);

	for (const scheduled of objectActions) {
		const action = scheduled.action;
		if (isScreenObjectAddAction(action)) {
			if (states.has(action.key)) {
				throw new Error(`Action ${scheduled.index} creates duplicate object key: ${action.key}`);
			}
			const initialState = createScreenObjectState(action);
			states.set(action.key, {
				compiled: {
					from: scheduled.from,
					initialState,
					key: action.key,
					transitions: [],
				},
				lastTransitionEndFrame: scheduled.from,
				state: initialState,
			});
			continue;
		}

		const state = states.get(action.key);
		if (!state) {
			throw new Error(`Action ${scheduled.index} patches unknown object key: ${action.key}`);
		}
		if (scheduled.from < state.lastTransitionEndFrame) {
			throw new Error(
				`Object ${action.key}: action ${scheduled.index} starts before its prior transition ends. Object patches cannot overlap.`,
			);
		}
		const targetState = mergeScreenObjectState(state.state, action, scheduled.index);
		state.compiled.transitions.push({
			durationInFrames: scheduled.durationInFrames,
			from: scheduled.from,
			initialState: state.state,
			targetState,
		});
		state.lastTransitionEndFrame = scheduled.endFrame;
		state.state = targetState;
	}

	return [...states.values()].map((state) => state.compiled);
}

function createScreenObjectState(action: ScreenObjectAddAction): ResolvedScreenObjectState {
	const style = { ...DEFAULT_SCREEN_OBJECT_STYLE, ...action.style };
	switch (action.type) {
		case "media.add":
			return { object: { source: action.source, type: "media" }, style };
		case "balance.add":
			return { object: { scorePercent: action.scorePercent, type: "balance" }, style };
	}
}

function mergeScreenObjectState(
	state: ResolvedScreenObjectState,
	action: ScreenObjectUpdateAction,
	actionIndex: number,
): ResolvedScreenObjectState {
	return {
		object: updateScreenObject(state.object, action, actionIndex),
		style: { ...state.style, ...action.style },
	};
}

function updateScreenObject(
	object: ScreenObject,
	action: ScreenObjectUpdateAction,
	actionIndex: number,
): ScreenObject {
	switch (action.type) {
		case "media.update":
			if (object.type !== "media") {
				throwScreenObjectKindMismatch(actionIndex, object, action);
			}
			return { ...object, source: action.source ?? object.source };
		case "balance.update":
			if (object.type !== "balance") {
				throwScreenObjectKindMismatch(actionIndex, object, action);
			}
			return { ...object, scorePercent: action.scorePercent ?? object.scorePercent };
	}
}

function throwScreenObjectKindMismatch(
	actionIndex: number,
	object: ScreenObject,
	action: ScreenObjectUpdateAction,
): never {
	throw new Error(
		`Action ${actionIndex} updates a ${object.type} object with ${action.type} changes. Object kinds cannot change.`,
	);
}

function resolveScreenObjectState(
	screenObject: CompiledScreenObject,
	frame: number,
): ResolvedScreenObjectState {
	let state = screenObject.initialState;
	for (const transition of screenObject.transitions) {
		if (frame < transition.from) {
			break;
		}
		const progress = transition.durationInFrames <= 1
			? 1
			: Math.min(1, (frame - transition.from) / (transition.durationInFrames - 1));
		state = interpolateScreenObjectState(transition.initialState, transition.targetState, progress);
	}
	return state;
}

function interpolateScreenObjectState(
	initialState: ResolvedScreenObjectState,
	targetState: ResolvedScreenObjectState,
	progress: number,
): ResolvedScreenObjectState {
	return {
		object: interpolateScreenObject(initialState.object, targetState.object, progress),
		style: interpolateCssStyle(initialState.style, targetState.style, progress),
	};
}

function interpolateScreenObject(
	initialObject: ScreenObject,
	targetObject: ScreenObject,
	progress: number,
): ScreenObject {
	if (initialObject.type !== targetObject.type) {
		throw new Error("Screen object kinds cannot change during a transition.");
	}
	if (initialObject.type !== "balance" || targetObject.type !== "balance") {
		return targetObject;
	}
	return {
		...targetObject,
		scorePercent: interpolateNumber(initialObject.scorePercent, targetObject.scorePercent, progress),
	};
}

function interpolateNumber(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

function interpolateCssStyle(
	initialStyle: CssStyle,
	targetStyle: CssStyle,
	progress: number,
): CssStyle {
	const style: CssStyle = {};
	for (const property of new Set([...Object.keys(initialStyle), ...Object.keys(targetStyle)])) {
		style[property] = interpolateCssStyleValue(
			initialStyle[property],
			targetStyle[property],
			progress,
		);
	}
	return style;
}

function interpolateCssStyleValue(
	initialValue: CssStyle[string] | undefined,
	targetValue: CssStyle[string] | undefined,
	progress: number,
): CssStyle[string] {
	if (initialValue === undefined || targetValue === undefined) {
		return targetValue ?? initialValue ?? "";
	}
	if (typeof initialValue === "number" && typeof targetValue === "number") {
		return interpolateNumber(initialValue, targetValue, progress);
	}
	const initialNumber = parseCssNumber(initialValue);
	const targetNumber = parseCssNumber(targetValue);
	if (!initialNumber || !targetNumber || initialNumber.unit !== targetNumber.unit) {
		return targetValue;
	}
	return `${interpolateNumber(initialNumber.value, targetNumber.value, progress)}${targetNumber.unit}`;
}

function parseCssNumber(value: CssStyle[string]): { unit: string; value: number } | undefined {
	if (typeof value === "number") {
		return { unit: "", value };
	}
	const match = /^(-?(?:\d+\.?\d*|\.\d+))(.*)$/.exec(value);
	if (!match) {
		return undefined;
	}
	const numericValue = Number(match[1]);
	return Number.isFinite(numericValue)
		? { unit: match[2] ?? "", value: numericValue }
		: undefined;
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
				stepId: step,
				stepProgress: Math.min(1, Math.max(0, (progress - phaseStart) / weight)),
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
		case "media.add":
		case "balance.add":
			return `Add ${action.key}`;
		case "media.update":
		case "balance.update":
			return `Patch ${action.key}`;
		case "captions.show":
			return "Show closed captions";
		case "wait":
			return "Wait";
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
				hideScores: action.hideScores ?? false,
				key: action.key,
				lastAnimationEndFrame: 0,
				scoreboard: action.scoreboard,
			};
			state.claimDefinitions.set(action.mainClaim.key, {
				key: action.mainClaim.key,
				side: "pro-main",
				showScore: action.mainClaim.showScore ?? false,
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
				claimScoreVisibility: resolveClaimScoreVisibility(state),
				debateCore: state.debateCore,
				durationInFrames: Math.max(1, scheduled.durationInFrames),
				from: scheduled.from,
				graph: action.key,
				hideScores: state.hideScores,
				label: scheduled.label,
				plan: planStaticDebate({ debateCore: state.debateCore }),
				scoreboard: state.scoreboard,
				sourceActionIndexes: [scheduled.index],
			});
			state.lastAnimationEndFrame = scheduled.endFrame;
			state.lastAnimationAction = scheduled;
			actionIndex += 1;
			continue;
		}

		const graphKey = action.graph;
		const state = requireGraphState(graphStates, graphKey, scheduled.index);
		if (action.type === "graph.set") {
			applyGraphSet(spec, state, action.claims, scheduled.index);
			animations.push(createStaticGraphAnimation(state, scheduled));
			actionIndex += 1;
			continue;
		}
		if (action.type === "graph.patch") {
			applyGraphPatch(state, action.claims, action.removeConnectionsFrom, scheduled.index);
			animations.push(createStaticGraphAnimation(state, scheduled));
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
		compileGraphAddBatch(state, batch, animations, spec.settings.composition.fps);
		actionIndex = nextIndex;
	}

	return animations;
}

function isScheduledGraphAction(
	action: ScheduledEpisodeAction,
): action is ScheduledEpisodeAction & { action: GraphAction } {
	return action.action.type.startsWith("graph.");
}

function isScheduledScreenObjectAction(
	action: ScheduledEpisodeAction,
): action is ScheduledEpisodeAction & { action: ScreenObjectAction } {
	return isScreenObjectAddAction(action.action) || isScreenObjectUpdateAction(action.action);
}

function isScreenObjectAddAction(action: EpisodeAction): action is ScreenObjectAddAction {
	return action.type === "media.add" || action.type === "balance.add";
}

function isScreenObjectUpdateAction(action: EpisodeAction): action is ScreenObjectUpdateAction {
	return action.type === "media.update" || action.type === "balance.update";
}

function compileGraphAddBatch(
	state: GraphCompilerState,
	batch: readonly ScheduledEpisodeAction[],
	animations: CompiledGraphAnimation[],
	fps: number,
): void {
	const first = batch[0]!;
	const previous = state.lastAnimationAction;
	if (previous && first.from < state.lastAnimationEndFrame) {
		throw new Error(
			`Graph ${state.key}: action ${describeScheduledGraphAction(first)} starts at ${formatFrameTime(first.from, fps)}, but action ${describeScheduledGraphAction(previous)} is still running until ${formatFrameTime(state.lastAnimationEndFrame, fps)}. Graph mutations cannot overlap; let the earlier graph action block or start this action at or after that time.`,
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
			showScore: action.showScore,
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
	state.lastAnimationAction = first;
	animations.push({
		addedClaimIds,
		claimScoreVisibility: resolveClaimScoreVisibility(state),
		debateCore: state.debateCore,
		durationInFrames: Math.max(1, first.durationInFrames),
		from: first.from,
		graph: state.key,
		hideScores: state.hideScores,
		label: batch.map((item) => item.label).join(" + "),
		plan,
		scoreboard: state.scoreboard,
		sourceActionIndexes: batch.map((item) => item.index),
	});
}

function describeScheduledGraphAction(scheduled: ScheduledEpisodeAction): string {
	const action = scheduled.action;
	if (action.type === "graph.create") {
		return `${scheduled.index} (graph.create ${action.key})`;
	}
	if (action.type === "graph.addClaim") {
		return `${scheduled.index} (graph.addClaim ${action.key})`;
	}
	if (action.type === "graph.set" || action.type === "graph.patch") {
		return `${scheduled.index} (${action.type} ${action.graph})`;
	}
	throw new Error(`Expected graph action, received ${action.type}.`);
}

function formatFrameTime(frame: number, fps: number): string {
	return `${(frame / fps).toFixed(2)}s`;
}

function createStaticGraphAnimation(
	state: GraphCompilerState,
	scheduled: ScheduledEpisodeAction,
): CompiledGraphAnimation {
	if (!state.debateCore) {
		throw new Error(`Graph ${state.key} must be created before it is displayed.`);
	}
	return {
		addedClaimIds: [],
		claimScoreVisibility: resolveClaimScoreVisibility(state),
		debateCore: state.debateCore,
		durationInFrames: 1,
		from: scheduled.from,
		graph: state.key,
		hideScores: state.hideScores,
		label: scheduled.label,
		plan: planStaticDebate({ debateCore: state.debateCore }),
		scoreboard: state.scoreboard,
		sourceActionIndexes: [scheduled.index],
	};
}

function resolveClaimScoreVisibility(
	state: GraphCompilerState,
): Readonly<Record<ClaimId, boolean>> {
	return Object.fromEntries(
		[...state.claimDefinitions.values()].map((definition) => [
			claimId(state.key, definition.key),
			!state.hideScores && (definition.showScore ?? true),
		]),
	) as Record<ClaimId, boolean>;
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
		key: claim.key,
		side: claim.side ?? existing!.side,
		showScore: claim.showScore ?? existing?.showScore,
		target: claim.target ?? existing?.target,
		text: claim.text ?? existing!.text,
		textReveal: claim.textReveal ?? existing?.textReveal,
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
