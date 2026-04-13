// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim } from "./Claim.ts";
import type { Connector, ConnectorId } from "./Connector.ts";
import type { Score, ScoreId } from "./Score.ts";

export type DebateActionListId = string & { readonly __brand: "DebateActionListId" };
export type DebateActionId = string & { readonly __brand: "DebateActionId" };

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
 * One initiating set of actions and the ordered list of resulting actions that
 * are eventually applied to the Debate.
 */
export interface DebateActionList {
    id: DebateActionListId
    initiatedActions: InitiatingDebateAction[]
    resultingActions: ResultingDebateAction[]
}

/**
 * Proposal narrowed to the current Scenario.md surface.
 *
 * The current scenario can initiate more than one action together, such as
 * adding a leaf claim and its connector at the same time.
 * Resulting actions model the ordered changes needed to animate that scenario.
 */
export type InitiatingDebateAction =
    | AddLeafClaimAction
    | ConnectorInsertedAction;

export type ResultingDebateAction =
    | ScoreInsertedAction
    | ScoreOrderChangedAction
    | ScoreDisplayChangedAction
    | ScoreValuesChangedAction
    | ConnectorInsertedAction
    | ConnectorDisplayChangedAction;

/** User action: add a new claim to an existing graph as a leaf. */
export interface AddLeafClaimAction {
    id: DebateActionId
    kind: "claim.addedAsLeaf"
    claim: Claim
    connector: Connector
}

/** A new Score is created for the new displayed location. */
export interface ScoreInsertedAction {
    id: DebateActionId
    kind: "score.inserted"
    score: Score
}

/**
 * The target-side Score owns the order of the displayed incoming connectors.
 */
export interface ScoreOrderChangedAction {
    id: DebateActionId
    kind: "score.incomingConnectorOrder.changed"
    scoreId: ScoreId
    incomingConnectorIds: ConnectorId[]
}

/** The displayed size of a Score changes, such as growing from 0 to its semantic scale. */
export interface ScoreDisplayChangedAction {
    id: DebateActionId
    kind: "score.display.changed"
    scoreId: ScoreId
    beforeScale: number
    afterScale: number
}

/** The calculated values on a Score change as propagation reaches it. */
export interface ScoreValuesChangedAction {
    id: DebateActionId
    kind: "score.values.changed"
    scoreId: ScoreId
    before: Pick<Score, "confidence" | "reversibleConfidence" | "relevance" | "scaleOfSources">
    after: Pick<Score, "confidence" | "reversibleConfidence" | "relevance" | "scaleOfSources">
    direction: PropagationDirection
}

/** The displayed connector for the new leaf is created. */
export interface ConnectorInsertedAction {
    id: DebateActionId
    kind: "connector.inserted"
    connector: Connector
}

/**
 * Edge-specific display changes needed by the current scenario.
 */
export interface ConnectorDisplayChangedAction {
    id: DebateActionId
    kind: "connector.display.changed"
    connectorId: ConnectorId
    sourceScoreId: ScoreId
    targetScoreId: ScoreId
    widthAtSource: number
    widthAtTarget: number
    direction: PropagationDirection
}
