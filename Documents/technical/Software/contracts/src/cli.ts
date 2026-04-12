import type {
    CalculatedDebate,
    CalculateDebateDiagnostic,
    CalculateDebateOptions,
    Debate,
    DebateAction,
    ScorePropagationChange,
} from "./Debate.ts";
import type { ClaimId } from "./Claim.ts";
import type { Score } from "./Score.ts";

export type CliCommand = "calculateDebate";
export type CycleHandlingMode = "fail" | "cut" | "simulateAllSingleCuts";

export interface CalculateDebateCliRequest {
    command: "calculateDebate";
    debate: Debate | CalculatedDebate;
    cycleHandling?: CycleHandlingMode;
    actions?: DebateAction[];
    options?: CalculateDebateOptions;
}

export interface CliError {
    code: "CYCLE_DETECTED" | "INVALID_REQUEST" | "SIMULATION_LIMIT_EXCEEDED";
    message: string;
    sccClaimIds?: string[][];
    details?: Record<string, unknown>;
}

export interface CalculateDebateCliSuccess {
    ok: true;
    command: "calculateDebate";
    calculatedDebate: CalculatedDebate;
    simulations?: CalculatedDebate[];
    diagnostics: CalculateDebateDiagnostic[];
    initialScores?: Record<ClaimId, Score>;
    propagationScoreChanges?: ScorePropagationChange[];
}

export interface CliFailure {
    ok: false;
    command: CliCommand;
    error: CliError;
}

export type CliRequest = CalculateDebateCliRequest;
export type CliResponse = CalculateDebateCliSuccess | CliFailure;