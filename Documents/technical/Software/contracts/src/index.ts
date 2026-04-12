export {
    newClaim,
    type Claim,
    type ClaimId,
    type ClaimSide,
    type ProtoClaim,
} from "./Claim.ts";

export {
    deriveTargetRelation,
    newConnector,
    type Affects,
    type Connector,
    type ConnectorId,
    type ProtoConnector,
    type TargetRelation,
} from "./Connector.ts";

export {
    type BuildPropagationAnimationFailure,
    type BuildPropagationAnimationRequest,
    type BuildPropagationAnimationResult,
    type BuildPropagationAnimationSuccess,
    isCalculated,
    newDebate,
    type CalculateDebateDiagnostic,
    type CalculateDebateCycleHandling,
    type CalculateDebateFailure,
    type CalculateDebateOptions,
    type CalculateDebateRequest,
    type CalculateDebateResult,
    type CalculatedDebate,
    type Debate,
    type DebateAction,
    type DebateId,
    type PropagationAnimationDirective,
    type PropagationAnimationKeyState,
    type ProtoDebate,
    type ScorePropagationChange,
} from "./Debate.ts";

export {
    newScore,
    type ProtoScore,
    type Score,
    type ScoreId,
} from "./Score.ts";

export { newId } from "./newId.ts";

export type {
    CalculateDebateCliRequest,
    CalculateDebateCliSuccess,
    CycleHandlingMode,
    CliCommand,
    CliError,
    CliFailure,
    CliRequest,
    CliResponse,
} from "./cli.ts";
