import type { DebateCommand } from "../debate-core/Commands.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type { Point } from "../geometry/Point.ts";
import { calculateConnectorCorridor } from "../geometry/calculateConnectorCorridor.ts";

// #region Planner options
export interface PlannerOptions {
    /** Edge-to-edge gap between sibling claim boxes along a claim lane's lane axis. This gap resolves at local `sourcesScale`. */
    claimLaneAxisGap: number
    /**
     * Fraction of the connector column reserved for its central straight section.
     * The remaining width is divided equally between the two endpoint bends.
     */
    connectorStraightShare: number
    /** Claim width used when resolving claim edges from claim centers. */
    claimWidth: number
    /** Claim height used for claim bounds and derived pipe width. */
    claimHeight: number
}

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