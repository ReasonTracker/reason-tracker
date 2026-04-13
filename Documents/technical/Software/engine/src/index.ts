// See 📌README.md in this folder for local coding standards before editing this file.

import type { Debate } from "../../contracts/src/Debate.ts";
import type {
    Intent,
    IntentSequence,
    Mutation,
    RecordId,
} from "../../contracts/src/IntentSequence.ts";

export interface ProcessDebateIntentRequest {
	debate: Debate
	intent: Intent
}

export interface ProcessDebateIntentResult {
	intentSequence: IntentSequence
	finalDebate: Debate
}

export interface ApplyIntentSequenceStepRequest {
	debate: Debate
	intentSequence: IntentSequence
	stepId: RecordId

	/**
	 * Optional mutation override for applying part or all of a recalculation wave.
	 *
	 * This allows callers to slice or mutate the wave's mutation array directly and
	 * send only the mutations they want applied for the selected step.
	 * When omitted, the stored mutations for the selected step are applied as-is.
	 */
	mutations?: Mutation[]
}

export interface ApplyIntentSequenceStepResult {
	debate: Debate
}

/**
 * Processes one received intent against a debate and returns the semantic
 * sequence of steps emitted by the engine plus the fully reduced final debate.
 */
export declare function processDebateIntent(
	request: ProcessDebateIntentRequest,
): ProcessDebateIntentResult;

/**
 * Applies one selected step from a previously produced intent sequence.
 *
 * For recalculation wave steps, callers may provide a custom mutation array so
 * they can apply only part of the wave without rebuilding the step object.
 */
export declare function applyIntentSequenceStep(
	request: ApplyIntentSequenceStepRequest,
): ApplyIntentSequenceStepResult;
