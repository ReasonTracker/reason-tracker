import { Easing, interpolate } from "remotion";

import {
    resolveSceneTargets,
    type CompiledEpisodeScript,
    type SceneTarget,
    type ScheduledEpisodeAction,
} from "./compileEpisodeScript";
import type { EpisodeAction } from "./episodeScriptSpec";

// AGENT NOTE: Keep camera framing and motion tuning values together.
/** Adds breathing room around the complete selected scene rectangle. */
const CAMERA_PADDING_RATIO = 0.01;
/** Preserves visible padding when framing very small scene targets. */
const MINIMUM_CAMERA_PADDING = 1;
const CAMERA_EASING = Easing.bezier(0.42, 0, 0.2, 1);

type CameraAction = Extract<EpisodeAction, { type: `camera.${string}` }>;
type ScheduledCameraAction = ScheduledEpisodeAction & { action: CameraAction };

type CameraTransition = {
    bounds: CameraBounds
    durationInFrames: number
    from: number
    type: CameraAction["type"]
};

export type CameraBounds = SceneTarget["bounds"];

export type SceneCameraScript = {
    resolveBounds: (frame: number) => CameraBounds
};

export type CanvasCameraTransform = {
    scale: number
    translateX: number
    translateY: number
};

export function resolveCanvasCameraTransform(
    bounds: CameraBounds,
    composition: CompiledEpisodeScript["composition"],
): CanvasCameraTransform {
    const scale = composition.width / bounds.width;
    return {
        scale,
        translateX: -bounds.minX * scale,
        translateY: -bounds.minY * scale,
    };
}

export function compileSceneCamera(episode: CompiledEpisodeScript): SceneCameraScript | undefined {
    const cameraActions = episode.actions
        .filter(isScheduledCameraAction)
        .sort((left, right) => left.from - right.from || left.index - right.index);
    if (cameraActions.length === 0) {
        return undefined;
    }

    let previousEnd = 0;
    const transitions = cameraActions.map((scheduled): CameraTransition => {
        if (scheduled.from < previousEnd) {
            throw new Error(
                `Camera action ${scheduled.index} starts at frame ${scheduled.from} before the previous camera action ends at frame ${previousEnd}.`,
            );
        }
        previousEnd = scheduled.endFrame;
        return {
            bounds: resolveTargetBounds(episode, scheduled),
            durationInFrames: scheduled.durationInFrames,
            from: scheduled.from,
            type: scheduled.action.type,
        };
    });
    const initialBounds = fallbackBounds(episode);

    return {
        resolveBounds(frame) {
            let currentBounds = initialBounds;
            for (const transition of transitions) {
                if (frame < transition.from) {
                    return currentBounds;
                }
                if (transition.type === "camera.cut" || transition.durationInFrames <= 1) {
                    currentBounds = transition.bounds;
                    continue;
                }
                const endFrame = transition.from + transition.durationInFrames;
                if (frame < endFrame) {
                    return interpolateBounds(
                        currentBounds,
                        transition.bounds,
                        resolveProgress(frame, transition.from, transition.durationInFrames),
                    );
                }
                currentBounds = transition.bounds;
            }
            return currentBounds;
        },
    };
}

function resolveTargetBounds(
    episode: CompiledEpisodeScript,
    scheduled: ScheduledCameraAction,
): CameraBounds {
    if ("layout" in scheduled.action.target) {
        return {
            height: scheduled.action.target.layout.height,
            minX: scheduled.action.target.layout.x,
            minY: scheduled.action.target.layout.y,
            width: scheduled.action.target.layout.width,
        };
    }
    const targetFrame = scheduled.from + signedSecondsToFrames(
        scheduled.action.target.offsetSeconds,
        episode.composition.fps,
    );
    const targets = resolveSceneTargets(episode, targetFrame);
    const targetsById = new Map<string, SceneTarget>();
    for (const target of targets) {
        if (targetsById.has(target.id)) {
            throw new Error(`Scene target ID is not unique at frame ${targetFrame}: ${target.id}`);
        }
        targetsById.set(target.id, target);
    }
    const selectedTargets = scheduled.action.target.objects.map((id) => {
        const target = targetsById.get(id);
        if (!target) {
            throw new Error(`Camera action ${scheduled.index} references missing scene target at frame ${targetFrame}: ${id}`);
        }
        if (target.anchor === "camera") {
            throw new Error(`Camera action ${scheduled.index} cannot target camera-anchored scene target: ${id}`);
        }
        return target;
    });
    const fittedBounds = fitBoundsToAspectRatio(
        addCameraPadding(combineBounds(selectedTargets.map((target) => target.bounds))),
        compositionAspectRatio(episode),
    );
    return applyTargetAdjustments(fittedBounds, scheduled.action.target);
}

function applyTargetAdjustments(
    bounds: CameraBounds,
    target: { "x%"?: number; "y%"?: number; "zoom%"?: number },
): CameraBounds {
    const zoom = (target["zoom%"] ?? 100) / 100;
    const width = bounds.width / zoom;
    const height = bounds.height / zoom;
    return {
        height,
        minX: bounds.minX + ((bounds.width - width) / 2) + (width * (target["x%"] ?? 0) / 100),
        minY: bounds.minY + ((bounds.height - height) / 2) + (height * (target["y%"] ?? 0) / 100),
        width,
    };
}

function addCameraPadding(bounds: CameraBounds): CameraBounds {
    const padding = Math.max(
        MINIMUM_CAMERA_PADDING,
        Math.max(bounds.width, bounds.height) * CAMERA_PADDING_RATIO,
    );
    return {
        height: bounds.height + (padding * 2),
        minX: bounds.minX - padding,
        minY: bounds.minY - padding,
        width: bounds.width + (padding * 2),
    };
}

function combineBounds(bounds: readonly CameraBounds[]): CameraBounds {
    if (bounds.length === 0) {
        throw new Error("Cannot combine an empty camera target.");
    }
    const minX = Math.min(...bounds.map((item) => item.minX));
    const minY = Math.min(...bounds.map((item) => item.minY));
    const maxX = Math.max(...bounds.map((item) => item.minX + item.width));
    const maxY = Math.max(...bounds.map((item) => item.minY + item.height));
    return {
        height: maxY - minY,
        minX,
        minY,
        width: maxX - minX,
    };
}

function fitBoundsToAspectRatio(bounds: CameraBounds, aspectRatio: number): CameraBounds {
    const centerX = bounds.minX + (bounds.width / 2);
    const centerY = bounds.minY + (bounds.height / 2);
    const currentAspectRatio = bounds.width / bounds.height;
    const width = currentAspectRatio < aspectRatio
        ? bounds.height * aspectRatio
        : bounds.width;
    const height = currentAspectRatio > aspectRatio
        ? bounds.width / aspectRatio
        : bounds.height;
    return {
        height,
        minX: centerX - (width / 2),
        minY: centerY - (height / 2),
        width,
    };
}

function fallbackBounds(episode: CompiledEpisodeScript): CameraBounds {
    return {
        height: episode.composition.height,
        minX: 0,
        minY: 0,
        width: episode.composition.width,
    };
}

function compositionAspectRatio(episode: CompiledEpisodeScript): number {
    return episode.composition.width / episode.composition.height;
}

function signedSecondsToFrames(seconds: number, fps: number): number {
    return Math.sign(seconds) * Math.round(Math.abs(seconds) * fps);
}

function interpolateBounds(from: CameraBounds, to: CameraBounds, progress: number): CameraBounds {
    const easedProgress = CAMERA_EASING(Math.min(1, Math.max(0, progress)));
    return {
        height: interpolate(easedProgress, [0, 1], [from.height, to.height]),
        minX: interpolate(easedProgress, [0, 1], [from.minX, to.minX]),
        minY: interpolate(easedProgress, [0, 1], [from.minY, to.minY]),
        width: interpolate(easedProgress, [0, 1], [from.width, to.width]),
    };
}

function resolveProgress(frame: number, from: number, durationInFrames: number): number {
    return durationInFrames <= 1
        ? 1
        : Math.min(1, Math.max(0, (frame - from) / (durationInFrames - 1)));
}

function isScheduledCameraAction(
    action: ScheduledEpisodeAction,
): action is ScheduledCameraAction {
    return action.action.type.startsWith("camera.");
}
