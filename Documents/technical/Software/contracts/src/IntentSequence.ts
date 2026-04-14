// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim, ClaimId, ClaimSide } from "./Claim.ts";
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
 * A recalculation wave step contains ordered change records.
 */
export type Intent =
    | ReceivedAddLeafClaimIntent
    | ReceivedAddConnectionIntent
    | ReceivedChangeClaimIntent
    | ReceivedChangeConnectionIntent
    | ReceivedMoveClaimIntent
    | ReceivedRemoveConnectionIntent
    | ReceivedRemoveClaimIntent;

export type Step =
    | AppliedAddLeafClaimStep
    | AppliedAddConnectionStep
    | AppliedChangeClaimStep
    | AppliedRemoveConnectionStep
    | AppliedRemoveClaimStep
    | RecalculationWaveStep
    | IncomingSourcesResortedStep;

export type Change =
    | ScoreCoreValuesChanged
    | ScaleOfSourcesChanged;

/**
 * Renderer-agnostic presentation substeps derived from an intent and its steps.
 *
 * These are smaller-grained than a Change and let downstream renderers stage
 * visual timing without hard-coding medium-specific heuristics into the
 * abstract domain or HTML renderer layers.
 */
export type AnimationStep =
    | ScoreAnimationStep
    | ConnectorAnimationStep;

export type AnimationStepPhase =
    | "enter"
    | "exit"
    | "display"
    | "scale"
    | "layout"
    | "update"
    | "grow"
    | "shrink"
    | "reroute";

export interface ScoreAnimationStep {
    id: RecordId
    type: "ScoreAnimationStep"
    sourceRecordId: RecordId
    scoreId: ScoreId
    phase: Extract<AnimationStepPhase, "enter" | "exit" | "display" | "scale" | "layout">
    direction?: PropagationDirection
}

export interface ConnectorAnimationStep {
    id: RecordId
    type: "ConnectorAnimationStep"
    sourceRecordId: RecordId
    connectorId: ConnectorId
    phase: Extract<AnimationStepPhase, "enter" | "exit" | "grow" | "shrink" | "update" | "reroute">
    direction?: PropagationDirection
}

export type ConnectionChange =
    | AddConnection
    | ChangeConnection
    | RemoveConnection;

export type ClaimChange = Partial<Pick<Claim, "content" | "side" | "forceConfidence">>;

/** Received event: add a new claim to an existing graph as a leaf. */
export interface ReceivedAddLeafClaimIntent {
    id: RecordId
    type: "ReceivedAddLeafClaimIntent"
    claim: Claim
    connector: Connector
    targetScoreId: ScoreId
}

/** Received event: add a connection between two existing claims. */
export interface ReceivedAddConnectionIntent {
    id: RecordId
    type: "ReceivedAddConnectionIntent"
    connector: Connector
    targetScoreId: ScoreId
}

/** Received event: change one connection in the graph. */
export interface ReceivedChangeConnectionIntent {
    id: RecordId
    type: "ReceivedChangeConnectionIntent"
    change: ConnectionChange
}

/** Received event: remove an existing connection between two claims. */
export interface ReceivedRemoveConnectionIntent {
    id: RecordId
    type: "ReceivedRemoveConnectionIntent"
    connectorId: ConnectorId
}

/** Received event: move an existing claim by applying ordered connection changes. */
export interface ReceivedMoveClaimIntent {
    id: RecordId
    type: "ReceivedMoveClaimIntent"
    claimId: ClaimId
    connectionChanges: ConnectionChange[]
}

/** Received event: change one claim's stored fields. */
export interface ReceivedChangeClaimIntent {
    id: RecordId
    type: "ReceivedChangeClaimIntent"
    claimId: ClaimId
    change: ClaimChange
}

/** Received event: remove an existing claim from the graph. */
export interface ReceivedRemoveClaimIntent {
    id: RecordId
    type: "ReceivedRemoveClaimIntent"
    claimId: ClaimId
}

/** Add a connection and create a new displayed score location under one target score. */
export interface AddConnection {
    type: "AddConnection"
    connector: Connector
    targetScoreId: ScoreId
}

/** Remove one existing connection from the graph. */
export interface RemoveConnection {
    type: "RemoveConnection"
    connectorId: ConnectorId
}

/** Replace one existing connection while selecting the resulting target score location. */
export interface ChangeConnection {
    type: "ChangeConnection"
    connectorId: ConnectorId
    connector: Connector
    targetScoreId: ScoreId
}

/** Applied action: add the new claim, connector, and score to the Debate data. */
export interface AppliedAddLeafClaimStep {
    id: RecordId
    type: "AppliedAddLeafClaimStep"
    claim: Claim
    connector: Connector
    score: Score
    targetScoreId: ScoreId
    incomingScoreIds: ScoreId[]
}

/** Applied action: add one connection and one displayed score location to the Debate data. */
export interface AppliedAddConnectionStep {
    id: RecordId
    type: "AppliedAddConnectionStep"
    connector: Connector
    score: Score
    targetScoreId: ScoreId
    incomingScoreIds: ScoreId[]
}

/** Applied action: remove one connection and its displayed score location from the Debate data. */
export interface AppliedRemoveConnectionStep {
    id: RecordId
    type: "AppliedRemoveConnectionStep"
    connector: Connector
    score: Score
    targetScoreId: ScoreId
    incomingScoreIds: ScoreId[]
}

/** Applied action: update one claim's stored fields in the Debate data. */
export interface AppliedChangeClaimStep {
    id: RecordId
    type: "AppliedChangeClaimStep"
    claimBefore: Claim
    claimAfter: Claim
}

/** Applied action: remove one claim from the Debate data after its scores are removed. */
export interface AppliedRemoveClaimStep {
    id: RecordId
    type: "AppliedRemoveClaimStep"
    claim: Claim
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
    changes: Change[]
}

/** The calculated values on a Score change as propagation reaches it. */
export interface ScoreCoreValuesChanged {
    id: RecordId
    type: "ScoreCoreValuesChanged"
    scoreId: ScoreId
    before: Pick<Score, "confidence" | "reversibleConfidence" | "relevance">
    after: Pick<Score, "confidence" | "reversibleConfidence" | "relevance">
    direction: PropagationDirection
}

/** The scale contributed by source Scores changes as propagation reaches it. */
export interface ScaleOfSourcesChanged {
    id: RecordId
    type: "ScaleOfSourcesChanged"
    scoreId: ScoreId
    before: Pick<Score, "scaleOfSources">
    after: Pick<Score, "scaleOfSources">
    direction: PropagationDirection
}

/**
 * The target-side Score owns the canonical order of the displayed incoming scores.
 */
export interface IncomingSourcesResortedStep {
    id: RecordId
    type: "IncomingSourcesResortedStep"
    scoreId: ScoreId
    incomingScoreIds: ScoreId[]
}
