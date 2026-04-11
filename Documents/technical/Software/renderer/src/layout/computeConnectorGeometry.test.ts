import { describe, expect, it } from "vitest";
import { withConnectorGeometry } from "./computeConnectorGeometry.ts";
import { connectorShapeToTarget, placedLayoutModel, placedClaimShape } from "./testLayoutBuilders.ts";

describe("withConnectorGeometry", () => {
    it("distributes leftover target height evenly between incoming connectors", () => {
        const model = placedLayoutModel(
            {
                target: placedClaimShape("target", "proMain", 1, 100, 100),
                "claim-id:a": placedClaimShape("claim-id:a", "proMain", 0.25, 20),
                "claim-id:b": placedClaimShape("claim-id:b", "proMain", 0.25, 160),
            },
            {
                "connector-id:a": connectorShapeToTarget("connector-id:a", "claim-id:a", "proTarget"),
                "connector-id:b": connectorShapeToTarget("connector-id:b", "claim-id:b", "proTarget"),
            },
        );

        const result = withConnectorGeometry(model.claimShapes, model.connectorShapes);

        expect(result["connector-id:a"].geometry?.targetSideY).toBeCloseTo(120, 10);
        expect(result["connector-id:b"].geometry?.targetSideY).toBeCloseTo(180, 10);
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

    it("uses potential-confidence padding only on outer boundaries", () => {
        const model = placedLayoutModel(
            {
                target: placedClaimShape("target", "proMain", 1, 100, 100),
                "claim-id:a": placedClaimShape("claim-id:a", "proMain", 0.5, 20, 40),
                "claim-id:b": placedClaimShape("claim-id:b", "proMain", 0.5, 160, 40),
            },
            {
                "connector-id:a": connectorShapeToTarget("connector-id:a", "claim-id:a", "proTarget"),
                "connector-id:b": connectorShapeToTarget("connector-id:b", "claim-id:b", "proTarget"),
            },
        );

        const result = withConnectorGeometry(model.claimShapes, model.connectorShapes);
        const first = result["connector-id:a"].geometry;
        const last = result["connector-id:b"].geometry;

        expect(first?.targetSideY).toBeCloseTo(120, 10);
        expect(last?.targetSideY).toBeCloseTo(180, 10);

        const targetTop = model.claimShapes.target.y;
        const targetBottom = model.claimShapes.target.y + model.claimShapes.target.height;
        const firstPotentialTop = (first?.targetSideY ?? 0) - (first?.referenceStrokeWidth ?? 0) / 2;
        const lastPotentialBottom = (last?.targetSideY ?? 0) + (last?.referenceStrokeWidth ?? 0) / 2;
        expect(firstPotentialTop).toBeCloseTo(targetTop, 10);
        expect(lastPotentialBottom).toBeCloseTo(targetBottom, 10);
    });
});
