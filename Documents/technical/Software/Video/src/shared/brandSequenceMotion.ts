type BrandSequenceState = {
  reasonX: number;
  trackerX: number;
  wordOpacity: number;
  taglineY: number;
  taglineOpacity: number;
};

// @ts-ignore Shared website motion module is plain JS so the static website can publish it directly.
import {
  BRAND_SEQUENCE_TAGLINE as sharedBrandSequenceTagline,
  TAGLINE_CENTER_OFFSET as sharedTaglineCenterOffset,
  getBrandSequenceState as getSharedBrandSequenceState,
} from "../../../website/site/modules/brand-sequence-motion.js";

export const BRAND_SEQUENCE_TAGLINE: string = sharedBrandSequenceTagline;
export const TAGLINE_CENTER_OFFSET: number = sharedTaglineCenterOffset;

export const getBrandSequenceState = (frame: number): BrandSequenceState => {
  return getSharedBrandSequenceState(frame) as BrandSequenceState;
};