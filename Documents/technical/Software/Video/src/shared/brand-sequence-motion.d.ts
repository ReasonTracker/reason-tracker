declare module "../../../website/site/modules/brand-sequence-motion.js" {
  export const BRAND_SEQUENCE_END_FRAME: number;
  export const BRAND_SEQUENCE_TAGLINE: string;
  export const TAGLINE_CENTER_OFFSET: number;
  export function getBrandSequenceState(frame: number): {
    reasonX: number;
    trackerX: number;
    wordOpacity: number;
    taglineY: number;
    taglineOpacity: number;
  };
}