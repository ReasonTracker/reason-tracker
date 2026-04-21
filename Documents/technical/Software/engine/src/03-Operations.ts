// PlannerResult interface for Planner output
import type { EngineCommand } from "./01--Commands.ts";
export interface PlannerResult {
    commands: readonly [EngineCommand, ...EngineCommand[]];
    operations: readonly Operation[];
}
// Union type for all operation variants
export type Operation = AddClaimOp | ConnectClaimAnimationOp | ClaimScoreAnimationOp | ConnectorScoreAnimationOp | ScaleUpdateOp;
// 03-Operations.ts
// Engine operation contracts emitted from Planner

import type { PartialExceptId } from "./01--Commands.ts";
import type { Claim } from "./00-entities/Claim.ts";
import { claimScores, connectorScores } from "./00-entities/Score.ts";
import { Score } from "./index.ts";

// Supports step 2: Animate new claim appearance and scale
export interface AddClaimOp {
    type: "AddClaim"
    claim: Claim
}
// Supports step 3: Animate connector line from new claim to target
export interface ConnectClaimAnimationOp {
    type: "ConnectClaimAnimation"
    scores: PartialExceptId<connectorScores>[]
}
// Supports step 4: Animate claim confidence/score update
export interface ClaimScoreAnimationOp {
    type: "ClaimScoreUpdate"
    scores: PartialExceptId<claimScores>[]
}
// Supports step 5 & 6: Animate connector thickness/score update (traverses graph, outputs for each connector)
export interface ConnectorScoreAnimationOp {
    type: "ConnectorScoreUpdate"
    scores: PartialExceptId<connectorScores>[]
}
// Supports step 7: Final pass to ensure all claims are at correct scale/position
export interface ScaleUpdateOp {
    type: "ScaleUpdate"
    scores: PartialExceptId<Pick<Score, "id" | "scaleOfSources">>[]
}
