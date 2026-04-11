export const BRAND_SEQUENCE_ENTRY_END = 30;
export const BRAND_SEQUENCE_HOLD_END = 120;
export const BRAND_SEQUENCE_END_FRAME = 150;
export const BRAND_SEQUENCE_FPS = 30;
export const BRAND_SEQUENCE_TAGLINE = "Videos about hard decisions";
export const TAGLINE_CENTER_OFFSET = 22;
export const BRAND_SEQUENCE_PLAYBACK_FULL = "full";
export const BRAND_SEQUENCE_PLAYBACK_INTRO_ONLY = "intro-only";
export const BRAND_SEQUENCE_PLAYBACK_STATIC_HOLD = "static-hold";

export function getBrandSequenceState(frame) {
  const safeFrame = Number.isFinite(frame) ? Math.max(0, frame) : 0;

  return {
    reasonX: interpolateBrandValue(safeFrame, -520, -42, -190),
    trackerX: interpolateBrandValue(safeFrame, 520, 42, 190),
    wordOpacity: interpolateBrandValue(safeFrame, 0, 1, 0),
    taglineY: interpolateBrandValue(safeFrame, 120, 0, 28),
    taglineOpacity: interpolateBrandValue(safeFrame, 0, 1, 0),
  };
}

export function getBrandSequencePlaybackEndFrame(playbackMode = BRAND_SEQUENCE_PLAYBACK_FULL) {
  switch (playbackMode) {
    case BRAND_SEQUENCE_PLAYBACK_INTRO_ONLY:
    case BRAND_SEQUENCE_PLAYBACK_STATIC_HOLD:
      return BRAND_SEQUENCE_HOLD_END;
    case BRAND_SEQUENCE_PLAYBACK_FULL:
    default:
      return BRAND_SEQUENCE_END_FRAME;
  }
}

export function shouldAnimateBrandSequence(playbackMode = BRAND_SEQUENCE_PLAYBACK_FULL) {
  return playbackMode !== BRAND_SEQUENCE_PLAYBACK_STATIC_HOLD;
}

function interpolateBrandValue(frame, startValue, centerValue, endValue) {
  if (frame <= 0) {
    return startValue;
  }

  if (frame < BRAND_SEQUENCE_ENTRY_END) {
    return lerp(startValue, centerValue, easeOutCubic(frame / BRAND_SEQUENCE_ENTRY_END));
  }

  if (frame < BRAND_SEQUENCE_HOLD_END) {
    return centerValue;
  }

  if (frame < BRAND_SEQUENCE_END_FRAME) {
    return lerp(centerValue, endValue, (frame - BRAND_SEQUENCE_HOLD_END) / (BRAND_SEQUENCE_END_FRAME - BRAND_SEQUENCE_HOLD_END));
  }

  return endValue;
}

function lerp(startValue, endValue, progress) {
  return startValue + (endValue - startValue) * clamp01(progress);
}

function easeOutCubic(progress) {
  const clamped = clamp01(progress);
  return 1 - Math.pow(1 - clamped, 3);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}