import type {
	CompiledScreenFill,
	ScheduledEpisodeAction,
} from "./compileEpisodeScript";
import {
	DEFAULT_DURATION,
	SCREEN_FILL_GRAPH_PHASES,
} from "./episodeScriptConstants";
import type {
	Duration,
	EpisodeDefaults,
	EpisodeOperation,
	EpisodeScriptSpec,
} from "./episodeScriptSpec";
import { calculateTextDurationSeconds } from "./textDuration";

export function scheduleActions(spec: EpisodeScriptSpec): readonly ScheduledEpisodeAction[] {
	const { fps } = spec.settings.composition;
	let cursorFrame = 0;
	let defaults: EpisodeDefaults = {};

	return spec.script.flatMap((action, index) => {
		if (action.type === "defaults.update") {
			defaults = mergeEpisodeDefaults(defaults, action.defaults);
			return [];
		}
		const resolvedAction = resolveOperationDefaults(defaults, action);
		const durationInFrames = resolveActionDurationInFrames(resolvedAction, fps);
		const from = cursorFrame + signedSecondsToFrames(resolvedAction.offsetSeconds ?? 0, fps);
		if (from < 0) {
			throw new Error(`Action ${index} (${resolvedAction.type}) starts before frame zero.`);
		}

		const endFrame = from + durationInFrames;
		if (resolvedAction.blocking ?? true) {
			cursorFrame = Math.max(cursorFrame, endFrame);
		}

		return [{
			action: resolvedAction,
			durationInFrames,
			endFrame,
			from,
			index,
			label: resolvedAction.label ?? describeAction(resolvedAction),
		}];
	});
}

export function resolveScreenFillTimingInFrames(
	action: EpisodeOperation,
	fps: number,
): Omit<CompiledScreenFill, "claimId"> | undefined {
	if (action.type !== "graph.addClaim" || action.presentation?.mode !== "screen-fill") {
		return undefined;
	}
	const timing = action.presentation.timing;
	const revealDurationInSeconds = timing.reveal === "text"
		? calculateTextDurationSeconds(action.text)
		: timing.reveal;
	return {
		graphPhaseDurationInFrames: {
			firstFill: Math.round(timing.graph.firstFill * fps),
			reorient: Math.round(timing.graph.reorient * fps),
			sprout: Math.round(timing.graph.sprout * fps),
			wave: Math.round(timing.graph.wave * fps),
		},
		holdDurationInFrames: Math.round(timing.hold * fps),
		revealDurationInFrames: Math.round(revealDurationInSeconds * fps),
		settleDurationInFrames: Math.round(timing.settle * fps),
	};
}

function mergeEpisodeDefaults(
	current: EpisodeDefaults,
	update: EpisodeDefaults,
): EpisodeDefaults {
	return {
		"balance.add": { ...current["balance.add"], ...update["balance.add"] },
		"balance.update": { ...current["balance.update"], ...update["balance.update"] },
		"camera.cut": { ...current["camera.cut"], ...update["camera.cut"] },
		"camera.move": { ...current["camera.move"], ...update["camera.move"] },
		"captions.show": { ...current["captions.show"], ...update["captions.show"] },
		"graph.addClaim": { ...current["graph.addClaim"], ...update["graph.addClaim"] },
		"graph.create": { ...current["graph.create"], ...update["graph.create"] },
		"graph.patch": { ...current["graph.patch"], ...update["graph.patch"] },
		"graph.set": { ...current["graph.set"], ...update["graph.set"] },
		"media.add": { ...current["media.add"], ...update["media.add"] },
		"media.update": { ...current["media.update"], ...update["media.update"] },
		"scoreboard.create": { ...current["scoreboard.create"], ...update["scoreboard.create"] },
		"wait": { ...current.wait, ...update.wait },
	};
}

function resolveOperationDefaults(
	defaults: EpisodeDefaults,
	action: EpisodeOperation,
): EpisodeOperation {
	if (
		action.type === "graph.addClaim"
		&& (action.presentation ?? defaults["graph.addClaim"]?.presentation)?.mode === "screen-fill"
	) {
		if (action.duration !== undefined) {
			throw new Error(`Screen-fill claim ${action.key} uses presentation.timing instead of duration.`);
		}
		const { duration: _duration, ...screenFillDefaults } = defaults["graph.addClaim"] ?? {};
		return { ...screenFillDefaults, ...action } as EpisodeOperation;
	}
	return { ...defaults[action.type], ...action } as EpisodeOperation;
}

function resolveActionDurationInFrames(action: EpisodeOperation, fps: number): number {
	const screenFill = resolveScreenFillTimingInFrames(action, fps);
	if (screenFill) {
		return screenFill.revealDurationInFrames
			+ screenFill.holdDurationInFrames
			+ screenFill.settleDurationInFrames
			+ SCREEN_FILL_GRAPH_PHASES.reduce(
				(total, stepId) => total + screenFill.graphPhaseDurationInFrames[stepId],
				0,
			);
	}
	return Math.max(0, Math.round(resolveDurationInSeconds(action) * fps));
}

function signedSecondsToFrames(seconds: number, fps: number): number {
	return Math.sign(seconds) * Math.round(Math.abs(seconds) * fps);
}

function resolveDurationInSeconds(action: EpisodeOperation): number {
	const duration = action.duration ?? resolveDefaultDuration(action);
	if (action.type === "wait" && (duration === "text" || duration <= 0)) {
		throw new Error("Wait requires an explicit or default positive duration.");
	}
	if (duration !== "text") {
		return duration;
	}
	const text = getDurationText(action);
	if (text === undefined) {
		throw new Error(`Action ${action.type} uses a text duration without text content.`);
	}
	return calculateTextDurationSeconds(text);
}

function resolveDefaultDuration(action: EpisodeOperation): Duration {
	switch (action.type) {
		case "graph.patch":
		case "graph.set":
			return getDurationText(action) === undefined ? DEFAULT_DURATION[action.type] : "text";
		default:
			return DEFAULT_DURATION[action.type];
	}
}

function getDurationText(action: EpisodeOperation): string | undefined {
	switch (action.type) {
		case "captions.show":
		case "graph.addClaim":
			return action.text;
		case "graph.create":
			return [action.mainClaim.text, ...(action.claims ?? []).map((claim) => claim.text)].join("");
		case "graph.patch":
		case "graph.set": {
			const text = action.claims.flatMap((claim) => claim.text === undefined ? [] : [claim.text]).join("");
			return text || undefined;
		}
		default:
			return undefined;
	}
}

function describeAction(action: EpisodeOperation): string {
	switch (action.type) {
		case "graph.create":
			return `Create ${action.key}`;
		case "graph.addClaim":
			return `Add ${action.key}`;
		case "graph.set":
			return `Set ${action.graph}`;
		case "graph.patch":
			return `Patch ${action.graph}`;
		case "scoreboard.create":
			return `Create scoreboard for ${action.graph}`;
		case "camera.cut":
			return "Camera cut";
		case "camera.move":
			return "Camera move";
		case "media.add":
		case "balance.add":
			return `Add ${action.key}`;
		case "media.update":
		case "balance.update":
			return `Patch ${action.key}`;
		case "captions.show":
			return "Show closed captions";
		case "wait":
			return "Wait";
	}
}
