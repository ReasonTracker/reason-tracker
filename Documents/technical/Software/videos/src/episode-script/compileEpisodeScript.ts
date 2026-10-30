import type { ClaimId } from "@reasontracker/engine/debate-core/Claim.ts";
import type { DebateCore } from "@reasontracker/engine/debate-core/Debate.ts";
import type { AnimationStepId, DebateAnimationPlan } from "@reasontracker/engine/animation/DebateAnimationPlan.ts";

import {
	episodeScriptSpecSchema,
	type EpisodeOperation,
	type EpisodeScriptSpec,
	type ScoreboardLayout,
	type Anchor,
	type CssStyle,
	type ObjectLayout,
} from "./episodeScriptSpec";
import { compileSceneObjects } from "./compileSceneObjects";
import { compileGraphActions } from "./compileGraphActions";
import { claimId } from "./graphCompilerState";
import { resolveGraphSceneTargets } from "./graphSceneTargets";
import {
	GRAPH_PHASES,
	SCREEN_FILL_GRAPH_PHASES,
} from "./episodeScriptConstants";
import {
	resolveScreenFillTimingInFrames,
	scheduleActions,
} from "./scheduleEpisodeActions";
import {
	resolveObjectLayoutBounds,
	resolveSceneObjectStates,
} from "./sceneObjectPlayback";

export { resolveSceneObjectStates };

const SUPPORTED_ACTION_TYPES = [
	"balance.add",
	"balance.update",
	"camera.cut",
	"camera.move",
	"captions.show",
	"defaults.update",
	"graph.addClaim",
	"graph.create",
	"graph.patch",
	"graph.set",
	"media.add",
	"media.update",
	"scoreboard.create",
	"wait",
] as const;

type SceneObject =
	| { aspectRatio: number; source: string; type: "media" }
	| { scorePercent: number; type: "balance" };

export type EpisodeMediaAsset = {
	aspectRatio: number
	src: string
};

export type ScheduledEpisodeAction = {
	action: EpisodeOperation
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
	screenFill?: CompiledScreenFill
	sourceActionIndexes: readonly number[]
};

export type CompiledScreenFill = {
	claimId: ClaimId
	graphPhaseDurationInFrames: Readonly<Record<Exclude<AnimationStepId, "voila">, number>>
	holdDurationInFrames: number
	revealDurationInFrames: number
	settleDurationInFrames: number
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
	screenFill?: {
		progress: number
		stage: "hold" | "reveal" | "settle"
	}
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
	const claimTextReveals = compileClaimTextReveals(actions, spec.settings.composition.fps);
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

function compileClaimTextReveals(
	actions: readonly ScheduledEpisodeAction[],
	fps: number,
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
			const screenFill = resolveScreenFillTimingInFrames(action, fps);
			reveals[claimId(action.graph, action.key)] = requireClaimTextReveal(
				scheduled,
				screenFill?.revealDurationInFrames,
			);
		}
	}
	return reveals;
}

function requireClaimTextReveal(
	action: ScheduledEpisodeAction,
	durationInFrames = action.durationInFrames,
): ClaimTextReveal {
	if (durationInFrames < 1) {
		throw new Error(`Action ${action.index} enables textReveal but has no duration.`);
	}
	return { durationInFrames, from: action.from };
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
	if (animation.screenFill) {
		return resolveScreenFillPlayback(animation, frame);
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

function resolveScreenFillPlayback(
	animation: CompiledGraphAnimation,
	frame: number,
): GraphPlayback {
	const screenFill = animation.screenFill;
	if (!screenFill) {
		throw new Error("Expected a screen-fill graph animation.");
	}
	let elapsedFrame = Math.max(0, frame - animation.from);
	for (const [stage, durationInFrames] of [
		["reveal", screenFill.revealDurationInFrames],
		["hold", screenFill.holdDurationInFrames],
		["settle", screenFill.settleDurationInFrames],
	] as const) {
		if (durationInFrames > 0 && elapsedFrame < durationInFrames) {
			return {
				animation,
				screenFill: { progress: elapsedFrame / Math.max(1, durationInFrames - 1), stage },
				stepProgress: 0,
			};
		}
		elapsedFrame -= durationInFrames;
	}
	for (const stepId of SCREEN_FILL_GRAPH_PHASES) {
		const durationInFrames = screenFill.graphPhaseDurationInFrames[stepId];
		if (durationInFrames > 0 && elapsedFrame < durationInFrames) {
			return {
				animation,
				stepId,
				stepProgress: elapsedFrame / Math.max(1, durationInFrames - 1),
			};
		}
		elapsedFrame -= durationInFrames;
	}
	return { animation, stepId: "wave", stepProgress: 1 };
}
