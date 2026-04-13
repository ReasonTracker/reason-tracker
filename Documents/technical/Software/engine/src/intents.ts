// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim } from "../../contracts/src/Claim.ts";
import type { Debate } from "../../contracts/src/Debate.ts";
import type {
	AddConnection,
	AppliedAddConnectionStep,
	AppliedAddLeafClaimStep,
	AppliedChangeClaimStep,
	AppliedRemoveClaimStep,
	AppliedRemoveConnectionStep,
	ChangeConnection,
	ClaimChange,
	Intent,
	IntentSequence,
	ReceivedAddConnectionIntent,
	ReceivedAddLeafClaimIntent,
	ReceivedChangeClaimIntent,
	ReceivedChangeConnectionIntent,
	ReceivedMoveClaimIntent,
	ReceivedRemoveClaimIntent,
	ReceivedRemoveConnectionIntent,
	RemoveConnection,
	RecordId,
	Step,
} from "../../contracts/src/IntentSequence.ts";
import { newId } from "../../contracts/src/newId.ts";
import { newScore, type ScoreId } from "../../contracts/src/Score.ts";
import type {
	ProcessDebateIntentRequest,
	ProcessDebateIntentResult,
} from "./api.ts";
import {
	assertNever,
	collectClaimSubtreeScoreIds,
	getOutgoingTargetScoreIdsForClaim,
	getScoreByConnectorId,
	getTargetScoreForIncomingScoreId,
	insertIncomingScoreId,
	uniqueScoreIds,
} from "./graph.ts";
import { buildRecalculationWaveStep } from "./recalculation.ts";
import { applyStep } from "./step-application.ts";

/**
 * Processes one received intent against a debate and returns the semantic
 * sequence of steps emitted by the engine plus the fully reduced final debate.
 *
 * This function is intended to be pure with one accepted exception: generating
 * new record ids for the emitted intent sequence, steps, and changes.
 */
export function processDebateIntent(
	request: ProcessDebateIntentRequest,
): ProcessDebateIntentResult {
	switch (request.intent.type) {
		case "ReceivedAddLeafClaimIntent":
			return processAddLeafClaimIntent(request.debate, request.intent);
		case "ReceivedAddConnectionIntent":
			return processAddConnectionIntent(request.debate, request.intent);
		case "ReceivedChangeConnectionIntent":
			return processChangeConnectionIntent(request.debate, request.intent);
		case "ReceivedRemoveConnectionIntent":
			return processRemoveConnectionIntent(request.debate, request.intent);
		case "ReceivedMoveClaimIntent":
			return processMoveClaimIntent(request.debate, request.intent);
		case "ReceivedChangeClaimIntent":
			return processChangeClaimIntent(request.debate, request.intent);
		case "ReceivedRemoveClaimIntent":
			return processRemoveClaimIntent(request.debate, request.intent);
		default:
			return assertNever(request.intent);
	}
}

function processAddLeafClaimIntent(
	debate: Debate,
	intent: ReceivedAddLeafClaimIntent,
): ProcessDebateIntentResult {
	if (debate.claims[intent.claim.id]) {
		throw new Error(`Claim ${intent.claim.id} already exists in the debate.`);
	}

	if (debate.connectors[intent.connector.id]) {
		throw new Error(`Connector ${intent.connector.id} already exists in the debate.`);
	}

	const targetScore = debate.scores[intent.targetScoreId];
	if (!targetScore) {
		throw new Error(`Target score ${intent.targetScoreId} was not found in the debate.`);
	}

	if (!debate.claims[intent.connector.target]) {
		throw new Error(`Target claim ${intent.connector.target} was not found in the debate.`);
	}

	if (targetScore.claimId !== intent.connector.target) {
		throw new Error(
			`Target score ${intent.targetScoreId} does not belong to claim ${intent.connector.target}.`,
		);
	}

	const addedScore = newScore({
		claimId: intent.claim.id,
		connectorId: intent.connector.id,
	});
	const incomingScoreIds = insertIncomingScoreId({
		debate,
		targetScore,
		newSourceClaim: intent.claim,
		newSourceScore: addedScore,
	});

	const appliedStep: AppliedAddLeafClaimStep = {
		id: newId() as RecordId,
		type: "AppliedAddLeafClaimStep",
		claim: intent.claim,
		connector: intent.connector,
		score: addedScore,
		targetScoreId: intent.targetScoreId,
		incomingScoreIds,
	};

	return finalizeIntentSequence(debate, intent, [
		appliedStep,
		buildRecalculationWaveStep(applyStep(debate, appliedStep), appliedStep.targetScoreId),
	]);
}

function processAddConnectionIntent(
	debate: Debate,
	intent: ReceivedAddConnectionIntent,
): ProcessDebateIntentResult {
	const appliedStep = createAppliedAddConnectionStep({
		debate,
		connector: intent.connector,
		targetScoreId: intent.targetScoreId,
	});

	return finalizeIntentSequence(debate, intent, [
		appliedStep,
		buildRecalculationWaveStep(applyStep(debate, appliedStep), appliedStep.targetScoreId),
	]);
}

function processChangeConnectionIntent(
	debate: Debate,
	intent: ReceivedChangeConnectionIntent,
): ProcessDebateIntentResult {
	const { steps } = applyConnectionChangeToSteps(debate, intent.change);
	return finalizeIntentSequence(debate, intent, steps);
}

function processRemoveConnectionIntent(
	debate: Debate,
	intent: ReceivedRemoveConnectionIntent,
): ProcessDebateIntentResult {
	const { steps } = applyConnectionChangeToSteps(debate, {
		type: "RemoveConnection",
		connectorId: intent.connectorId,
	});
	return finalizeIntentSequence(debate, intent, steps);
}

function processMoveClaimIntent(
	debate: Debate,
	intent: ReceivedMoveClaimIntent,
): ProcessDebateIntentResult {
	let workingDebate = debate;
	const steps: Step[] = [];

	for (const connectionChange of intent.connectionChanges) {
		validateMoveClaimConnectionChange(workingDebate, intent, connectionChange);
		const result = applyConnectionChangeToSteps(workingDebate, connectionChange);
		steps.push(...result.steps);
		workingDebate = result.finalDebate;
	}

	return finalizeIntentSequence(debate, intent, steps);
}

function processChangeClaimIntent(
	debate: Debate,
	intent: ReceivedChangeClaimIntent,
): ProcessDebateIntentResult {
	const claimBefore = debate.claims[intent.claimId];
	if (!claimBefore) {
		throw new Error(`Claim ${intent.claimId} was not found in the debate.`);
	}

	const claimAfter = applyClaimChange(claimBefore, intent.change);
	const appliedStep: AppliedChangeClaimStep = {
		id: newId() as RecordId,
		type: "AppliedChangeClaimStep",
		claimBefore,
		claimAfter,
	};

	const steps: Step[] = [appliedStep];
	if (claimBefore.side !== claimAfter.side) {
		const debateAfterClaimChange = applyStep(debate, appliedStep);
		const startingScoreIds = getOutgoingTargetScoreIdsForClaim(debateAfterClaimChange, claimAfter.id);
		if (startingScoreIds.length > 0) {
			steps.push(buildRecalculationWaveStep(debateAfterClaimChange, startingScoreIds));
		}
	}

	return finalizeIntentSequence(debate, intent, steps);
}

function processRemoveClaimIntent(
	debate: Debate,
	intent: ReceivedRemoveClaimIntent,
): ProcessDebateIntentResult {
	if (intent.claimId === debate.mainClaimId) {
		throw new Error("Removing the main claim is not implemented in the V2 engine yet.");
	}

	const claim = debate.claims[intent.claimId];
	if (!claim) {
		throw new Error(`Claim ${intent.claimId} was not found in the debate.`);
	}

	const scoreIdsToRemove = collectClaimSubtreeScoreIds(debate, intent.claimId);
	const removedRootScoreIds = scoreIdsToRemove.filter((scoreId) => debate.scores[scoreId]?.claimId === intent.claimId);
	const affectedTargetScoreIds = uniqueScoreIds(
		removedRootScoreIds
			.map((scoreId) => getTargetScoreForIncomingScoreId(debate, scoreId)?.id)
			.filter((scoreId): scoreId is ScoreId => scoreId !== undefined),
	);

	let workingDebate = debate;
	const steps: Step[] = [];
	for (const scoreId of scoreIdsToRemove) {
		const score = workingDebate.scores[scoreId];
		if (!score) {
			continue;
		}

		if (!score.connectorId) {
			throw new Error(
				`Score ${score.id} for claim ${intent.claimId} has no connectorId and cannot be removed by this path.`,
			);
		}

		const appliedStep = createAppliedRemoveConnectionStep(workingDebate, score.connectorId);
		steps.push(appliedStep);
		workingDebate = applyStep(workingDebate, appliedStep);
	}

	const removeClaimStep: AppliedRemoveClaimStep = {
		id: newId() as RecordId,
		type: "AppliedRemoveClaimStep",
		claim,
	};
	steps.push(removeClaimStep);
	workingDebate = applyStep(workingDebate, removeClaimStep);

	if (affectedTargetScoreIds.length > 0) {
		steps.push(buildRecalculationWaveStep(workingDebate, affectedTargetScoreIds));
	}

	return finalizeIntentSequence(debate, intent, steps);
}

function createAppliedAddConnectionStep(args: {
	debate: Debate
	connector: ReceivedAddConnectionIntent["connector"]
	targetScoreId: ScoreId
}): AppliedAddConnectionStep {
	if (args.debate.connectors[args.connector.id]) {
		throw new Error(`Connector ${args.connector.id} already exists in the debate.`);
	}

	const sourceClaim = args.debate.claims[args.connector.source];
	if (!sourceClaim) {
		throw new Error(`Source claim ${args.connector.source} was not found in the debate.`);
	}

	const targetScore = args.debate.scores[args.targetScoreId];
	if (!targetScore) {
		throw new Error(`Target score ${args.targetScoreId} was not found in the debate.`);
	}

	if (targetScore.claimId !== args.connector.target) {
		throw new Error(
			`Target score ${args.targetScoreId} does not belong to claim ${args.connector.target}.`,
		);
	}

	const addedScore = newScore({
		claimId: args.connector.source,
		connectorId: args.connector.id,
	});

	return {
		id: newId() as RecordId,
		type: "AppliedAddConnectionStep",
		connector: args.connector,
		score: addedScore,
		targetScoreId: args.targetScoreId,
		incomingScoreIds: insertIncomingScoreId({
			debate: args.debate,
			targetScore,
			newSourceClaim: sourceClaim,
			newSourceScore: addedScore,
		}),
	};
}

function createAppliedRemoveConnectionStep(
	debate: Debate,
	connectorId: RemoveConnection["connectorId"],
): AppliedRemoveConnectionStep {
	const connector = debate.connectors[connectorId];
	if (!connector) {
		throw new Error(`Connector ${connectorId} was not found in the debate.`);
	}

	const score = getScoreByConnectorId(debate, connectorId);
	const targetScore = getTargetScoreForIncomingScoreId(debate, score.id);
	if (!targetScore) {
		throw new Error(`Target score for score ${score.id} was not found in the debate.`);
	}

	return {
		id: newId() as RecordId,
		type: "AppliedRemoveConnectionStep",
		connector,
		score,
		targetScoreId: targetScore.id,
		incomingScoreIds: targetScore.incomingScoreIds.filter((incomingScoreId) => incomingScoreId !== score.id),
	};
}

function applyClaimChange(claim: Claim, change: ClaimChange): Claim {
	return {
		...claim,
		...change,
		id: claim.id,
	};
}

function applyConnectionChangeToSteps(
	debate: Debate,
	connectionChange: AddConnection | RemoveConnection | ChangeConnection,
): { steps: Step[]; finalDebate: Debate } {
	switch (connectionChange.type) {
		case "AddConnection": {
			const appliedStep = createAppliedAddConnectionStep({
				debate,
				connector: connectionChange.connector,
				targetScoreId: connectionChange.targetScoreId,
			});
			const debateAfterAdd = applyStep(debate, appliedStep);
			const steps: Step[] = [
				appliedStep,
				buildRecalculationWaveStep(debateAfterAdd, appliedStep.targetScoreId),
			];
			return {
				steps,
				finalDebate: replaySteps(debate, steps),
			};
		}
		case "RemoveConnection": {
			const appliedStep = createAppliedRemoveConnectionStep(debate, connectionChange.connectorId);
			const debateAfterRemove = applyStep(debate, appliedStep);
			const steps: Step[] = [
				appliedStep,
				buildRecalculationWaveStep(debateAfterRemove, appliedStep.targetScoreId),
			];
			return {
				steps,
				finalDebate: replaySteps(debate, steps),
			};
		}
		case "ChangeConnection": {
			const removeResult = applyConnectionChangeToSteps(debate, {
				type: "RemoveConnection",
				connectorId: connectionChange.connectorId,
			});
			const addResult = applyConnectionChangeToSteps(removeResult.finalDebate, {
				type: "AddConnection",
				connector: connectionChange.connector,
				targetScoreId: connectionChange.targetScoreId,
			});
			return {
				steps: [...removeResult.steps, ...addResult.steps],
				finalDebate: addResult.finalDebate,
			};
		}
		default:
			return assertNever(connectionChange);
	}
}

function validateMoveClaimConnectionChange(
	debate: Debate,
	intent: ReceivedMoveClaimIntent,
	connectionChange: AddConnection | RemoveConnection | ChangeConnection,
): void {
	switch (connectionChange.type) {
		case "AddConnection":
		case "ChangeConnection":
			if (connectionChange.connector.source !== intent.claimId) {
				throw new Error(
					`Move claim ${intent.claimId} can only add or change connections whose source is that claim.`,
				);
			}
			return;
		case "RemoveConnection": {
			const score = getScoreByConnectorId(debate, connectionChange.connectorId);
			if (score.claimId !== intent.claimId) {
				throw new Error(
					`Move claim ${intent.claimId} can only remove connections attached to that claim's displayed scores.`,
				);
			}
			return;
		}
		default:
			return assertNever(connectionChange);
	}
}

function finalizeIntentSequence(
	startingDebate: Debate,
	intent: Intent,
	steps: Step[],
): ProcessDebateIntentResult {
	const intentSequence: IntentSequence = {
		id: newId() as IntentSequence["id"],
		intent,
		steps,
	};

	return {
		intentSequence,
		finalDebate: replaySteps(startingDebate, steps),
	};
}

function replaySteps(
	startingDebate: Debate,
	steps: Step[],
): Debate {
	let finalDebate = startingDebate;
	for (const step of steps) {
		finalDebate = applyStep(finalDebate, step);
	}
	return finalDebate;
}