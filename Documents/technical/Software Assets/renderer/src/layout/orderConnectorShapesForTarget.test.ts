import { describe, expect, it } from "vitest";
import { orderConnectorShapeIdsForTarget } from "./orderConnectorShapesForTarget.ts";
import { layoutEdgeToTarget, positionedLayoutModel, positionedLayoutNode } from "./testLayoutBuilders.ts";
import type { PositionedLayoutModel } from "./types.ts";

// Test fixture naming rule: every fixture string must include the literal token "id" (for example claim-id:* and connector-id:*).

function orderedConnectorAndSourceClaimPairs(
    model: PositionedLayoutModel,
    orderedConnectorShapeIds: string[],
): Array<{ connectorShapeId: string; sourceClaimShapeId: string }> {
    return orderedConnectorShapeIds.map((connectorShapeId) => {
        const connectorShape = model.connectorShapes[connectorShapeId];
        return {
            connectorShapeId,
            sourceClaimShapeId: connectorShape?.sourceClaimShapeId ?? "",
        };
    });
}

describe("orderConnectorShapeIdsForTarget", () => {
    it("orders by source center y from ELK output first", () => {
        const model = positionedLayoutModel(
            {
                target: positionedLayoutNode("target", "proMain", 1, 100),
                "claim-id:pro:upper": positionedLayoutNode("claim-id:pro:upper", "proMain", 0.5, 60),
                "claim-id:con:top": positionedLayoutNode("claim-id:con:top", "conMain", 0.9, 20),
                "claim-id:pro:lower": positionedLayoutNode("claim-id:pro:lower", "proMain", 0.4, 140),
            },
            {
                "connector-id:con:top": layoutEdgeToTarget("connector-id:con:top", "claim-id:con:top", "conTarget"),
                "connector-id:pro:upper": layoutEdgeToTarget("connector-id:pro:upper", "claim-id:pro:upper", "proTarget"),
                "connector-id:pro:lower": layoutEdgeToTarget("connector-id:pro:lower", "claim-id:pro:lower", "proTarget"),
            },
        );

        const result = orderConnectorShapeIdsForTarget(model, [
            "connector-id:con:top",
            "connector-id:pro:upper",
            "connector-id:pro:lower",
        ]);

        expect(orderedConnectorAndSourceClaimPairs(model, result)).toEqual([
            {
                connectorShapeId: "connector-id:con:top",
                sourceClaimShapeId: "claim-id:con:top",
            },
            {
                connectorShapeId: "connector-id:pro:upper",
                sourceClaimShapeId: "claim-id:pro:upper",
            },
            {
                connectorShapeId: "connector-id:pro:lower",
                sourceClaimShapeId: "claim-id:pro:lower",
            },
        ]);
    });

    it("keeps y-based order even when confidence suggests a different order", () => {
        const model = positionedLayoutModel(
            {
                target: positionedLayoutNode("target", "proMain", 1, 100),
                "claim-id:pro:high-confidence": positionedLayoutNode("claim-id:pro:high-confidence", "proMain", 0.95, 200),
                "claim-id:pro:low-confidence": positionedLayoutNode("claim-id:pro:low-confidence", "proMain", 0.25, 40),
                "claim-id:pro:mid-confidence": positionedLayoutNode("claim-id:pro:mid-confidence", "proMain", 0.7, 120),
            },
            {
                "connector-id:pro:low-confidence": layoutEdgeToTarget("connector-id:pro:low-confidence", "claim-id:pro:low-confidence", "proTarget"),
                "connector-id:pro:high-confidence": layoutEdgeToTarget("connector-id:pro:high-confidence", "claim-id:pro:high-confidence", "proTarget"),
                "connector-id:pro:mid-confidence": layoutEdgeToTarget("connector-id:pro:mid-confidence", "claim-id:pro:mid-confidence", "proTarget"),
            },
        );

        const result = orderConnectorShapeIdsForTarget(model, [
            "connector-id:pro:low-confidence",
            "connector-id:pro:high-confidence",
            "connector-id:pro:mid-confidence",
        ]);

        expect(orderedConnectorAndSourceClaimPairs(model, result)).toEqual([
            {
                connectorShapeId: "connector-id:pro:low-confidence",
                sourceClaimShapeId: "claim-id:pro:low-confidence",
            },
            {
                connectorShapeId: "connector-id:pro:mid-confidence",
                sourceClaimShapeId: "claim-id:pro:mid-confidence",
            },
            {
                connectorShapeId: "connector-id:pro:high-confidence",
                sourceClaimShapeId: "claim-id:pro:high-confidence",
            },
        ]);
    });

    it("uses relation and confidence preference only when y values tie", () => {
        const model = positionedLayoutModel(
            {
                target: positionedLayoutNode("target", "proMain", 1, 100),
                "claim-id:pro:high": positionedLayoutNode("claim-id:pro:high", "proMain", 0.9, 80),
                "claim-id:pro:low": positionedLayoutNode("claim-id:pro:low", "proMain", 0.2, 80),
                "claim-id:con:high": positionedLayoutNode("claim-id:con:high", "conMain", 0.95, 80),
            },
            {
                "connector-id:con:high": layoutEdgeToTarget("connector-id:con:high", "claim-id:con:high", "conTarget"),
                "connector-id:pro:low": layoutEdgeToTarget("connector-id:pro:low", "claim-id:pro:low", "proTarget"),
                "connector-id:pro:high": layoutEdgeToTarget("connector-id:pro:high", "claim-id:pro:high", "proTarget"),
            },
        );

        const result = orderConnectorShapeIdsForTarget(model, [
            "connector-id:con:high",
            "connector-id:pro:low",
            "connector-id:pro:high",
        ]);

        expect(orderedConnectorAndSourceClaimPairs(model, result)).toEqual([
            {
                connectorShapeId: "connector-id:pro:high",
                sourceClaimShapeId: "claim-id:pro:high",
            },
            {
                connectorShapeId: "connector-id:pro:low",
                sourceClaimShapeId: "claim-id:pro:low",
            },
            {
                connectorShapeId: "connector-id:con:high",
                sourceClaimShapeId: "claim-id:con:high",
            },
        ]);
    });
});
