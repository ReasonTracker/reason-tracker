import type { DebateCore } from "../debate-core/Debate.ts";
import { buildScoreGraphFromDebateCore, type BuiltScoreGraphFromDebateCore } from "./buildScoreGraphFromDebateCore.ts";
import { calculateScores } from "./calculateScores.ts";
import {
    calculateDeliveryScales,
    calculateSourcesScales,
    type SourcesScales,
} from "./calculateSourcesScales.ts";
import type { Scores } from "./scoreTypes.ts";

export interface CalculatedSourcesScalesFromDebateCore extends BuiltScoreGraphFromDebateCore {
    deliveryScales: SourcesScales
    scores: Scores
    sourcesScales: SourcesScales
}

export function calculateSourcesScalesFromDebateCore(args: {
    debateCore: DebateCore;
    rootSourcesScale: number;
}): CalculatedSourcesScalesFromDebateCore {
    const built = buildScoreGraphFromDebateCore(args.debateCore);
    const scores = calculateScores(built.graph);
    const sourcesScales = calculateSourcesScales({
        graph: built.graph,
        rootScoreNodeId: built.rootScoreNodeId,
        rootSourcesScale: args.rootSourcesScale,
        scores,
    });
    const deliveryScales = calculateDeliveryScales({
        graph: built.graph,
        rootScoreNodeId: built.rootScoreNodeId,
        rootSourcesScale: args.rootSourcesScale,
        scores,
        sourcesScales,
    });

    return {
        ...built,
        deliveryScales,
        scores,
        sourcesScales,
    };
}