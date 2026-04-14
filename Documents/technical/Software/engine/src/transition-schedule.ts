// See 📌README.md in this folder for local coding standards before editing this file.

import type { Debate } from "../../contracts/src/Debate.ts";
import type { AnimationStep, Change, IntentSequence } from "../../contracts/src/IntentSequence.ts";
import { applyIntentSequenceStep } from "./step-application.ts";
import { calculateLayoutPipeline, type DebateLayoutPipelineContext, type LayoutOptions } from "./layout.ts";

export interface PrepareAnimationScheduleRequest {
	debate: Debate
	intentSequence?: IntentSequence
	eventDurationInFrames: number
	layoutOptions?: LayoutOptions
}

export interface AnimationTransitionUnit {
	name: string
	from: DebateLayoutPipelineContext
	to: DebateLayoutPipelineContext
	animationSteps: readonly AnimationStep[]
	durationInFrames: number
}

export interface PreparedAnimationSchedule {
	initialPipeline: DebateLayoutPipelineContext
	transitionUnits: AnimationTransitionUnit[]
	finalPipeline: DebateLayoutPipelineContext
}

export async function prepareAnimationSchedule(
	request: PrepareAnimationScheduleRequest,
): Promise<PreparedAnimationSchedule> {
	const initialPipeline = await calculateLayoutPipeline({
		debate: request.debate,
	}, request.layoutOptions);
	const intentSequence = request.intentSequence;
	if (!intentSequence) {
		return {
			initialPipeline,
			transitionUnits: [],
			finalPipeline: initialPipeline,
		};
	}

	const unscheduledUnits: Array<Omit<AnimationTransitionUnit, "durationInFrames">> = [];
	let workingDebate = request.debate;
	let workingPipeline = initialPipeline;

	for (const step of intentSequence.steps) {
		if (step.type === "RecalculationWaveStep") {
			for (const change of step.changes) {
				const nextDebate = applyIntentSequenceStep({
					debate: workingDebate,
					intentSequence,
					stepId: step.id,
					changes: [change],
				}).debate;
				const nextPipeline = await calculateLayoutPipeline({
					debate: nextDebate,
					intentSequence,
					stepId: step.id,
					changes: [change],
				}, request.layoutOptions);
				pushTransitionUnits(
					unscheduledUnits,
					workingPipeline,
					nextPipeline,
					`${step.type} / ${change.type} / ${change.scoreId}`,
				);
				workingDebate = nextDebate;
				workingPipeline = nextPipeline;
			}
			continue;
		}

		const nextDebate = applyIntentSequenceStep({
			debate: workingDebate,
			intentSequence,
			stepId: step.id,
		}).debate;
		const nextPipeline = await calculateLayoutPipeline({
			debate: nextDebate,
			intentSequence,
			stepId: step.id,
		}, request.layoutOptions);
		pushTransitionUnits(
			unscheduledUnits,
			workingPipeline,
			nextPipeline,
			step.type,
		);
		workingDebate = nextDebate;
		workingPipeline = nextPipeline;
	}

	return {
		initialPipeline,
		transitionUnits: scheduleTransitionUnits(unscheduledUnits, request.eventDurationInFrames, workingPipeline),
		finalPipeline: workingPipeline,
	};
}

function pushTransitionUnits(
	units: Array<Omit<AnimationTransitionUnit, "durationInFrames">>,
	from: DebateLayoutPipelineContext,
	to: DebateLayoutPipelineContext,
	baseName: string,
): void {
	for (const animationStep of to.animationSteps ?? []) {
		units.push({
			name: `${baseName} / ${formatAnimationStepName(animationStep, to.debate)}`,
			from,
			to,
			animationSteps: [animationStep],
		});
	}
}

function resolveAnimationUnitWeight(animationSteps: readonly AnimationStep[]): number {
	if (animationSteps.length === 0) {
		return 1;
	}

	return animationSteps.reduce((sum, animationStep) => sum + resolveAnimationStepWeight(animationStep), 0);
}

function scheduleTransitionUnits(
	units: Array<Omit<AnimationTransitionUnit, "durationInFrames">>,
	eventDurationInFrames: number,
	finalPipeline: DebateLayoutPipelineContext,
): AnimationTransitionUnit[] {
	if (units.length === 0) {
		return [];
	}

	const weightedUnits = units.map((unit, index) => {
		const weight = resolveAnimationUnitWeight(unit.animationSteps);
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

	let assignedFrames = scheduledUnits.reduce((sum, entry) => sum + entry.durationInFrames, 0);
	let remainingFrames = Math.max(0, eventDurationInFrames - assignedFrames);
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

	assignedFrames = normalizedUnits.reduce((sum, unit) => sum + unit.durationInFrames, 0);
	const holdFrames = Math.max(0, eventDurationInFrames - assignedFrames);
	if (holdFrames > 0) {
		normalizedUnits.push({
			name: "Hold final state",
			from: finalPipeline,
			to: finalPipeline,
			animationSteps: [],
			durationInFrames: holdFrames,
		});
	}

	return normalizedUnits;
}

function resolveAnimationStepWeight(animationStep: AnimationStep | undefined): number {
	if (!animationStep) {
		return 1;
	}

	if (animationStep.type === "ScoreAnimationStep") {
		switch (animationStep.phase) {
			case "enter":
			case "exit":
				return 3;
			case "display":
				return 2;
			case "scale":
				return 2;
			case "layout":
				return 2;
		}
	}

	switch (animationStep.phase) {
		case "enter":
		case "grow":
		case "shrink":
		case "exit":
			return 5;
		case "update":
		case "reroute":
			return 4;
	}
}

function formatAnimationStepName(animationStep: AnimationStep, debate: Debate): string {
	if (animationStep.type === "ScoreAnimationStep") {
		const score = debate.scores[animationStep.scoreId];
		const claim = score ? debate.claims[score.claimId] : undefined;
		return `${animationStep.type} ${animationStep.phase} ${claim?.content ?? animationStep.scoreId}`;
	}

	const connector = debate.connectors[animationStep.connectorId];
	const sourceClaim = connector ? debate.claims[connector.source] : undefined;
	const targetClaim = connector ? debate.claims[connector.target] : undefined;
	return `${animationStep.type} ${animationStep.phase} ${sourceClaim?.content ?? connector?.source ?? animationStep.connectorId} -> ${targetClaim?.content ?? connector?.target ?? animationStep.connectorId}`;
}
