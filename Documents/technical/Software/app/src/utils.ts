export type PartialExceptId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id?: T["id"]; };

export type PatchWithRequiredId<T extends { id: unknown; }> = Partial<Omit<T, "id">> & { id: T["id"]; };

