/**
 * Expands a type so that all properties from intersections (&) are shown directly in tooltips and hovers.
 */
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export interface WhenPctProps {
    /** When the tween should start (as a percent of the step, from 0 to 1). For example, 0.2 means the tween starts when 20% of the step is done. */
    startPct?: number;
    /** When the tween should stop (as a percent of the step, from 0 to 1). For example, 0.8 means the tween ends when 80% of the step is done. */
    endPct?: number;
}

export type TweenBoolean = boolean | Expand<{
    type: "tween/boolean";
    from: boolean;
    to: boolean;
} & WhenPctProps>;


// Internal: TweenNumber without startPct/endPct (for use in TweenPoint)
export type TweenNumberBase = number | {
    type: "tween/number";
    from: number;
    to: number;
};


export type TweenNumber = TweenNumberBase | Expand<{
    type: "tween/number";
    from: number;
    to: number;
} & WhenPctProps>;

export type TweenPoint = Expand<{
    x: TweenNumberBase;
    y: TweenNumberBase;
} & WhenPctProps>;


export type PartialExceptId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id?: T["id"]; };

export type PatchWithRequiredId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id: T["id"]; };

