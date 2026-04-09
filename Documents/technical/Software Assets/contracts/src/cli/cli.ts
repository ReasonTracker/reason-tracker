import type { CalculatedDebate, Debate } from "../Debate";

export type CliCommand = "calculateDebate";

export interface CalculateDebateCliRequest {
    command: "calculateDebate";
    debate: Debate | CalculatedDebate;
}

export interface CliError {
    code: "CYCLE_DETECTED" | "INVALID_REQUEST";
    message: string;
    cycleClaimIds?: string[];
}

export interface CalculateDebateCliSuccess {
    ok: true;
    command: "calculateDebate";
    debate: CalculatedDebate;
}

export interface CliFailure {
    ok: false;
    command: CliCommand;
    error: CliError;
}

export type CliRequest = CalculateDebateCliRequest;
export type CliResponse = CalculateDebateCliSuccess | CliFailure;
