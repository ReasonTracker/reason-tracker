export type {
  BuildTimelineInput,
  BuildTimelineRequest,
  TimelineAddEvent,
  TimelineAnchor,
  TimelineEvent,
  TimelineObjectProps,
  TimelineRemoveEvent,
  TimelineUpdateEvent,
} from "./types/input.ts";

export type {
  BuildTimelineOutput,
  ResolvedTimeline,
  ResolvedTimelineObject,
  ResolvedTimelineObjectExistence,
  ResolvedTimelineObjectStateSegment,
} from "./types/output.ts";

export type BuildTimeline = (
  input: import("./types/input.ts").BuildTimelineInput,
) => import("./types/output.ts").BuildTimelineOutput;