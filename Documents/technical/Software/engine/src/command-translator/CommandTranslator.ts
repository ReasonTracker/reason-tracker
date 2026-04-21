import type { EngineCommand, PartialExceptId } from "../00-commands.ts";
import type { Claim } from "../00-entities/Claim.ts";
import type { Debate } from "../00-entities/Debate.ts";
import { claimScores, connectorScores } from "../00-entities/Score.ts";
import { Score } from "../index.ts";

export interface CommandTranslator {
    translate(commands: readonly EngineCommand[], debate: Debate): readonly CommandTranslationResult[]
}

export type Operation = AddClaimOp;

export interface CommandTranslationResult {
    commands: readonly [EngineCommand, ...EngineCommand[]]
    operations: readonly Operation[]
}

export interface AddClaimOp {
    type: "AddClaim"
    claim: Claim
}

export interface ConnectClaimAnimationOp {
    type: "ConnectClaimAnimation"
    scores: PartialExceptId<connectorScores>[]
}

export interface ClaimScoreAnimationOp {
    type: "ClaimScoreUpdate"
    scores: PartialExceptId<claimScores>[]
}

export interface ConnectorScoreAnimationOp {
    type: "ConnectorScoreUpdate"
    scores: PartialExceptId<connectorScores>[]
}

export interface ScaleUpdateOp {
    type: "ScaleUpdate"
    scores: PartialExceptId<Pick<Score, "id" | "scaleOfSources">>[]
}
