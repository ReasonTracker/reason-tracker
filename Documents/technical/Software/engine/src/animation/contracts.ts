import type { DebateCommand } from "../debate-core/Commands.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type { PlannerOptions } from "../animationContracts.ts";
import type { Point } from "../geometry/Point.ts";
import { calculateConnectorCorridor } from "../geometry/calculateConnectorCorridor.ts";

export type { PlannerOptions } from "../animationContracts.ts";

export const defaultPlannerOptions: PlannerOptions = {
    claimLaneAxisGap: 50,
    connectorStraightShare: 0.5,
    claimWidth: 360,
    claimHeight: 176,
};

export function resolvePlannerOptions(options?: Partial<PlannerOptions>): PlannerOptions {
    const resolved = {
        ...defaultPlannerOptions,
        ...options,
    };
    calculateConnectorCorridor({ bendRun: 0, straightShare: resolved.connectorStraightShare });
    return resolved;
}

// #endregion

// #region Planner boundary
export interface PlannerInput {
    debateCore: DebateCore
    command: DebateCommand
    origin?: Point
    options?: Partial<PlannerOptions>
}

// #endregion