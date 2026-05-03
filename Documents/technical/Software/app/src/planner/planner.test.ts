import { test } from "vitest";

import { planner } from "./planner.ts";
import type { PlannerInput } from "./planner.ts";
import type { Snapshot } from "./Snapshot.ts";

test("logs the current planner result for claim/add", () => {
    const snapshot: Snapshot = {
        claims: {},
        claimAggregators: {},
        junctions: {},
        junctionAggregators: {},
        confidenceConnectors: {},
        deliveryConnectors: {},
        relevanceConnectors: {},
    };

    const input: PlannerInput = {
        snapshot,
        command: {
            type: "claim/add",
            claim: {
                content: "Example child claim",
            },
            connection: {
                type: "confidence",
                targetRelationship: "proTarget",
            },
        },
    };

    const result = planner(input);

    // console.log("Planner input:");
    // console.log(JSON.stringify(input, null, 2));
    // console.log("Planner result:");
    console.log(JSON.stringify(result, null, 2));
});