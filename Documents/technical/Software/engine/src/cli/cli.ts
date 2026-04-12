import type {
    CalculateDebateCliRequest,
    ClaimId,
    CliResponse,
    Debate,
    Score,
} from "@reasontracker/contracts";
import { isCalculated } from "@reasontracker/contracts";
import { calculateDebate } from "../scoring/calculateDebate.ts";

// Keep this module as a thin CLI adapter: parsing/mapping only.
// Domain behavior (validation, cycle handling, scoring) must stay in core scoring.
export function runCli(request: CalculateDebateCliRequest): CliResponse {
    if (request.command !== "calculateDebate") {
        return {
            ok: false,
            command: request.command,
            error: {
                code: "INVALID_REQUEST",
                message: `Unknown command: ${String(request.command)}`,
            },
        };
    }

    const cycleHandling = request.cycleHandling ?? "fail";

    const baseDebate: Debate = isCalculated(request.debate)
        ? (() => {
              const { scores: _scores, ...debateWithoutScores } = request.debate;
              return debateWithoutScores;
          })()
        : request.debate;

    const scoreResult = calculateDebate({
        debate: baseDebate,
        cycleHandling,
        actions: request.actions,
        options: request.options,
    });
    if (!scoreResult.ok) {
        const errorCode =
            scoreResult.reason === "cycleDetected"
                ? "CYCLE_DETECTED"
                                : scoreResult.validationErrorCode === "SIMULATION_LIMIT_EXCEEDED"
                                    ? "SIMULATION_LIMIT_EXCEEDED"
                : scoreResult.validationErrorCode === "INVALID_DEBATE"
                  ? "INVALID_DEBATE"
                  : "INVALID_REQUEST";
        return {
            ok: false,
            command: request.command,
            error: {
                code: errorCode,
                message:
                    scoreResult.message ??
                    (scoreResult.reason === "cycleDetected"
                        ? "Cycle detected and cycleHandling is fail."
                        : "Invalid calculateDebate request."),
                sccClaimIds: scoreResult.sccClaimIds,
                details: scoreResult.details,
            },
        };
    }

    return {
        ok: true,
        command: request.command,
        calculatedDebate: {
            ...baseDebate,
            scores: scoreResult.scores,
        },
        diagnostics: scoreResult.diagnostics,
        // Option-dependent fields are present only when requested.
        // The CLI request options are runtime booleans, so this narrow is runtime-based.
        ...(request.options?.includeInitialScores
            ? {
                  initialScores: (scoreResult as { initialScores?: Record<ClaimId, Score> })
                      .initialScores,
              }
            : {}),
        ...(request.options?.includePropagationScoreChanges
            ? {
                  propagationScoreChanges:
                      (
                          scoreResult as {
                              propagationScoreChanges?: {
                                  actionIndex: number;
                                  step: number;
                                  claimId: ClaimId;
                                  before: Score;
                                  after: Score;
                                  delta: {
                                      confidence: number;
                                      reversibleConfidence: number;
                                      relevance: number;
                                  };
                              }[];
                          }
                      ).propagationScoreChanges,
              }
            : {}),
        ...(scoreResult.simulations
            ? {
                  simulations: scoreResult.simulations,
              }
            : {}),
    };
}
