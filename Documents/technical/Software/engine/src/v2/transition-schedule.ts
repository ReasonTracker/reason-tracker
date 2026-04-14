// See 📌README.md in this folder for local coding standards before editing this file.

import type { Change, Debate, Intent } from "../../../contracts/src/v2/index.ts";
import { applyChanges } from "./applyChanges.ts";
import { assertNever } from "./graph.ts";
import { calculateLayoutPipeline, type DebateLayoutPipelineContext, type LayoutOptions } from "./layout.ts";

export interface PrepareChangeScheduleRequest {
	debate: Debate
	intent?: Intent
	eventDurationInFrames: number
	layoutOptions?: LayoutOptions
}

export interface ChangeTransitionUnit {
	name: string
	from: DebateLayoutPipelineContext
	to: DebateLayoutPipelineContext
	changes: readonly Change[]
	durationInFrames: number
}

export type AnimationTransitionUnit = ChangeTransitionUnit;

export interface PreparedChangeSchedule {
	initialPipeline: DebateLayoutPipelineContext
	transitionUnits: ChangeTransitionUnit[]
	finalPipeline: DebateLayoutPipelineContext
}

export type PrepareAnimationScheduleRequest = PrepareChangeScheduleRequest;
export type PreparedAnimationSchedule = PreparedChangeSchedule;

export async function prepareChangeSchedule(
	request: PrepareChangeScheduleRequest,
): Promise<PreparedChangeSchedule> {
	const initialPipeline = await calculateLayoutPipeline({
		debate: request.debate,
	}, request.layoutOptions);
	const intent = request.intent;
	if (!intent) {
		return {
			initialPipeline,
			transitionUnits: [],
			finalPipeline: initialPipeline,
		};
	}

	const unscheduledUnits: Array<Omit<ChangeTransitionUnit, "durationInFrames">> = [];
	let workingDebate = request.debate;
	let workingPipeline = initialPipeline;
	let pendingChanges: Change[] = [];
	let pendingDebate = workingDebate;

	for (const change of intent.changes) {
		pendingDebate = applyChanges(pendingDebate, [change]);
		pendingChanges.push(change);

		if (!endsCommittedBoundary(change)) {
			continue;
		}

		const nextPipeline = await calculateLayoutPipeline({
			debate: pendingDebate,
			intent,
			changes: [...pendingChanges],
		}, request.layoutOptions);
		pushTransitionUnits(
			unscheduledUnits,
			workingPipeline,
			nextPipeline,
			formatChangeGroupName(pendingChanges, pendingDebate),
			[...pendingChanges],
		);
		workingDebate = pendingDebate;
		workingPipeline = nextPipeline;
		pendingChanges = [];
	}

	if (pendingChanges.length > 0) {
		const nextPipeline = await calculateLayoutPipeline({
			debate: pendingDebate,
			intent,
			changes: [...pendingChanges],
		}, request.layoutOptions);
		pushTransitionUnits(
			unscheduledUnits,
			workingPipeline,
			nextPipeline,
			formatChangeGroupName(pendingChanges, pendingDebate),
			[...pendingChanges],
		);
		workingDebate = pendingDebate;
		workingPipeline = nextPipeline;
	}

	return {
		initialPipeline,
		transitionUnits: scheduleTransitionUnits(unscheduledUnits, request.eventDurationInFrames, workingPipeline),
		finalPipeline: workingPipeline,
	};
}

export const prepareAnimationSchedule = prepareChangeSchedule;

function pushTransitionUnits(
	units: Array<Omit<ChangeTransitionUnit, "durationInFrames">>,
	from: DebateLayoutPipelineContext,
	to: DebateLayoutPipelineContext,
	baseName: string,
	changes: Change[],
): void {
	units.push({
		name: baseName,
		from,
		to,
		changes,
	});
}

function endsCommittedBoundary(change: Change): boolean {
	switch (change.kind) {
		case "IncomingSourceInserted":
		case "ScoreRemoved":
		case "IncomingSourcesResorted":
		case "ClaimRemoved":
		case "ClaimContentChanged":
		case "ClaimSideChanged":
		case "ClaimForceConfidenceChanged":
		case "ConnectorSourceChanged":
		case "ConnectorTargetChanged":
		case "ConnectorAffectsChanged":
		case "ScoreClaimConfidenceChanged":
		case "ScoreReversibleClaimConfidenceChanged":
		case "ScoreConnectorConfidenceChanged":
		case "ScoreRelevanceChanged":
		case "ScoreScaleOfSourcesChanged":
			return true;
		case "ClaimAdded":
		case "ConnectorAdded":
		case "ConnectorRemoved":
		case "ScoreAdded":
		case "IncomingSourceRemoved":
			return false;
		default:
			return assertNever(change);
	}
}

function scheduleTransitionUnits(
	units: Array<Omit<ChangeTransitionUnit, "durationInFrames">>,
	eventDurationInFrames: number,
	_finalPipeline: DebateLayoutPipelineContext,
): ChangeTransitionUnit[] {
	if (units.length === 0) {
		return [];
	}

	const weightedUnits = units.map((unit, index) => {
		const weight = Math.max(1, unit.changes.reduce((sum, change) => sum + resolveChangeWeight(change), 0));
		return {
			index,
			weight,
			unit,
		};
	});
	const totalWeight = weightedUnits.reduce((sum, unit) => sum + unit.weight, 0);
	const scheduledUnits = weightedUnits.map((entry) => {
		const rawFrames = eventDurationInFrames * (entry.weight / Math.max(1, totalWeight));
		const durationInFrames = Math.max(1, Math.floor(rawFrames));
		return {
			...entry,
			durationInFrames,
			remainder: rawFrames - durationInFrames,
		};
	});

	let remainingFrames = Math.max(0, eventDurationInFrames - scheduledUnits.reduce((sum, entry) => sum + entry.durationInFrames, 0));
	const normalizedUnits = [...scheduledUnits]
		.sort((left, right) => right.remainder - left.remainder)
		.map((entry) => {
			if (remainingFrames > 0) {
				remainingFrames -= 1;
				return {
					...entry,
					durationInFrames: entry.durationInFrames + 1,
				};
			}

			return entry;
		})
		.sort((left, right) => left.index - right.index)
		.map(({ index: _ignoredIndex, weight: _ignoredWeight, remainder: _ignoredRemainder, unit, durationInFrames }) => ({
			...unit,
			durationInFrames,
		}));

	return normalizedUnits;
}

function resolveChangeWeight(change: Change): number {
	switch (change.kind) {
		case "ClaimAdded":
		case "ScoreAdded":
		case "ConnectorAdded":
		case "ClaimRemoved":
		case "ScoreRemoved":
		case "ConnectorRemoved":
			return 5;
		case "IncomingSourceInserted":
		case "IncomingSourceRemoved":
		case "IncomingSourcesResorted":
			return 3;
		case "ScoreClaimConfidenceChanged":
		case "ScoreReversibleClaimConfidenceChanged":
		case "ScoreConnectorConfidenceChanged":
		case "ScoreRelevanceChanged":
		case "ScoreScaleOfSourcesChanged":
			return 2;
		case "ClaimContentChanged":
		case "ClaimSideChanged":
		case "ClaimForceConfidenceChanged":
		case "ConnectorSourceChanged":
		case "ConnectorTargetChanged":
		case "ConnectorAffectsChanged":
			return 2;
		default:
			return 1;
	}
}

function formatChangeName(change: Change, debate: Debate): string {
	switch (change.kind) {
		case "ScoreClaimConfidenceChanged":
		case "ScoreReversibleClaimConfidenceChanged":
		case "ScoreConnectorConfidenceChanged":
		case "ScoreRelevanceChanged":
		case "ScoreScaleOfSourcesChanged": {
			const score = debate.scores[change.scoreId];
			const claim = score ? debate.claims[score.claimId] : undefined;
			return `${change.kind} / ${claim?.content ?? change.scoreId}`;
		}
		case "ClaimAdded":
		case "ClaimRemoved":
			return `${change.kind} / ${change.claim.content}`;
		case "ClaimContentChanged":
		case "ClaimSideChanged":
		case "ClaimForceConfidenceChanged": {
			const claim = debate.claims[change.claimId];
			return `${change.kind} / ${claim?.content ?? change.claimId}`;
		}
		case "ConnectorAdded":
		case "ConnectorRemoved": {
			const source = debate.claims[change.connector.source];
			const target = debate.claims[change.connector.target];
			return `${change.kind} / ${source?.content ?? change.connector.source} -> ${target?.content ?? change.connector.target}`;
		}
		case "ConnectorSourceChanged":
		case "ConnectorTargetChanged":
		case "ConnectorAffectsChanged":
			return `${change.kind} / ${change.connectorId}`;
		case "ScoreAdded":
		case "ScoreRemoved": {
			const claim = debate.claims[change.score.claimId];
			return `${change.kind} / ${claim?.content ?? change.score.id}`;
		}
		case "IncomingSourceInserted":
		case "IncomingSourceRemoved":
		case "IncomingSourcesResorted":
			return `${change.kind} / ${change.targetScoreId}`;
		default:
			return assertNever(change);
	}
}

function formatChangeGroupName(changes: readonly Change[], debate: Debate): string {
	if (changes.length === 0) {
		return "No changes";
	}

	if (changes.length === 1) {
		return formatChangeName(changes[0], debate);
	}

	return `${formatChangeName(changes[0], debate)} (+${changes.length - 1})`;
}
