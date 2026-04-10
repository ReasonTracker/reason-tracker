import type {
    ContributorNodeSizingOptions,
    ContributorNodeSizingResult,
    LayoutModel,
    NodeSize,
} from "./types.ts";

const DEFAULT_NODE_SIZE: NodeSize = {
    width: 320,
    height: 180,
};

export function computeContributorNodeSizing(
    model: LayoutModel,
    options: ContributorNodeSizingOptions = {},
): ContributorNodeSizingResult {
    const applyConfidenceScale = options.applyConfidenceScale ?? true;
    const applyRelevanceScale = options.applyRelevanceScale ?? true;
    const defaultNodeSize = options.defaultNodeSize ?? DEFAULT_NODE_SIZE;

    const confidenceCascadeScaleByNodeId: Record<string, number> = {};
    const relevanceNormalizedScaleByNodeId: Record<string, number> = {};
    const nodeScaleByNodeId: Record<string, number> = {};
    const nodeSizeByNodeId: Record<string, NodeSize> = {};

    for (const nodeId of Object.keys(model.nodes)) {
        confidenceCascadeScaleByNodeId[nodeId] = 1;
        relevanceNormalizedScaleByNodeId[nodeId] = 1;
        nodeScaleByNodeId[nodeId] = 1;
        nodeSizeByNodeId[nodeId] = {
            width: defaultNodeSize.width,
            height: defaultNodeSize.height,
        };
    }

    const contributorNodeIdsByTargetNodeId: Record<string, Set<string>> = {};

    for (const edge of Object.values(model.edges)) {
        (contributorNodeIdsByTargetNodeId[edge.fromNodeId] ??= new Set<string>()).add(edge.toNodeId);
    }

    const confidenceGroupScaleByTargetNodeId: Record<string, number> = {};

    for (const [targetNodeId, contributorNodeIds] of Object.entries(contributorNodeIdsByTargetNodeId)) {
        if (contributorNodeIds.size === 0) continue;

        let totalPositiveConfidenceMass = 0;

        for (const contributorNodeId of contributorNodeIds) {
            const contributorNode = model.nodes[contributorNodeId];
            if (!contributorNode) continue;

            const confidence = contributorNode.score?.confidence ?? 1;
            if (confidence <= 0) continue;

            totalPositiveConfidenceMass += confidence;
        }

        confidenceGroupScaleByTargetNodeId[targetNodeId] =
            applyConfidenceScale
                ? 1 / Math.max(1, totalPositiveConfidenceMass)
                : 1;
    }

    const orderedNodeIds = Object.keys(model.nodes).sort((a, b) => {
        const depthOrder = model.nodes[a].depth - model.nodes[b].depth;
        if (depthOrder !== 0) return depthOrder;
        return a.localeCompare(b);
    });

    confidenceCascadeScaleByNodeId[model.rootNodeId] = 1;

    nodeScaleByNodeId[model.rootNodeId] =
        confidenceCascadeScaleByNodeId[model.rootNodeId] * relevanceNormalizedScaleByNodeId[model.rootNodeId];

    for (const targetNodeId of orderedNodeIds) {
        const contributorNodeIds = contributorNodeIdsByTargetNodeId[targetNodeId];
        if (!contributorNodeIds || contributorNodeIds.size === 0) continue;

        const targetFinalScale = nodeScaleByNodeId[targetNodeId] ?? 1;
        const confidenceGroupScale = confidenceGroupScaleByTargetNodeId[targetNodeId] ?? 1;
        const cascadedConfidenceScaleFromTarget = targetFinalScale * confidenceGroupScale;

        let maxContributorRelevance = 1;
        if (applyRelevanceScale) {
            maxContributorRelevance = 0;
            for (const contributorNodeId of contributorNodeIds) {
                const contributorNode = model.nodes[contributorNodeId];
                if (!contributorNode) continue;
                const contributorRelevance = Math.max(0, contributorNode.score?.relevance ?? 1);
                maxContributorRelevance = Math.max(maxContributorRelevance, contributorRelevance);
            }
            if (maxContributorRelevance <= 0) {
                maxContributorRelevance = 1;
            }
        }

        for (const contributorNodeId of contributorNodeIds) {
            const contributorNode = model.nodes[contributorNodeId];
            if (!contributorNode) continue;

            const priorConfidenceCascadeScale = confidenceCascadeScaleByNodeId[contributorNodeId] ?? 1;
            const nextConfidenceCascadeScale = Math.min(
                priorConfidenceCascadeScale,
                cascadedConfidenceScaleFromTarget,
            );

            confidenceCascadeScaleByNodeId[contributorNodeId] = nextConfidenceCascadeScale;

            const relevanceNormalizedScale = applyRelevanceScale
                ? Math.min(
                    1,
                    Math.max(0, contributorNode.score?.relevance ?? 1) / maxContributorRelevance,
                )
                : 1;
            relevanceNormalizedScaleByNodeId[contributorNodeId] = relevanceNormalizedScale;

            nodeScaleByNodeId[contributorNodeId] =
                nextConfidenceCascadeScale * relevanceNormalizedScale;
        }
    }

    for (const nodeId of Object.keys(model.nodes)) {
        const scale = nodeScaleByNodeId[nodeId] ?? 1;
        nodeSizeByNodeId[nodeId] = {
            width: defaultNodeSize.width * scale,
            height: defaultNodeSize.height * scale,
        };
    }

    return {
        nodeSizeByNodeId,
        nodeScaleByNodeId,
    };
}
