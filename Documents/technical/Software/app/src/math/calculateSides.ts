import { claimChildrenIdsByParentId } from "./claimChildrenIdsByParentId.ts";
import type { ScoreGraph, ScoreNodeId } from "./scoreTypes.ts";

export type MainSide = "proMain" | "conMain";
export type Sides = Partial<Record<ScoreNodeId, MainSide>>;

/**
 * Derives each score-node occurrence's eventual relation to the main claim.
 *
 * The root occurrence is always `proMain`. A `proParent` edge keeps the same
 * side, and a `conParent` edge flips it.
 */
export function calculateSides(args: {
    graph: ScoreGraph;
    rootScoreNodeId: ScoreNodeId;
}): Sides {
    const graphWithChildren = {
        ...args.graph,
        childrenByParentId: args.graph.childrenByParentId ?? claimChildrenIdsByParentId(args.graph),
    };
    const sides: Sides = {};

    assignSide({
        graph: graphWithChildren,
        rootScoreNodeId: args.rootScoreNodeId,
        side: "proMain",
        sides,
    });

    return sides;
}

function assignSide(args: {
    graph: ScoreGraph;
    rootScoreNodeId: ScoreNodeId;
    side: MainSide;
    sides: Sides;
}): void {
    const scoreNode = args.graph.nodes[args.rootScoreNodeId];

    if (!scoreNode) {
        throw new Error(`Missing score node while calculating sides: ${args.rootScoreNodeId}`);
    }

    args.sides[args.rootScoreNodeId] = args.side;

    for (const childId of args.graph.childrenByParentId?.[args.rootScoreNodeId] ?? []) {
        const child = args.graph.nodes[childId];

        if (!child) {
            throw new Error(`Missing child score node while calculating sides: ${childId}`);
        }

        if (child.proParent === undefined) {
            throw new Error(`Missing proParent while calculating sides: ${childId}`);
        }

        assignSide({
            ...args,
            rootScoreNodeId: childId,
            side: child.proParent ? args.side : flipSide(args.side),
        });
    }
}

function flipSide(side: MainSide): MainSide {
    return side === "proMain" ? "conMain" : "proMain";
}