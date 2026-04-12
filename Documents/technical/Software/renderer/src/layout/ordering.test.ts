import { describe, expect, it } from "vitest";
import { compareConnectorPreference, sortDraftLayoutModel } from "./ordering.ts";
import { connectorShapeToTarget, layoutModel, claimShape } from "./testLayoutBuilders.ts";

// Test fixture naming rule: every fixture string must include the literal token "id" (for example claim-id:* and connector-id:*).

function orderedConnectorAndSourceClaimPairs(
    connectorIds: string[],
    compare: (a: string, b: string) => number,
    sourceClaimShapeIdByConnectorId: Record<string, string>,
): Array<{ connectorId: string; sourceClaimShapeId: string }> {
    return [...connectorIds]
        .sort(compare)
        .map((connectorId) => ({
            connectorId,
            sourceClaimShapeId: sourceClaimShapeIdByConnectorId[connectorId] ?? "",
        }));
}

describe("layout ordering shared preference", () => {
    it("prefers matching relation before opposing relation", () => {
        const inputModel = layoutModel(
            {
                target: claimShape("target", 1, 0),
                "claim-id:pro:match": claimShape("claim-id:pro:match", 0.2, 1),
                "claim-id:con:oppose": claimShape("claim-id:con:oppose", 0.9, 1),
            },
            {
                "connector-id:pro:match": connectorShapeToTarget("connector-id:pro:match", "claim-id:pro:match", "proTarget"),
                "connector-id:con:oppose": connectorShapeToTarget("connector-id:con:oppose", "claim-id:con:oppose", "conTarget"),
            },
        );

        const ordered = orderedConnectorAndSourceClaimPairs(
            ["connector-id:con:oppose", "connector-id:pro:match"],
            (a, b) => compareConnectorPreference(inputModel, a, b),
            {
                "connector-id:pro:match": "claim-id:pro:match",
                "connector-id:con:oppose": "claim-id:con:oppose",
            },
        );

        expect(ordered).toEqual([
            {
                connectorId: "connector-id:pro:match",
                sourceClaimShapeId: "claim-id:pro:match",
            },
            {
                connectorId: "connector-id:con:oppose",
                sourceClaimShapeId: "claim-id:con:oppose",
            },
        ]);
    });

    it("prefers higher confidence within same relation", () => {
        const inputModel = layoutModel(
            {
                target: claimShape("target", 1, 0),
                "claim-id:pro:high-confidence": claimShape("claim-id:pro:high-confidence", 0.9, 1),
                "claim-id:pro:low-confidence": claimShape("claim-id:pro:low-confidence", 0.3, 1),
            },
            {
                "connector-id:pro:high-confidence": connectorShapeToTarget("connector-id:pro:high-confidence", "claim-id:pro:high-confidence", "proTarget"),
                "connector-id:pro:low-confidence": connectorShapeToTarget("connector-id:pro:low-confidence", "claim-id:pro:low-confidence", "proTarget"),
            },
        );

        const ordered = orderedConnectorAndSourceClaimPairs(
            ["connector-id:pro:low-confidence", "connector-id:pro:high-confidence"],
            (a, b) => compareConnectorPreference(inputModel, a, b),
            {
                "connector-id:pro:high-confidence": "claim-id:pro:high-confidence",
                "connector-id:pro:low-confidence": "claim-id:pro:low-confidence",
            },
        );

        expect(ordered).toEqual([
            {
                connectorId: "connector-id:pro:high-confidence",
                sourceClaimShapeId: "claim-id:pro:high-confidence",
            },
            {
                connectorId: "connector-id:pro:low-confidence",
                sourceClaimShapeId: "claim-id:pro:low-confidence",
            },
        ]);
    });

    it("orders ELK claim inputs by depth then shared connector preference", () => {
        const inputModel = layoutModel(
            {
                target: claimShape("target", 1, 0),
                "claim-id:pro:high": claimShape("claim-id:pro:high", 0.9, 1),
                "claim-id:pro:low": claimShape("claim-id:pro:low", 0.2, 1),
                "claim-id:con:high": claimShape("claim-id:con:high", 0.95, 1),
            },
            {
                "connector-id:con:high": connectorShapeToTarget("connector-id:con:high", "claim-id:con:high", "conTarget"),
                "connector-id:pro:low": connectorShapeToTarget("connector-id:pro:low", "claim-id:pro:low", "proTarget"),
                "connector-id:pro:high": connectorShapeToTarget("connector-id:pro:high", "claim-id:pro:high", "proTarget"),
            },
        );

        expect(sortDraftLayoutModel(inputModel).claimShapeIds).toEqual([
            "target",
            "claim-id:pro:high",
            "claim-id:pro:low",
            "claim-id:con:high",
        ]);
    });

    it("keeps preserve-input order within relation buckets", () => {
        const inputModel = layoutModel(
            {
                target: claimShape("target", 1, 0),
                "claim-id:pro:first": claimShape("claim-id:pro:first", 0.2, 1),
                "claim-id:con:last": claimShape("claim-id:con:last", 0.9, 1),
                "claim-id:pro:inserted": claimShape("claim-id:pro:inserted", 0.1, 1),
            },
            {
                "connector-id:pro:first": connectorShapeToTarget("connector-id:pro:first", "claim-id:pro:first", "proTarget"),
                "connector-id:con:last": connectorShapeToTarget("connector-id:con:last", "claim-id:con:last", "conTarget"),
                "connector-id:pro:inserted": connectorShapeToTarget("connector-id:pro:inserted", "claim-id:pro:inserted", "proTarget"),
            },
        );

        expect(sortDraftLayoutModel(inputModel, "preserve-input")).toEqual({
            connectorShapeIds: [
                "connector-id:pro:first",
                "connector-id:pro:inserted",
                "connector-id:con:last",
            ],
            claimShapeIds: [
                "target",
                "claim-id:pro:first",
                "claim-id:pro:inserted",
                "claim-id:con:last",
            ],
        });
    });
});