import type { DebateCommand } from "../debate-core/Commands.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type { Snapshot } from "./Snapshot.ts";

// #region Planner options
export interface PlannerOptions {
    /** Edge-to-edge gap between sibling claim boxes along a claim lane's lane axis. This gap resolves at local `sourcesScale`. */
    claimLaneAxisGap: number
    /** Width reserved for the junction lane on the cross-lane axis when that lane is present. */
    junctionLaneWidth: number
    /** Width reserved for the connector curve lane on the cross-lane axis. */
    connectorCurveLaneWidth: number
    /** Width reserved for the connector diagonal lane on the cross-lane axis. */
    connectorDiagonalLaneWidth: number
    /** Claim width used when resolving claim edges from claim centers. */
    claimWidth: number
    /** Claim height used for claim bounds and derived pipe width. */
    claimHeight: number
    /** Outward depth for delivery and relevance aggregators. */
    aggregatorDepth: number
}

export const defaultPlannerOptions: PlannerOptions = {
    claimLaneAxisGap: 100,
    junctionLaneWidth: 100,
    connectorCurveLaneWidth: 100,
    connectorDiagonalLaneWidth: 100,
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