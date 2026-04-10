import type { ConnectorShape, DraftLayoutModel, LayoutModel } from "./types.ts";

interface ConnectorOrderingModel {
    claimShapes: Record<string, { score?: { confidence: number } }>;
    connectorShapes: Record<string, Pick<ConnectorShape, "id" | "sourceClaimShapeId" | "targetRelation">>;
}

export function compareConnectorPreference(
    model: ConnectorOrderingModel,
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

export function orderClaimShapeIdsForElk(model: DraftLayoutModel): string[] {
    const connectorShapeIdsBySourceClaimShapeId: Record<string, string[]> = {};
    for (const connectorShape of Object.values(model.connectorShapes)) {
        (connectorShapeIdsBySourceClaimShapeId[connectorShape.sourceClaimShapeId] ??= []).push(connectorShape.id);
    }

    const preferredConnectorShapeIdBySourceClaimShapeId: Record<string, string> = {};
    for (const [sourceClaimShapeId, connectorShapeIds] of Object.entries(connectorShapeIdsBySourceClaimShapeId)) {
        const sortedConnectorShapeIds = [...connectorShapeIds].sort((a, b) => compareConnectorPreference(model, a, b));
        if (sortedConnectorShapeIds.length > 0) {
            preferredConnectorShapeIdBySourceClaimShapeId[sourceClaimShapeId] = sortedConnectorShapeIds[0];
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
            const connectorOrder = compareConnectorPreference(model, preferredConnectorShapeIdA, preferredConnectorShapeIdB);
            if (connectorOrder !== 0) return connectorOrder;
        } else if (preferredConnectorShapeIdA) {
            return -1;
        } else if (preferredConnectorShapeIdB) {
            return 1;
        }

        return claimShapeIdA.localeCompare(claimShapeIdB);
    });
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

function sourceConfidence(model: ConnectorOrderingModel, sourceClaimShapeId: string): number {
    return model.claimShapes[sourceClaimShapeId]?.score?.confidence ?? 1;
}