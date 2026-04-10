import { describe, expect, it } from "vitest";
import { withConnectorGeometry } from "./computeConnectorGeometry.ts";
import { connectorShapeToTarget, placedLayoutModel, placedClaimShape } from "./testLayoutBuilders.ts";

describe("withConnectorGeometry", () => {
    it("distributes leftover target height evenly between incoming connectors", () => {
        const model = placedLayoutModel(
            {
                target: placedClaimShape("target", "proMain", 1, 100),
                "claim-id:a": placedClaimShape("claim-id:a", "proMain", 0.25, 20),
                "claim-id:b": placedClaimShape("claim-id:b", "proMain", 0.25, 160),
            },
            {
                "connector-id:a": connectorShapeToTarget("connector-id:a", "claim-id:a", "proTarget"),
                "connector-id:b": connectorShapeToTarget("connector-id:b", "claim-id:b", "proTarget"),
            },
        );

        const result = withConnectorGeometry(model.claimShapes, model.connectorShapes);

        expect(result["connector-id:a"].geometry?.targetSideY).toBeCloseTo(105, 10);
        expect(result["connector-id:b"].geometry?.targetSideY).toBeCloseTo(135, 10);
    });

    it("keeps connector stacking gap at zero when incoming stack is taller than target", () => {
        const model = placedLayoutModel(
            {
                target: placedClaimShape("target", "proMain", 1, 100),
                "claim-id:a": placedClaimShape("claim-id:a", "proMain", 1, 20),
                "claim-id:b": placedClaimShape("claim-id:b", "proMain", 1, 160),
            },
            {
                "connector-id:a": connectorShapeToTarget("connector-id:a", "claim-id:a", "proTarget"),
                "connector-id:b": connectorShapeToTarget("connector-id:b", "claim-id:b", "proTarget"),
            },
        );

        const result = withConnectorGeometry(model.claimShapes, model.connectorShapes);

        expect(result["connector-id:a"].geometry?.targetSideY).toBeCloseTo(100, 10);
        expect(result["connector-id:b"].geometry?.targetSideY).toBeCloseTo(140, 10);
    });
});
