export { runCli } from "./cli";
export {
    runCliFromArgv,
    runCliFromProcess,
    type CliIoResult,
} from "./cli/io";
export { calculateScores, type CalculateScoresResult } from "./scoring/calculateScores";

export type {
    Affects,
    CalculateDebateCliRequest,
    CalculateDebateCliSuccess,
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
    Score,
    ScoreId,
} from "@reasontracker/contracts";
