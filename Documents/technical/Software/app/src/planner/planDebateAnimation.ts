import type { AddClaimCommand } from "../debate-core/Commands.ts";
import {
	applyConfidenceClaimAddCommand,
	applyRelevanceClaimAddCommand,
	type AppliedConfidenceClaimAddCommand,
	type AppliedRelevanceClaimAddCommand,
} from "./applyDebateCommand.ts";
import { buildDebateFrame } from "./buildDebateFrame.ts";
import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "./buildPresentationGraphFromDebateCore.ts";
import {
	numberTrack,
	type AnimationStepId,
	type DebateAnimationPlan,
	type DebateAnimationStep,
	type DebateFrame,
	type NumberTrack,
} from "./DebateAnimationPlan.ts";
import {
	resolvePlannerOptions,
	type PlannerInput,
} from "./contracts.ts";
import {
	resolvePresentationMath,
	resolvePresentationMathSnapshot,
	type ResolvedPresentationMath,
} from "./resolvePresentationMath.ts";

const SCENE_PADDING = 96;
// AGENT NOTE: Keep animation timing constants together below the imports.
/** Begins direct-score layout changes as the first fill reaches its target. */
const FIRST_FILL_LAYOUT_START_PROGRESS = 0.5;

type TrackAddress = {
	field: string
	id: string
	kind: "claim" | "confidence" | "relevance"
};

type TrackTiming = Partial<Pick<NumberTrack, "easing" | "endProgress" | "startProgress">>;

type CommandImpact = {
	addedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	contactConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	directAddedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	taperedDeliveryOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
};

type FirstWaveImpact = {
	claimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	connectorOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
};

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

	return {
		bounds: resolveSceneBounds([frame], options.claimWidth, options.claimHeight),
		origin: input.origin,
		openingFrame: frame,
		options,
		steps: { firstFill, sprout, voila, wave },
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
	const voilaInitialFrame = augmentOpeningFrame({
		addedClaimOccurrenceIds: commandImpact.addedClaimOccurrenceIds,
		newConfidenceOccurrenceIds: commandImpact.newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds: commandImpact.newRelevanceOccurrenceIds,
		openingFrame,
		stagingFrame: stagedAnimationFrame,
	});
	const voilaFrame = buildVoilaFrame({
		newConfidenceOccurrenceIds: commandImpact.newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds: commandImpact.newRelevanceOccurrenceIds,
		stagingFrame: stagedAnimationFrame,
	});
	const sproutFrame = buildSproutFrame({
		newConfidenceOccurrenceIds: commandImpact.newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds: commandImpact.newRelevanceOccurrenceIds,
		voilaFrame,
	});
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
	const firstFillFrame = preserveRevealState(buildDebateFrame({
		debateCore: settledDebateCore,
		origin: input.origin,
		options,
		resolvedMath: firstFillResolvedMath,
	}), sproutFrame);
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
	const waveFrame = preserveRevealState(buildDebateFrame({
		debateCore: settledDebateCore,
		origin: input.origin,
		options,
		resolvedMath: waveResolvedMath,
	}), firstFillFrame);

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
		() => ({ easing: "smooth" }),
	);

	return {
		bounds: resolveSceneBounds([
			openingFrame,
			voilaInitialFrame,
			voilaFrame,
			sproutFrame,
			firstFillFrame,
			waveFrame,
		], options.claimWidth, options.claimHeight),
		origin: input.origin,
		openingFrame,
		options,
		steps: { firstFill, sprout, voila, wave },
	};
}

function augmentOpeningFrame(args: {
	addedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	openingFrame: DebateFrame
	stagingFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.stagingFrame);

	for (const claim of Object.values(frame.claims)) {
		const openingClaim = args.openingFrame.claims[claim.id];
		if (openingClaim) {
			frame.claims[claim.id] = { ...openingClaim, position: { ...openingClaim.position } };
		} else if (args.addedClaimOccurrenceIds.has(claim.id)) {
			claim.scale = 0;
		} else {
			throw new Error(`Opening frame is missing existing claim occurrence: ${claim.id}`);
		}
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const openingConnection = args.openingFrame.confidenceConnections[connection.id];
		if (openingConnection) {
			frame.confidenceConnections[connection.id] = {
				...connection,
				...openingConnection,
				relevanceConnectorOccurrenceIds: connection.relevanceConnectorOccurrenceIds,
			};
		} else if (args.newConfidenceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
			connection.shellReveal = 0;
		} else {
			throw new Error(`Opening frame is missing existing confidence occurrence: ${connection.id}`);
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		const openingConnection = args.openingFrame.relevanceConnections[connection.id];
		if (openingConnection) {
			frame.relevanceConnections[connection.id] = { ...openingConnection };
		} else if (args.newRelevanceOccurrenceIds.has(connection.id)) {
			connection.scale = 0;
			connection.score = 0;
			connection.shellReveal = 0;
		} else {
			throw new Error(`Opening frame is missing existing relevance occurrence: ${connection.id}`);
		}
	}

	return frame;
}

function preserveOpeningFrameState(
	placementFrame: DebateFrame,
	openingFrame: DebateFrame,
): DebateFrame {
	const frame = cloneFrame(placementFrame);

	for (const claim of Object.values(frame.claims)) {
		const openingClaim = openingFrame.claims[claim.id];
		if (openingClaim) {
			frame.claims[claim.id] = { ...openingClaim, position: { ...openingClaim.position } };
		}
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const openingConnection = openingFrame.confidenceConnections[connection.id];
		if (openingConnection) {
			frame.confidenceConnections[connection.id] = {
				...connection,
				...openingConnection,
				junctionSpan: connection.junctionSpan,
				relevanceConnectorOccurrenceIds: connection.relevanceConnectorOccurrenceIds,
			};
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		const openingConnection = openingFrame.relevanceConnections[connection.id];
		if (openingConnection) {
			frame.relevanceConnections[connection.id] = { ...openingConnection };
		}
	}

	return frame;
}

function resolveCommandImpact(
	appliedCommands: readonly (
		| AppliedConfidenceClaimAddCommand
		| AppliedRelevanceClaimAddCommand
	)[],
	settledFrame: DebateFrame,
): CommandImpact {
	const addedClaimIds = new Set(appliedCommands.map((applied) => applied.claimId));
	const newConfidenceConnectorIds = new Set(
		appliedCommands.flatMap((applied) =>
			"confidenceConnectorId" in applied ? [applied.confidenceConnectorId] : []
		),
	);
	const newRelevanceConnectorIds = new Set(
		appliedCommands.flatMap((applied) =>
			"relevanceConnectorId" in applied ? [applied.relevanceConnectorId] : []
		),
	);
	const addedClaimOccurrenceIds = new Set(
		Object.values(settledFrame.claims)
			.filter((claim) => addedClaimIds.has(claim.claimId))
			.map((claim) => claim.id),
	);
	const newConfidenceOccurrenceIds = new Set(
		Object.values(settledFrame.confidenceConnections)
			.filter((connection) => newConfidenceConnectorIds.has(connection.confidenceConnectorId))
			.map((connection) => connection.id),
	);
	const newRelevanceOccurrences = Object.values(settledFrame.relevanceConnections)
		.filter((connection) => newRelevanceConnectorIds.has(connection.relevanceConnectorId));
	const newRelevanceOccurrenceIds = new Set(
		newRelevanceOccurrences.map((connection) => connection.id),
	);
	const contactConfidenceOccurrenceIds = new Set(newConfidenceOccurrenceIds);
	for (const relevanceOccurrence of newRelevanceOccurrences) {
		contactConfidenceOccurrenceIds.add(
			relevanceOccurrence.targetConfidenceConnectorOccurrenceId,
		);
	}
	const firstWaveTargetClaimOccurrenceIds = new Set(
		[...contactConfidenceOccurrenceIds].map((occurrenceId) => {
			const connection = settledFrame.confidenceConnections[occurrenceId];
			if (!connection) {
				throw new Error(`Missing contact confidence occurrence: ${occurrenceId}`);
			}
			return connection.targetClaimOccurrenceId;
		}),
	);
	const directAddedClaimOccurrenceIds = new Set(
		[...addedClaimOccurrenceIds].filter(
			(occurrenceId) => !firstWaveTargetClaimOccurrenceIds.has(occurrenceId),
		),
	);

	return {
		addedClaimOccurrenceIds,
		contactConfidenceOccurrenceIds,
		directAddedClaimOccurrenceIds,
		newConfidenceOccurrenceIds,
		newRelevanceOccurrenceIds,
		taperedDeliveryOccurrenceIds: new Set(newConfidenceOccurrenceIds),
	};
}

function applyTemporaryDeliveryTapers(
	frame: DebateFrame,
	occurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>,
): DebateFrame {
	const taperedFrame = cloneFrame(frame);
	for (const occurrenceId of occurrenceIds) {
		const connection = taperedFrame.confidenceConnections[occurrenceId];
		if (!connection) {
			throw new Error(`Missing tapered confidence occurrence: ${occurrenceId}`);
		}
		connection.deliveryTargetScale = connection.deliveryScale * connection.score;
	}

	return taperedFrame;
}

function buildVoilaFrame(args: {
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	stagingFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.stagingFrame);

	for (const occurrenceId of args.newConfidenceOccurrenceIds) {
		const connection = frame.confidenceConnections[occurrenceId];
		if (!connection) {
			throw new Error(`Missing new confidence occurrence: ${occurrenceId}`);
		}
		connection.shellReveal = 0;
	}

	for (const occurrenceId of args.newRelevanceOccurrenceIds) {
		const connection = frame.relevanceConnections[occurrenceId];
		if (!connection) {
			throw new Error(`Missing new relevance occurrence: ${occurrenceId}`);
		}
		connection.shellReveal = 0;
	}

	return frame;
}

function buildSproutFrame(args: {
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	newRelevanceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	voilaFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.voilaFrame);

	for (const connection of Object.values(frame.confidenceConnections)) {
		if (args.newConfidenceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
			connection.shellReveal = 1;
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		if (args.newRelevanceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
			connection.shellReveal = 1;
		}
	}

	return frame;
}

function resolveFirstFillMath(args: {
	commandImpact: CommandImpact
	settledResolvedMath: ResolvedPresentationMath
	stagingResolvedMath: ResolvedPresentationMath
}): ResolvedPresentationMath {
	const claimScores = { ...args.stagingResolvedMath.claimScores };
	const connectorScores = { ...args.stagingResolvedMath.connectorScores };

	for (const occurrenceId of args.commandImpact.directAddedClaimOccurrenceIds) {
		claimScores[occurrenceId] = requireClaimScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}
	for (const occurrenceId of args.commandImpact.contactConfidenceOccurrenceIds) {
		connectorScores[occurrenceId] = requireConnectorScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}
	for (const occurrenceId of args.commandImpact.newRelevanceOccurrenceIds) {
		connectorScores[occurrenceId] = requireConnectorScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}

	return resolveSnapshotMath(args.settledResolvedMath, claimScores, connectorScores);
}

function resolveFirstWaveMath(args: {
	commandImpact: CommandImpact
	firstFillResolvedMath: ResolvedPresentationMath
	settledResolvedMath: ResolvedPresentationMath
}): ResolvedPresentationMath {
	const claimScores = { ...args.firstFillResolvedMath.claimScores };
	const connectorScores = { ...args.firstFillResolvedMath.connectorScores };
	const impact = resolveFirstWaveImpact(args.commandImpact, args.settledResolvedMath);

	for (const occurrenceId of impact.claimOccurrenceIds) {
		claimScores[occurrenceId] = requireClaimScore(args.settledResolvedMath, occurrenceId);
	}
	for (const occurrenceId of impact.connectorOccurrenceIds) {
		connectorScores[occurrenceId] = requireConnectorScore(
			args.settledResolvedMath,
			occurrenceId,
		);
	}

	return resolveSnapshotMath(args.settledResolvedMath, claimScores, connectorScores);
}

function resolveFirstWaveImpact(
	commandImpact: CommandImpact,
	settledResolvedMath: ResolvedPresentationMath,
): FirstWaveImpact {
	const claimOccurrenceIds = new Set<PresentationClaimOccurrenceId>();
	const connectorOccurrenceIds = new Set<PresentationConnectorOccurrenceId>();
	const presentationGraph = settledResolvedMath.presentationGraph;

	for (const occurrenceId of commandImpact.contactConfidenceOccurrenceIds) {
		const connection = presentationGraph.connectorOccurrences[occurrenceId];
		if (!connection || connection.type !== "confidence") {
			throw new Error(`Missing contact confidence occurrence: ${occurrenceId}`);
		}
		const targetClaim = presentationGraph.claimOccurrences[connection.targetClaimOccurrenceId];
		if (!targetClaim) {
			throw new Error(`Missing first-wave target claim: ${connection.targetClaimOccurrenceId}`);
		}

		claimOccurrenceIds.add(targetClaim.id);
		if (!targetClaim.incomingConnectorOccurrenceId) {
			continue;
		}
		connectorOccurrenceIds.add(targetClaim.incomingConnectorOccurrenceId);
		const outgoingConnection = presentationGraph.connectorOccurrences[
			targetClaim.incomingConnectorOccurrenceId
		];
		if (outgoingConnection?.type === "relevance") {
			connectorOccurrenceIds.add(
				outgoingConnection.targetConfidenceConnectorOccurrenceId,
			);
		}
	}

	return { claimOccurrenceIds, connectorOccurrenceIds };
}

function preserveRevealState(frame: DebateFrame, revealFrame: DebateFrame): DebateFrame {
	const preservedFrame = cloneFrame(frame);
	for (const connection of Object.values(preservedFrame.confidenceConnections)) {
		connection.shellReveal = revealFrame.confidenceConnections[connection.id]?.shellReveal
			?? connection.shellReveal;
	}
	for (const connection of Object.values(preservedFrame.relevanceConnections)) {
		connection.shellReveal = revealFrame.relevanceConnections[connection.id]?.shellReveal
			?? connection.shellReveal;
	}
	return preservedFrame;
}

function resolvePlacementMath(args: {
	openingResolvedMath: ResolvedPresentationMath
	settledResolvedMath: ResolvedPresentationMath
}): ResolvedPresentationMath {
	const claimScores: ResolvedPresentationMath["claimScores"] = {};
	for (const occurrence of Object.values(
		args.settledResolvedMath.presentationGraph.claimOccurrences,
	)) {
		claimScores[occurrence.id] = args.openingResolvedMath.claimScores[occurrence.id] ?? {
			claimId: occurrence.claimId,
			rawValue: 0,
			totalWeight: 0,
			value: 0,
			weightedSum: 0,
		};
	}

	const connectorScores: ResolvedPresentationMath["connectorScores"] = {};
	for (const occurrence of Object.values(
		args.settledResolvedMath.presentationGraph.connectorOccurrences,
	)) {
		connectorScores[occurrence.id] = args.openingResolvedMath.connectorScores[occurrence.id] ?? {
			deliveryScore: 0,
			relevanceMultiplier: 1,
			sourceScore: 0,
		};
	}

	return resolveSnapshotMath(args.settledResolvedMath, claimScores, connectorScores);
}

function resolveSnapshotMath(
	basis: ResolvedPresentationMath,
	claimScores: ResolvedPresentationMath["claimScores"],
	connectorScores: ResolvedPresentationMath["connectorScores"],
): ResolvedPresentationMath {
	return resolvePresentationMathSnapshot({
		basis,
		claimScores,
		connectorScores,
		rootSourcesScale: basis.sourcesScales[basis.presentationGraph.rootClaimOccurrenceId] ?? 1,
	});
}

function requireClaimScore(
	math: ResolvedPresentationMath,
	occurrenceId: PresentationClaimOccurrenceId,
) {
	const score = math.claimScores[occurrenceId];
	if (!score) {
		throw new Error(`Missing claim score for occurrence: ${occurrenceId}`);
	}
	return score;
}

function requireConnectorScore(
	math: ResolvedPresentationMath,
	occurrenceId: PresentationConnectorOccurrenceId,
) {
	const score = math.connectorScores[occurrenceId];
	if (!score) {
		throw new Error(`Missing connector score for occurrence: ${occurrenceId}`);
	}
	return score;
}

function assertScoreChangesLimitedTo(args: {
	allowedClaimOccurrenceIds: ReadonlySet<PresentationClaimOccurrenceId>
	allowedConnectorOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	from: ResolvedPresentationMath
	label: string
	to: ResolvedPresentationMath
}): void {
	for (const [occurrenceId, score] of Object.entries(args.to.claimScores)) {
		const typedOccurrenceId = occurrenceId as PresentationClaimOccurrenceId;
		if (
			!args.allowedClaimOccurrenceIds.has(typedOccurrenceId)
			&& !claimScoresEqual(score, args.from.claimScores[typedOccurrenceId])
		) {
			throw new Error(`${args.label} unexpectedly changes claim score: ${occurrenceId}`);
		}
	}
	for (const [occurrenceId, score] of Object.entries(args.to.connectorScores)) {
		const typedOccurrenceId = occurrenceId as PresentationConnectorOccurrenceId;
		if (
			!args.allowedConnectorOccurrenceIds.has(typedOccurrenceId)
			&& !connectorScoresEqual(score, args.from.connectorScores[typedOccurrenceId])
		) {
			throw new Error(`${args.label} unexpectedly changes connector score: ${occurrenceId}`);
		}
	}
}

function claimScoresEqual(
	left: ResolvedPresentationMath["claimScores"][PresentationClaimOccurrenceId],
	right: ResolvedPresentationMath["claimScores"][PresentationClaimOccurrenceId],
): boolean {
	return left?.claimId === right?.claimId
		&& left?.rawValue === right?.rawValue
		&& left?.totalWeight === right?.totalWeight
		&& left?.value === right?.value
		&& left?.weightedSum === right?.weightedSum;
}

function connectorScoresEqual(
	left: ResolvedPresentationMath["connectorScores"][PresentationConnectorOccurrenceId],
	right: ResolvedPresentationMath["connectorScores"][PresentationConnectorOccurrenceId],
): boolean {
	return left?.deliveryScore === right?.deliveryScore
		&& left?.relevanceMultiplier === right?.relevanceMultiplier
		&& left?.sourceScore === right?.sourceScore;
}

function buildAnimationStep<TId extends AnimationStepId>(
	id: TId,
	initialFrame: DebateFrame,
	targetFrame: DebateFrame,
	resolveTiming: (address: TrackAddress) => TrackTiming,
): DebateAnimationStep<TId> {
	const tracks: DebateAnimationStep["tracks"] = {
		claims: {},
		confidenceConnections: {},
		relevanceConnections: {},
	};

	for (const initial of Object.values(initialFrame.claims)) {
		const target = targetFrame.claims[initial.id];
		if (!target) {
			throw new Error(`Animation target is missing claim occurrence: ${initial.id}`);
		}

		tracks.claims[initial.id] = compactTracks({
			opacity: createTrack(initial.opacity, target.opacity, resolveTiming({ field: "opacity", id: initial.id, kind: "claim" })),
			positionX: createTrack(initial.position.x, target.position.x, resolveTiming({ field: "positionX", id: initial.id, kind: "claim" })),
			positionY: createTrack(initial.position.y, target.position.y, resolveTiming({ field: "positionY", id: initial.id, kind: "claim" })),
			rawScore: createTrack(initial.rawScore, target.rawScore, resolveTiming({ field: "rawScore", id: initial.id, kind: "claim" })),
			scale: createTrack(initial.scale, target.scale, resolveTiming({ field: "scale", id: initial.id, kind: "claim" })),
			score: createTrack(initial.score, target.score, resolveTiming({ field: "score", id: initial.id, kind: "claim" })),
			sourcesScale: createTrack(initial.sourcesScale, target.sourcesScale, resolveTiming({ field: "sourcesScale", id: initial.id, kind: "claim" })),
		});
	}

	for (const initial of Object.values(initialFrame.confidenceConnections)) {
		const target = targetFrame.confidenceConnections[initial.id];
		if (!target) {
			throw new Error(`Animation target is missing confidence occurrence: ${initial.id}`);
		}

		tracks.confidenceConnections[initial.id] = compactTracks({
			deliveryScore: createTrack(initial.deliveryScore, target.deliveryScore, resolveTiming({ field: "deliveryScore", id: initial.id, kind: "confidence" })),
			deliveryScale: createTrack(initial.deliveryScale, target.deliveryScale, resolveTiming({ field: "deliveryScale", id: initial.id, kind: "confidence" })),
			deliveryTargetScale: createTrack(initial.deliveryTargetScale, target.deliveryTargetScale, resolveTiming({ field: "deliveryTargetScale", id: initial.id, kind: "confidence" })),
			junctionSpan: createTrack(initial.junctionSpan, target.junctionSpan, resolveTiming({ field: "junctionSpan", id: initial.id, kind: "confidence" })),
			shellReveal: createTrack(initial.shellReveal, target.shellReveal, resolveTiming({ field: "shellReveal", id: initial.id, kind: "confidence" })),
			sourceScale: createTrack(initial.sourceScale, target.sourceScale, resolveTiming({ field: "sourceScale", id: initial.id, kind: "confidence" })),
			targetSideOffset: createTrack(initial.targetSideOffset, target.targetSideOffset, resolveTiming({ field: "targetSideOffset", id: initial.id, kind: "confidence" })),
			volumeChanges: createTrackList(initial.score, target.score, resolveTiming({ field: "score", id: initial.id, kind: "confidence" })),
		});
	}

	for (const initial of Object.values(initialFrame.relevanceConnections)) {
		const target = targetFrame.relevanceConnections[initial.id];
		if (!target) {
			throw new Error(`Animation target is missing relevance occurrence: ${initial.id}`);
		}

		tracks.relevanceConnections[initial.id] = compactTracks({
			scale: createTrack(initial.scale, target.scale, resolveTiming({ field: "scale", id: initial.id, kind: "relevance" })),
			shellReveal: createTrack(initial.shellReveal, target.shellReveal, resolveTiming({ field: "shellReveal", id: initial.id, kind: "relevance" })),
			targetSideOffset: createTrack(initial.targetSideOffset, target.targetSideOffset, resolveTiming({ field: "targetSideOffset", id: initial.id, kind: "relevance" })),
			volumeChanges: createTrackList(initial.score, target.score, resolveTiming({ field: "score", id: initial.id, kind: "relevance" })),
		});
	}

	return {
		id,
		initialFrame: cloneFrame(initialFrame),
		targetFrame: cloneFrame(targetFrame),
		tracks,
	} as DebateAnimationStep<TId>;
}

function createTrack(
	from: number,
	to: number,
	timing: TrackTiming,
): NumberTrack | undefined {
	return Math.abs(from - to) <= 1e-9 ? undefined : numberTrack(from, to, timing);
}

function createTrackList(
	from: number,
	to: number,
	timing: TrackTiming,
): NumberTrack[] | undefined {
	const track = createTrack(from, to, timing);
	return track ? [track] : undefined;
}

function compactTracks<T extends Record<string, NumberTrack | NumberTrack[] | undefined>>(
	tracks: T,
): { [TKey in keyof T]?: Exclude<T[TKey], undefined> } {
	return Object.fromEntries(
		Object.entries(tracks).filter(([, track]) => track !== undefined),
	) as { [TKey in keyof T]?: Exclude<T[TKey], undefined> };
}

function cloneFrame(frame: DebateFrame): DebateFrame {
	return {
		claims: mapRecord(frame.claims, (claim) => ({
			...claim,
			position: { ...claim.position },
		})),
		confidenceConnections: mapRecord(frame.confidenceConnections, (connection) => ({
			...connection,
			relevanceConnectorOccurrenceIds: [...connection.relevanceConnectorOccurrenceIds],
			volumeTransitions: [...connection.volumeTransitions],
		})),
		relevanceConnections: mapRecord(frame.relevanceConnections, (connection) => ({
			...connection,
			volumeTransitions: [...connection.volumeTransitions],
		})),
	};
}

function mapRecord<TKey extends string, TValue>(
	record: Record<TKey, TValue>,
	mapValue: (value: TValue) => TValue,
): Record<TKey, TValue> {
	return Object.fromEntries(
		Object.entries(record).map(([key, value]) => [key, mapValue(value as TValue)]),
	) as Record<TKey, TValue>;
}

function resolveSceneBounds(
	frames: DebateFrame[],
	claimWidth: number,
	claimHeight: number,
): DebateAnimationPlan["bounds"] {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const frame of frames) {
		for (const claim of Object.values(frame.claims)) {
			const halfWidth = (claimWidth * claim.scale) / 2;
			const halfHeight = (claimHeight * claim.scale) / 2;
			minX = Math.min(minX, claim.position.x - halfWidth);
			minY = Math.min(minY, claim.position.y - halfHeight);
			maxX = Math.max(maxX, claim.position.x + halfWidth);
			maxY = Math.max(maxY, claim.position.y + halfHeight);
		}
	}

	if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
		return { height: 1080, minX: 0, minY: 0, width: 1920 };
	}

	return {
		height: Math.max(1, (maxY - minY) + (SCENE_PADDING * 2)),
		minX: minX - SCENE_PADDING,
		minY: minY - SCENE_PADDING,
		width: Math.max(1, (maxX - minX) + (SCENE_PADDING * 2)),
	};
}
