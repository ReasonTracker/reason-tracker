import type {
  BuildPropagationAnimationRequest,
  BuildPropagationAnimationResult,
  Debate,
  PropagationAnimationDirective,
} from "@reasontracker/contracts";
import { buildPropagationAnimation } from "@reasontracker/engine";

export type PropagationWindow = {
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
};

export type BuildEpisodePropagationRequest = {
  debate: Debate;
  directives: PropagationAnimationDirective[];
  fps: number;
  cycleHandling?: BuildPropagationAnimationRequest["cycleHandling"];
};

export type EpisodePropagationPlan = {
  animationResult: BuildPropagationAnimationResult;
  window: PropagationWindow;
  cameraFrameOffset: number;
};

export function getPropagationWindow(
  directives: readonly PropagationAnimationDirective[],
  fps: number,
): PropagationWindow {
  if (directives.length < 1) {
    return {
      startFrame: 0,
      endFrame: 0,
      durationInFrames: 0,
    };
  }

  const safeFps = Math.max(1, Number.isFinite(fps) ? fps : 1);
  let startFrame = Number.POSITIVE_INFINITY;
  let endFrame = 0;

  for (const directive of directives) {
    const directiveStart = Math.max(0, Math.round(directive.startAtSeconds * safeFps));
    const directiveDuration = Math.max(1, Math.round(directive.durationSeconds * safeFps));
    startFrame = Math.min(startFrame, directiveStart);
    endFrame = Math.max(endFrame, directiveStart + directiveDuration);
  }

  return {
    startFrame: Number.isFinite(startFrame) ? startFrame : 0,
    endFrame,
    durationInFrames: Math.max(0, endFrame - (Number.isFinite(startFrame) ? startFrame : 0)),
  };
}

export function buildEpisodePropagationPlan(
  request: BuildEpisodePropagationRequest,
): EpisodePropagationPlan {
  const window = getPropagationWindow(request.directives, request.fps);
  const animationResult = buildPropagationAnimation({
    debate: request.debate,
    directives: request.directives,
    fps: request.fps,
    cycleHandling: request.cycleHandling,
  });

  return {
    animationResult,
    window,
    cameraFrameOffset: window.endFrame,
  };
}
