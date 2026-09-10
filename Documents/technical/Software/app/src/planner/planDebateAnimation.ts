import type { AddConfidenceClaimCommand } from "../debate-core/Commands.ts";
import type { ClaimId } from "../debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "../debate-core/Connector.ts";
import { applyConfidenceClaimAddCommand } from "./applyDebateCommand.ts";
import { buildDebateFrame } from "./buildDebateFrame.ts";
import type { PresentationConnectorOccurrenceId } from "./buildPresentationGraphFromDebateCore.ts";
import {
	numberTrack,
	type AnimationStepId,
	type ClaimFrameState,
	type ConfidenceConnectionFrameState,
	type DebateAnimationPlan,
	type DebateAnimationStep,
	type DebateFrame,
	type NumberTrack,
	type RelevanceConnectionFrameState,
} from "./DebateAnimationPlan.ts";
import {
	resolvePlannerOptions,
	type PlannerInput,
} from "./contracts.ts";
import { resolvePresentationMath } from "./resolvePresentationMath.ts";

const SCENE_PADDING = 96;

type TrackAddress = {
	field: string
	id: string
	kind: "claim" | "confidence" | "relevance"
};

type TrackTiming = Partial<Pick<NumberTrack, "easing" | "endProgress" | "startProgress">>;

export function planStaticDebate(
	input: Omit<PlannerInput, "command">,
): DebateAnimationPlan {
	const options = resolvePlannerOptions(input.options);
	const frame = buildDebateFrame({
		debateCore: input.debateCore,
		options,
		resolvedMath: resolvePresentationMath(input.debateCore),
	});
	const firstFill = buildAnimationStep("firstFill", frame, frame, () => ({}));
	const sprout = buildAnimationStep("sprout", frame, frame, () => ({}));
	const voila = buildAnimationStep("voila", frame, frame, () => ({}));
	const wave = buildAnimationStep("wave", frame, frame, () => ({}));

	return {
		bounds: resolveSceneBounds([frame], options.claimWidth, options.claimHeight),
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
		commands: readonly AddConfidenceClaimCommand[]
	},
): DebateAnimationPlan {
	if (input.commands.length === 0) {
		throw new Error("Cannot plan an animation without commands.");
	}

	const options = resolvePlannerOptions(input.options);
	let settledDebateCore = input.debateCore;
	const appliedCommands = input.commands.map((command) => {
		const applied = applyConfidenceClaimAddCommand({
			command,
			debateCore: settledDebateCore,
		});
		settledDebateCore = applied.debateCore;
		return applied;
	});
	const openingFrame = buildDebateFrame({
		debateCore: input.debateCore,
		options,
		resolvedMath: resolvePresentationMath(input.debateCore),
	});
	const settledResolvedMath = resolvePresentationMath(settledDebateCore);
	const settledFrame = buildDebateFrame({
		debateCore: settledDebateCore,
		options,
		resolvedMath: settledResolvedMath,
	});
	const voilaLayoutFrame = buildDebateFrame({
		debateCore: settledDebateCore,
		options,
		resolvedMath: resolvePresentationMath(settledDebateCore),
		visualScales: Object.fromEntries(
			Object.values(settledFrame.claims).map((claim) => [
				claim.id,
				openingFrame.claims[claim.id]?.scale ?? claim.scale,
			]),
		),
	});
	const newConfidenceConnectorIds = new Set(
		appliedCommands.map((applied) => applied.confidenceConnectorId),
	);
	const newConfidenceOccurrenceIds = new Set(
		Object.values(settledFrame.confidenceConnections)
			.filter((connection) =>
				newConfidenceConnectorIds.has(connection.confidenceConnectorId)
			)
			.map((connection) => connection.id),
	);
	const voilaInitialFrame = augmentOpeningFrame({
		newConfidenceOccurrenceIds,
		openingFrame,
		voilaLayoutFrame,
	});
	const voilaFrame = buildVoilaFrame({
		newConfidenceOccurrenceIds,
		openingFrame,
		voilaLayoutFrame,
	});
	const sproutFrame = buildSproutFrame({
		newConfidenceOccurrenceIds,
		openingFrame,
		settledFrame,
	});
	const firstFillFrame = cloneFrame(sproutFrame);

	for (const occurrenceId of newConfidenceOccurrenceIds) {
		const connection = firstFillFrame.confidenceConnections[occurrenceId];
		const settledConnection = settledFrame.confidenceConnections[occurrenceId];
		if (connection && settledConnection) {
			connection.deliveryScore = settledConnection.deliveryScore;
			connection.score = settledConnection.score;
		}
	}
	const waveFrame = buildChangedScoreWaveFrame({
		firstFillFrame,
		settledFrame,
	});

	const voila = buildAnimationStep("voila", voilaInitialFrame, voilaFrame, () => ({
		easing: "smooth",
	}));
	const sprout = buildAnimationStep("sprout", voilaFrame, sproutFrame, (address) => {
		if (address.kind === "claim") {
			return { easing: "smooth", endProgress: 1, startProgress: 0.7 };
		}

		if (address.kind === "confidence" && newConfidenceOccurrenceIds.has(
			address.id as PresentationConnectorOccurrenceId,
		)) {
			return { easing: "smooth", endProgress: 0.5, startProgress: 0 };
		}

		if (
			(address.kind === "confidence" && address.field === "sourceScale")
			|| (address.kind === "relevance" && address.field === "scale")
		) {
			return { easing: "smooth", endProgress: 1, startProgress: 0.7 };
		}

		if (
			address.kind === "confidence"
			&& (address.field === "deliveryScale" || address.field === "targetSideOffset")
		) {
			return { easing: "smooth", endProgress: 0.5, startProgress: 0 };
		}

		return { easing: "smooth", endProgress: 0.7, startProgress: 0.5 };
	});
	const firstFill = buildAnimationStep(
		"firstFill",
		sproutFrame,
		firstFillFrame,
		() => ({ easing: "linear" }),
	);
	const wave = buildAnimationStep(
		"wave",
		firstFillFrame,
		waveFrame,
		() => ({ easing: "linear" }),
	);
	wave.waveLayoutDependency = {
		debateCore: settledDebateCore,
		resolvedMath: settledResolvedMath,
	};

	return {
		bounds: resolveSceneBounds([
			openingFrame,
			voilaInitialFrame,
			voilaFrame,
			sproutFrame,
			firstFillFrame,
			waveFrame,
		], options.claimWidth, options.claimHeight),
		openingFrame,
		options,
		steps: { firstFill, sprout, voila, wave },
	};
}

function buildChangedScoreWaveFrame(args: {
	firstFillFrame: DebateFrame
	settledFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.firstFillFrame);
	const changedClaimOccurrenceIds = new Set(
		Object.values(args.settledFrame.claims)
			.filter((settledClaim) => {
				const firstFillClaim = args.firstFillFrame.claims[settledClaim.id];
				return firstFillClaim !== undefined
					&& (
						firstFillClaim.rawScore !== settledClaim.rawScore
						|| firstFillClaim.score !== settledClaim.score
					);
			})
			.map((claim) => claim.id),
	);

	for (const occurrenceId of changedClaimOccurrenceIds) {
		const claim = frame.claims[occurrenceId];
		const settledClaim = args.settledFrame.claims[occurrenceId];
		if (claim && settledClaim) {
			claim.rawScore = settledClaim.rawScore;
			claim.score = settledClaim.score;
		}
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const settledConnection = args.settledFrame.confidenceConnections[connection.id];
		if (settledConnection) {
			connection.deliveryScore = settledConnection.deliveryScore;
			if (!changedClaimOccurrenceIds.has(connection.sourceClaimOccurrenceId)) {
				continue;
			}
			connection.score = settledConnection.score;
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		if (!changedClaimOccurrenceIds.has(connection.sourceClaimOccurrenceId)) {
			continue;
		}

		const settledConnection = args.settledFrame.relevanceConnections[connection.id];
		if (settledConnection) {
			connection.score = settledConnection.score;
		}
	}

	return frame;
}

function augmentOpeningFrame(args: {
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	openingFrame: DebateFrame
	voilaLayoutFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.voilaLayoutFrame);

	for (const claim of Object.values(frame.claims)) {
		const openingClaim = args.openingFrame.claims[claim.id];
		if (openingClaim) {
			frame.claims[claim.id] = { ...openingClaim, position: { ...openingClaim.position } };
		} else {
			claim.opacity = 0;
			claim.scale = 0;
		}
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const openingConnection = args.openingFrame.confidenceConnections[connection.id];
		if (openingConnection) {
			frame.confidenceConnections[connection.id] = { ...openingConnection };
		} else {
			connection.score = 0;
			connection.shellReveal = 0;
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		const openingConnection = args.openingFrame.relevanceConnections[connection.id];
		if (openingConnection) {
			frame.relevanceConnections[connection.id] = { ...openingConnection };
		} else {
			connection.scale = 0;
			connection.score = 0;
			connection.shellReveal = 0;
		}
	}

	return frame;
}

function buildVoilaFrame(args: {
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	openingFrame: DebateFrame
	voilaLayoutFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.voilaLayoutFrame);

	for (const claim of Object.values(frame.claims)) {
		const openingClaim = args.openingFrame.claims[claim.id];
		if (!openingClaim) {
			continue;
		}

		claim.rawScore = openingClaim.rawScore;
		claim.score = openingClaim.score;
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const openingConnection = args.openingFrame.confidenceConnections[connection.id];
		if (openingConnection) {
			connection.deliveryScore = openingConnection.deliveryScore;
			connection.deliveryScale = openingConnection.deliveryScale;
			connection.score = openingConnection.score;
			connection.sourceScale = openingConnection.sourceScale;
			connection.targetSideOffset = openingConnection.targetSideOffset;
			continue;
		}

		if (args.newConfidenceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
			connection.shellReveal = 0;
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		const openingConnection = args.openingFrame.relevanceConnections[connection.id];
		if (openingConnection) {
			frame.relevanceConnections[connection.id] = { ...openingConnection };
		}
	}

	return frame;
}

function buildSproutFrame(args: {
	newConfidenceOccurrenceIds: ReadonlySet<PresentationConnectorOccurrenceId>
	openingFrame: DebateFrame
	settledFrame: DebateFrame
}): DebateFrame {
	const frame = cloneFrame(args.settledFrame);

	for (const claim of Object.values(frame.claims)) {
		const openingClaim = args.openingFrame.claims[claim.id];
		if (openingClaim) {
			claim.rawScore = openingClaim.rawScore;
			claim.score = openingClaim.score;
		}
	}

	for (const connection of Object.values(frame.confidenceConnections)) {
		const openingConnection = args.openingFrame.confidenceConnections[connection.id];
		if (openingConnection) {
			connection.deliveryScore = openingConnection.deliveryScore;
			connection.score = openingConnection.score;
		}

		if (args.newConfidenceOccurrenceIds.has(connection.id)) {
			connection.score = 0;
		}
	}

	for (const connection of Object.values(frame.relevanceConnections)) {
		const openingConnection = args.openingFrame.relevanceConnections[connection.id];
		if (openingConnection) {
			connection.score = openingConnection.score;
		}
	}

	return frame;
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

	return { id, initialFrame: cloneFrame(initialFrame), tracks } as DebateAnimationStep<TId>;
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
