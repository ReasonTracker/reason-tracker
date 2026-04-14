// See 📌README.md in this folder for local coding standards before editing this file.

import { Easing, interpolate } from "remotion";

const DEFAULT_PAN_DURATION_RATIO = 0.5;
const PAN_EASING = Easing.bezier(0.42, 0, 0.2, 1);
const ZOOM_EASING = Easing.bezier(0.42, 0, 0.2, 1);

export type ZoomMotionOptions = {
	frame: number;
	startFrame: number;
	durationInFrames: number;
	startScale: number;
	endScale: number;
	startTranslateX: number;
	endTranslateX: number;
	startTranslateY: number;
	endTranslateY: number;
};

export type ZoomMotionState = {
	scale: number;
	translateX: number;
	translateY: number;
};

export function getZoomMotionState({
	frame,
	startFrame,
	durationInFrames,
	startScale,
	endScale,
	startTranslateX,
	endTranslateX,
	startTranslateY,
	endTranslateY,
}: ZoomMotionOptions): ZoomMotionState {
	const panDurationInFrames = Math.max(1, Math.round(durationInFrames * DEFAULT_PAN_DURATION_RATIO));

	const panProgress = interpolate(frame, [startFrame, startFrame + panDurationInFrames], [0, 1], {
		easing: PAN_EASING,
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	const zoomProgress = interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
		easing: ZOOM_EASING,
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	const scale = interpolate(zoomProgress, [0, 1], [startScale, endScale]);
	const startOffsetX = startTranslateX / Math.max(startScale, Number.EPSILON);
	const endOffsetX = endTranslateX / Math.max(endScale, Number.EPSILON);
	const startOffsetY = startTranslateY / Math.max(startScale, Number.EPSILON);
	const endOffsetY = endTranslateY / Math.max(endScale, Number.EPSILON);
	const offsetX = interpolate(panProgress, [0, 1], [startOffsetX, endOffsetX]);
	const offsetY = interpolate(panProgress, [0, 1], [startOffsetY, endOffsetY]);
	const translateX = offsetX * scale;
	const translateY = offsetY * scale;

	return {
		scale,
		translateX,
		translateY,
	};
}