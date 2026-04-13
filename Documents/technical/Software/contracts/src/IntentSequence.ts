// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim, ClaimId } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score, ScoreId } from "./Score.ts";

export type IntentSequenceId = string & { readonly __brand: "IntentSequenceId" };
export type RecordId = string & { readonly __brand: "RecordId" };

/**
 * Direction of a resulting change moving through the displayed graph.
 *
 * A resulting action may be understood as moving either with or against
 * the structural graph direction.
 */
export type PropagationDirection =
    | "sourceToTarget"
    | "targetToSource";

/**
 * One received intent and the ordered semantic steps that follow from it.
 */
export interface IntentSequence {
    id: IntentSequenceId
    intent: Intent
    steps: Step[]
}

/**
 * Proposal narrowed to the current Scenario.md surface.
 *
 * Intents are received records.
 * Steps are the semantic stages that follow from an intent.
 * A recalculation wave step contains ordered mutation records.
 */
export type Intent =
    | ReceivedAddLeafClaimIntent
    | ReceivedAddConnectionIntent
    | ReceivedRemoveConnectionIntent
    | ReceivedMoveClaimIntent
    | ReceivedRemoveClaimIntent;

export type Step =
    | AppliedAddLeafClaimStep
    | RecalculationWaveStep
    | IncomingSourcesResortedStep;

export type Mutation =
    | ScoreCoreValuesChangedMutation
    | ScaleOfSourcesChangedMutation;

/** Received event: add a new claim to an existing graph as a leaf. */
export interface ReceivedAddLeafClaimIntent {
    id: RecordId
    type: "ReceivedAddLeafClaimIntent"
    claim: Claim
    connector: Connector
}

/** Received event: add a connection between two existing claims. */
export interface ReceivedAddConnectionIntent {
    id: RecordId
    type: "ReceivedAddConnectionIntent"
    connector: Connector
}

/** Received event: remove an existing connection between two claims. */
export interface ReceivedRemoveConnectionIntent {
    id: RecordId
    type: "ReceivedRemoveConnectionIntent"
    connectorId: ConnectorId
}

/** Received event: move an existing claim to a different target in the graph. */
export interface ReceivedMoveClaimIntent {
    id: RecordId
    type: "ReceivedMoveClaimIntent"
    claimId: ClaimId
    targetClaimId: ClaimId
}

/** Received event: remove an existing claim from the graph. */
export interface ReceivedRemoveClaimIntent {
    id: RecordId
    type: "ReceivedRemoveClaimIntent"
    claimId: ClaimId
}

/** Applied action: add the new claim, connector, and score to the Debate data. */
export interface AppliedAddLeafClaimStep {
    id: RecordId
    type: "AppliedAddLeafClaimStep"
    claim: Claim
    connector: Connector
    score: Score
    targetScoreId: ScoreId
    incomingConnectorIds: ConnectorId[]
}

/**
 * One recalculation wave emitted after an applied change.
 *
 * The ordered records capture the sequence produced while the scoring algorithm
 * walks through the graph.
 */
export interface RecalculationWaveStep {
    id: RecordId
    type: "RecalculationWaveStep"
    mutations: Mutation[]
}

/** The calculated values on a Score change as propagation reaches it. */
export interface ScoreCoreValuesChangedMutation {
    id: RecordId
    type: "ScoreCoreValuesChangedMutation"
    scoreId: ScoreId
    before: Pick<Score, "confidence" | "reversibleConfidence" | "relevance">
    after: Pick<Score, "confidence" | "reversibleConfidence" | "relevance">
    direction: PropagationDirection
}

/** The scale contributed by source Scores changes as propagation reaches it. */
export interface ScaleOfSourcesChangedMutation {
    id: RecordId
    type: "ScaleOfSourcesChangedMutation"
    scoreId: ScoreId
    before: Pick<Score, "scaleOfSources">
    after: Pick<Score, "scaleOfSources">
    direction: PropagationDirection
}

/**
 * The target-side Score owns the canonical order of the displayed incoming connectors.
 */
export interface IncomingSourcesResortedStep {
    id: RecordId
    type: "IncomingSourcesResortedStep"
    scoreId: ScoreId
    incomingConnectorIds: ConnectorId[]
}
