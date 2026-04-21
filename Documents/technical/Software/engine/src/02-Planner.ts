import type { EngineCommand } from "./01-Commands.ts";
import type { Debate } from "./00-entities/Debate.ts";
import type { PlannerResult } from "./03-Operations.ts";


export interface Planner {
    translate(commands: readonly EngineCommand[], debate: Debate): readonly PlannerResult[];
}


