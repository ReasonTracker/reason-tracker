import {
    deriveTargetRelation,
    type ClaimId,
    type Debate,
    type Score,
} from "@reasontracker/contracts";
import { calculateConfidence } from "./calculateConfidence.ts";
import { calculateRelevance } from "./calculateRelevance.ts";
import { createConnectorsIndexes } from "./createConnectorsIndexes.ts";
import { sortSourceIdsFirst } from "./sortSourceIdsFirst.ts";

export type CalculateScoresResult =
    | {
          ok: true;
          scores: Record<ClaimId, Score>;
      }
    | {
          ok: false;
          cycleClaimIds: ClaimId[];
      };

export function calculateScores(debate: Debate): CalculateScoresResult {
    const sortResult = sortSourceIdsFirst(debate);
    if (!sortResult.ok) {
        return {
            ok: false,
            cycleClaimIds: sortResult.cycleClaimIds,
        };
    }

    const scores = {} as Record<ClaimId, Score>;
    const connectorsByTarget = createConnectorsIndexes(debate).byTarget;

    for (const id of sortResult.ids) {
        const claim = debate.claims[id];
        if (!claim) continue;

        const children =
            connectorsByTarget[id]?.map((connector) => {
                const score = scores[connector.source as ClaimId];
                const sourceClaim = debate.claims[connector.source as ClaimId];
                const targetClaim = debate.claims[connector.target as ClaimId];
                const targetRelation = deriveTargetRelation(
                    sourceClaim?.side ?? "proMain",
                    targetClaim?.side ?? "proMain",
                );
                return { score, targetRelation, connector };
            }) ?? [];

        const confidenceChildren = children.filter(
            (child) => child.connector?.affects === "confidence",
        );
        const relevanceChildren = children.filter(
            (child) => child.connector?.affects === "relevance",
        );

        const { confidence, reversibleConfidence } =
            calculateConfidence(confidenceChildren);

        scores[id] = {
            id: id as unknown as Score["id"],
            claimId: id,
            relevance: calculateRelevance(relevanceChildren),
            confidence: claim.forceConfidence ?? confidence,
            reversibleConfidence,
        };
    }

    return {
        ok: true,
        scores,
    };
}
