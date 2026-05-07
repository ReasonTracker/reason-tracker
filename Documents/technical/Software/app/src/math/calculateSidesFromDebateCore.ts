import type { DebateCore } from "../debate-core/Debate.ts";
import { buildScoreGraphFromDebateCore, type BuiltScoreGraphFromDebateCore } from "./buildScoreGraphFromDebateCore.ts";
import { calculateSides, type MainSide, type Sides } from "./calculateSides.ts";

export interface CalculatedSidesFromDebateCore extends BuiltScoreGraphFromDebateCore {
    sides: Sides
    rootSide: MainSide
}

export function calculateSidesFromDebateCore(debateCore: DebateCore): CalculatedSidesFromDebateCore {
    const built = buildScoreGraphFromDebateCore(debateCore);
    const sides = calculateSides({
        graph: built.graph,
        rootScoreNodeId: built.rootScoreNodeId,
    });

    return {
        ...built,
        rootSide: "proMain",
        sides,
    };
}