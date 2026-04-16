// See 📌README.md in this folder for local coding standards before editing this file.

import {
	newId,
	newScore,
	type AddConnectionOperation,
	type Change,
	type ChangeId,
	type ChangeConnectionOperation,
	type Claim,
	type ClaimChange,
	type ConnectionOperation,
	type Debate,
	type Intent,
	type IntentId,
	type IntentInput,
	type RemoveConnectionOperation,
	type Score,
	type ScoreId,
} from "../../contracts/src/index.ts";
import type {
	ProcessDebateIntentRequest,
	ProcessDebateIntentResult,
} from "./api.ts";
import { applyChanges } from "./applyChanges.ts";
import {
	assertNever,
	collectClaimSubtreeScoreIds,
	getOutgoingTargetScoreIdsForClaim,
	getScoresForClaimId,
	getScoreByConnectorId,
	getTargetScoreForIncomingScoreId,
	insertIncomingScoreId,
	uniqueScoreIds,
} from "./graph.ts";
import { buildRecalculationChanges } from "./recalculation.ts";

export function processDebateIntent(
	request: ProcessDebateIntentRequest,
): ProcessDebateIntentResult {
	switch (request.intent.kind) {
		case "AddClaim":
			return processAddClaimIntent(request.debate, request.intent);
		case "AddConnection":
			return processAddConnectionIntent(request.debate, request.intent);
		case "ChangeConnection":
			return processChangeConnectionIntent(request.debate, request.intent);
		case "RemoveConnection":
			return processRemoveConnectionIntent(request.debate, request.intent);
		case "MoveClaim":
			return processMoveClaimIntent(request.debate, request.intent);
		case "ChangeClaim":
			return processChangeClaimIntent(request.debate, request.intent);
		case "RemoveClaim":
			return processRemoveClaimIntent(request.debate, request.intent);
		default:
			return assertNever(request.intent);
	}
}

function processAddClaimIntent(debate: Debate, intent: Extract<IntentInput, { kind: "AddClaim" }>): ProcessDebateIntentResult {
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
		throw new Error(`Target score ${intent.targetScoreId} does not belong to claim ${intent.connector.target}.`);
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

	const changes: Change[] = [
		{
			id: newId() as ChangeId,
			kind: "ClaimAdded",
			claim: intent.claim,
		},
		{
			id: newId() as ChangeId,
			kind: "ConnectorAdded",
			connector: intent.connector,
		},
		{
			id: newId() as ChangeId,
			kind: "ScoreAdded",
			score: addedScore,
		},
		{
			id: newId() as ChangeId,
			kind: "IncomingSourceInserted",
			targetScoreId: intent.targetScoreId,
			sourceScoreId: addedScore.id,
			incomingScoreIds,
			direction: "sourceToTarget",
		},
	];
	const debateAfterStructuralChanges = applyChanges(debate, changes);
	changes.push(...buildRecalculationChanges(debateAfterStructuralChanges, intent.targetScoreId));
	return finalizeIntent(debate, intent, changes);
}

function processAddConnectionIntent(debate: Debate, intent: Extract<IntentInput, { kind: "AddConnection" }>): ProcessDebateIntentResult {
	const structural = createAddConnectionChanges({
		debate,
		connector: intent.connector,
		targetScoreId: intent.targetScoreId,
	});
	const changes = [...structural.changes, ...buildRecalculationChanges(structural.finalDebate, intent.targetScoreId)];
	return finalizeIntent(debate, intent, changes);
}

function processChangeConnectionIntent(debate: Debate, intent: Extract<IntentInput, { kind: "ChangeConnection" }>): ProcessDebateIntentResult {
	const result = applyConnectionChangeToChanges(debate, intent.change);
	return finalizeIntent(debate, intent, result.changes);
}

function processRemoveConnectionIntent(debate: Debate, intent: Extract<IntentInput, { kind: "RemoveConnection" }>): ProcessDebateIntentResult {
	const result = applyConnectionChangeToChanges(debate, {
		type: "RemoveConnection",
		connectorId: intent.connectorId,
	});
	return finalizeIntent(debate, intent, result.changes);
}

function processMoveClaimIntent(debate: Debate, intent: Extract<IntentInput, { kind: "MoveClaim" }>): ProcessDebateIntentResult {
	let workingDebate = debate;
	const changes: Change[] = [];

	for (const connectionChange of intent.connectionChanges) {
		validateMoveClaimConnectionChange(workingDebate, intent.claimId, connectionChange);
		const result = applyConnectionChangeToChanges(workingDebate, connectionChange);
		changes.push(...result.changes);
		workingDebate = result.finalDebate;
	}

	return finalizeIntent(debate, intent, changes);
}

function processChangeClaimIntent(debate: Debate, intent: Extract<IntentInput, { kind: "ChangeClaim" }>): ProcessDebateIntentResult {
	const claimBefore = debate.claims[intent.claimId];
	if (!claimBefore) {
		throw new Error(`Claim ${intent.claimId} was not found in the debate.`);
	}

	const claimAfter = applyClaimChange(claimBefore, intent.change);
	const changes: Change[] = [];

	if (claimBefore.content !== claimAfter.content) {
		changes.push({
			id: newId() as ChangeId,
			kind: "ClaimContentChanged",
			claimId: claimBefore.id,
			before: { content: claimBefore.content },
			after: { content: claimAfter.content },
		});
	}

	if (claimBefore.side !== claimAfter.side) {
		changes.push({
			id: newId() as ChangeId,
			kind: "ClaimSideChanged",
			claimId: claimBefore.id,
			before: { side: claimBefore.side },
			after: { side: claimAfter.side },
		});
	}

	if (claimBefore.forceConfidence !== claimAfter.forceConfidence) {
		changes.push({
			id: newId() as ChangeId,
			kind: "ClaimForceConfidenceChanged",
			claimId: claimBefore.id,
			before: { forceConfidence: claimBefore.forceConfidence },
			after: { forceConfidence: claimAfter.forceConfidence },
		});
	}

	const debateAfterClaimChanges = applyChanges(debate, changes);
	if (claimBefore.side !== claimAfter.side || claimBefore.forceConfidence !== claimAfter.forceConfidence) {
		const startingScoreIds = uniqueScoreIds([
			...getScoresForClaimId(debateAfterClaimChanges, claimAfter.id).map((score) => score.id),
			...getOutgoingTargetScoreIdsForClaim(debateAfterClaimChanges, claimAfter.id),
		]);
		if (startingScoreIds.length > 0) {
			changes.push(...buildRecalculationChanges(debateAfterClaimChanges, startingScoreIds));
		}
	}

	return finalizeIntent(debate, intent, changes);
}

function processRemoveClaimIntent(debate: Debate, intent: Extract<IntentInput, { kind: "RemoveClaim" }>): ProcessDebateIntentResult {
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
	const changes: Change[] = [];
	for (const scoreId of scoreIdsToRemove) {
		const score = workingDebate.scores[scoreId];
		if (!score) {
			continue;
		}

		if (!score.connectorId) {
			throw new Error(`Score ${score.id} for claim ${intent.claimId} has no connectorId and cannot be removed by this path.`);
		}

		const result = createRemoveConnectionChanges(workingDebate, score.connectorId);
		changes.push(...result.changes);
		workingDebate = result.finalDebate;
	}

	changes.push({
		id: newId() as ChangeId,
		kind: "ClaimRemoved",
		claim,
	});
	workingDebate = applyChanges(workingDebate, [changes[changes.length - 1]]);

	if (affectedTargetScoreIds.length > 0) {
		changes.push(...buildRecalculationChanges(workingDebate, affectedTargetScoreIds));
	}

	return finalizeIntent(debate, intent, changes);
}

function createAddConnectionChanges(args: {
	debate: Debate
	connector: Extract<IntentInput, { kind: "AddConnection" }>["connector"]
	targetScoreId: ScoreId
}): { changes: Change[]; finalDebate: Debate } {
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
		throw new Error(`Target score ${args.targetScoreId} does not belong to claim ${args.connector.target}.`);
	}

	const addedScore = newScore({
		claimId: args.connector.source,
		connectorId: args.connector.id,
	});
	const incomingScoreIds = insertIncomingScoreId({
		debate: args.debate,
		targetScore,
		newSourceClaim: sourceClaim,
		newSourceScore: addedScore,
	});
	const changes: Change[] = [
		{
			id: newId() as ChangeId,
			kind: "ConnectorAdded",
			connector: args.connector,
		},
		{
			id: newId() as ChangeId,
			kind: "ScoreAdded",
			score: addedScore,
		},
		{
			id: newId() as ChangeId,
			kind: "IncomingSourceInserted",
			targetScoreId: args.targetScoreId,
			sourceScoreId: addedScore.id,
			incomingScoreIds,
			direction: "sourceToTarget",
		},
	];

	return {
		changes,
		finalDebate: applyChanges(args.debate, changes),
	};
}

function createRemoveConnectionChanges(
	debate: Debate,
	connectorId: RemoveConnectionOperation["connectorId"],
): { changes: Change[]; finalDebate: Debate } {
	const connector = debate.connectors[connectorId];
	if (!connector) {
		throw new Error(`Connector ${connectorId} was not found in the debate.`);
	}

	const score = getScoreByConnectorId(debate, connectorId);
	const targetScore = getTargetScoreForIncomingScoreId(debate, score.id);
	if (!targetScore) {
		throw new Error(`Target score for score ${score.id} was not found in the debate.`);
	}

	const incomingScoreIds = targetScore.incomingScoreIds.filter((incomingScoreId) => incomingScoreId !== score.id);
	const changes: Change[] = [
		{
			id: newId() as ChangeId,
			kind: "IncomingSourceRemoved",
			targetScoreId: targetScore.id,
			sourceScoreId: score.id,
			incomingScoreIds,
			direction: "targetToSource",
		},
		{
			id: newId() as ChangeId,
			kind: "ConnectorRemoved",
			connector,
		},
		{
			id: newId() as ChangeId,
			kind: "ScoreRemoved",
			score,
		},
	];

	return {
		changes,
		finalDebate: applyChanges(debate, changes),
	};
}

function applyClaimChange(claim: Claim, change: ClaimChange): Claim {
	return {
		...claim,
		...change,
		id: claim.id,
	};
}

function applyConnectionChangeToChanges(
	debate: Debate,
	connectionChange: ConnectionOperation,
): { changes: Change[]; finalDebate: Debate } {
	switch (connectionChange.type) {
		case "AddConnection": {
			const structural = createAddConnectionChanges({
				debate,
				connector: connectionChange.connector,
				targetScoreId: connectionChange.targetScoreId,
			});
			const changes = [...structural.changes, ...buildRecalculationChanges(structural.finalDebate, connectionChange.targetScoreId)];
			return {
				changes,
				finalDebate: applyChanges(debate, changes),
			};
		}
		case "RemoveConnection": {
			const structural = createRemoveConnectionChanges(debate, connectionChange.connectorId);
			const targetScoreId = getTargetScoreForIncomingScoreId(debate, getScoreByConnectorId(debate, connectionChange.connectorId).id)?.id;
			if (!targetScoreId) {
				throw new Error(`Target score for connector ${connectionChange.connectorId} was not found in the debate.`);
			}
			const changes = [...structural.changes, ...buildRecalculationChanges(structural.finalDebate, targetScoreId)];
			return {
				changes,
				finalDebate: applyChanges(debate, changes),
			};
		}
		case "ChangeConnection": {
			if (isNoOpConnectionChange(debate, connectionChange)) {
				return {
					changes: [],
					finalDebate: debate,
				};
			}

			const removeResult = applyConnectionChangeToChanges(debate, {
				type: "RemoveConnection",
				connectorId: connectionChange.connectorId,
			});
			const addResult = applyConnectionChangeToChanges(removeResult.finalDebate, {
				type: "AddConnection",
				connector: connectionChange.connector,
				targetScoreId: connectionChange.targetScoreId,
			});
			return {
				changes: [...removeResult.changes, ...addResult.changes],
				finalDebate: addResult.finalDebate,
			};
		}
		default:
			return assertNever(connectionChange);
	}
}

function isNoOpConnectionChange(
	debate: Debate,
	connectionChange: ChangeConnectionOperation,
): boolean {
	const existingConnector = debate.connectors[connectionChange.connectorId];
	if (!existingConnector) {
		throw new Error(`Connector ${connectionChange.connectorId} was not found in the debate.`);
	}

	const existingScore = getScoreByConnectorId(debate, connectionChange.connectorId);
	const existingTargetScoreId = getTargetScoreForIncomingScoreId(debate, existingScore.id)?.id;
	if (!existingTargetScoreId) {
		throw new Error(`Target score for connector ${connectionChange.connectorId} was not found in the debate.`);
	}

	return (
		existingTargetScoreId === connectionChange.targetScoreId &&
		existingConnector.id === connectionChange.connector.id &&
		existingConnector.source === connectionChange.connector.source &&
		existingConnector.target === connectionChange.connector.target &&
		existingConnector.affects === connectionChange.connector.affects
	);
}

function validateMoveClaimConnectionChange(
	debate: Debate,
	claimId: IntentInput extends never ? never : Extract<IntentInput, { kind: "MoveClaim" }>["claimId"],
	connectionChange: AddConnectionOperation | RemoveConnectionOperation | ChangeConnectionOperation,
): void {
	switch (connectionChange.type) {
		case "AddConnection":
		case "ChangeConnection":
			if (connectionChange.connector.source !== claimId) {
				throw new Error(`Move claim ${claimId} can only add or change connections whose source is that claim.`);
			}
			return;
		case "RemoveConnection": {
			const score = getScoreByConnectorId(debate, connectionChange.connectorId);
			if (score.claimId !== claimId) {
				throw new Error(`Move claim ${claimId} can only remove connections attached to that claim's displayed scores.`);
			}
			return;
		}
		default:
			return assertNever(connectionChange);
	}
}

function finalizeIntent(startingDebate: Debate, intent: IntentInput, changes: Change[]): ProcessDebateIntentResult {
	const resolvedIntent = {
		...intent,
		id: intent.id as IntentId,
		changes,
	} as Intent;

	return {
		intent: resolvedIntent,
		finalDebate: applyChanges(startingDebate, changes),
	};
}
