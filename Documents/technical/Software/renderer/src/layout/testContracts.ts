import type { ClaimId, ConnectorId, DebateId, Score } from "@reasontracker/contracts";

export function asClaimId(value: string): ClaimId {
    return value as ClaimId;
}

export function asDebateId(value: string): DebateId {
    return value as DebateId;
}

export function asConnectorId(value: string): ConnectorId {
    return value as ConnectorId;
}

export function asScore(id: string, confidence: number, relevance = 1): Score {
    return {
        id: id as Score["id"],
        claimId: id as ClaimId,
        confidence,
        reversibleConfidence: confidence * 2 - 1,
        relevance,
    };
}
