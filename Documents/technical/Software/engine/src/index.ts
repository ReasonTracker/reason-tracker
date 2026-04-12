export { runCli } from "./cli/cli.ts";
export {
    runCliFromArgv,
    runCliFromProcess,
    type CliIoResult,
} from "./cli/cli-io.ts";
export { calculateDebate as calculateScores } from "./scoring/calculateDebate.ts";

export type {
    Affects,
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
    DebateId,
    CalculatedDebate,
    DebateAction,
    Score,
    ScorePropagationChange,
    ScoreId,
} from "@reasontracker/contracts";
