import type { Connector, Score } from "@reasontracker/contracts";

interface RelevanceChild {
    score?: Score;
    connector?: Connector;
}

/**
 * @param children only child scores that affect relevance
 */
export function calculateRelevance(children: RelevanceChild[]): number {
    if (children.length < 1) return 1;

    let relevance = 1;
    for (const child of children) {
        if ((child.score?.confidence ?? 0) <= 0) continue;

        if (child.connector?.proTarget) {
            relevance += child.score!.confidence;
        } else {
            relevance -= child.score!.confidence / 2;
        }
    }

    if (relevance < 0) relevance = 0;
    return relevance;
}
