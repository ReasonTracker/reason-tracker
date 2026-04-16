// See 📌README.md in this folder for local coding standards before editing this file.

import type { Debate, Intent, IntentInput, Change } from "../../../contracts/src/index.ts";

export interface DebatePipelineContext {
	debate: Debate
}

export interface ProcessDebateIntentRequest extends DebatePipelineContext {
	intent: IntentInput
}

export interface ProcessDebateIntentResult {
	intent: Intent
	finalDebate: Debate
}

export interface ApplyIntentChangesRequest extends DebatePipelineContext {
	intent: Intent
	changes?: Change[]
}

export interface ApplyIntentChangesResult {
	debate: Debate
}
