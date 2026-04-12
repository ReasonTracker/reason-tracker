type TimelineWaitMarker = "wait";

export const wait: TimelineWaitMarker = "wait";

type TimelineWaitEntry = readonly [typeof wait, number];
type TimelineSegmentEntry<Id extends string = string> = readonly [Id, number, number?, number?];

export type TimelineEntry<Id extends string = string> = TimelineWaitEntry | TimelineSegmentEntry<Id>;

export type TimelineSegment = {
  from: number;
  durationInFrames: number;
};

export type TimelineBuildResult<Id extends string> = {
  times: Record<Id, TimelineSegment>;
  totalDurationInFrames: number;
};

export function buildTimelineTimes<Id extends string>(
  entries: readonly TimelineEntry<Id>[],
  fps: number,
): TimelineBuildResult<Id> {
  const safeFps = Math.max(1, Number.isFinite(fps) ? fps : 1);
  let cursorFrame = 0;
  let totalDurationInFrames = 0;
  const times = {} as Record<Id, TimelineSegment>;

  for (const entry of entries) {
    if (entry[0].trim() === wait) {
      cursorFrame += secondsToFrames(entry[1], safeFps);
      totalDurationInFrames = Math.max(totalDurationInFrames, cursorFrame);
      continue;
    }

    const [id, seconds, preSeconds = 0, overlapSeconds = 0] = entry;
    const trimmedId = id.trim() as Id;
    const baseDurationInFrames = secondsToFrames(seconds, safeFps);
    const preDurationInFrames = secondsToFrames(preSeconds, safeFps);
    const overlapDurationInFrames = secondsToFrames(overlapSeconds, safeFps);
    const from = Math.max(0, cursorFrame - preDurationInFrames);
    const durationInFrames = Math.max(1, baseDurationInFrames + preDurationInFrames + overlapDurationInFrames);
    const end = from + durationInFrames;

    times[trimmedId] = {
      from,
      durationInFrames,
    };

    cursorFrame += baseDurationInFrames;
    totalDurationInFrames = Math.max(totalDurationInFrames, end, cursorFrame);
  }

  return {
    times,
    totalDurationInFrames,
  };
}

function secondsToFrames(seconds: number, fps: number): number {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Math.round(safeSeconds * fps);
}
