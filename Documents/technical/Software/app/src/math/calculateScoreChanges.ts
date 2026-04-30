import type { Impact, Score, ScoreGraph, ScoreNodeId, Scores } from "./scoreTypes.ts";
import { withChildrenByParentId } from "./calculateScores.ts";
import {
	calculateScoreRun,
	type ScoreCalculationAudit,
	type ScoreCalculationGroup,
	type ScoreCycleResolutionOptions,
} from "./calculateScoreRun.ts";

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
	initialAudit: ScoreCalculationAudit;
	commandRuns: CommandScoreChange<TCommand>[];
	finalGraph: ScoreGraph;
	finalScores: Scores;
	finalAudit: ScoreCalculationAudit;
};

export type CommandScoreChange<TCommand> = {
	command: TCommand;
	graphBefore: ScoreGraph;
	graphAfter: ScoreGraph;
	scoresBefore: Scores;
	scoresAfter: Scores;
	scoreAuditBefore: ScoreCalculationAudit;
	scoreAuditAfter: ScoreCalculationAudit;
	directScoreNodeIds: ScoreNodeId[];
	changedScoreNodeIds: ScoreNodeId[];
	propagation: ScorePropagationStep[];
};

export type ScorePropagationStep = {
	scoreNodeId: ScoreNodeId;
	changeType: "added" | "removed" | "changed";
	changeSource: "command" | "propagation";
	propagationGroupId: string;
	propagationGroupType: "node" | "cycle";
	before?: Score;
	after?: Score;
	impacts: Impact[];
	impactMode: "direct" | "variant-average";
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
	cycleResolution?: ScoreCycleResolutionOptions;
}): ScoreChangeRun<TCommand> {
	const commands = Array.isArray(args.commands) ? args.commands : [args.commands];

	let currentGraph = withChildrenByParentId(args.graph);
	let currentCalculation = calculateScoreRun(currentGraph, args.cycleResolution);
	let currentScores = currentCalculation.scores;

	const initialScores = currentScores;
	const initialAudit = currentCalculation.audit;
	const commandRuns: CommandScoreChange<TCommand>[] = [];

	for (const command of commands) {
		const graphBefore = currentGraph;
		const scoresBefore = currentScores;
		const scoreAuditBefore = currentCalculation.audit;

		const applied = normalizeApplyCommandResult(
			args.applyCommand(graphBefore, command),
		);

		const graphAfter = withChildrenByParentId(applied.graph);
		const calculationAfter = calculateScoreRun(graphAfter, args.cycleResolution);
		const scoresAfter = calculationAfter.scores;
		const changedScoreNodeIds = findChangedScoreNodeIds(scoresBefore, scoresAfter);
		const directScoreNodeIds = applied.directScoreNodeIds ?? [];
		const propagation = buildScorePropagation({
			scoresBefore,
			scoresAfter,
			directScoreNodeIds,
			changedScoreNodeIds,
			calculationAfter,
		});

		commandRuns.push({
			command,
			graphBefore,
			graphAfter,
			scoresBefore,
			scoresAfter,
			scoreAuditBefore,
			scoreAuditAfter: calculationAfter.audit,
			directScoreNodeIds,
			changedScoreNodeIds,
			propagation,
		});

		currentGraph = graphAfter;
		currentCalculation = calculationAfter;
		currentScores = scoresAfter;
	}

	return {
		initialScores,
		initialAudit,
		commandRuns,
		finalGraph: currentGraph,
		finalScores: currentScores,
		finalAudit: currentCalculation.audit,
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
	scoresBefore: Scores;
	scoresAfter: Scores;
	directScoreNodeIds: ScoreNodeId[];
	changedScoreNodeIds: ScoreNodeId[];
	calculationAfter: {
		groups: ScoreCalculationGroup[];
		impactsByScoreNodeId: Partial<Record<ScoreNodeId, Impact[]>>;
		impactMode: "direct" | "variant-average";
	};
}): ScorePropagationStep[] {
	const changed = new Set(args.changedScoreNodeIds);
	const direct = new Set(args.directScoreNodeIds);
	const groupByScoreNodeId = new Map<ScoreNodeId, ScoreCalculationGroup>();

	for (const group of args.calculationAfter.groups) {
		for (const scoreNodeId of group.scoreNodeIds) {
			groupByScoreNodeId.set(scoreNodeId, group);
		}
	}

	const afterOrder = args.calculationAfter.groups.flatMap((group) =>
		group.scoreNodeIds.filter((id: ScoreNodeId) => changed.has(id)),
	);
	const removedIds = args.changedScoreNodeIds.filter((id: ScoreNodeId) => !args.scoresAfter[id]);
	const orderedIds = [...afterOrder, ...removedIds];

	return orderedIds.map((scoreNodeId) => {
		const before = args.scoresBefore[scoreNodeId];
		const after = args.scoresAfter[scoreNodeId];
		const group = groupByScoreNodeId.get(scoreNodeId);

		return {
			scoreNodeId,
			changeType: getChangeType(before, after),
			changeSource: direct.has(scoreNodeId) ? "command" : "propagation",
			propagationGroupId: group?.id ?? `removed:${scoreNodeId}`,
			propagationGroupType: group?.type ?? "node",
			before,
			after,
			impacts: after ? args.calculationAfter.impactsByScoreNodeId[scoreNodeId] ?? [] : [],
			impactMode: args.calculationAfter.impactMode,
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
