import type { Score, TargetRelation } from "@reasontracker/contracts";

export interface ScoreChild {
    score?: Score;
    targetRelation: TargetRelation;
}

export interface ConfidenceResult {
    confidence: number;
    reversibleConfidence: number;
}

/**
 * An average of all the children confidences weighted by their relevance and reversed if they are a con.
 */
export function calculateConfidence(children: ScoreChild[]): ConfidenceResult {
    if (children.length < 1) {
        return {
            confidence: 1,
            reversibleConfidence: 1,
        };
    }

    let childrenWeight = 0;
    for (const child of children) {
        if (!child.score) continue;
        childrenWeight += weight(child.score);
    }

    let confidence = 0;
    if (childrenWeight !== 0) {
        for (const child of children) {
            if (!child.score) continue;
            confidence +=
                child.score.confidence *
                (weight(child.score) / childrenWeight) *
                (child.targetRelation === "conTarget" ? -1 : 1);
        }
    }

    const reversibleConfidence = confidence;
    if (confidence < 0) confidence = 0;

    return {
        confidence,
        reversibleConfidence,
    };
}

function weight(score: Score): number {
    return Math.abs(score.confidence) * score.relevance;
}
