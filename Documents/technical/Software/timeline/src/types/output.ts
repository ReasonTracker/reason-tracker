import type { TimelineObjectProps } from "./input.ts";

export type ResolvedTimelineObjectExistence = {
  startSeconds: number;
  endSeconds: number | null;
  durationSeconds: number | null;
};

export type ResolvedTimelineObjectStateSegment = {
  startSeconds: number;
  endSeconds: number | null;
  durationSeconds: number | null;
  props: TimelineObjectProps;
};

export type ResolvedTimelineObject = {
  objectId: string;
  objectType: string;
  existence: ResolvedTimelineObjectExistence;
  stateSegments: readonly ResolvedTimelineObjectStateSegment[];
};

export type ResolvedTimeline = {
  objects: readonly ResolvedTimelineObject[];
};

export type BuildTimelineOutput = ResolvedTimeline;