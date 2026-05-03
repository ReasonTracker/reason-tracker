import type { DebateCommand } from "../debate-core/Commands.ts";
import type { Snapshot } from "./Snapshot.ts";

export type PlannerInput = {
    snapshot: Snapshot
    command: DebateCommand
};

const plannersByCommandType: Partial<Record<DebateCommand["type"], (input: PlannerInput) => Snapshot[]>> = {
    "claim/add": planAddClaim,
};

export function planner(input: PlannerInput): Snapshot[] {
    return plannersByCommandType[input.command.type]?.(input) ?? [input.snapshot];
}

function planAddClaim(input: PlannerInput): Snapshot[] {
    if (input.command.type !== "claim/add") {
        return [input.snapshot];
    }



    return [input.snapshot];
}