// See 📌README.md in this folder for local coding standards before editing this file.

import type { Debate } from "../../contracts/src/Debate.ts";
import type {
	AppliedAddConnectionStep,
	AppliedAddLeafClaimStep,
	AppliedChangeClaimStep,
	AppliedRemoveClaimStep,
	AppliedRemoveConnectionStep,
	Change,
	IncomingSourcesResortedStep,
	RecalculationWaveStep,
	Step,
} from "../../contracts/src/IntentSequence.ts";
import type { Score } from "../../contracts/src/Score.ts";
import type {
	ApplyIntentSequenceStepRequest,
	ApplyIntentSequenceStepResult,
} from "./api.ts";
import { assertNever } from "./graph.ts";

export function applyIntentSequenceStep(
	request: ApplyIntentSequenceStepRequest,
): ApplyIntentSequenceStepResult {
	const step = request.intentSequence.steps.find((candidate) => candidate.id === request.stepId);
	if (!step) {
		throw new Error(`Step ${request.stepId} was not found in the provided intent sequence.`);
	}

	return {
		debate: applyStep(request.debate, step, request.changes),
	};
}

export function applyStep(debate: Debate, step: Step, changesOverride?: Change[]): Debate {
	switch (step.type) {
		case "AppliedAddLeafClaimStep":
			return applyAppliedAddLeafClaimStep(debate, step);
		case "AppliedAddConnectionStep":
			return applyAppliedAddConnectionStep(debate, step);
		case "AppliedRemoveConnectionStep":
			return applyAppliedRemoveConnectionStep(debate, step);
		case "AppliedChangeClaimStep":
			return applyAppliedChangeClaimStep(debate, step);
		case "AppliedRemoveClaimStep":
			return applyAppliedRemoveClaimStep(debate, step);
		case "RecalculationWaveStep":
			return applyRecalculationWaveStep(debate, step, changesOverride);
		case "IncomingSourcesResortedStep":
			return applyIncomingSourcesResortedStep(debate, step);
		default:
			return assertNever(step);
	}
}

export function applyAppliedAddLeafClaimStep(
	debate: Debate,
	step: AppliedAddLeafClaimStep,
): Debate {
	const targetScore = debate.scores[step.targetScoreId];
	if (!targetScore) {
		throw new Error(`Target score ${step.targetScoreId} was not found in the debate.`);
	}

	return {
		...debate,
		claims: {
			...debate.claims,
			[step.claim.id]: step.claim,
		},
		connectors: {
			...debate.connectors,
			[step.connector.id]: step.connector,
		},
		scores: {
			...debate.scores,
			[step.score.id]: step.score,
			[step.targetScoreId]: {
				...targetScore,
				incomingScoreIds: [...step.incomingScoreIds],
			},
		},
	};
}

export function applyAppliedAddConnectionStep(
	debate: Debate,
	step: AppliedAddConnectionStep,
): Debate {
	const targetScore = debate.scores[step.targetScoreId];
	if (!targetScore) {
		throw new Error(`Target score ${step.targetScoreId} was not found in the debate.`);
	}

	return {
		...debate,
		connectors: {
			...debate.connectors,
			[step.connector.id]: step.connector,
		},
		scores: {
			...debate.scores,
			[step.score.id]: step.score,
			[step.targetScoreId]: {
				...targetScore,
				incomingScoreIds: [...step.incomingScoreIds],
			},
		},
	};
}

export function applyAppliedRemoveConnectionStep(
	debate: Debate,
	step: AppliedRemoveConnectionStep,
): Debate {
	const targetScore = debate.scores[step.targetScoreId];
	if (!targetScore) {
		throw new Error(`Target score ${step.targetScoreId} was not found in the debate.`);
	}

	const nextConnectors = { ...debate.connectors };
	delete nextConnectors[step.connector.id];

	const nextScores = { ...debate.scores };
	delete nextScores[step.score.id];

	return {
		...debate,
		connectors: nextConnectors,
		scores: {
			...nextScores,
			[step.targetScoreId]: {
				...targetScore,
				incomingScoreIds: [...step.incomingScoreIds],
			},
		},
	};
}

export function applyAppliedChangeClaimStep(
	debate: Debate,
	step: AppliedChangeClaimStep,
): Debate {
	return {
		...debate,
		claims: {
			...debate.claims,
			[step.claimAfter.id]: step.claimAfter,
		},
	};
}

export function applyAppliedRemoveClaimStep(
	debate: Debate,
	step: AppliedRemoveClaimStep,
): Debate {
	const nextClaims = { ...debate.claims };
	delete nextClaims[step.claim.id];

	return {
		...debate,
		claims: nextClaims,
	};
}

export function applyRecalculationWaveStep(
	debate: Debate,
	step: RecalculationWaveStep,
	changesOverride: Change[] | undefined,
): Debate {
	let nextDebate = debate;
	for (const change of changesOverride ?? step.changes) {
		nextDebate = applyChange(nextDebate, change);
	}
	return nextDebate;
}

export function applyIncomingSourcesResortedStep(
	debate: Debate,
	step: IncomingSourcesResortedStep,
): Debate {
	const score = debate.scores[step.scoreId];
	if (!score) {
		throw new Error(`Score ${step.scoreId} was not found in the debate.`);
	}

	return {
		...debate,
		scores: {
			...debate.scores,
			[step.scoreId]: {
				...score,
				incomingScoreIds: [...step.incomingScoreIds],
			},
		},
	};
}

export function applyChange(debate: Debate, change: Change): Debate {
	const score = debate.scores[change.scoreId];
	if (!score) {
		throw new Error(`Score ${change.scoreId} was not found in the debate.`);
	}

	switch (change.type) {
		case "ScoreCoreValuesChanged":
			return applyScoreCoreValuesChanged(debate, score, change);
		case "ScaleOfSourcesChanged":
			return applyScaleOfSourcesChanged(debate, score, change);
		default:
			return assertNever(change);
	}
}

function applyScoreCoreValuesChanged(
	debate: Debate,
	score: Score,
	change: Extract<Change, { type: "ScoreCoreValuesChanged" }>,
): Debate {
	return {
		...debate,
		scores: {
			...debate.scores,
			[change.scoreId]: {
				...score,
				confidence: change.after.confidence,
				reversibleConfidence: change.after.reversibleConfidence,
				relevance: change.after.relevance,
			},
		},
	};
}

function applyScaleOfSourcesChanged(
	debate: Debate,
	score: Score,
	change: Extract<Change, { type: "ScaleOfSourcesChanged" }>,
): Debate {
	return {
		...debate,
		scores: {
			...debate.scores,
			[change.scoreId]: {
				...score,
				scaleOfSources: change.after.scaleOfSources,
			},
		},
	};
}