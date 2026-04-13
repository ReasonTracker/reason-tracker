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

		const refreshedScore = workingDebate.scores[scoreId];
		const scaleChange = createScaleOfSourcesChanged(
			refreshedScore,
			recalculated.scaleOfSources,
		);
		if (scaleChange) {
			changes.push(scaleChange);
			workingDebate = applyChange(workingDebate, scaleChange);
		}

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
	const scaleOfSources = calculateScaleOfSources(incomingChildren);

	return {
		confidence: confidenceResult.confidence,
		reversibleConfidence: confidenceResult.reversibleConfidence,
		relevance,
		scaleOfSources,
	};
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

function calculateScaleOfSources(children: Array<{ score: Score }>): number {
	if (children.length < 1) {
		return 0;
	}

	let totalWeight = 0;
	let weightedScale = 0;
	for (const child of children) {
		const weight = Math.max(calculateImpact(child.score), 0);
		const childScale = Math.max(child.score.scaleOfSources, child.score.confidence);
		totalWeight += weight;
		weightedScale += childScale * weight;
	}

	if (totalWeight <= 0) {
		return 0;
	}

	return clamp(weightedScale / totalWeight, 0, 1);
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