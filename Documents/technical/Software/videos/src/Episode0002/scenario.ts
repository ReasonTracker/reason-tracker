import type { ClaimId } from "@debate-core/Claim.ts";
import type {
    ConfidenceConnectorId,
    RelevanceConnectorId,
} from "@debate-core/Connector.ts";
import type { DebateCore } from "@debate-core/Debate.ts";

export const mainClaimId = "episode-0002-claim-main" as ClaimId;
export const c1ClaimId = "episode-0002-claim-c1" as ClaimId;
export const c2ClaimId = "episode-0002-claim-c2" as ClaimId;
export const c3ClaimId = "episode-0002-claim-c3" as ClaimId;
export const c4ClaimId = "episode-0002-claim-c4" as ClaimId;
export const c5ClaimId = "episode-0002-claim-c5" as ClaimId;
export const c6ClaimId = "episode-0002-claim-c6" as ClaimId;

export const c1ConfidenceConnectorId = "episode-0002-confidence-main-c1" as ConfidenceConnectorId;
export const c2ConfidenceConnectorId = "episode-0002-confidence-main-c2" as ConfidenceConnectorId;
export const c3RelevanceConnectorId = "episode-0002-relevance-c3-c2" as RelevanceConnectorId;
export const c4ConfidenceConnectorId = "episode-0002-confidence-c1-c4" as ConfidenceConnectorId;
export const c5ConfidenceConnectorId = "episode-0002-confidence-c1-c5" as ConfidenceConnectorId;
export const c6ConfidenceConnectorId = "episode-0002-confidence-c1-c6" as ConfidenceConnectorId;

export const episode0002DebateCore: DebateCore = {
    id: "episode-0002-debate" as DebateCore["id"],
    description: "Episode 0002 debate scenario.",
    name: "Episode 0002 Debate",
    mainClaimId,
    claims: {
        [mainClaimId]: {
            id: mainClaimId,
            content: "Main",
        },
        [c1ClaimId]: {
            id: c1ClaimId,
            content: "C1",
        },
        [c2ClaimId]: {
            id: c2ClaimId,
            content: "C2",
        },
        [c3ClaimId]: {
            id: c3ClaimId,
            content: "C3",
        },
        [c4ClaimId]: {
            id: c4ClaimId,
            content: "C4",
        },
        [c5ClaimId]: {
            id: c5ClaimId,
            content: "C5",
        },
        [c6ClaimId]: {
            id: c6ClaimId,
            content: "C6",
        },
    },
    connectors: {
        [c1ConfidenceConnectorId]: {
            id: c1ConfidenceConnectorId,
            type: "confidence",
            source: c1ClaimId,
            targetClaimId: mainClaimId,
            targetRelationship: "proTarget",
        },
        [c2ConfidenceConnectorId]: {
            id: c2ConfidenceConnectorId,
            type: "confidence",
            source: c2ClaimId,
            targetClaimId: mainClaimId,
            targetRelationship: "conTarget",
        },
        [c3RelevanceConnectorId]: {
            id: c3RelevanceConnectorId,
            type: "relevance",
            source: c3ClaimId,
            targetConfidenceConnectorId: c2ConfidenceConnectorId,
            targetRelationship: "proTarget",
        },
        [c4ConfidenceConnectorId]: {
            id: c4ConfidenceConnectorId,
            type: "confidence",
            source: c4ClaimId,
            targetClaimId: c1ClaimId,
            targetRelationship: "proTarget",
        },
        [c5ConfidenceConnectorId]: {
            id: c5ConfidenceConnectorId,
            type: "confidence",
            source: c5ClaimId,
            targetClaimId: c1ClaimId,
            targetRelationship: "proTarget",
        },
        [c6ConfidenceConnectorId]: {
            id: c6ConfidenceConnectorId,
            type: "confidence",
            source: c6ClaimId,
            targetClaimId: c1ClaimId,
            targetRelationship: "conTarget",
        },
    },
};