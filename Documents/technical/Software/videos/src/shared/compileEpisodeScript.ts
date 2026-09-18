import type { AddClaimCommand } from "@debate-core/Commands.ts";
import type { Claim, ClaimId } from "@debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConfidenceConnectorId,
	RelevanceConnector,
	RelevanceConnectorId,
	TargetRelation,
} from "@debate-core/Connector.ts";
import type { DebateCore } from "@debate-core/Debate.ts";
import {
	applyConfidenceClaimAddCommand,
	applyRelevanceClaimAddCommand,
} from "@planner/applyDebateCommand.ts";
import type { AnimationStepId, DebateAnimationPlan } from "@planner/DebateAnimationPlan.ts";
import { planDebateAnimationBatch, planStaticDebate } from "@planner/planner.ts";

import {
	episodeScriptSpecSchema,
	type ClaimSide,
	type EpisodeAction,
	type EpisodeScriptSpec,
	type GraphClaimState,
	type GraphLayout,
	type MediaLayout,
	type MediaLayoutUpdate,
	type ScoreboardLayout,
	type Anchor,
	type CssStyle,
	type Duration,
	type EpisodeClaim,
	type ObjectLayout,
} from "./episodeScriptSpec";
import { resolveGraphSceneTargets } from "./graphSceneTargets";
import { calculateTextDurationSeconds } from "./textDuration";

const DEFAULT_DURATION: Readonly<Record<EpisodeAction["type"], Duration>> = {
	"camera.cut": 0,
	"camera.move": 1.2,
	"media.add": 0,
	"media.update": 0,
	"balance.add": 0,
	"balance.update": 0,
	"captions.show": "text",
	"graph.addClaim": "text",
	"graph.create": "text",
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
type SceneObjectAddAction = Extract<EpisodeAction, { type: "media.add" | "balance.add" }>;
type SceneObjectUpdateAction = Extract<EpisodeAction, { type: "media.update" | "balance.update" }>;
type SceneObjectAction = SceneObjectAddAction | SceneObjectUpdateAction;
type SceneObject =
	| { aspectRatio: number; source: string; type: "media" }
	| { scorePercent: number; type: "balance" };

export type EpisodeMediaAsset = {
	aspectRatio: number
	src: string
};

type ClaimDefinition = EpisodeClaim & {
	side: ClaimSide
	showScore?: boolean
	target?: ClaimTarget
	textReveal?: boolean
};

type GraphCompilerState = {
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
	anchor: Anchor
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

export type ResolvedSceneObjectState = {
	anchor: Anchor
	layout: ObjectLayout
	object: SceneObject
	style: CssStyle
};

export type SceneTarget = {
	id: string
	parentId?: string
	anchor: Anchor
	bounds: { minX: number; minY: number; width: number; height: number }
};

export type CompiledSceneObjectTransition = {
	durationInFrames: number
	from: number
	initialState: ResolvedSceneObjectState
	targetState: ResolvedSceneObjectState
};

export type CompiledSceneObject = {
	from: number
	initialState: ResolvedSceneObjectState
	key: string
	transitions: readonly CompiledSceneObjectTransition[]
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
	sceneObjects: readonly CompiledSceneObject[]
	spec: EpisodeScriptSpec
};

export function compileEpisodeScript(
	input: unknown,
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>> = {},
): CompiledEpisodeScript {
	const result = episodeScriptSpecSchema.safeParse(input);
	if (!result.success) {
		throw new Error(formatEpisodeScriptValidationError(input, result.error.issues));
	}
	const spec = result.data;
	const actions = scheduleActions(spec);
	const graphAnimations = compileGraphActions(spec, actions);
	const claimTextReveals = compileClaimTextReveals(actions);
	const sceneObjects = compileSceneObjects(actions, mediaAssets);
	assertUniqueSceneTargetRoots(graphAnimations, sceneObjects);

	return {
		actions,
		claimTextReveals,
		composition: spec.settings.composition,
		durationInFrames: Math.max(1, ...actions.map((action) => action.endFrame)),
		graphAnimations,
		sceneObjects,
		spec,
	};
}

function assertUniqueSceneTargetRoots(
	graphAnimations: readonly CompiledGraphAnimation[],
	sceneObjects: readonly CompiledSceneObject[],
): void {
	const graphKeys = new Set(graphAnimations.map((animation) => animation.graph));
	const duplicate = sceneObjects.find((sceneObject) => graphKeys.has(sceneObject.key));
	if (duplicate) {
		throw new Error(`Graph and retained object keys share the scene target namespace: ${duplicate.key}`);
	}
}

function formatEpisodeScriptValidationError(
	input: unknown,
	issues: readonly EpisodeScriptValidationIssue[],
): string {
	return ["Invalid episode script:", ...issues.map((issue) => formatEpisodeScriptIssue(input, issue))]
		.join("\n");
}

function formatEpisodeScriptIssue(
	input: unknown,
	issue: EpisodeScriptValidationIssue,
): string {
	const [root, actionIndex, field, ...nestedPath] = issue.path;
	if (root === "script" && typeof actionIndex === "number") {
		const actionType = getEpisodeActionType(input, actionIndex);
		if (field === "type") {
			return `- script[${actionIndex}] (${String(actionType)}): type must be one of ${SUPPORTED_ACTION_TYPES.join(", ")}.`;
		}
		const property = [field, ...nestedPath].filter((part) => part !== undefined).join(".");
		return `- script[${actionIndex}] (${String(actionType)})${property ? `.${property}` : ""}: ${describeEpisodeScriptIssue(issue)}`;
	}
	const path = issue.path.length > 0 ? issue.path.join(".") : "root";
	return `- ${path}: ${describeEpisodeScriptIssue(issue)}`;
}

type EpisodeScriptValidationIssue = {
	code?: string
	expected?: string
	input?: unknown
	maximum?: number | bigint
	minimum?: number | bigint
	keys?: readonly string[]
	message: string
	origin?: string
	path: readonly PropertyKey[]
};

function describeEpisodeScriptIssue(issue: EpisodeScriptValidationIssue): string {
	if (issue.code === "invalid_type") {
		return issue.input === undefined
			? "is required."
			: `must be ${issue.expected ?? "the required type"}; received ${JSON.stringify(issue.input)}.`;
	}
	if (issue.code === "unrecognized_keys") {
		return `does not allow ${issue.keys?.map((key) => JSON.stringify(key)).join(", ") ?? "these fields"}.`;
	}
	if (issue.code === "invalid_union") {
		return "must use exactly one supported object shape.";
	}
	if (issue.code === "too_small") {
		const unit = issue.origin === "array" ? " item(s)" : " character(s)";
		return `must contain at least ${String(issue.minimum)}${unit}.`;
	}
	if (issue.code === "too_big") {
		const unit = issue.origin === "array" ? " item(s)" : " character(s)";
		return `must contain no more than ${String(issue.maximum)}${unit}.`;
	}
	return issue.message;
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

export function resolveSceneObjectStates(
	episode: CompiledEpisodeScript,
	frame: number,
): readonly (ResolvedSceneObjectState & Pick<CompiledSceneObject, "key">)[] {
	return episode.sceneObjects
		.filter((sceneObject) => sceneObject.from <= frame)
		.map((sceneObject) => ({
			...resolveSceneObjectState(sceneObject, frame),
			key: sceneObject.key,
		}));
}

export function resolveSceneTargets(
	episode: CompiledEpisodeScript,
	frame: number,
): readonly SceneTarget[] {
	const sceneObjectTargets = resolveSceneObjectStates(episode, frame).map((sceneObject): SceneTarget => {
		return {
			anchor: sceneObject.anchor,
			bounds: resolveObjectLayoutBounds(sceneObject.layout),
			id: sceneObject.key,
		};
	});
	const playback = resolveGraphPlayback(episode, frame);
	return playback
		? [...sceneObjectTargets, ...resolveGraphSceneTargets(playback)]
		: sceneObjectTargets;
}

function resolveObjectLayoutBounds(layout: ObjectLayout): SceneTarget["bounds"] {
	const originX = layout.originX ?? layout.width / 2;
	const originY = layout.originY ?? layout.height / 2;
	const radians = layout.rotation * (Math.PI / 180);
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const corners = [
		[0, 0],
		[layout.width, 0],
		[layout.width, layout.height],
		[0, layout.height],
	].map(([x, y]) => {
		const scaledX = (x! - originX) * layout.scale;
		const scaledY = (y! - originY) * layout.scale;
		return {
			x: layout.x + originX + (scaledX * cosine) - (scaledY * sine),
			y: layout.y + originY + (scaledX * sine) + (scaledY * cosine),
		};
	});
	const minX = Math.min(...corners.map((corner) => corner.x));
	const minY = Math.min(...corners.map((corner) => corner.y));
	const maxX = Math.max(...corners.map((corner) => corner.x));
	const maxY = Math.max(...corners.map((corner) => corner.y));
	return { height: maxY - minY, minX, minY, width: maxX - minX };
}

function compileSceneObjects(
	actions: readonly ScheduledEpisodeAction[],
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
): readonly CompiledSceneObject[] {
	type SceneObjectCompilerState = {
		compiled: {
			from: number
			initialState: ResolvedSceneObjectState
			key: string
			transitions: CompiledSceneObjectTransition[]
		}
		lastTransitionEndFrame: number
		state: ResolvedSceneObjectState
	};

	const states = new Map<string, SceneObjectCompilerState>();
	const objectActions = actions
		.filter(isScheduledSceneObjectAction)
		.sort((left, right) => left.from - right.from || left.index - right.index);

	for (const scheduled of objectActions) {
		const action = scheduled.action;
		if (isSceneObjectAddAction(action)) {
			if (states.has(action.key)) {
				throw new Error(`Action ${scheduled.index} creates duplicate object key: ${action.key}`);
			}
			const initialState = createSceneObjectState(action, mediaAssets, scheduled.index);
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
		const targetState = mergeSceneObjectState(state.state, action, scheduled.index, mediaAssets);
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

function createSceneObjectState(
	action: SceneObjectAddAction,
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
	actionIndex: number,
): ResolvedSceneObjectState {
	const style = { ...DEFAULT_SCREEN_OBJECT_STYLE, ...action.style };
	switch (action.type) {
		case "media.add": {
			const mediaAsset = requireMediaAsset(mediaAssets, action.source, actionIndex);
			return {
				anchor: action.anchor,
				layout: resolveMediaLayout(action.layout, mediaAsset.aspectRatio),
				object: { aspectRatio: mediaAsset.aspectRatio, source: action.source, type: "media" },
				style,
			};
		}
		case "balance.add":
			return { anchor: action.anchor, layout: action.layout, object: { scorePercent: action.scorePercent, type: "balance" }, style };
	}
}

function mergeSceneObjectState(
	state: ResolvedSceneObjectState,
	action: SceneObjectUpdateAction,
	actionIndex: number,
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
): ResolvedSceneObjectState {
	const object = updateSceneObject(state.object, action, actionIndex, mediaAssets);
	return {
		anchor: state.anchor,
		layout: object.type === "media" && action.type === "media.update"
			? resolveMediaLayout(action.layout, object.aspectRatio, state.layout)
			: { ...state.layout, ...action.layout },
		object,
		style: { ...state.style, ...action.style },
	};
}

function updateSceneObject(
	object: SceneObject,
	action: SceneObjectUpdateAction,
	actionIndex: number,
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
): SceneObject {
	switch (action.type) {
		case "media.update":
			if (object.type !== "media") {
				throwSceneObjectKindMismatch(actionIndex, object, action);
			}
			if (!action.source) {
				return object;
			}
			const mediaAsset = requireMediaAsset(mediaAssets, action.source, actionIndex);
			return { aspectRatio: mediaAsset.aspectRatio, source: action.source, type: "media" };
		case "balance.update":
			if (object.type !== "balance") {
				throwSceneObjectKindMismatch(actionIndex, object, action);
			}
			return { ...object, scorePercent: action.scorePercent ?? object.scorePercent };
	}
}

function requireMediaAsset(
	mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
	source: string,
	actionIndex: number,
): EpisodeMediaAsset {
	const mediaAsset = mediaAssets[source];
	if (!mediaAsset || !Number.isFinite(mediaAsset.aspectRatio) || mediaAsset.aspectRatio <= 0) {
		throw new Error(`Action ${actionIndex} references media source without a valid intrinsic aspect ratio: ${source}`);
	}
	return mediaAsset;
}

function resolveMediaLayout(
	layout: MediaLayout | MediaLayoutUpdate | undefined,
	aspectRatio: number,
	previousLayout?: ObjectLayout,
): ObjectLayout {
	const width = layout?.width ?? (layout?.height === undefined
		? previousLayout?.width
		: layout.height * aspectRatio);
	if (width === undefined) {
		throw new Error("Media layout requires a width or height.");
	}
	const height = layout?.height ?? width / aspectRatio;
	return {
		height,
		originX: layout?.originX ?? previousLayout?.originX ?? width / 2,
		originY: layout?.originY ?? previousLayout?.originY ?? height / 2,
		rotation: layout?.rotation ?? previousLayout?.rotation ?? 0,
		scale: layout?.scale ?? previousLayout?.scale ?? 1,
		width,
		x: layout?.x ?? previousLayout?.x ?? 0,
		y: layout?.y ?? previousLayout?.y ?? 0,
	};
}

function throwSceneObjectKindMismatch(
	actionIndex: number,
	object: SceneObject,
	action: SceneObjectUpdateAction,
): never {
	throw new Error(
		`Action ${actionIndex} updates a ${object.type} object with ${action.type} changes. Object kinds cannot change.`,
	);
}

function resolveSceneObjectState(
	sceneObject: CompiledSceneObject,
	frame: number,
): ResolvedSceneObjectState {
	let state = sceneObject.initialState;
	for (const transition of sceneObject.transitions) {
		if (frame < transition.from) {
			break;
		}
		const progress = transition.durationInFrames <= 1
			? 1
			: Math.min(1, (frame - transition.from) / (transition.durationInFrames - 1));
		state = interpolateSceneObjectState(transition.initialState, transition.targetState, progress);
	}
	return state;
}

function interpolateSceneObjectState(
	initialState: ResolvedSceneObjectState,
	targetState: ResolvedSceneObjectState,
	progress: number,
): ResolvedSceneObjectState {
	return {
		anchor: initialState.anchor,
		layout: interpolateObjectLayout(initialState.layout, targetState.layout, progress),
		object: interpolateSceneObject(initialState.object, targetState.object, progress),
		style: interpolateCssStyle(initialState.style, targetState.style, progress),
	};
}

function interpolateObjectLayout(
	initialLayout: ObjectLayout,
	targetLayout: ObjectLayout,
	progress: number,
): ObjectLayout {
	return {
		height: interpolateNumber(initialLayout.height, targetLayout.height, progress),
		originX: interpolateNumber(
			initialLayout.originX ?? initialLayout.width / 2,
			targetLayout.originX ?? targetLayout.width / 2,
			progress,
		),
		originY: interpolateNumber(
			initialLayout.originY ?? initialLayout.height / 2,
			targetLayout.originY ?? targetLayout.height / 2,
			progress,
		),
		rotation: interpolateNumber(initialLayout.rotation, targetLayout.rotation, progress),
		scale: interpolateNumber(initialLayout.scale, targetLayout.scale, progress),
		width: interpolateNumber(initialLayout.width, targetLayout.width, progress),
		x: interpolateNumber(initialLayout.x, targetLayout.x, progress),
		y: interpolateNumber(initialLayout.y, targetLayout.y, progress),
	};
}

function interpolateSceneObject(
	initialObject: SceneObject,
	targetObject: SceneObject,
	progress: number,
): SceneObject {
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

	const lastAnimationFrame = Math.max(0, animation.durationInFrames - 1);
	const animationFrame = Math.min(lastAnimationFrame, Math.max(0, frame - animation.from));
	let accumulatedWeight = 0;
	let phaseStartFrame = 0;
	for (const [step, weight] of GRAPH_PHASES) {
		accumulatedWeight += weight;
		const phaseEndFrame = step === "wave"
			? lastAnimationFrame
			: Math.round(accumulatedWeight * lastAnimationFrame);
		if (animationFrame < phaseEndFrame || step === "wave") {
			const phaseDuration = phaseEndFrame - phaseStartFrame;
			return {
				animation,
				stepId: step,
				stepProgress: phaseDuration <= 0
					? 1
					: Math.min(1, Math.max(
						0,
						(animationFrame - phaseStartFrame) / phaseDuration,
					)),
			};
		}
		phaseStartFrame = phaseEndFrame;
	}

	return { animation, stepId: "wave", stepProgress: 1 };
}

function scheduleActions(spec: EpisodeScriptSpec): readonly ScheduledEpisodeAction[] {
	const { fps } = spec.settings.composition;
	let cursorFrame = 0;

	return spec.script.map((action, index) => {
		const durationInSeconds = resolveDurationInSeconds(spec, action);
		const durationInFrames = Math.max(0, Math.round(durationInSeconds * fps));
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

function resolveDurationInSeconds(spec: EpisodeScriptSpec, action: EpisodeAction): number {
	const duration = action.duration ?? resolveDefaultDuration(spec, action);
	if (duration !== "text") {
		return duration;
	}
	const text = getDurationText(action);
	if (text === undefined) {
		throw new Error(`Action ${action.type} uses a text duration without text content.`);
	}
	return calculateTextDurationSeconds(text);
}

function resolveDefaultDuration(spec: EpisodeScriptSpec, action: EpisodeAction): Duration {
	const defaults = spec.settings.defaults;
	switch (action.type) {
		case "graph.create":
			return defaults?.["graph.create"]?.duration
				?? DEFAULT_DURATION[action.type];
		case "graph.addClaim":
			return defaults?.["graph.addClaim"]?.duration
				?? DEFAULT_DURATION[action.type];
		case "camera.move":
			return defaults?.["camera.move"]?.duration
				?? DEFAULT_DURATION[action.type];
		case "graph.patch":
		case "graph.set":
			return getDurationText(action) === undefined ? DEFAULT_DURATION[action.type] : "text";
		default:
			return DEFAULT_DURATION[action.type];
	}
}

function getDurationText(action: EpisodeAction): string | undefined {
	switch (action.type) {
		case "captions.show":
		case "graph.addClaim":
			return action.text;
		case "graph.create":
			return [action.mainClaim.text, ...(action.claims ?? []).map((claim) => claim.text)].join("");
		case "graph.patch":
		case "graph.set": {
			const text = action.claims.flatMap((claim) => claim.text === undefined ? [] : [claim.text]).join("");
			return text || undefined;
		}
		default:
			return undefined;
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
				anchor: action.anchor,
				claimDefinitions: new Map(),
				hideScores: action.hideScores ?? false,
				key: action.key,
				lastAnimationEndFrame: 0,
				layout: action.layout,
				scoreboard: action.scoreboard,
			};
			state.claimDefinitions.set(action.mainClaim.key, {
				defaultConfidence: action.mainClaim.defaultConfidence,
				defaultRelevance: action.mainClaim.defaultRelevance,
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
				anchor: state.anchor,
				claimScoreVisibility: resolveClaimScoreVisibility(state),
				debateCore: state.debateCore,
				durationInFrames: Math.max(1, scheduled.durationInFrames),
				from: scheduled.from,
				graph: action.key,
				hideScores: state.hideScores,
				label: scheduled.label,
				plan: planStaticDebate({
					debateCore: state.debateCore,
					origin: state.layout,
				}),
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

function isScheduledSceneObjectAction(
	action: ScheduledEpisodeAction,
): action is ScheduledEpisodeAction & { action: SceneObjectAction } {
	return isSceneObjectAddAction(action.action) || isSceneObjectUpdateAction(action.action);
}

function isSceneObjectAddAction(action: EpisodeAction): action is SceneObjectAddAction {
	return action.type === "media.add" || action.type === "balance.add";
}

function isSceneObjectUpdateAction(action: EpisodeAction): action is SceneObjectUpdateAction {
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
	const initialDebateCore = state.debateCore;

	const commands = batch.map((scheduled): AddClaimCommand => {
		if (scheduled.action.type !== "graph.addClaim") {
			throw new Error("Internal graph batch contains a non-add action.");
		}
		const action = scheduled.action;
		if (state.debateCore?.claims[claimId(state.key, action.key)]) {
			throw new Error(`Action ${scheduled.index} adds duplicate claim key: ${action.key}`);
		}
		const targetKey = typeof action.target === "string" ? action.target : action.target.relevanceOf;
		const target = requireClaimDefinition(state, targetKey, scheduled.index);
		const definition: ClaimDefinition = {
			defaultConfidence: action.defaultConfidence,
			defaultRelevance: action.defaultRelevance,
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
		debateCore: initialDebateCore,
		origin: state.layout,
	});
	const addedClaimIds: ClaimId[] = [];
	for (const command of commands) {
		const applied: ReturnType<typeof applyConfidenceClaimAddCommand> | ReturnType<typeof applyRelevanceClaimAddCommand> = command.type === "confidence/claim/add"
			? applyConfidenceClaimAddCommand({ command, debateCore: state.debateCore! })
			: applyRelevanceClaimAddCommand({ command, debateCore: state.debateCore! });
		state.debateCore = applied.debateCore;
		addedClaimIds.push(applied.claimId);
	}
	state.lastAnimationEndFrame = first.endFrame;
	state.lastAnimationAction = first;
	animations.push({
		addedClaimIds,
		anchor: state.anchor,
		claimScoreVisibility: resolveClaimScoreVisibility(state),
		debateCore: state.debateCore!,
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
	return {
		content: definition.text,
		defaultConfidence: definition.defaultConfidence,
		defaultRelevance: definition.defaultRelevance,
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
		defaultConfidence: claim.defaultConfidence ?? existing?.defaultConfidence,
		defaultRelevance: claim.defaultRelevance ?? existing?.defaultRelevance,
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
