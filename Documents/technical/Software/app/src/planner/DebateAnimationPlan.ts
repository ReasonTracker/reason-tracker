import type { ClaimId } from "../debate-core/Claim.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type {
	ConfidenceConnectorId,
	RelevanceConnectorId,
} from "../debate-core/Connector.ts";
import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "./buildPresentationGraphFromDebateCore.ts";
import type { PlannerOptions } from "./contracts.ts";
import { buildDebateFrame } from "./buildDebateFrame.ts";
import {
	calculatePresentationScales,
	type PresentationSide,
	type ResolvedPresentationMath,
} from "./resolvePresentationMath.ts";

export type AnimationStepId = "voila" | "sprout" | "firstFill" | "wave";
export type AnimationEasing = "linear" | "smooth";

export type Point = {
	x: number
	y: number
};

export type NumberTrack = {
	easing: AnimationEasing
	endProgress: number
	from: number
	startProgress: number
	to: number
};

export type ClaimFrameState = {
	claimId: ClaimId
	id: PresentationClaimOccurrenceId
	opacity: number
	position: Point
	scale: number
	score: number
	side: PresentationSide
	sourcesScale: number
};

export type ConnectorVolumeTransition = {
	finalValue: number
	initialValue: number
	progress: number
};

export type ConfidenceConnectionFrameState = {
	confidenceConnectorId: ConfidenceConnectorId
	deliveryScore: number
	deliveryScale: number
	id: PresentationConnectorOccurrenceId
	relevanceMultiplier: number
	relevanceConnectorOccurrenceIds: PresentationConnectorOccurrenceId[]
	score: number
	shellReveal: number
	side: PresentationSide
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	sourceScale: number
	targetClaimOccurrenceId: PresentationClaimOccurrenceId
	targetSideOffset: number
	volumeTransitions: ConnectorVolumeTransition[]
};

export type RelevanceConnectionFrameState = {
	id: PresentationConnectorOccurrenceId
	relevanceConnectorId: RelevanceConnectorId
	scale: number
	score: number
	shellReveal: number
	side: PresentationSide
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	targetConfidenceConnectorOccurrenceId: PresentationConnectorOccurrenceId
	targetSideOffset: number
	volumeTransitions: ConnectorVolumeTransition[]
};

export type DebateFrame = {
	claims: Record<PresentationClaimOccurrenceId, ClaimFrameState>
	confidenceConnections: Record<
		PresentationConnectorOccurrenceId,
		ConfidenceConnectionFrameState
	>
	relevanceConnections: Record<
		PresentationConnectorOccurrenceId,
		RelevanceConnectionFrameState
	>
};

type ClaimTracks = Partial<Record<
	PresentationClaimOccurrenceId,
	Partial<Record<"opacity" | "positionX" | "positionY" | "scale" | "score" | "sourcesScale", NumberTrack>>
>>;

type ConfidenceConnectionTracks = Partial<Record<
	PresentationConnectorOccurrenceId,
	Partial<Record<
		"deliveryScale" | "deliveryScore" | "shellReveal" | "sourceScale" | "targetSideOffset",
		NumberTrack
	>> & { volumeChanges?: NumberTrack[] }
>>;

type RelevanceConnectionTracks = Partial<Record<
	PresentationConnectorOccurrenceId,
	Partial<Record<"scale" | "shellReveal" | "targetSideOffset", NumberTrack>>
		& { volumeChanges?: NumberTrack[] }
>>;

export type DebateAnimationStep<TId extends AnimationStepId = AnimationStepId> = {
	id: TId
	initialFrame: DebateFrame
	tracks: {
		claims: ClaimTracks
		confidenceConnections: ConfidenceConnectionTracks
		relevanceConnections: RelevanceConnectionTracks
	}
	waveLayoutDependency?: {
		debateCore: DebateCore
		resolvedMath: ResolvedPresentationMath
	}
};

export type DebateAnimationPlan = {
	bounds: {
		height: number
		minX: number
		minY: number
		width: number
	}
	openingFrame: DebateFrame
	options: PlannerOptions
	steps: {
		firstFill: DebateAnimationStep<"firstFill">
		sprout: DebateAnimationStep<"sprout">
		voila: DebateAnimationStep<"voila">
		wave: DebateAnimationStep<"wave">
	}
};

export function resolveAnimationFrame(
	plan: DebateAnimationPlan,
	stepId: AnimationStepId,
	progress: number,
): DebateFrame {
	const step = plan.steps[stepId];

	const resolvedFrame: DebateFrame = {
		claims: mapRecord(step.initialFrame.claims, (item) => {
			const tracks = step.tracks.claims[item.id];
			return {
				...item,
				opacity: resolveNumberTrack(tracks?.opacity, progress, item.opacity),
				position: {
					x: resolveNumberTrack(tracks?.positionX, progress, item.position.x),
					y: resolveNumberTrack(tracks?.positionY, progress, item.position.y),
				},
				scale: resolveNumberTrack(tracks?.scale, progress, item.scale),
				score: resolveNumberTrack(tracks?.score, progress, item.score),
				sourcesScale: resolveNumberTrack(tracks?.sourcesScale, progress, item.sourcesScale),
			};
		}),
		confidenceConnections: mapRecord(
			step.initialFrame.confidenceConnections,
			(item) => {
				const tracks = step.tracks.confidenceConnections[item.id];
				return {
					...item,
					deliveryScore: resolveNumberTrack(
						tracks?.deliveryScore,
						progress,
						item.deliveryScore,
					),
					deliveryScale: resolveNumberTrack(
						tracks?.deliveryScale,
						progress,
						item.deliveryScale,
					),
					score: tracks?.volumeChanges?.at(-1)?.to ?? item.score,
					shellReveal: resolveNumberTrack(tracks?.shellReveal, progress, item.shellReveal),
					sourceScale: resolveNumberTrack(tracks?.sourceScale, progress, item.sourceScale),
					targetSideOffset: resolveNumberTrack(
						tracks?.targetSideOffset,
						progress,
						item.targetSideOffset,
					),
					volumeTransitions: resolveVolumeTransitions(tracks?.volumeChanges, progress),
				};
			},
		),
		relevanceConnections: mapRecord(
			step.initialFrame.relevanceConnections,
			(item) => {
				const tracks = step.tracks.relevanceConnections[item.id];
				return {
					...item,
					scale: resolveNumberTrack(tracks?.scale, progress, item.scale),
					score: tracks?.volumeChanges?.at(-1)?.to ?? item.score,
					shellReveal: resolveNumberTrack(tracks?.shellReveal, progress, item.shellReveal),
					targetSideOffset: resolveNumberTrack(
						tracks?.targetSideOffset,
						progress,
						item.targetSideOffset,
					),
					volumeTransitions: resolveVolumeTransitions(tracks?.volumeChanges, progress),
				};
			},
		),
	};

	return stepId === "wave" && step.waveLayoutDependency
		? resolveWaveLayout({
			dependency: step.waveLayoutDependency,
			frame: resolvedFrame,
			options: plan.options,
		})
		: resolvedFrame;
}

function resolveWaveLayout(args: {
	dependency: NonNullable<DebateAnimationStep["waveLayoutDependency"]>
	frame: DebateFrame
	options: PlannerOptions
}): DebateFrame {
	const claimScores = { ...args.dependency.resolvedMath.claimScores };
	for (const claim of Object.values(args.frame.claims)) {
		const score = args.dependency.resolvedMath.claimScores[claim.id];
		if (score) {
			claimScores[claim.id] = { ...score, value: claim.score };
		}
	}
	const connectorScores = { ...args.dependency.resolvedMath.connectorScores };
	for (const connection of Object.values(args.frame.confidenceConnections)) {
		const score = connectorScores[connection.id];
		if (score) {
			connectorScores[connection.id] = {
				...score,
				deliveryScore: connection.deliveryScore,
				relevanceMultiplier: connection.relevanceMultiplier,
			};
		}
	}
	const scales = calculatePresentationScales({
		connectorScores,
		presentationGraph: args.dependency.resolvedMath.presentationGraph,
		rootSourcesScale: args.dependency.resolvedMath.sourcesScales[
			args.dependency.resolvedMath.presentationGraph.rootClaimOccurrenceId
		] ?? 1,
	});
	const derivedFrame = buildDebateFrame({
		debateCore: args.dependency.debateCore,
		options: args.options,
		resolvedMath: {
			...args.dependency.resolvedMath,
			...scales,
			claimScores,
			connectorScores,
		},
	});

	for (const claim of Object.values(derivedFrame.claims)) {
		claim.opacity = args.frame.claims[claim.id]?.opacity ?? claim.opacity;
	}
	for (const connection of Object.values(derivedFrame.confidenceConnections)) {
		const visualState = args.frame.confidenceConnections[connection.id];
		if (visualState) {
			connection.score = visualState.score;
			connection.shellReveal = visualState.shellReveal;
			connection.volumeTransitions = visualState.volumeTransitions;
		}
	}
	for (const connection of Object.values(derivedFrame.relevanceConnections)) {
		const visualState = args.frame.relevanceConnections[connection.id];
		if (visualState) {
			connection.score = visualState.score;
			connection.shellReveal = visualState.shellReveal;
			connection.volumeTransitions = visualState.volumeTransitions;
		}
	}

	return derivedFrame;
}

export function numberTrack(
	from: number,
	to: number,
	options: Partial<Pick<NumberTrack, "easing" | "endProgress" | "startProgress">> = {},
): NumberTrack {
	return {
		easing: options.easing ?? "smooth",
		endProgress: options.endProgress ?? 1,
		from,
		startProgress: options.startProgress ?? 0,
		to,
	};
}

function resolveNumberTrack(
	track: NumberTrack | undefined,
	progress: number,
	fallback: number,
): number {
	if (!track) {
		return fallback;
	}
	const easedProgress = resolveNumberTrackProgress(track, progress);

	return track.from + ((track.to - track.from) * easedProgress);
}

function resolveVolumeTransitions(
	tracks: NumberTrack[] | undefined,
	progress: number,
): ConnectorVolumeTransition[] {
	if (!tracks) {
		return [];
	}

	return tracks.map((track) => ({
			finalValue: track.to,
			initialValue: track.from,
			progress: resolveNumberTrackProgress(track, progress),
		}));
}

function resolveNumberTrackProgress(track: NumberTrack, progress: number): number {

	const duration = track.endProgress - track.startProgress;
	const localProgress = duration <= 0
		? (progress >= track.endProgress ? 1 : 0)
		: clamp01((progress - track.startProgress) / duration);
	return track.easing === "smooth"
		? smoothStep(localProgress)
		: localProgress;
}

function mapRecord<TKey extends string, TValue>(
	record: Record<TKey, TValue>,
	mapValue: (value: TValue) => TValue,
): Record<TKey, TValue> {
	return Object.fromEntries(
		Object.entries(record).map(([key, value]) => [key, mapValue(value as TValue)]),
	) as Record<TKey, TValue>;
}

function smoothStep(value: number): number {
	return value * value * (3 - (2 * value));
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}