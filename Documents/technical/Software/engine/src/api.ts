// See 📌README.md in this folder for local coding standards before editing this file.

import type { Debate } from "../../contracts/src/Debate.ts";
import type {
	Change,
	Intent,
	IntentSequence,
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
	 * Optional change override for applying part or all of a recalculation wave.
	 *
	 * This allows callers to slice or edit the wave's change array directly and
	 * send only the changes they want applied for the selected step.
	 * When omitted, the stored changes for the selected step are applied as-is.
	 *
	 * Callers should preserve the original change order from the selected wave,
	 * because that order is part of the propagation semantics.
	 */
	changes?: Change[]
}

export interface ApplyIntentSequenceStepResult {
	debate: Debate
}