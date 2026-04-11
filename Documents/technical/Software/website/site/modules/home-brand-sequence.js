import {
  BRAND_SEQUENCE_FPS,
  BRAND_SEQUENCE_PLAYBACK_INTRO_ONLY,
  BRAND_SEQUENCE_TAGLINE,
  TAGLINE_CENTER_OFFSET,
  getBrandSequencePlaybackEndFrame,
  getBrandSequenceState,
  shouldAnimateBrandSequence,
} from "/modules/brand-sequence-motion.js";

export function mountHomeBrandSequence(container, options = {}) {
  if (!(container instanceof Element)) {
    return () => {};
  }

  const playbackMode = options.playbackMode ?? BRAND_SEQUENCE_PLAYBACK_INTRO_ONLY;
  const finalFrame = getBrandSequencePlaybackEndFrame(playbackMode);

  const elements = createBrandSequenceElements();
  container.replaceChildren(elements.root);
  renderBrandSequenceFrame(elements, 0);

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    renderBrandSequenceFrame(elements, finalFrame);
    return () => {};
  }

  if (!shouldAnimateBrandSequence(playbackMode)) {
    renderBrandSequenceFrame(elements, finalFrame);
    return () => {};
  }

  let animationFrameId = 0;
  let startTime = null;

  const tick = (timestamp) => {
    if (startTime === null) {
      startTime = timestamp;
    }

    const elapsedMs = timestamp - startTime;
    const frame = Math.min(finalFrame, Math.round((elapsedMs / 1000) * BRAND_SEQUENCE_FPS));
    renderBrandSequenceFrame(elements, frame);

    if (frame < finalFrame) {
      animationFrameId = window.requestAnimationFrame(tick);
    }
  };

  animationFrameId = window.requestAnimationFrame(tick);

  return () => {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
    }
  };
}

function createBrandSequenceElements() {
  const root = document.createElement("div");
  root.className = "rt-brand-sequence";
  root.setAttribute("aria-label", "Reason Tracker brand sequence");

  const lockup = document.createElement("div");
  lockup.className = "rt-brand-sequence__lockup";

  const reason = document.createElement("span");
  reason.className = "rt-brand-sequence__reason";
  reason.textContent = "Reason";

  const tracker = document.createElement("span");
  tracker.className = "rt-brand-sequence__tracker";
  tracker.textContent = "Tracker";

  const tagline = document.createElement("span");
  tagline.className = "rt-brand-sequence__tagline";
  tagline.textContent = BRAND_SEQUENCE_TAGLINE;

  lockup.append(reason, tracker);
  root.append(lockup, tagline);

  return { root, reason, tracker, tagline };
}

function renderBrandSequenceFrame(elements, frame) {
  const state = getBrandSequenceState(frame);

  elements.reason.style.opacity = String(state.wordOpacity);
  elements.reason.style.transform = `translateX(${state.reasonX}px)`;

  elements.tracker.style.opacity = String(state.wordOpacity);
  elements.tracker.style.transform = `translateX(${state.trackerX}px)`;

  elements.tagline.style.opacity = String(state.taglineOpacity);
  elements.tagline.style.transform = `translate(${TAGLINE_CENTER_OFFSET}px, ${state.taglineY}px)`;
}