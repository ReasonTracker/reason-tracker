import type { AddClaimCommand } from "../debate-core/Commands.ts";
import {
	applyConfidenceClaimAddCommand,
	applyRelevanceClaimAddCommand,
} from "./applyDebateCommand.ts";
import { buildDebateFrame } from "../layout/buildDebateFrame.ts";
import type { PresentationConnectorOccurrenceId } from "../animationContracts.ts";
import {
	resolveCommandImpact,
	resolveFirstWaveImpact,
} from "./animationImpact.ts";
import {
	applyDisplayState,
	applyTemporaryDeliveryTapers,
	augmentOpeningFrame,
	buildSproutFrame,
	buildVoilaFrame,
	preserveOpeningFrameState,
	preserveRevealState,
	settleAggregatorScores,
	trailAggregatorScores,
} from "./animationFrameTransitions.ts";
import {
	assertScoreChangesLimitedTo,
	resolveFirstFillMath,
	resolveFirstWaveMath,
	resolvePlacementMath,
	resolveSnapshotMath,
} from "./animationSnapshotMath.ts";
import {
	buildAnimationStep,
	resolveSceneBounds,
	type TrackAddress,
} from "./buildAnimationStep.ts";
import {
	resolvePlannerOptions,
	type PlannerInput,
} from "./contracts.ts";
import {
	resolvePresentationMath,
} from "../layout/resolvePresentationMath.ts";
import type { DebateAnimationPlan } from "./DebateAnimationPlan.ts";

const FIRST_FILL_LAYOUT_START_PROGRESS = 0.5;

// Linear, like the First Fill score, so the aggregator front keeps the pipe front's pace.
function resolveTrailingAggregatorTiming(address: TrackAddress) {
	return address.field === "aggregatorScore"
		? { easing: "linear" as const }
		: { easing: "smooth" as const };
}

export function planStaticDebate(
	input: Omit<PlannerInput, "command">,
): DebateAnimationPlan {
	const options = resolvePlannerOptions(input.options);
	const frame = buildDebateFrame({
		debateCore: input.debateCore,
		origin: input.origin,
		options,
		resolvedMath: resolvePresentationMath(input.debateCore),
	});
	const firstFill = buildAnimationStep("firstFill", frame, frame, () => ({}));
	const sprout = buildAnimationStep("sprout", frame, frame, () => ({}));
	const voila = buildAnimationStep("voila", frame, frame, () => ({}));
	const wave = buildAnimationStep("wave", frame, frame, () => ({}));
	const reorient = buildAnimationStep("reorient", frame, frame, () => ({}));

	return {
		bounds: resolveSceneBounds([frame], options.claimWidth, options.claimHeight),
		origin: input.origin,
		openingFrame: frame,
		options,
		steps: { firstFill, reorient, sprout, voila, wave },
	};
}

export function planDebateAnimation(input: PlannerInput): DebateAnimationPlan {
	if (input.command.type !== "confidence/claim/add") {
		throw new Error(`Unsupported animation command: ${input.command.type}`);
	}

	return planDebateAnimationBatch({
		commands: [input.command],
		debateCore: input.debateCore,
		options: input.options,
	});
}

export function planDebateAnimationBatch(
	input: Omit<PlannerInput, "command"> & {
		commands: readonly AddClaimCommand[]
	},
): DebateAnimationPlan {
	if (input.commands.length === 0) {
		throw new Error("Cannot plan an animation without commands.");
	}

	const options = resolvePlannerOptions(input.options);
	let settledDebateCore = input.debateCore;
	const appliedCommands = input.commands.map((command) => {
		const applied = command.type === "confidence/claim/add"
			? applyConfidenceClaimAddCommand({ command, debateCore: settledDebateCore })
			: applyRelevanceClaimAddCommand({ command, debateCore: settledDebateCore });
		settledDebateCore = applied.debateCore;
		return applied;
	});
	const openingResolvedMath = resolvePresentationMath(input.debateCore);
	const openingFrame = buildDebateFrame({
		debateCore: input.debateCore,
		origin: input.origin,
		options,
		resolvedMath: openingResolvedMath,
	});
	const settledResolvedMath = resolvePresentationMath(settledDebateCore);
	const settledFrame = buildDebateFrame({
		debateCore: settledDebateCore,
		origin: input.origin,
		options,
		resolvedMath: settledResolvedMath,
	});
	const commandImpact = resolveCommandImpact(appliedCommands, settledFrame);
	const stagingResolvedMath = resolvePlacementMath({
		openingResolvedMath,
		settledResolvedMath,
	});
	const stagingFrame = buildDebateFrame({
		debateCore: settledDebateCore,
		origin: input.origin,
		options,
		resolvedMath: stagingResolvedMath,
	});
	const stagedAnimationFrame = preserveOpeningFrameState(
		applyTemporaryDeliveryTapers(
			stagingFrame,
			commandImpact.taperedDeliveryOccurrenceIds,
		),
		openingFrame,
	);
	const voilaInitialFrame = settleAggregatorScores(augmentOpeningFrame({
		addedClaimOccurrenceIds: commandImpact.addedClaimOccurrenceIds,
		newConfidenceOccurrenceIds: commandImpact.newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds: commandImpact.newRelevanceOccurrenceIds,
		openingFrame,
		stagingFrame: stagedAnimationFrame,
	}));
	const voilaFrame = settleAggregatorScores(buildVoilaFrame({
		newConfidenceOccurrenceIds: commandImpact.newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds: commandImpact.newRelevanceOccurrenceIds,
		stagingFrame: stagedAnimationFrame,
	}));
	const sproutFrame = settleAggregatorScores(buildSproutFrame({
		newConfidenceOccurrenceIds: commandImpact.newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds: commandImpact.newRelevanceOccurrenceIds,
		voilaFrame,
	}));
	const firstFillResolvedMath = resolveFirstFillMath({
		commandImpact,
		settledResolvedMath,
		stagingResolvedMath,
	});
	assertScoreChangesLimitedTo({
		allowedClaimOccurrenceIds: commandImpact.directAddedClaimOccurrenceIds,
		allowedConnectorOccurrenceIds: new Set([
			...commandImpact.contactConfidenceOccurrenceIds,
			...commandImpact.newRelevanceOccurrenceIds,
		]),
		from: stagingResolvedMath,
		label: "First Fill",
		to: firstFillResolvedMath,
	});
	const firstFillFrame = trailAggregatorScores(preserveRevealState(buildDebateFrame({
		debateCore: settledDebateCore,
		origin: input.origin,
		options,
		resolvedMath: firstFillResolvedMath,
	}), sproutFrame), sproutFrame);
	const waveResolvedMath = resolveFirstWaveMath({
		commandImpact,
		firstFillResolvedMath,
		settledResolvedMath,
	});
	const firstWaveImpact = resolveFirstWaveImpact(
		commandImpact,
		settledResolvedMath,
	);
	assertScoreChangesLimitedTo({
		allowedClaimOccurrenceIds: firstWaveImpact.claimOccurrenceIds,
		allowedConnectorOccurrenceIds: firstWaveImpact.connectorOccurrenceIds,
		from: firstFillResolvedMath,
		label: "Wave",
		to: waveResolvedMath,
	});
	const waveFrame = trailAggregatorScores(preserveRevealState(buildDebateFrame({
		debateCore: settledDebateCore,
		origin: input.origin,
		options,
		resolvedMath: waveResolvedMath,
	}), firstFillFrame), firstFillFrame);
	const reorientResolvedMath = resolveSnapshotMath(
		settledResolvedMath,
		waveResolvedMath.claimScores,
		waveResolvedMath.connectorScores,
		"derived",
	);
	const reorientFrame = trailAggregatorScores(preserveRevealState(buildDebateFrame({
		debateCore: settledDebateCore,
		origin: input.origin,
		options,
		resolvedMath: reorientResolvedMath,
	}), waveFrame), waveFrame);
	const reorientInitialFrame = applyDisplayState(waveFrame, reorientFrame);

	const voila = buildAnimationStep("voila", voilaInitialFrame, voilaFrame, () => ({
		easing: "smooth",
	}));
	const sprout = buildAnimationStep("sprout", voilaFrame, sproutFrame, (address) => {
		if (
			address.kind === "relevance"
			&& address.field === "shellReveal"
			&& commandImpact.newRelevanceOccurrenceIds.has(
				address.id as PresentationConnectorOccurrenceId,
			)
		) {
			return { easing: "smooth", startProgress: 0.25 };
		}
		return { easing: "smooth" };
	});
	const firstFill = buildAnimationStep(
		"firstFill",
		sproutFrame,
		firstFillFrame,
		(address) => address.field === "score"
			? { easing: "linear" }
			: { easing: "smooth", startProgress: FIRST_FILL_LAYOUT_START_PROGRESS },
	);
	const wave = buildAnimationStep(
		"wave",
		firstFillFrame,
		waveFrame,
		resolveTrailingAggregatorTiming,
	);
	const reorient = buildAnimationStep(
		"reorient",
		reorientInitialFrame,
		reorientFrame,
		resolveTrailingAggregatorTiming,
	);

	return {
		bounds: resolveSceneBounds([
			openingFrame,
			voilaInitialFrame,
			voilaFrame,
			sproutFrame,
			firstFillFrame,
			waveFrame,
			reorientFrame,
		], options.claimWidth, options.claimHeight),
		origin: input.origin,
		openingFrame,
		options,
		steps: { firstFill, reorient, sprout, voila, wave },
	};
}
