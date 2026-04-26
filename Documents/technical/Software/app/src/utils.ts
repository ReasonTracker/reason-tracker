export type Tween = number | {
    type: "tween";
    from: number;
    to: number;
    kind: "Progressive" | "Uniform"
};

export type PartialExceptId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id?: T["id"]; };

export type PatchWithRequiredId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id: T["id"]; };

