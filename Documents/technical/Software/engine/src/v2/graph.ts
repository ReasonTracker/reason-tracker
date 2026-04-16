// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim, ClaimId, ConnectorId, Debate, Score, ScoreId } from "../../../contracts/src/index.ts";
import { deriveTargetRelation } from "../../../contracts/src/index.ts";

export interface ScoreIndexes {
	outgoingTargetScoreIdsBySourceScoreId: Partial<Record<ScoreId, ScoreId[]>>
}

export function insertIncomingScoreId(args: {
	debate: Debate
	targetScore: Score
	newSourceClaim: Claim
	newSourceScore: Score
}): ScoreId[] {
	const nextIncomingScoreIds = [...args.targetScore.incomingScoreIds];
	const newTargetClaim = args.debate.claims[args.targetScore.claimId];
	if (!newTargetClaim) {
		throw new Error(`Target claim ${args.targetScore.claimId} was not found in the debate.`);
	}

	const newImpact = calculateImpact(args.newSourceScore);
	const newRelation = deriveTargetRelation(args.newSourceClaim.side, newTargetClaim.side);
	let insertAt = nextIncomingScoreIds.length;

	for (let index = 0; index < nextIncomingScoreIds.length; index += 1) {
		const existingSourceScore = args.debate.scores[nextIncomingScoreIds[index]];
		if (!existingSourceScore) {
			throw new Error(`Score ${nextIncomingScoreIds[index]} was not found in the debate.`);
		}

		const existingSourceClaim = args.debate.claims[existingSourceScore.claimId];
		if (!existingSourceClaim) {
			throw new Error(`Claim ${existingSourceScore.claimId} was not found in the debate.`);
		}

		const existingRelation = deriveTargetRelation(existingSourceClaim.side, newTargetClaim.side);
		if (!shouldExistingStayBeforeNew(existingRelation, calculateImpact(existingSourceScore), newRelation, newImpact)) {
			insertAt = index;
			break;
		}
	}

	nextIncomingScoreIds.splice(insertAt, 0, args.newSourceScore.id);
	return nextIncomingScoreIds;
}

export function createScoreIndexes(debate: Debate): ScoreIndexes {
	const outgoingTargetScoreIdsBySourceScoreId: Partial<Record<ScoreId, ScoreId[]>> = {};

	for (const score of Object.values(debate.scores)) {
		for (const incomingScoreId of score.incomingScoreIds) {
			const existing = outgoingTargetScoreIdsBySourceScoreId[incomingScoreId] ?? [];
			outgoingTargetScoreIdsBySourceScoreId[incomingScoreId] = [...existing, score.id];
		}
	}

	return {
		outgoingTargetScoreIdsBySourceScoreId,
	};
}

export function getOutgoingTargetScoreIds(indexes: ScoreIndexes, sourceScoreId: ScoreId): ScoreId[] {
	return indexes.outgoingTargetScoreIdsBySourceScoreId[sourceScoreId] ?? [];
}

export function getScoreByConnectorId(debate: Debate, connectorId: ConnectorId): Score {
	const score = Object.values(debate.scores).find((candidate) => candidate.connectorId === connectorId);
	if (!score) {
		throw new Error(`Score for connector ${connectorId} was not found in the debate.`);
	}
	return score;
}

export function getTargetScoreForIncomingScoreId(debate: Debate, incomingScoreId: ScoreId): Score | undefined {
	return Object.values(debate.scores).find((candidate) => candidate.incomingScoreIds.includes(incomingScoreId));
}

export function getScoresForClaimId(debate: Debate, claimId: ClaimId): Score[] {
	return Object.values(debate.scores).filter((score) => score.claimId === claimId);
}

export function getOutgoingTargetScoreIdsForClaim(debate: Debate, claimId: ClaimId): ScoreId[] {
	const scoreIndexes = createScoreIndexes(debate);
	return uniqueScoreIds(
		getScoresForClaimId(debate, claimId).flatMap((score) => getOutgoingTargetScoreIds(scoreIndexes, score.id)),
	);
}

export function collectClaimSubtreeScoreIds(debate: Debate, claimId: ClaimId): ScoreId[] {
	const scoreIndexes = createScoreIndexes(debate);
	const visited = new Set<ScoreId>();
	const ordered: ScoreId[] = [];

	for (const score of getScoresForClaimId(debate, claimId)) {
		collectScoreSubtreeIds(scoreIndexes, score.id, visited, ordered);
	}

	return ordered;
}

export function uniqueScoreIds(scoreIds: ScoreId[]): ScoreId[] {
	return [...new Set(scoreIds)];
}

export function calculateImpact(score: Score): number {
	return Math.abs(score.connectorConfidence) * score.relevance;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function assertNever(value: never): never {
	throw new Error(`Unexpected value: ${String(value)}`);
}

function shouldExistingStayBeforeNew(
	existingRelation: ReturnType<typeof deriveTargetRelation>,
	existingImpact: number,
	newRelation: ReturnType<typeof deriveTargetRelation>,
	newImpact: number,
): boolean {
	if (existingRelation !== newRelation) {
		return existingRelation === "proTarget";
	}

	return existingImpact > newImpact;
}

function collectScoreSubtreeIds(
	indexes: ScoreIndexes,
	startingScoreId: ScoreId,
	visited: Set<ScoreId>,
	ordered: ScoreId[],
): void {
	if (visited.has(startingScoreId)) {
		return;
	}
	visited.add(startingScoreId);

	for (const childScoreId of getOutgoingTargetScoreIds(indexes, startingScoreId)) {
		collectScoreSubtreeIds(indexes, childScoreId, visited, ordered);
	}

	ordered.push(startingScoreId);
}
