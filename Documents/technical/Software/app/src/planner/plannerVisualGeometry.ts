// AGENT NOTE: Keep planner visual size math here so layout and rendering share
// one owned contract for claim and connector dimensions.
/** Base width of a claim card before source-scale attenuation is applied. */
export const PLANNER_BASE_CLAIM_WIDTH_PX = 360;
/** Base height of a claim card before source-scale attenuation is applied. */
export const PLANNER_BASE_CLAIM_HEIGHT_PX = 176;
/** Full-size horizontal distance between one claim column and the next. */
export const PLANNER_BASE_HORIZONTAL_GAP_PX = 500;
/** Full-size vertical distance between sibling subtree blocks. */
export const PLANNER_BASE_VERTICAL_GAP_PX = 100;
/** Leftward claim-to-aggregator offset at full claim scale. */
export const PLANNER_BASE_CLAIM_AGGREGATOR_OFFSET_X_PX = 36;

export function clampPlannerVisualScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1;
    }

    return Math.min(1, Math.max(0, scale));
}

export function getPlannerScaledDistance(distance: number, scale: number): number {
    return Math.round(distance * clampPlannerVisualScale(scale));
}

export function getPlannerClaimWidth(scale: number): number {
    return getPlannerScaledDistance(PLANNER_BASE_CLAIM_WIDTH_PX, scale);
}

export function getPlannerClaimHeight(scale: number): number {
    return getPlannerScaledDistance(PLANNER_BASE_CLAIM_HEIGHT_PX, scale);
}

export function getPlannerPipeWidth(scale: number): number {
    return getPlannerClaimHeight(scale);
}

export function getPlannerHorizontalGap(scale: number, multiplier = 1): number {
    return getPlannerScaledDistance(PLANNER_BASE_HORIZONTAL_GAP_PX * multiplier, scale);
}

export function getPlannerVerticalGap(scale: number): number {
    return getPlannerScaledDistance(PLANNER_BASE_VERTICAL_GAP_PX, scale);
}

export function getPlannerClaimAggregatorOffsetX(scale: number): number {
    return getPlannerScaledDistance(PLANNER_BASE_CLAIM_AGGREGATOR_OFFSET_X_PX, scale);
}