// See 📌README.md in this folder for local coding standards before editing this file.

import {
	deriveTargetRelation,
	newId,
	type Change,
	type ChangeId,
	type Debate,
	type Score,
	type ScoreId,
} from "../../contracts/src/index.ts";
import {
	calculateImpact,
	clamp,
	createScoreIndexes,
	getOutgoingTargetScoreIds,
	getScoresForClaimId,
} from "./graph.ts";
import { applyChange } from "./applyChanges.ts";

export function buildRecalculationChanges(
	debate: Debate,
	startingScoreIds: ScoreId | ScoreId[],
): Change[] {
	let workingDebate = debate;
	const scoreIndexes = createScoreIndexes(debate);
	const changes: Change[] = [];
	const pendingScoreIds: ScoreId[] = Array.isArray(startingScoreIds)
		? [...startingScoreIds]
		: [startingScoreIds];
	const processedScoreIds = new Set<ScoreId>();

	while (pendingScoreIds.length > 0) {
		const scoreId = pendingScoreIds.shift();
		if (!scoreId || processedScoreIds.has(scoreId)) {
			continue;
		}
		processedScoreIds.add(scoreId);

		const score = workingDebate.scores[scoreId];
		if (!score) {
			throw new Error(`Score ${scoreId} was not found during recalculation.`);
		}

		for (const change of createScoreFieldChanges(score, calculateScoreState(workingDebate, score))) {
			changes.push(change);
			workingDebate = applyChange(workingDebate, change);
		}

		const nextDebateWithScaleOfSources = synchronizeScoreScaleOfSources(workingDebate);
		for (const change of createScaleOfSourcesChangedRecords(workingDebate, nextDebateWithScaleOfSources)) {
			changes.push(change);
			workingDebate = applyChange(workingDebate, change);
		}

		const refreshedScore = workingDebate.scores[scoreId];
		for (const nextScoreId of getOutgoingTargetScoreIds(scoreIndexes, refreshedScore.id)) {
			if (!processedScoreIds.has(nextScoreId)) {
				pendingScoreIds.push(nextScoreId);
			}
		}
	}

	return changes;
}

function calculateScoreState(
	debate: Debate,
	score: Score,
): Pick<
	Score,
	| "claimConfidence"
	| "reversibleClaimConfidence"
	| "connectorConfidence"
	| "reversibleConnectorConfidence"
	| "relevance"
	| "scaleOfSources"
> {
	const claim = debate.claims[score.claimId];
	if (!claim) {
		throw new Error(`Claim ${score.claimId} was not found for score ${score.id}.`);
	}

	const incomingChildren = score.incomingScoreIds.map((incomingScoreId) => {
		const incomingScore = debate.scores[incomingScoreId];
		if (!incomingScore) {
			throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
		}

		if (!incomingScore.connectorId) {
			throw new Error(`Incoming score ${incomingScoreId} is missing its connectorId.`);
		}

		const connector = debate.connectors[incomingScore.connectorId];
		if (!connector) {
			throw new Error(`Connector ${incomingScore.connectorId} was not found in the debate.`);
		}

		const sourceClaim = debate.claims[incomingScore.claimId];
		if (!sourceClaim) {
			throw new Error(`Claim ${incomingScore.claimId} was not found in the debate.`);
		}

		return {
			connector,
			score: incomingScore,
			targetRelation: deriveTargetRelation(sourceClaim.side, claim.side),
		};
	});

	if (incomingChildren.length < 1 && claim.forceConfidence !== undefined) {
		const claimConfidence = clamp(claim.forceConfidence, 0, 1);
		return {
			claimConfidence,
			reversibleClaimConfidence: clamp(claim.forceConfidence, -1, 1),
			connectorConfidence: claimConfidence,
			reversibleConnectorConfidence: clamp(claim.forceConfidence, -1, 1),
			relevance: 1,
			scaleOfSources: 0,
		};
	}

	const confidenceChildren = incomingChildren.filter(({ connector }) => connector.affects === "confidence");
	const relevanceChildren = incomingChildren.filter(({ connector }) => connector.affects === "relevance");
	const confidenceResult = calculateConfidence(confidenceChildren);
	const relevance = calculateRelevance(relevanceChildren);

	return {
		claimConfidence: confidenceResult.claimConfidence,
		reversibleClaimConfidence: confidenceResult.reversibleClaimConfidence,
		connectorConfidence: confidenceResult.claimConfidence,
		reversibleConnectorConfidence: confidenceResult.reversibleClaimConfidence,
		relevance,
		scaleOfSources: score.scaleOfSources,
	};
}

export function synchronizeScoreScaleOfSources(debate: Debate): Debate {
	const scaleOfSourcesByScoreId = buildPropagatedScaleOfSourcesByScoreId(debate);
	let hasChanges = false;
	const nextScores = { ...debate.scores };

	for (const [scoreId, score] of Object.entries(debate.scores) as Array<[ScoreId, Score]>) {
		const nextScaleOfSources = scaleOfSourcesByScoreId[scoreId] ?? score.scaleOfSources;
		if (score.scaleOfSources === nextScaleOfSources) {
			continue;
		}

		hasChanges = true;
		nextScores[scoreId] = {
			...score,
			scaleOfSources: nextScaleOfSources,
		};
	}

	return hasChanges
		? {
			...debate,
			scores: nextScores,
		}
		: debate;
}

function buildPropagatedScaleOfSourcesByScoreId(debate: Debate): Record<ScoreId, number> {
	const rootScores = getScoresForClaimId(debate, debate.mainClaimId);
	if (rootScores.length !== 1) {
		throw new Error(`Expected exactly one root score for main claim ${debate.mainClaimId}, found ${rootScores.length}.`);
	}

	const rootScoreId = rootScores[0].id;
	const scoreIdsInLayoutOrder = collectScoreIdsInLayoutOrder(debate, rootScoreId);
	const confidenceCascadeScaleByScoreId = {} as Record<ScoreId, number>;
	const scaleOfSourcesByScoreId = {} as Record<ScoreId, number>;
	const incomingScoreIdsByTargetScoreId = {} as Record<ScoreId, Set<ScoreId>>;

	for (const scoreId of scoreIdsInLayoutOrder) {
		confidenceCascadeScaleByScoreId[scoreId] = 1;
		scaleOfSourcesByScoreId[scoreId] = scoreId === rootScoreId ? 1 : 0;
		incomingScoreIdsByTargetScoreId[scoreId] = new Set(debate.scores[scoreId]?.incomingScoreIds ?? []);
	}

	const confidenceGroupScaleByTargetScoreId = {} as Record<ScoreId, number>;
	for (const targetScoreId of scoreIdsInLayoutOrder) {
		const incomingScoreIds = incomingScoreIdsByTargetScoreId[targetScoreId];
		if (!incomingScoreIds || incomingScoreIds.size === 0) {
			continue;
		}

		let totalPositiveConfidenceMass = 0;
		for (const incomingScoreId of incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (!incomingScore) {
				throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
			}

			if (incomingScore.connectorConfidence > 0) {
				totalPositiveConfidenceMass += incomingScore.connectorConfidence;
			}
		}

		confidenceGroupScaleByTargetScoreId[targetScoreId] = 1 / Math.max(1, totalPositiveConfidenceMass);
	}

	for (const targetScoreId of scoreIdsInLayoutOrder) {
		const incomingScoreIds = incomingScoreIdsByTargetScoreId[targetScoreId];
		if (!incomingScoreIds || incomingScoreIds.size === 0) {
			continue;
		}

		const targetFinalScale = scaleOfSourcesByScoreId[targetScoreId] ?? 1;
		const cascadedConfidenceScaleFromTarget = targetFinalScale * (confidenceGroupScaleByTargetScoreId[targetScoreId] ?? 1);

		let maxIncomingRelevance = 0;
		for (const incomingScoreId of incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (!incomingScore) {
				throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
			}

			maxIncomingRelevance = Math.max(maxIncomingRelevance, Math.max(0, incomingScore.relevance));
		}
		if (maxIncomingRelevance <= 0) {
			maxIncomingRelevance = 1;
		}

		for (const incomingScoreId of incomingScoreIds) {
			const incomingScore = debate.scores[incomingScoreId];
			if (!incomingScore) {
				throw new Error(`Incoming score ${incomingScoreId} was not found in the debate.`);
			}

			const nextConfidenceCascadeScale = Math.min(
				confidenceCascadeScaleByScoreId[incomingScoreId] ?? 1,
				cascadedConfidenceScaleFromTarget,
			);
			confidenceCascadeScaleByScoreId[incomingScoreId] = nextConfidenceCascadeScale;

			const relevanceNormalizedScale = Math.min(
				1,
				Math.max(0, incomingScore.relevance) / maxIncomingRelevance,
			);
			scaleOfSourcesByScoreId[incomingScoreId] = nextConfidenceCascadeScale * relevanceNormalizedScale;
		}
	}

	return scaleOfSourcesByScoreId;
}

function calculateConfidence(
	children: Array<{ score: Score; targetRelation: ReturnType<typeof deriveTargetRelation> }>,
): Pick<Score, "claimConfidence" | "reversibleClaimConfidence"> {
	if (children.length < 1) {
		return {
			claimConfidence: 1,
			reversibleClaimConfidence: 1,
		};
	}

	let totalWeight = 0;
	for (const child of children) {
		totalWeight += calculateImpact(child.score);
	}

	let reversibleClaimConfidence = 0;
	if (totalWeight !== 0) {
		for (const child of children) {
			reversibleClaimConfidence +=
				child.score.connectorConfidence *
				(calculateImpact(child.score) / totalWeight) *
				(child.targetRelation === "conTarget" ? -1 : 1);
		}
	}

	return {
		claimConfidence: clamp(reversibleClaimConfidence, 0, 1),
		reversibleClaimConfidence: clamp(reversibleClaimConfidence, -1, 1),
	};
}

function calculateRelevance(
	children: Array<{ score: Score; targetRelation: ReturnType<typeof deriveTargetRelation> }>,
): number {
	if (children.length < 1) {
		return 1;
	}

	let relevance = 1;
	for (const child of children) {
		if (child.score.connectorConfidence <= 0) {
			continue;
		}

		if (child.targetRelation === "proTarget") {
			relevance += child.score.connectorConfidence;
		} else {
			relevance -= child.score.connectorConfidence / 2;
		}
	}

	return Math.max(relevance, 0);
}

function createScoreFieldChanges(
	before: Score,
	after: Pick<
		Score,
		| "claimConfidence"
		| "reversibleClaimConfidence"
		| "connectorConfidence"
		| "reversibleConnectorConfidence"
		| "relevance"
	>,
): Change[] {
	const changes: Change[] = [];

	if (
		before.claimConfidence !== after.claimConfidence ||
		before.reversibleClaimConfidence !== after.reversibleClaimConfidence
	) {
		changes.push({
			id: newId() as ChangeId,
			kind: "ScoreClaimConfidenceChanged",
			scoreId: before.id,
			before: {
				claimConfidence: before.claimConfidence,
				reversibleClaimConfidence: before.reversibleClaimConfidence,
			},
			after: {
				claimConfidence: after.claimConfidence,
				reversibleClaimConfidence: after.reversibleClaimConfidence,
			},
			direction: "sourceToTarget",
		});
	}

	if (
		before.connectorConfidence !== after.connectorConfidence ||
		before.reversibleConnectorConfidence !== after.reversibleConnectorConfidence
	) {
		changes.push({
			id: newId() as ChangeId,
			kind: "ScoreConnectorConfidenceChanged",
			scoreId: before.id,
			before: {
				connectorConfidence: before.connectorConfidence,
				reversibleConnectorConfidence: before.reversibleConnectorConfidence,
			},
			after: {
				connectorConfidence: after.connectorConfidence,
				reversibleConnectorConfidence: after.reversibleConnectorConfidence,
			},
			direction: "sourceToTarget",
		});
	}

	if (before.relevance !== after.relevance) {
		changes.push({
			id: newId() as ChangeId,
			kind: "ScoreRelevanceChanged",
			scoreId: before.id,
			before: { relevance: before.relevance },
			after: { relevance: after.relevance },
			direction: "sourceToTarget",
		});
	}

	return changes;
}

function createScaleOfSourcesChangedRecords(beforeDebate: Debate, afterDebate: Debate): Change[] {
	const rootScores = getScoresForClaimId(afterDebate, afterDebate.mainClaimId);
	if (rootScores.length !== 1) {
		throw new Error(`Expected exactly one root score for main claim ${afterDebate.mainClaimId}, found ${rootScores.length}.`);
	}

	const orderedScoreIds = collectScoreIdsInLayoutOrder(afterDebate, rootScores[0].id);
	const scaleChanges = [] as Extract<Change, { kind: "ScoreScaleOfSourcesBatchChanged" }>["changes"];

	for (const scoreId of orderedScoreIds) {
		const beforeScore = beforeDebate.scores[scoreId];
		const afterScore = afterDebate.scores[scoreId];
		if (!beforeScore || !afterScore || beforeScore.scaleOfSources === afterScore.scaleOfSources) {
			continue;
		}

		scaleChanges.push({
			scoreId,
			before: {
				scaleOfSources: beforeScore.scaleOfSources,
			},
			after: {
				scaleOfSources: afterScore.scaleOfSources,
			},
			direction: "sourceToTarget",
		});
	}

	if (scaleChanges.length === 0) {
		return [];
	}

	return [{
		id: newId() as ChangeId,
		kind: "ScoreScaleOfSourcesBatchChanged",
		changes: scaleChanges,
	}];
}

function collectScoreIdsInLayoutOrder(debate: Debate, rootScoreId: ScoreId): ScoreId[] {
	const visited = new Set<ScoreId>();
	const ordered: ScoreId[] = [];

	visitScore(rootScoreId);

	for (const scoreId of Object.keys(debate.scores) as ScoreId[]) {
		visitScore(scoreId);
	}

	return ordered;

	function visitScore(scoreId: ScoreId): void {
		if (visited.has(scoreId)) {
			return;
		}

		const score = debate.scores[scoreId];
		if (!score) {
			throw new Error(`Score ${scoreId} was not found in the debate.`);
		}

		visited.add(scoreId);
		ordered.push(scoreId);

		for (const incomingScoreId of score.incomingScoreIds) {
			visitScore(incomingScoreId);
		}
	}
}
