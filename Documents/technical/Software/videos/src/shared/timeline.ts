// See 📌README.md in this folder for local coding standards before editing this file.

type TimelineWaitMarker = "wait";

export const wait: TimelineWaitMarker = "wait";

type TimelineWaitEntry = readonly [marker: typeof wait, seconds: number];
type TimelineSegmentEntry<Id extends string = string> = readonly [id: Id, lengthSeconds: number, adjustSeconds?: number];

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
		const trimmedId = entry[0].trim();

		if (trimmedId === wait) {
			cursorFrame += secondsToFrames(entry[1], safeFps);
			totalDurationInFrames = Math.max(totalDurationInFrames, cursorFrame);
			continue;
		}

		const hasAdjustment = entry.length >= 3;
		const [, lengthSeconds, adjustSeconds = 0] = entry;
		const durationInFrames = Math.max(1, secondsToFrames(lengthSeconds, safeFps));
		const from = Math.max(0, cursorFrame + signedSecondsToFrames(adjustSeconds, safeFps));

		times[trimmedId as Id] = {
			from,
			durationInFrames,
		};

		if (!hasAdjustment) {
			cursorFrame += durationInFrames;
		}

		totalDurationInFrames = Math.max(totalDurationInFrames, cursorFrame);
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

function signedSecondsToFrames(seconds: number, fps: number): number {
	return Number.isFinite(seconds) ? Math.round(seconds * fps) : 0;
}