export {
    runCliFromArgv,
    runCliFromProcess,
    type CliIoResult,
} from "./cli/cli-io.ts";
export {
    buildPropagationAnimation,
    calculateDebate,
} from "./scoring/calculateDebate.ts";
export {
    calculateDebate as calculateScores,
} from "./scoring/calculateDebate.ts";

export type {
    Affects,
    BuildPropagationAnimationFailure,
    BuildPropagationAnimationRequest,
    BuildPropagationAnimationResult,
    BuildPropagationAnimationSuccess,
    CalculateDebateDiagnostic,
    CalculateDebateCliRequest,
    CalculateDebateCliSuccess,
    CalculateDebateFailure,
    CalculateDebateOptions,
    CalculateDebateRequest,
    CalculateDebateResult,
    CycleHandlingMode,
    Claim,
    ClaimId,
    CliError,
    CliFailure,
    CliRequest,
    CliResponse,
    Connector,
    ConnectorId,
    Debate,
    GraphAction,
    DebateId,
    CalculatedDebate,
    DebateAction,
    PropagationAnimationDirective,
    StageMode,
    PropagationAnimationKeyState,
    Score,
    ScorePropagationChange,
    ScoreId,
} from "@reasontracker/contracts";
