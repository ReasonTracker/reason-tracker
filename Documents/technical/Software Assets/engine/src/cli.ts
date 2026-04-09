import type {
    CalculateDebateCliRequest,
    CliResponse,
    Debate,
} from "@reasontracker/contracts";
import { isCalculated } from "@reasontracker/contracts";
import { calculateScores } from "./scoring/calculateScores.ts";

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

    const baseDebate: Debate = isCalculated(request.debate)
        ? (() => {
              const { scores: _scores, ...debateWithoutScores } = request.debate;
              return debateWithoutScores;
          })()
        : request.debate;

    const scoreResult = calculateScores(baseDebate);
    if (!scoreResult.ok) {
        return {
            ok: false,
            command: request.command,
            error: {
                code: "CYCLE_DETECTED",
                // TODO: Add a formal cycle payload once cycle-breaking semantics are defined.
                message: "Cannot calculate debate scores because the connector graph contains a cycle.",
                cycleClaimIds: scoreResult.cycleClaimIds,
            },
        };
    }

    return {
        ok: true,
        command: request.command,
        debate: {
            ...baseDebate,
            scores: scoreResult.scores,
        },
    };
}
