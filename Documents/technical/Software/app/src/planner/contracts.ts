import type { DebateCommand } from "../debate-core/Commands.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type { Snapshot } from "./Snapshot.ts";

// #region Planner options
export interface PlannerOptions {
    /** Edge-to-edge gap between sibling claim boxes along a claim lane's lane axis. This gap resolves at local `sourcesScale`. */
    claimLaneAxisGap: number
    /** Additional cross-lane breathing room added after minimum geometry and separation requirements are satisfied. */
    crossLaneExtraGap: number
    /** Claim width used when resolving claim edges from claim centers. */
    claimWidth: number
    /** Claim height used for claim bounds and derived pipe width. */
    claimHeight: number
    /** Outward depth for delivery and relevance aggregators. */
    aggregatorDepth: number
}

export const defaultPlannerOptions: PlannerOptions = {
    claimLaneAxisGap: 50,
    crossLaneExtraGap: 50,
    claimWidth: 360,
    claimHeight: 176,
    aggregatorDepth: 36,
};

export function resolvePlannerOptions(options?: Partial<PlannerOptions>): PlannerOptions {
    return {
        ...defaultPlannerOptions,
        ...options,
    };
}

// #endregion

// #region Planner boundary
export interface PlannerInput {
    debateCore: DebateCore
    command: DebateCommand
    options?: Partial<PlannerOptions>
}

export type PlannerOutput = Snapshot[];

export type Planner = (input: PlannerInput) => PlannerOutput;

// #endregion