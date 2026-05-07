import type { Planner, PlannerInput } from "./contracts.ts";
import type { Snapshot } from "./Snapshot.ts";

const plannersByCommandType: Partial<Record<PlannerInput["command"]["type"], Planner>> = {
    "confidence/claim/add": planAddConfidenceClaim,
};

export const planner: Planner = (input) => {
    return plannersByCommandType[input.command.type]?.(input) ?? [input.snapshot];
};

function planAddConfidenceClaim(input: PlannerInput): Snapshot[] {
    if (input.command.type !== "confidence/claim/add") {
        return [input.snapshot];
    }



    return [input.snapshot];
}