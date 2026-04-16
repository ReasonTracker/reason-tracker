// See 📌README.md in this folder for local coding standards before editing this file.

import type { Change, Debate, Intent } from "../../../contracts/src/index.ts";
import { applyChanges } from "./applyChanges.ts";
import { assertNever } from "./graph.ts";
import { calculateLayoutPipeline, type DebateLayoutPipelineContext, type LayoutOptions } from "./layout.ts";

export interface PrepareChangeScheduleRequest {
	debate: Debate
	intent?: Intent
	eventDurationInFrames: number
	layoutOptions?: LayoutOptions
}

export interface ChangeGroup {
	name: string
	changes: readonly Change[]
	initialLayout: DebateLayoutPipelineContext
	finalLayout: DebateLayoutPipelineContext
	durationInFrames: number
}

export type ChangeTransitionUnit = ChangeGroup;
export type AnimationTransitionUnit = ChangeGroup;

export interface PreparedChangeSchedule {
	initialLayout: DebateLayoutPipelineContext
	changeGroups: ChangeGroup[]
	finalLayout: DebateLayoutPipelineContext
}

export type PrepareAnimationScheduleRequest = PrepareChangeScheduleRequest;
export type PreparedAnimationSchedule = PreparedChangeSchedule;

export async function prepareChangeSchedule(
	request: PrepareChangeScheduleRequest,
): Promise<PreparedChangeSchedule> {
	const initialLayout = await calculateLayoutPipeline({
		debate: request.debate,
	}, request.layoutOptions);
	const intent = request.intent;
	if (!intent) {
		return {
			initialLayout,
			changeGroups: [],
			finalLayout: initialLayout,
		};
	}

	const unscheduledChangeGroups: Array<Omit<ChangeGroup, "durationInFrames">> = [];
	let currentLayout = initialLayout;
	let pendingChanges: Change[] = [];
	let pendingDebate = request.debate;

	for (const change of intent.changes) {
		pendingDebate = applyChanges(pendingDebate, [change]);
		pendingChanges.push(change);

		if (!endsChangeGroup(change)) {
			continue;
		}

		const nextLayout = await calculateLayoutPipeline({
			debate: pendingDebate,
			intent,
			changes: [...pendingChanges],
		}, request.layoutOptions);
		pushChangeGroup(
			unscheduledChangeGroups,
			formatChangeGroupName(pendingChanges, pendingDebate),
			[...pendingChanges],
			currentLayout,
			nextLayout,
		);
		currentLayout = nextLayout;
		pendingChanges = [];
	}

	if (pendingChanges.length > 0) {
		const nextLayout = await calculateLayoutPipeline({
			debate: pendingDebate,
			intent,
			changes: [...pendingChanges],
		}, request.layoutOptions);
		pushChangeGroup(
			unscheduledChangeGroups,
			formatChangeGroupName(pendingChanges, pendingDebate),
			[...pendingChanges],
			currentLayout,
			nextLayout,
		);
		currentLayout = nextLayout;
	}

	return {
		initialLayout,
		changeGroups: scheduleChangeGroups(unscheduledChangeGroups, request.eventDurationInFrames),
		finalLayout: currentLayout,
	};
}

export const prepareAnimationSchedule = prepareChangeSchedule;

function pushChangeGroup(
	changeGroups: Array<Omit<ChangeGroup, "durationInFrames">>,
	name: string,
	changes: Change[],
	initialLayout: DebateLayoutPipelineContext,
	finalLayout: DebateLayoutPipelineContext,
): void {
	changeGroups.push({
		name,
		changes,
		initialLayout,
		finalLayout,
	});
}

function endsChangeGroup(change: Change): boolean {
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
		case "ScoreConnectorConfidenceChanged":
		case "ScoreRelevanceChanged":
		case "ScoreScaleOfSourcesChanged":
		case "ScoreScaleOfSourcesBatchChanged":
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


function scheduleChangeGroups(
	changeGroups: Array<Omit<ChangeGroup, "durationInFrames">>,
	eventDurationInFrames: number,
	): ChangeGroup[] {
	if (changeGroups.length === 0) {
		return [];
	}

	const rawFramesPerGroup = eventDurationInFrames / Math.max(1, changeGroups.length);
	const scheduledChangeGroups = changeGroups.map((changeGroup, index) => {
		const durationInFrames = Math.max(1, Math.floor(rawFramesPerGroup));
		return {
			index,
			changeGroup,
			durationInFrames,
			remainder: rawFramesPerGroup - durationInFrames,
		};
	});

	let remainingFrames = Math.max(0, eventDurationInFrames - scheduledChangeGroups.reduce((sum, entry) => sum + entry.durationInFrames, 0));
	return [...scheduledChangeGroups]
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
		.map(({ index: _ignoredIndex, remainder: _ignoredRemainder, changeGroup, durationInFrames }) => ({
			...changeGroup,
			durationInFrames,
		}));
}

function formatChangeName(change: Change, debate: Debate): string {
	switch (change.kind) {
		case "ScoreClaimConfidenceChanged":
		case "ScoreConnectorConfidenceChanged":
		case "ScoreRelevanceChanged":
		case "ScoreScaleOfSourcesChanged": {
			const score = debate.scores[change.scoreId];
			const claim = score ? debate.claims[score.claimId] : undefined;
			return `${change.kind} / ${claim?.content ?? change.scoreId}`;
		}
		case "ScoreScaleOfSourcesBatchChanged": {
			const firstEntry = change.changes[0];
			if (!firstEntry) {
				return change.kind;
			}

			const score = debate.scores[firstEntry.scoreId];
			const claim = score ? debate.claims[score.claimId] : undefined;
			return `${change.kind} / ${claim?.content ?? firstEntry.scoreId} (+${Math.max(0, change.changes.length - 1)})`;
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
