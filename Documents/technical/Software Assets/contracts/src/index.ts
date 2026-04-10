export {
    newClaim,
    type Claim,
    type ClaimId,
    type ProtoClaim,
} from "./Claim.ts";

export {
    newConnector,
    type Affects,
    type Connector,
    type ConnectorId,
    type ProtoConnector,
} from "./Connector.ts";

export {
    isCalculated,
    newDebate,
    type CalculatedDebate,
    type Debate,
    type DebateId,
    type ProtoDebate,
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
} from "./cli/cli.ts";
