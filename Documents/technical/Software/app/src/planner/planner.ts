import type { Planner, PlannerInput } from "./contracts.ts";
import type { Snapshot } from "./Snapshot.ts";

const plannersByCommandType: Partial<Record<PlannerInput["command"]["type"], Planner>> = {
    "claim/add": planAddClaim,
};

export const planner: Planner = (input) => {
    return plannersByCommandType[input.command.type]?.(input) ?? [input.snapshot];
};

function planAddClaim(input: PlannerInput): Snapshot[] {
    if (input.command.type !== "claim/add") {
        return [input.snapshot];
    }



    return [input.snapshot];
}