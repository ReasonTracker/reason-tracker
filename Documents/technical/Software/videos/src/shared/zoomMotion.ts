import { Easing, interpolate } from "remotion";

// AGENT NOTE: Keep camera motion tuning constants grouped here.
/** Easing used by camera moves so pan and zoom settle together without a hard stop. */
const CAMERA_MOTION_EASING = Easing.bezier(0.42, 0, 0.2, 1);

export type ZoomMotionOptions = {
    frame: number;
    startFrame: number;
    durationInFrames: number;
    startScale: number;
    endScale: number;
    targetX: number;
    targetY: number;
    startScreenX: number;
    endScreenX: number;
    startScreenY: number;
    endScreenY: number;
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
    targetX,
    targetY,
    startScreenX,
    endScreenX,
    startScreenY,
    endScreenY,
}: ZoomMotionOptions): ZoomMotionState {
    const motionProgress = interpolate(frame, [startFrame, startFrame + durationInFrames], [0, 1], {
        easing: CAMERA_MOTION_EASING,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const scale = interpolate(motionProgress, [0, 1], [startScale, endScale]);
    const screenX = interpolate(motionProgress, [0, 1], [startScreenX, endScreenX]);
    const screenY = interpolate(motionProgress, [0, 1], [startScreenY, endScreenY]);
    const translateX = screenX - targetX * scale;
    const translateY = screenY - targetY * scale;

    return {
        scale,
        translateX,
        translateY,
    };
}
