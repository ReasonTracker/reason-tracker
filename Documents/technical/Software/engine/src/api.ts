// See 📌README.md in this folder for local coding standards before editing this file.

import type { Debate } from "../../contracts/src/Debate.ts";
import type {
	AnimationStep,
	Change,
	Intent,
	IntentSequence,
	RecordId,
} from "../../contracts/src/IntentSequence.ts";

/**
 * Base payload carried forward through the abstract pipeline.
 *
 * Later stages should extend this grouped context rather than restating the
 * same domain fields in parallel request shapes.
 */
export interface DebatePipelineContext {
	debate: Debate
}

/**
	 * Pipeline payload carrying optional intent-sequence selection context.
 *
 * This stays renderer-agnostic and can be extended by layout, renderer, or
 * video-specific projection layers.
 */
export interface IntentSequenceSelectionPipelineContext extends DebatePipelineContext {
	intentSequence?: IntentSequence
	stepId?: RecordId
	changes?: Change[]
	animationSteps?: AnimationStep[]
}

/**
	 * Pipeline payload narrowed to one resolved step application.
	 */
export interface ResolvedIntentSequencePipelineContext extends IntentSequenceSelectionPipelineContext {
	intentSequence: IntentSequence
	stepId: RecordId
}

export interface ProcessDebateIntentRequest extends DebatePipelineContext {
	intent: Intent
}

export interface ProcessDebateIntentResult {
	intentSequence: IntentSequence
	finalDebate: Debate
}

export interface ApplyIntentSequenceStepRequest extends ResolvedIntentSequencePipelineContext {

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
}

export interface ApplyIntentSequenceStepResult {
	debate: Debate
}