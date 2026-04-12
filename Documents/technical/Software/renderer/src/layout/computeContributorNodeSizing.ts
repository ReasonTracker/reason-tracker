import type {
    ClaimShapeSize,
    ContributorNodeSizingOptions,
    ContributorNodeSizingResult,
    DraftLayoutModel,
} from "./types.ts";

const DEFAULT_CLAIM_SHAPE_SIZE: ClaimShapeSize = {
    width: 320,
    height: 180,
};

export function computeContributorNodeSizing(
    model: DraftLayoutModel,
    options: ContributorNodeSizingOptions = {},
): ContributorNodeSizingResult {
    const applyConfidenceScale = options.applyConfidenceScale ?? true;
    const applyRelevanceScale = options.applyRelevanceScale ?? true;
    const defaultClaimShapeSize = options.defaultClaimShapeSize ?? DEFAULT_CLAIM_SHAPE_SIZE;

    const confidenceCascadeScaleByClaimShapeId: Record<string, number> = {};
    const relevanceNormalizedScaleByClaimShapeId: Record<string, number> = {};
    const claimShapeScaleByClaimShapeId: Record<string, number> = {};
    const claimShapeSizeByClaimShapeId: Record<string, ClaimShapeSize> = {};

    for (const claimShapeId of Object.keys(model.claimShapes)) {
        confidenceCascadeScaleByClaimShapeId[claimShapeId] = 1;
        relevanceNormalizedScaleByClaimShapeId[claimShapeId] = 1;
        claimShapeScaleByClaimShapeId[claimShapeId] = 1;
        claimShapeSizeByClaimShapeId[claimShapeId] = {
            width: defaultClaimShapeSize.width,
            height: defaultClaimShapeSize.height,
        };
    }

    const contributorClaimShapeIdsByTargetClaimShapeId: Record<string, Set<string>> = {};

    for (const connectorShape of Object.values(model.connectorShapes)) {
        (contributorClaimShapeIdsByTargetClaimShapeId[connectorShape.targetClaimShapeId] ??= new Set<string>()).add(
            connectorShape.sourceClaimShapeId,
        );
    }

    const confidenceGroupScaleByTargetClaimShapeId: Record<string, number> = {};

    for (const [targetClaimShapeId, contributorClaimShapeIds] of Object.entries(contributorClaimShapeIdsByTargetClaimShapeId)) {
        if (contributorClaimShapeIds.size === 0) continue;

        let totalPositiveConfidenceMass = 0;

        for (const contributorClaimShapeId of contributorClaimShapeIds) {
            const contributorClaimShape = model.claimShapes[contributorClaimShapeId];
            if (!contributorClaimShape) continue;

            const confidence = contributorClaimShape.score?.confidence ?? 1;
            if (confidence <= 0) continue;

            totalPositiveConfidenceMass += confidence;
        }

        confidenceGroupScaleByTargetClaimShapeId[targetClaimShapeId] =
            applyConfidenceScale
                ? 1 / Math.max(1, totalPositiveConfidenceMass)
                : 1;
    }

    const orderedClaimShapeIds = model.claimShapeInputOrder;

    confidenceCascadeScaleByClaimShapeId[model.rootClaimShapeId] = 1;

    claimShapeScaleByClaimShapeId[model.rootClaimShapeId] =
        confidenceCascadeScaleByClaimShapeId[model.rootClaimShapeId] * relevanceNormalizedScaleByClaimShapeId[model.rootClaimShapeId];

    for (const targetClaimShapeId of orderedClaimShapeIds) {
        const contributorClaimShapeIds = contributorClaimShapeIdsByTargetClaimShapeId[targetClaimShapeId];
        if (!contributorClaimShapeIds || contributorClaimShapeIds.size === 0) continue;

        const targetFinalScale = claimShapeScaleByClaimShapeId[targetClaimShapeId] ?? 1;
        const confidenceGroupScale = confidenceGroupScaleByTargetClaimShapeId[targetClaimShapeId] ?? 1;
        const cascadedConfidenceScaleFromTarget = targetFinalScale * confidenceGroupScale;

        let maxContributorRelevance = 1;
        if (applyRelevanceScale) {
            maxContributorRelevance = 0;
            for (const contributorClaimShapeId of contributorClaimShapeIds) {
                const contributorClaimShape = model.claimShapes[contributorClaimShapeId];
                if (!contributorClaimShape) continue;
                const contributorRelevance = Math.max(0, contributorClaimShape.score?.relevance ?? 1);
                maxContributorRelevance = Math.max(maxContributorRelevance, contributorRelevance);
            }
            if (maxContributorRelevance <= 0) {
                maxContributorRelevance = 1;
            }
        }

        for (const contributorClaimShapeId of contributorClaimShapeIds) {
            const contributorClaimShape = model.claimShapes[contributorClaimShapeId];
            if (!contributorClaimShape) continue;

            const priorConfidenceCascadeScale = confidenceCascadeScaleByClaimShapeId[contributorClaimShapeId] ?? 1;
            const nextConfidenceCascadeScale = Math.min(
                priorConfidenceCascadeScale,
                cascadedConfidenceScaleFromTarget,
            );

            confidenceCascadeScaleByClaimShapeId[contributorClaimShapeId] = nextConfidenceCascadeScale;

            const relevanceNormalizedScale = applyRelevanceScale
                ? Math.min(
                    1,
                    Math.max(0, contributorClaimShape.score?.relevance ?? 1) / maxContributorRelevance,
                )
                : 1;
            relevanceNormalizedScaleByClaimShapeId[contributorClaimShapeId] = relevanceNormalizedScale;

            claimShapeScaleByClaimShapeId[contributorClaimShapeId] =
                nextConfidenceCascadeScale * relevanceNormalizedScale;
        }
    }

    for (const claimShapeId of Object.keys(model.claimShapes)) {
        const scale = claimShapeScaleByClaimShapeId[claimShapeId] ?? 1;
        claimShapeSizeByClaimShapeId[claimShapeId] = {
            width: defaultClaimShapeSize.width * scale,
            height: defaultClaimShapeSize.height * scale,
        };
    }

    return {
        claimShapeSizeByClaimShapeId,
        claimShapeScaleByClaimShapeId,
    };
}
