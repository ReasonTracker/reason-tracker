import type { DebateCore } from "../debate-core/Debate.ts";
import {
	resolveCyclesFromDebateCore,
	type CycleResolutionOptions,
	type CycleResolvedScoreResult,
} from "./resolveCyclesFromDebateCore.ts";

export type CalculatedScoresFromDebateCore = CycleResolvedScoreResult;

export function calculateScoresFromDebateCore(
	debateCore: DebateCore,
	options?: CycleResolutionOptions,
): CalculatedScoresFromDebateCore {
	return resolveCyclesFromDebateCore(debateCore, options);
}