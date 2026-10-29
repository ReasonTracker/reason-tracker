import type { AddClaimCommand } from "@reasontracker/engine/debate-core/Commands.ts";
import type { ClaimId } from "@reasontracker/engine/debate-core/Claim.ts";
import {
	applyConfidenceClaimAddCommand,
	applyRelevanceClaimAddCommand,
} from "@reasontracker/engine/animation/applyDebateCommand.ts";
import { planDebateAnimationBatch } from "@reasontracker/engine/animation/planDebateAnimation.ts";

import type {
	CompiledGraphAnimation,
	CompiledScreenFill,
	ScheduledEpisodeAction,
} from "./compileEpisodeScript";
import {
	claimId,
	createAddCommand,
	requireClaimDefinition,
	resolveClaimScoreVisibility,
	type ClaimDefinition,
	type GraphCompilerState,
} from "./graphCompilerState";
import type { EpisodeOperation } from "./episodeScriptSpec";
import { resolveScreenFillTimingInFrames } from "./scheduleEpisodeActions";

export function compileGraphAddBatch(
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
	if (
		batch.length > 1
		&& batch.some((item) => item.action.type === "graph.addClaim" && item.action.presentation?.mode === "screen-fill")
	) {
		throw new Error(`Graph ${state.key}: a screen-fill claim cannot share a graph-add batch.`);
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
			reversible: action.reversible,
			reversedContent: action.reversedContent,
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
	const screenFill = first.action.type === "graph.addClaim"
		? compileScreenFill(first.action, state.key, fps)
		: undefined;
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
		screenFill,
		sourceActionIndexes: batch.map((item) => item.index),
	});
}

function compileScreenFill(
	action: Extract<EpisodeOperation, { type: "graph.addClaim" }>,
	graphKey: string,
	fps: number,
): CompiledScreenFill | undefined {
	const timing = resolveScreenFillTimingInFrames(action, fps);
	return timing
		? { ...timing, claimId: claimId(graphKey, action.key) }
		: undefined;
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
