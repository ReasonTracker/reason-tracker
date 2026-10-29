export const BRAND_SEQUENCE_ENTRY_END: number;
export const BRAND_SEQUENCE_HOLD_END: number;
export const BRAND_SEQUENCE_END_FRAME: number;
export const BRAND_SEQUENCE_FPS: number;
export const BRAND_SEQUENCE_TAGLINE: string;
export const TAGLINE_CENTER_OFFSET: number;
export const BRAND_SEQUENCE_PLAYBACK_FULL: string;
export const BRAND_SEQUENCE_PLAYBACK_INTRO_ONLY: string;
export const BRAND_SEQUENCE_PLAYBACK_STATIC_HOLD: string;

export function getBrandSequenceState(frame: number): {
	reasonX: number;
	trackerX: number;
	wordOpacity: number;
	taglineY: number;
	taglineOpacity: number;
};

export function getBrandSequencePlaybackEndFrame(playbackMode?: string): number;
export function shouldAnimateBrandSequence(playbackMode?: string): boolean;
