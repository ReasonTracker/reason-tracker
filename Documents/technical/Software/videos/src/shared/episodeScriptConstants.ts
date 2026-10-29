import type { AnimationStepId } from "@reasontracker/engine/animation/DebateAnimationPlan.ts";

import type { Duration, EpisodeOperation } from "./episodeScriptSpec";

export const DEFAULT_DURATION: Readonly<Record<EpisodeOperation["type"], Duration>> = {
	"camera.cut": 0,
	"camera.move": 1.2,
	"media.add": 0,
	"media.update": 0,
	"balance.add": 0,
	"balance.update": 0,
	"captions.show": "text",
	"graph.addClaim": "text",
	"graph.create": "text",
	"graph.patch": 0,
	"graph.set": 0,
	"scoreboard.create": 0,
	"wait": 0,
};

export const GRAPH_PHASES = [
	["voila", 1 / 4],
	["sprout", 2 / 7],
	["firstFill", 13 / 56],
	["wave", 13 / 112],
	["reorient", 13 / 112],
] as const satisfies readonly (readonly [AnimationStepId, number])[];

export const SCREEN_FILL_GRAPH_PHASES = ["sprout", "firstFill", "wave", "reorient"] as const satisfies readonly Exclude<AnimationStepId, "voila">[];
