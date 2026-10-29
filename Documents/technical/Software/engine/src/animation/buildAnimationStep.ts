import {
	numberTrack,
	type AnimationStepId,
	type DebateAnimationPlan,
	type DebateAnimationStep,
	type DebateFrame,
	type NumberTrack,
} from "./DebateAnimationPlan.ts";
import { cloneFrame } from "./animationFrameTransitions.ts";

const SCENE_PADDING = 96;

export type TrackAddress = {
	field: string
	id: string
	kind: "claim" | "confidence" | "relevance"
};

type TrackTiming = Partial<Pick<NumberTrack, "easing" | "endProgress" | "startProgress">>;

export function buildAnimationStep<TId extends AnimationStepId>(
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
			originalValue: createTrack(initial.originalValue, target.originalValue, resolveTiming({ field: "originalValue", id: initial.id, kind: "claim" })),
			scale: createTrack(initial.scale, target.scale, resolveTiming({ field: "scale", id: initial.id, kind: "claim" })),
			sourcesScale: createTrack(initial.sourcesScale, target.sourcesScale, resolveTiming({ field: "sourcesScale", id: initial.id, kind: "claim" })),
			value: createTrack(initial.value, target.value, resolveTiming({ field: "value", id: initial.id, kind: "claim" })),
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

export function resolveSceneBounds(
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
