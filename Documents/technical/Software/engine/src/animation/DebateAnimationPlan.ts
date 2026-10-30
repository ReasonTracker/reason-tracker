import type {
	ClaimFrameState,
	ConfidenceConnectionFrameState,
	ConnectorVolumeTransition,
	DebateFrame,
	PlannerOptions,
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
	PresentationSide,
	RelevanceConnectionFrameState,
} from "../animationContracts.ts";
import type { Point } from "../geometry/Point.ts";

export type {
	ClaimFrameState,
	ConfidenceConnectionFrameState,
	DebateFrame,
	ConnectorVolumeTransition,
	RelevanceConnectionFrameState,
} from "../animationContracts.ts";

export type AnimationStepId = "voila" | "sprout" | "firstFill" | "wave" | "reorient";
export type AnimationEasing = "linear" | "smooth";

export type NumberTrack = {
	easing: AnimationEasing
	endProgress: number
	from: number
	startProgress: number
	to: number
};

type ClaimTracks = Partial<Record<
	PresentationClaimOccurrenceId,
	Partial<Record<"opacity" | "originalValue" | "positionX" | "positionY" | "scale" | "sourcesScale" | "value", NumberTrack>>
>>;

type ConfidenceConnectionTracks = Partial<Record<
	PresentationConnectorOccurrenceId,
	Partial<Record<
		"deliveryScale" | "deliveryScore" | "deliveryTargetScale" | "shellReveal" | "sourceScale" | "targetSideOffset",
		NumberTrack
	>> & { aggregatorVolumeChanges?: NumberTrack[], volumeChanges?: NumberTrack[] }
>>;

type RelevanceConnectionTracks = Partial<Record<
	PresentationConnectorOccurrenceId,
	Partial<Record<"scale" | "shellReveal" | "targetSideOffset", NumberTrack>>
	& { volumeChanges?: NumberTrack[] }
>>;

export type DebateAnimationStep<TId extends AnimationStepId = AnimationStepId> = {
	id: TId
	initialFrame: DebateFrame
	targetFrame: DebateFrame
	tracks: {
		claims: ClaimTracks
		confidenceConnections: ConfidenceConnectionTracks
		relevanceConnections: RelevanceConnectionTracks
	}
};

export type DebateAnimationPlan = {
	bounds: {
		height: number
		minX: number
		minY: number
		width: number
	}
	origin?: Point
	openingFrame: DebateFrame
	options: PlannerOptions
	steps: {
		firstFill: DebateAnimationStep<"firstFill">
		reorient: DebateAnimationStep<"reorient">
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
	if (progress <= 0) {
		return cloneFrame(step.initialFrame);
	}
	if (progress >= 1) {
		return cloneFrame(step.targetFrame);
	}

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
				originalValue: resolveNumberTrack(
					tracks?.originalValue,
					progress,
					item.originalValue,
				),
				scale: resolveNumberTrack(tracks?.scale, progress, item.scale),
				sourcesScale: resolveNumberTrack(tracks?.sourcesScale, progress, item.sourcesScale),
				value: resolveNumberTrack(tracks?.value, progress, item.value),
			};
		}),
		confidenceConnections: mapRecord(
			step.initialFrame.confidenceConnections,
			(item) => {
				const tracks = step.tracks.confidenceConnections[item.id];
				return {
					...item,
					aggregatorScore: tracks?.aggregatorVolumeChanges?.at(-1)?.to ?? item.aggregatorScore,
					aggregatorVolumeTransitions: resolveVolumeTransitions(
						tracks?.aggregatorVolumeChanges,
						progress,
					),
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
					deliveryTargetScale: resolveNumberTrack(
						tracks?.deliveryTargetScale,
						progress,
						item.deliveryTargetScale,
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

	return resolvedFrame;
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

function cloneFrame(frame: DebateFrame): DebateFrame {
	return {
		claims: mapRecord(frame.claims, (claim) => ({
			...claim,
			position: { ...claim.position },
		})),
		confidenceConnections: mapRecord(frame.confidenceConnections, (connection) => ({
			...connection,
			aggregatorVolumeTransitions: [...connection.aggregatorVolumeTransitions],
			relevanceConnectorOccurrenceIds: [...connection.relevanceConnectorOccurrenceIds],
			volumeTransitions: [...connection.volumeTransitions],
		})),
		relevanceConnections: mapRecord(frame.relevanceConnections, (connection) => ({
			...connection,
			volumeTransitions: [...connection.volumeTransitions],
		})),
	};
}