import { test } from "vitest";

import { sampleDebateCore, sampleSnapshot } from "./sampleDebateState.ts";
import { planner } from "./planner.ts";
import type { PlannerInput } from "./planner.ts";

test("logs the current planner result for claim/add", () => {
    const input: PlannerInput = {
        debateCore: sampleDebateCore,
        snapshot: sampleSnapshot,
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

    console.log(JSON.stringify(result, null, 2));
});