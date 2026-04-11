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
  targetOffsetX: number;
  targetOffsetY: number;
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
  targetOffsetX,
  targetOffsetY,
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
  const translateX = interpolate(panProgress, [0, 1], [0, targetOffsetX * scale]);
  const translateY = interpolate(panProgress, [0, 1], [0, targetOffsetY * scale]);

  return {
    scale,
    translateX,
    translateY,
  };
}