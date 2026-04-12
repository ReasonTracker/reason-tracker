import type { ConnectorShape, DraftLayoutModel, LayoutModel, SiblingOrderingMode } from "./types.ts";

export function sortDraftLayoutModel(
    model: Pick<DraftLayoutModel, "claimShapes" | "connectorShapes">,
    siblingOrderingMode: SiblingOrderingMode = "auto-reorder",
): {
    claimShapeIds: string[];
    connectorShapeIds: string[];
} {
    const connectorShapeIds = orderConnectorShapeIds(model, siblingOrderingMode);
    const claimShapeIds = orderClaimShapeIds(model, connectorShapeIds, siblingOrderingMode);

    return {
        claimShapeIds,
        connectorShapeIds,
    };
}

export function compareConnectorPreference(
    model: {
        claimShapes: Record<string, { score?: { confidence: number } }>;
        connectorShapes: Record<string, Pick<ConnectorShape, "id" | "sourceClaimShapeId" | "targetRelation">>;
    },
    connectorShapeIdA: string,
    connectorShapeIdB: string,
): number {
    const connectorShapeA = model.connectorShapes[connectorShapeIdA];
    const connectorShapeB = model.connectorShapes[connectorShapeIdB];
    if (!connectorShapeA || !connectorShapeB) return connectorShapeIdA.localeCompare(connectorShapeIdB);

    const relationOrder = relationPriority(connectorShapeA.targetRelation) - relationPriority(connectorShapeB.targetRelation);
    if (relationOrder !== 0) return relationOrder;

    const confidenceA = sourceConfidence(model, connectorShapeA.sourceClaimShapeId);
    const confidenceB = sourceConfidence(model, connectorShapeB.sourceClaimShapeId);
    const confidenceOrder = confidenceB - confidenceA;
    if (confidenceOrder !== 0) return confidenceOrder;

    return connectorShapeIdA.localeCompare(connectorShapeIdB);
}

function orderClaimShapeIds(
    model: Pick<DraftLayoutModel, "claimShapes" | "connectorShapes">,
    connectorShapeIdsInOrder: string[],
    siblingOrderingMode: SiblingOrderingMode,
): string[] {
    const inputClaimShapeIndexById: Record<string, number> = {};
    for (const [index, claimShapeId] of Object.keys(model.claimShapes).entries()) {
        inputClaimShapeIndexById[claimShapeId] = index;
    }

    const connectorShapeIdsBySourceClaimShapeId: Record<string, string[]> = {};
    for (const connectorShapeId of connectorShapeIdsInOrder) {
        const connectorShape = model.connectorShapes[connectorShapeId];
        if (!connectorShape) {
            continue;
        }

        (connectorShapeIdsBySourceClaimShapeId[connectorShape.sourceClaimShapeId] ??= []).push(connectorShape.id);
    }

    const preferredConnectorShapeIdBySourceClaimShapeId: Record<string, string> = {};
    const connectorOrderIndexById: Record<string, number> = {};
    for (const [index, connectorShapeId] of connectorShapeIdsInOrder.entries()) {
        connectorOrderIndexById[connectorShapeId] = index;
    }

    for (const [sourceClaimShapeId, connectorShapeIds] of Object.entries(connectorShapeIdsBySourceClaimShapeId)) {
        if (connectorShapeIds.length > 0) {
            preferredConnectorShapeIdBySourceClaimShapeId[sourceClaimShapeId] = connectorShapeIds[0];
        }
    }

    return Object.keys(model.claimShapes).sort((claimShapeIdA, claimShapeIdB) => {
        const claimShapeA = model.claimShapes[claimShapeIdA];
        const claimShapeB = model.claimShapes[claimShapeIdB];
        const depthOrder = claimShapeA.depth - claimShapeB.depth;
        if (depthOrder !== 0) return depthOrder;

        const preferredConnectorShapeIdA = preferredConnectorShapeIdBySourceClaimShapeId[claimShapeIdA];
        const preferredConnectorShapeIdB = preferredConnectorShapeIdBySourceClaimShapeId[claimShapeIdB];
        if (preferredConnectorShapeIdA && preferredConnectorShapeIdB) {
            const connectorOrder = siblingOrderingMode === "preserve-input"
                ? (connectorOrderIndexById[preferredConnectorShapeIdA] ?? Number.MAX_SAFE_INTEGER)
                    - (connectorOrderIndexById[preferredConnectorShapeIdB] ?? Number.MAX_SAFE_INTEGER)
                : compareConnectorPreference(model, preferredConnectorShapeIdA, preferredConnectorShapeIdB);
            if (connectorOrder !== 0) return connectorOrder;
        } else if (preferredConnectorShapeIdA) {
            return -1;
        } else if (preferredConnectorShapeIdB) {
            return 1;
        }

        if (siblingOrderingMode === "preserve-input") {
            return (inputClaimShapeIndexById[claimShapeIdA] ?? Number.MAX_SAFE_INTEGER)
                - (inputClaimShapeIndexById[claimShapeIdB] ?? Number.MAX_SAFE_INTEGER);
        }

        return claimShapeIdA.localeCompare(claimShapeIdB);
    });
}

function orderConnectorShapeIds(
    model: Pick<DraftLayoutModel, "claimShapes" | "connectorShapes">,
    siblingOrderingMode: SiblingOrderingMode,
): string[] {
    if (siblingOrderingMode === "preserve-input") {
        return Object.keys(model.connectorShapes).sort((a, b) => {
            const connectorShapeA = model.connectorShapes[a];
            const connectorShapeB = model.connectorShapes[b];
            if (!connectorShapeA || !connectorShapeB) {
                return a.localeCompare(b);
            }

            const relationOrder = relationPriority(connectorShapeA.targetRelation) - relationPriority(connectorShapeB.targetRelation);
            if (relationOrder !== 0) return relationOrder;

            return 0;
        });
    }

    return Object.keys(model.connectorShapes).sort((a, b) => compareConnectorPreference(model, a, b));
}

export function orderConnectorShapeIdsForTargetByPreference(
    model: LayoutModel,
    connectorShapeIds: string[],
): string[] {
    return [...connectorShapeIds].sort((a, b) => compareConnectorPreference(model, a, b));
}

function relationPriority(targetRelation: ConnectorShape["targetRelation"]): number {
    if (targetRelation === "proTarget") return 0;
    if (targetRelation === "conTarget") return 1;
    return 2;
}

function sourceConfidence(
    model: {
        claimShapes: Record<string, { score?: { confidence: number } }>;
    },
    sourceClaimShapeId: string,
): number {
    return model.claimShapes[sourceClaimShapeId]?.score?.confidence ?? 1;
}