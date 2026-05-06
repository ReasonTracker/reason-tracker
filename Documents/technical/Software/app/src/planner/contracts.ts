import type { DebateCommand } from "../debate-core/Commands.ts";
import type { DebateCore } from "../debate-core/Debate.ts";
import type { Snapshot } from "./Snapshot.ts";

// #region Planner options
export interface PlannerOptions {
    /** Horizontal spacing between one claim lane and the next claim lane. */
    claimLaneSpacing: number
    /** Vertical distance between sibling claims within the same layer. */
    claimSpacing: number
    /** Size reserved for the junction lane when that lane is present. */
    junctionLaneSize: number
    /** Size reserved for the connector curve lane. */
    connectorCurveLaneSize: number
    /** Size reserved for the connector diagonal lane. */
    connectorDiagonalLaneSize: number
    /** Claim width used when resolving claim edges from claim centers. */
    claimWidth: number
    /** Claim height used for claim bounds and derived pipe width. */
    claimHeight: number
    /** Outward depth for delivery and relevance aggregators. */
    aggregatorDepth: number
    /** Junction width as a multiple of the incoming claim size used to form that junction. */
    junctionWidthFromIncomingClaimSize: number
}

export const defaultPlannerOptions: PlannerOptions = {
    claimLaneSpacing: 500,
    claimSpacing: 100,
    junctionLaneSize: 500,
    connectorCurveLaneSize: 100,
    connectorDiagonalLaneSize: 100,
    claimWidth: 360,
    claimHeight: 176,
    aggregatorDepth: 36,
    junctionWidthFromIncomingClaimSize: 1,
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
    snapshot: Snapshot
    command: DebateCommand
    options?: Partial<PlannerOptions>
}

export type PlannerOutput = Snapshot[];

export type Planner = (input: PlannerInput) => PlannerOutput;

// #endregion