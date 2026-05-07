import type { DebateCore } from "../debate-core/Debate.ts";
import { buildScoreGraphFromDebateCore, type BuiltScoreGraphFromDebateCore } from "./buildScoreGraphFromDebateCore.ts";
import { calculateScores } from "./calculateScores.ts";
import type { Scores } from "./scoreTypes.ts";

export interface CalculatedScoresFromDebateCore extends BuiltScoreGraphFromDebateCore {
    scores: Scores
}

export function calculateScoresFromDebateCore(debateCore: DebateCore): CalculatedScoresFromDebateCore {
    const built = buildScoreGraphFromDebateCore(debateCore);

    return {
        ...built,
        scores: calculateScores(built.graph),
    };
}