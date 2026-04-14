// See 📌README.md in this folder for local coding standards before editing this file.

import { deriveTargetRelation } from "../../contracts/src/Connector.ts";
import type { Debate } from "../../contracts/src/Debate.ts";
import type {
	Change,
	RecalculationWaveStep,
	RecordId,
	ScaleOfSourcesChanged,
	ScoreCoreValuesChanged,
} from "../../contracts/src/IntentSequence.ts";
import { newId } from "../../contracts/src/newId.ts";
import type { Score, ScoreId } from "../../contracts/src/Score.ts";
import {
	calculateImpact,
	clamp,
	createScoreIndexes,
	getScoresForClaimId,
	getOutgoingTargetScoreIds,
} from "./graph.ts";
import { applyChange } from "./step-application.ts";

export function buildRecalculationWaveStep(
	debate: Debate,
	startingScoreIds: ScoreId | ScoreId[],
): RecalculationWaveStep {
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

		const recalculated = calculateScoreState(workingDebate, score);
		const scoreChange = createScoreCoreValuesChanged(score, recalculated);
		if (scoreChange) {
			changes.push(scoreChange);
			workingDebate = applyChange(workingDebate, scoreChange);
		}

		const nextDebateWithScaleOfSources = synchronizeScoreScaleOfSources(workingDebate);
		for (const scaleChange of createScaleOfSourcesChangedRecords(workingDebate, nextDebateWithScaleOfSources)) {
			changes.push(scaleChange);
			workingDebate = applyChange(workingDebate, scaleChange);
		}

		const refreshedScore = workingDebate.scores[scoreId];

		for (const nextScoreId of getOutgoingTargetScoreIds(scoreIndexes, refreshedScore.id)) {
			if (!processedScoreIds.has(nextScoreId)) {
				pendingScoreIds.push(nextScoreId);
			}
		}
	}

	return {
		id: newId() as RecordId,
		type: "RecalculationWaveStep",
		changes,
	};
}

function calculateScoreState(
	debate: Debate,
	score: Score,
): Pick<Score, "confidence" | "reversibleConfidence" | "relevance" | "scaleOfSources"> {
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
		return {
			confidence: clamp(claim.forceConfidence, 0, 1),
			reversibleConfidence: clamp(claim.forceConfidence, -1, 1),
			relevance: 1,
			scaleOfSources: 0,
		};
	}

	const confidenceChildren = incomingChildren.filter(({ connector }) => connector.affects === "confidence");
	const relevanceChildren = incomingChildren.filter(({ connector }) => connector.affects === "relevance");

	const confidenceResult = calculateConfidence(confidenceChildren);
	const relevance = calculateRelevance(relevanceChildren);

	return {
		confidence: confidenceResult.confidence,
		reversibleConfidence: confidenceResult.reversibleConfidence,
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

			if (incomingScore.confidence > 0) {
				totalPositiveConfidenceMass += incomingScore.confidence;
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
): Pick<Score, "confidence" | "reversibleConfidence"> {
	if (children.length < 1) {
		return {
			confidence: 1,
			reversibleConfidence: 1,
		};
	}

	let totalWeight = 0;
	for (const child of children) {
		totalWeight += calculateImpact(child.score);
	}

	let reversibleConfidence = 0;
	if (totalWeight !== 0) {
		for (const child of children) {
			reversibleConfidence +=
				child.score.confidence *
				(calculateImpact(child.score) / totalWeight) *
				(child.targetRelation === "conTarget" ? -1 : 1);
		}
	}

	return {
		confidence: clamp(reversibleConfidence, 0, 1),
		reversibleConfidence: clamp(reversibleConfidence, -1, 1),
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
		if (child.score.confidence <= 0) {
			continue;
		}

		if (child.targetRelation === "proTarget") {
			relevance += child.score.confidence;
		} else {
			relevance -= child.score.confidence / 2;
		}
	}

	return Math.max(relevance, 0);
}

function createScaleOfSourcesChangedRecords(beforeDebate: Debate, afterDebate: Debate): ScaleOfSourcesChanged[] {
	const rootScores = getScoresForClaimId(afterDebate, afterDebate.mainClaimId);
	if (rootScores.length !== 1) {
		throw new Error(`Expected exactly one root score for main claim ${afterDebate.mainClaimId}, found ${rootScores.length}.`);
	}

	const orderedScoreIds = collectScoreIdsInLayoutOrder(afterDebate, rootScores[0].id);
	const scaleChanges: ScaleOfSourcesChanged[] = [];

	for (const scoreId of orderedScoreIds) {
		const beforeScore = beforeDebate.scores[scoreId];
		const afterScore = afterDebate.scores[scoreId];
		if (!beforeScore || !afterScore || beforeScore.scaleOfSources === afterScore.scaleOfSources) {
			continue;
		}

		scaleChanges.push({
			id: newId() as RecordId,
			type: "ScaleOfSourcesChanged",
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

	return scaleChanges;
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

function createScoreCoreValuesChanged(
	before: Score,
	after: Pick<Score, "confidence" | "reversibleConfidence" | "relevance">,
): ScoreCoreValuesChanged | undefined {
	if (
		before.confidence === after.confidence &&
		before.reversibleConfidence === after.reversibleConfidence &&
		before.relevance === after.relevance
	) {
		return undefined;
	}

	return {
		id: newId() as RecordId,
		type: "ScoreCoreValuesChanged",
		scoreId: before.id,
		before: {
			confidence: before.confidence,
			reversibleConfidence: before.reversibleConfidence,
			relevance: before.relevance,
		},
		after,
		direction: "sourceToTarget",
	};
}

function createScaleOfSourcesChanged(
	before: Score,
	afterScaleOfSources: number,
): ScaleOfSourcesChanged | undefined {
	if (before.scaleOfSources === afterScaleOfSources) {
		return undefined;
	}

	return {
		id: newId() as RecordId,
		type: "ScaleOfSourcesChanged",
		scoreId: before.id,
		before: {
			scaleOfSources: before.scaleOfSources,
		},
		after: {
			scaleOfSources: afterScaleOfSources,
		},
		direction: "sourceToTarget",
	};
}