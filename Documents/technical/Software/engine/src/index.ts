export { runCli } from "./cli.ts";
export {
    runCliFromArgv,
    runCliFromProcess,
    type CliIoResult,
} from "./cli-io.ts";
export { calculateScores, type CalculateScoresResult } from "./scoring/calculateScores.ts";

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
