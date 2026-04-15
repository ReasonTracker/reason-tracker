export type TimelineObjectProps = Record<string, unknown>;

export type TimelineAnchor =
  | {
      type: "timeline-start";
      offsetSeconds: number;
    }
  | {
      type: "event";
      eventId: string;
      offsetSeconds: number;
    };

export type TimelineAddEvent = {
  kind: "add";
  eventId: string;
  at: TimelineAnchor;
  objectId: string;
  objectType: string;
  props: TimelineObjectProps;
};

export type TimelineUpdateEvent = {
  kind: "update";
  eventId: string;
  at: TimelineAnchor;
  objectId: string;
  propsPatch: TimelineObjectProps;
};

export type TimelineRemoveEvent = {
  kind: "remove";
  eventId: string;
  at: TimelineAnchor;
  objectId: string;
};

export type TimelineEvent =
  | TimelineAddEvent
  | TimelineUpdateEvent
  | TimelineRemoveEvent;

export type BuildTimelineRequest = {
  events: readonly TimelineEvent[];
};

export type BuildTimelineInput = BuildTimelineRequest;