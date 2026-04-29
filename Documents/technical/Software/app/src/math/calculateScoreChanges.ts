import type { Impact, Score, ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.js";
import { calculateScoreImpacts, calculateScores, withChildrenByParentId } from "./calculateScores.js";
import { sortClaimsLeavesToRoot } from "./sortClaimsLeavesToRoot.js";

export type ApplyCommandResult = {
	graph: ScoreGraph;
	/**
	 * ScoreNodes directly created, removed, connected, disconnected, or edited
	 * by the command. Ancestor changes are discovered by recalculation.
	 */
	directScoreNodeIds?: ScoreNodeId[];
};

export type ApplyCommandToScoreGraph<TCommand> = (
	graph: ScoreGraph,
	command: TCommand,
) => ScoreGraph | ApplyCommandResult;

export type ScoreChangeRun<TCommand> = {
	initialScores: Scores;
	commandRuns: CommandScoreChange<TCommand>[];
	finalGraph: ScoreGraph;
	finalScores: Scores;
};

export type CommandScoreChange<TCommand> = {
	command: TCommand;
	graphBefore: ScoreGraph;
	graphAfter: ScoreGraph;
	scoresBefore: Scores;
	scoresAfter: Scores;
	directScoreNodeIds: ScoreNodeId[];
	changedScoreNodeIds: ScoreNodeId[];
	propagation: ScorePropagationStep[];
};

export type ScorePropagationStep = {
	scoreNodeId: ScoreNodeId;
	changeType: "added" | "removed" | "changed";
	changeSource: "command" | "propagation";
	before?: Score;
	after?: Score;
	impacts: Impact[];
};

/**
 * Applies commands one at a time and records how score changes propagate.
 *
 * The command adapter mutates or rebuilds the scoring graph. This function
 * recalculates scores before and after each command and returns the ordered
 * score changes that a display can animate.
 */
export function calculateScoreChanges<TCommand>(args: {
	graph: ScoreGraph;
	commands: TCommand | readonly TCommand[];
	applyCommand: ApplyCommandToScoreGraph<TCommand>;
}): ScoreChangeRun<TCommand> {
	const commands = Array.isArray(args.commands) ? args.commands : [args.commands];

	let currentGraph = withChildrenByParentId(args.graph);
	let currentScores = calculateScores(currentGraph);

	const initialScores = currentScores;
	const commandRuns: CommandScoreChange<TCommand>[] = [];

	for (const command of commands) {
		const graphBefore = currentGraph;
		const scoresBefore = currentScores;

		const applied = normalizeApplyCommandResult(
			args.applyCommand(graphBefore, command),
		);

		const graphAfter = withChildrenByParentId(applied.graph);
		const scoresAfter = calculateScores(graphAfter);
		const changedScoreNodeIds = findChangedScoreNodeIds(scoresBefore, scoresAfter);
		const directScoreNodeIds = applied.directScoreNodeIds ?? [];
		const propagation = buildScorePropagation({
			graphBefore,
			graphAfter,
			scoresBefore,
			scoresAfter,
			directScoreNodeIds,
			changedScoreNodeIds,
		});

		commandRuns.push({
			command,
			graphBefore,
			graphAfter,
			scoresBefore,
			scoresAfter,
			directScoreNodeIds,
			changedScoreNodeIds,
			propagation,
		});

		currentGraph = graphAfter;
		currentScores = scoresAfter;
	}

	return {
		initialScores,
		commandRuns,
		finalGraph: currentGraph,
		finalScores: currentScores,
	};
}

function normalizeApplyCommandResult(result: ScoreGraph | ApplyCommandResult): ApplyCommandResult {
	if ("graph" in result) {
		return result;
	}

	return { graph: result };
}

function findChangedScoreNodeIds(before: Scores, after: Scores): ScoreNodeId[] {
	const ids = new Set<ScoreNodeId>([
		...(Object.keys(before) as ScoreNodeId[]),
		...(Object.keys(after) as ScoreNodeId[]),
	]);

	return [...ids].filter((id) => scoreChanged(before[id], after[id]));
}

function scoreChanged(before?: Score, after?: Score): boolean {
	if (!before || !after) {
		return before !== after;
	}

	return (
		before.value !== after.value ||
		before.rawValue !== after.rawValue ||
		before.weightedSum !== after.weightedSum ||
		before.totalWeight !== after.totalWeight
	);
}

function buildScorePropagation(args: {
	graphBefore: ScoreGraph;
	graphAfter: ScoreGraph;
	scoresBefore: Scores;
	scoresAfter: Scores;
	directScoreNodeIds: ScoreNodeId[];
	changedScoreNodeIds: ScoreNodeId[];
}): ScorePropagationStep[] {
	const changed = new Set(args.changedScoreNodeIds);
	const direct = new Set(args.directScoreNodeIds);
	const afterOrder = sortClaimsLeavesToRoot(args.graphAfter).filter((id: ScoreNodeId) => changed.has(id));
	const removedIds = args.changedScoreNodeIds.filter((id: ScoreNodeId) => !args.scoresAfter[id]);
	const orderedIds = [...afterOrder, ...removedIds];

	return orderedIds.map((scoreNodeId) => {
		const before = args.scoresBefore[scoreNodeId];
		const after = args.scoresAfter[scoreNodeId];

		return {
			scoreNodeId,
			changeType: getChangeType(before, after),
			changeSource: direct.has(scoreNodeId) ? "command" : "propagation",
			before,
			after,
			impacts: after ? calculateScoreImpacts(scoreNodeId, args.graphAfter, args.scoresAfter) : [],
		};
	});
}

function getChangeType(before?: Score, after?: Score): ScorePropagationStep["changeType"] {
	if (!before && after) {
		return "added";
	}

	if (before && !after) {
		return "removed";
	}

	return "changed";
}
