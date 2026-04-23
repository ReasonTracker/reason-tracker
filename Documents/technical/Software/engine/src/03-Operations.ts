import type { DebateMetadataPatch, EngineCommand } from "./01-Commands.ts";
import type { Claim, ClaimId, ClaimPatch } from "./00-entities/Claim.ts";
import type { Connector, ConnectorId } from "./00-entities/Connector.ts";
import type { Debate } from "./00-entities/Debate.ts";
import type { Score, ScoreId, ScorePatch, ScoreScalePatch } from "./00-entities/Score.ts";

export interface PlannerResult {
    commands: readonly [EngineCommand, ...EngineCommand[]];
    operations: readonly Operation[];
}

export type Operation =
    | DebateCreatedOp
    | DebateUpdatedOp
    | ClaimAddedOp
    | ClaimUpdatedOp
    | ClaimDeletedOp
    | ConnectorAddedOp
    | ConnectorDeletedOp
    | ScoreAddedOp
    | ScoreUpdatedOp
    | ScaleOfSourcesOp
    | ScoreDeletedOp;

export interface DebateCreatedOp {
    type: "DebateCreated"
    debate: Debate
}

export interface DebateUpdatedOp {
    type: "DebateUpdated"
    patch: DebateMetadataPatch
}

export interface ClaimAddedOp {
    type: "ClaimAdded"
    claim: Claim
}

export interface ClaimUpdatedOp {
    type: "ClaimUpdated"
    patch: ClaimPatch
}

export interface ClaimDeletedOp {
    type: "ClaimDeleted"
    claimId: ClaimId
}

export interface ConnectorAddedOp {
    type: "ConnectorAdded"
    connector: Connector
}

export interface ConnectorDeletedOp {
    type: "ConnectorDeleted"
    connectorId: ConnectorId
}

export interface ScoreAddedOp {
    type: "ScoreAdded"
    score: Score
}

export interface ScoreUpdatedOp {
    type: "ScoreUpdated"
    patches: ScorePatch[]
}

export interface ScaleOfSourcesOp {
    type: "scaleOfSources"
    patches: ScoreScalePatch[]
}

export interface ScoreDeletedOp {
    type: "ScoreDeleted"
    scoreId: ScoreId
}
