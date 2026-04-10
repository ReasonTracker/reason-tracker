import { compareConnectorPreference } from "./ordering.ts";
import type { PositionedLayoutModel } from "./types.ts";

export function orderConnectorShapeIdsForTarget(
    model: PositionedLayoutModel,
    connectorShapeIds: string[],
): string[] {
    return [...connectorShapeIds].sort((a, b) => {
        const connectorShapeA = model.connectorShapes[a];
        const connectorShapeB = model.connectorShapes[b];
        if (!connectorShapeA || !connectorShapeB) return a.localeCompare(b);

        const sourceClaimShapeA = model.claimShapes[connectorShapeA.sourceClaimShapeId];
        const sourceClaimShapeB = model.claimShapes[connectorShapeB.sourceClaimShapeId];
        if (!sourceClaimShapeA || !sourceClaimShapeB) return a.localeCompare(b);

        const sourceYOrder = (sourceClaimShapeA.y + sourceClaimShapeA.height / 2)
            - (sourceClaimShapeB.y + sourceClaimShapeB.height / 2);
        if (sourceYOrder !== 0) return sourceYOrder;

        const preferenceOrder = compareConnectorPreference(model, a, b);
        if (preferenceOrder !== 0) return preferenceOrder;

        return a.localeCompare(b);
    });
}
