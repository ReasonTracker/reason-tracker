import { planStaticDebate } from "@reasontracker/engine/animation/planDebateAnimation.ts";

import type {
	CompiledGraphAnimation,
	ScheduledEpisodeAction,
} from "./compileEpisodeScript";
import {
	applyGraphPatch,
	applyGraphSet,
	createDebateCore,
	createStaticGraphAnimation,
	requireGraphState,
	resolveClaimScoreVisibility,
	setClaimDefinition,
	type GraphCompilerState,
} from "./graphCompilerState";
import { compileGraphAddBatch } from "./compileGraphAddBatch";
import type {
	EpisodeAction,
	EpisodeScriptSpec,
	ScoreboardLayout,
} from "./episodeScriptSpec";

type GraphAction = Extract<EpisodeAction, { type: `graph.${string}` }>
	| Extract<EpisodeAction, { type: "scoreboard.create" }>;

export function compileGraphActions(
	spec: EpisodeScriptSpec,
	actions: readonly ScheduledEpisodeAction[],
): readonly CompiledGraphAnimation[] {
	const graphStates = new Map<string, GraphCompilerState>();
	const scoreboardLayouts = new Map<string, { index: number; layout: ScoreboardLayout }>();
	const animations: CompiledGraphAnimation[] = [];
	const graphActions = actions
		.filter(isScheduledGraphAction);
	graphActions.sort((left, right) => left.from - right.from || left.index - right.index);

	for (let actionIndex = 0; actionIndex < graphActions.length;) {
		const scheduled = graphActions[actionIndex]!;
		const action = scheduled.action;

		if (action.type === "scoreboard.create") {
			if (scoreboardLayouts.has(action.graph)) {
				throw new Error(`Action ${scheduled.index} creates duplicate scoreboard for graph: ${action.graph}`);
			}
			scoreboardLayouts.set(action.graph, { index: scheduled.index, layout: action.layout });
			const state = graphStates.get(action.graph);
			if (state) {
				state.scoreboard = action.layout;
				animations.push(createStaticGraphAnimation(state, scheduled));
			}
			actionIndex += 1;
			continue;
		}

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
				scoreboard: scoreboardLayouts.get(action.key)?.layout,
			};
			state.claimDefinitions.set(action.mainClaim.key, {
				defaultConfidence: action.mainClaim.defaultConfidence,
				defaultRelevance: action.mainClaim.defaultRelevance,
				key: action.mainClaim.key,
				reversible: action.mainClaim.reversible,
				reversedContent: action.mainClaim.reversedContent,
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
				sourceActionIndexes: [
					scheduled.index,
					...(scoreboardLayouts.get(action.key)?.index === undefined
						? []
						: [scoreboardLayouts.get(action.key)!.index]),
				],
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
	for (const [graphKey, scoreboard] of scoreboardLayouts) {
		if (!graphStates.has(graphKey)) {
			throw new Error(`Action ${scoreboard.index} creates a scoreboard for unknown graph: ${graphKey}`);
		}
	}

	return animations;
}

function isScheduledGraphAction(
	action: ScheduledEpisodeAction,
): action is ScheduledEpisodeAction & { action: GraphAction } {
	return action.action.type.startsWith("graph.") || action.action.type === "scoreboard.create";
}
