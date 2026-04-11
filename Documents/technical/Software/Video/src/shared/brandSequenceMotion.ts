type BrandSequenceState = {
  reasonX: number;
  trackerX: number;
  wordOpacity: number;
  taglineY: number;
  taglineOpacity: number;
};

// @ts-ignore Shared website motion module is plain JS so the static website can publish it directly.
import * as sharedBrandSequenceMotion from "../../../website/site/modules/brand-sequence-motion.js";

export const BRAND_SEQUENCE_TAGLINE: string = sharedBrandSequenceMotion.BRAND_SEQUENCE_TAGLINE;
export const TAGLINE_CENTER_OFFSET: number = sharedBrandSequenceMotion.TAGLINE_CENTER_OFFSET;

export const getBrandSequenceState = (frame: number): BrandSequenceState => {
  return sharedBrandSequenceMotion.getBrandSequenceState(frame) as BrandSequenceState;
};