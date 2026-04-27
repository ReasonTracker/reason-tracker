export type TweenBoolean = boolean | {
    type: "tween/boolean";
    from: boolean;
    to: boolean;
};

export type TweenNumber = number | {
    type: "tween/number";
    from: number;
    to: number;
};

export interface TweenPoint {
    x: TweenNumber
    y: TweenNumber
};

export type PartialExceptId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id?: T["id"]; };

export type PatchWithRequiredId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id: T["id"]; };

