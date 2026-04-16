// See 📌README.md in this folder for local coding standards before editing this file.

import type { Claim, ClaimId, ClaimSide } from "./Claim.ts";
import type { Affects, Connector, ConnectorId } from "./Connector.ts";
import type { Score, ScoreId } from "./Score.ts";

export type IntentId = string & { readonly __brand: "IntentIdV2" };
export type ChangeId = string & { readonly __brand: "ChangeIdV2" };
export type PropagationDirection = "sourceToTarget" | "targetToSource";

export type IntentKind =
	| "AddClaim"
	| "AddConnection"
	| "ChangeClaim"
	| "ChangeConnection"
	| "MoveClaim"
	| "RemoveConnection"
	| "RemoveClaim";

export interface AddConnectionOperation {
	type: "AddConnection"
	connector: Connector
	targetScoreId: ScoreId
}

export interface RemoveConnectionOperation {
	type: "RemoveConnection"
	connectorId: ConnectorId
}

export interface ChangeConnectionOperation {
	type: "ChangeConnection"
	connectorId: ConnectorId
	connector: Connector
	targetScoreId: ScoreId
}

export type ConnectionOperation =
	| AddConnectionOperation
	| RemoveConnectionOperation
	| ChangeConnectionOperation;

interface IntentBase {
	id: IntentId
	kind: IntentKind
	changes: Change[]
}

export interface AddClaimIntent extends IntentBase {
	kind: "AddClaim"
	claim: Claim
	connector: Connector
	targetScoreId: ScoreId
}

export interface AddConnectionIntent extends IntentBase {
	kind: "AddConnection"
	connector: Connector
	targetScoreId: ScoreId
}

export interface ChangeClaimIntent extends IntentBase {
	kind: "ChangeClaim"
	claimId: ClaimId
	change: ClaimChange
}

export interface ChangeConnectionIntent extends IntentBase {
	kind: "ChangeConnection"
	change: ConnectionOperation
}

export interface MoveClaimIntent extends IntentBase {
	kind: "MoveClaim"
	claimId: ClaimId
	connectionChanges: ConnectionOperation[]
}

export interface RemoveConnectionIntent extends IntentBase {
	kind: "RemoveConnection"
	connectorId: ConnectorId
}

export interface RemoveClaimIntent extends IntentBase {
	kind: "RemoveClaim"
	claimId: ClaimId
}

export type Intent =
	| AddClaimIntent
	| AddConnectionIntent
	| ChangeClaimIntent
	| ChangeConnectionIntent
	| MoveClaimIntent
	| RemoveConnectionIntent
	| RemoveClaimIntent;

export type IntentInput =
	| Omit<AddClaimIntent, "changes">
	| Omit<AddConnectionIntent, "changes">
	| Omit<ChangeClaimIntent, "changes">
	| Omit<ChangeConnectionIntent, "changes">
	| Omit<MoveClaimIntent, "changes">
	| Omit<RemoveConnectionIntent, "changes">
	| Omit<RemoveClaimIntent, "changes">;

export type ClaimChange = Partial<Pick<Claim, "content" | "side" | "forceConfidence">>;

export interface ClaimAddedChange {
	id: ChangeId
	kind: "ClaimAdded"
	claim: Claim
}

export interface ClaimRemovedChange {
	id: ChangeId
	kind: "ClaimRemoved"
	claim: Claim
}

export interface ClaimContentChangedChange {
	id: ChangeId
	kind: "ClaimContentChanged"
	claimId: ClaimId
	before: { content: string }
	after: { content: string }
}

export interface ClaimSideChangedChange {
	id: ChangeId
	kind: "ClaimSideChanged"
	claimId: ClaimId
	before: { side: ClaimSide }
	after: { side: ClaimSide }
}

export interface ClaimForceConfidenceChangedChange {
	id: ChangeId
	kind: "ClaimForceConfidenceChanged"
	claimId: ClaimId
	before: { forceConfidence?: number }
	after: { forceConfidence?: number }
}

export interface ConnectorAddedChange {
	id: ChangeId
	kind: "ConnectorAdded"
	connector: Connector
}

export interface ConnectorRemovedChange {
	id: ChangeId
	kind: "ConnectorRemoved"
	connector: Connector
}

export interface ConnectorSourceChangedChange {
	id: ChangeId
	kind: "ConnectorSourceChanged"
	connectorId: ConnectorId
	before: { source: ClaimId }
	after: { source: ClaimId }
}

export interface ConnectorTargetChangedChange {
	id: ChangeId
	kind: "ConnectorTargetChanged"
	connectorId: ConnectorId
	before: { target: ClaimId }
	after: { target: ClaimId }
}

export interface ConnectorAffectsChangedChange {
	id: ChangeId
	kind: "ConnectorAffectsChanged"
	connectorId: ConnectorId
	before: { affects: Affects }
	after: { affects: Affects }
}

export interface ScoreAddedChange {
	id: ChangeId
	kind: "ScoreAdded"
	score: Score
}

export interface ScoreRemovedChange {
	id: ChangeId
	kind: "ScoreRemoved"
	score: Score
}

export interface IncomingSourceInsertedChange {
	id: ChangeId
	kind: "IncomingSourceInserted"
	targetScoreId: ScoreId
	sourceScoreId: ScoreId
	incomingScoreIds: ScoreId[]
	direction: PropagationDirection
}

export interface IncomingSourceRemovedChange {
	id: ChangeId
	kind: "IncomingSourceRemoved"
	targetScoreId: ScoreId
	sourceScoreId: ScoreId
	incomingScoreIds: ScoreId[]
	direction: PropagationDirection
}

export interface IncomingSourcesResortedChange {
	id: ChangeId
	kind: "IncomingSourcesResorted"
	targetScoreId: ScoreId
	incomingScoreIds: ScoreId[]
}

interface DirectedScoreFieldChange<TKind extends string, TBefore, TAfter> {
	id: ChangeId
	kind: TKind
	scoreId: ScoreId
	before: TBefore
	after: TAfter
	direction: PropagationDirection
}

export type ScoreClaimConfidenceChangedChange = DirectedScoreFieldChange<
	"ScoreClaimConfidenceChanged",
	{ claimConfidence: number; reversibleClaimConfidence: number },
	{ claimConfidence: number; reversibleClaimConfidence: number }
>;

export type ScoreConnectorConfidenceChangedChange = DirectedScoreFieldChange<
	"ScoreConnectorConfidenceChanged",
	{ connectorConfidence: number; reversibleConnectorConfidence: number },
	{ connectorConfidence: number; reversibleConnectorConfidence: number }
>;

export type ScoreRelevanceChangedChange = DirectedScoreFieldChange<
	"ScoreRelevanceChanged",
	{ relevance: number },
	{ relevance: number }
>;

export type ScoreScaleOfSourcesChangedChange = DirectedScoreFieldChange<
	"ScoreScaleOfSourcesChanged",
	{ scaleOfSources: number },
	{ scaleOfSources: number }
>;

export interface ScoreScaleOfSourcesBatchEntry {
	scoreId: ScoreId
	before: { scaleOfSources: number }
	after: { scaleOfSources: number }
	direction: PropagationDirection
}

export interface ScoreScaleOfSourcesBatchChangedChange {
	id: ChangeId
	kind: "ScoreScaleOfSourcesBatchChanged"
	changes: ScoreScaleOfSourcesBatchEntry[]
}

export type Change =
	| ClaimAddedChange
	| ClaimRemovedChange
	| ClaimContentChangedChange
	| ClaimSideChangedChange
	| ClaimForceConfidenceChangedChange
	| ConnectorAddedChange
	| ConnectorRemovedChange
	| ConnectorSourceChangedChange
	| ConnectorTargetChangedChange
	| ConnectorAffectsChangedChange
	| ScoreAddedChange
	| ScoreRemovedChange
	| IncomingSourceInsertedChange
	| IncomingSourceRemovedChange
	| IncomingSourcesResortedChange
	| ScoreClaimConfidenceChangedChange
	| ScoreConnectorConfidenceChangedChange
	| ScoreRelevanceChangedChange
	| ScoreScaleOfSourcesChangedChange
	| ScoreScaleOfSourcesBatchChangedChange;
