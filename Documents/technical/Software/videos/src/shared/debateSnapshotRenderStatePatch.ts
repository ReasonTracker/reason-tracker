import type { PatchWithRequiredId } from "@app/utils.ts";
import type { VizItem, VizItemId } from "@planner/Snapshot.ts";

import type { DebateSnapshotRenderState } from "./debate-render/renderTypes";

type SnapshotPatchItem<T extends VizItem = VizItem> = T extends { id: unknown }
    ? PatchWithRequiredId<T>
    : never;

export function applyDebateSnapshotRenderStatePatch(
    baseState: DebateSnapshotRenderState,
    patch: {
        debateCore?: Omit<Partial<DebateSnapshotRenderState["debateCore"]>, "claims" | "connectors"> & {
            claims?: Partial<DebateSnapshotRenderState["debateCore"]["claims"]>;
            connectors?: Partial<DebateSnapshotRenderState["debateCore"]["connectors"]>;
        };
        snapshot?: Partial<Record<VizItemId, SnapshotPatchItem>>;
    },
): DebateSnapshotRenderState {
    return {
        debateCore: patch.debateCore
            ? {
                ...baseState.debateCore,
                ...patch.debateCore,
                claims: mergeRecord(baseState.debateCore.claims, patch.debateCore.claims),
                connectors: mergeRecord(baseState.debateCore.connectors, patch.debateCore.connectors),
            }
            : baseState.debateCore,
        plannerOptions: baseState.plannerOptions,
        snapshot: mergePatchedRecord(baseState.snapshot, patch.snapshot),
    };
}

export function stripDebateSnapshotRenderStateAnimations(
    renderState: DebateSnapshotRenderState,
): DebateSnapshotRenderState {
    return stripAnimationValue(renderState);
}

function mergeRecord<K extends string | number | symbol, V>(
    baseRecord: Record<K, V>,
    patchRecord: Partial<Record<K, V>> | undefined,
): Record<K, V> {
    return {
        ...baseRecord,
        ...patchRecord,
    } as Record<K, V>;
}

function mergePatchedRecord<K extends string | number | symbol, V extends { id: unknown }>(
    baseRecord: Record<K, V>,
    patchRecord: Partial<Record<K, PatchWithRequiredId<V>>> | undefined,
): Record<K, V> {
    if (!patchRecord) {
        return baseRecord;
    }

    const result = { ...baseRecord };

    for (const [rawKey, patchValue] of Object.entries(patchRecord) as Array<[string, PatchWithRequiredId<V> | undefined]>) {
        if (!patchValue) {
            continue;
        }

        const key = rawKey as K;
        const baseValue = result[key];

        result[key] = (baseValue
            ? { ...baseValue, ...patchValue }
            : patchValue) as V;
    }

    return result;
}

function stripAnimationValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((entry) => stripAnimationValue(entry)) as T;
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    if (isTweenValue(value)) {
        return stripAnimationValue(value.to) as T;
    }

    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
        if (key === "startPct" || key === "endPct") {
            continue;
        }

        result[key] = stripAnimationValue(entry);
    }

    return result as T;
}

function isTweenValue(value: object): value is { to: unknown; type: "tween/boolean" | "tween/number" } {
    return "type" in value
        && "to" in value
        && (value.type === "tween/boolean" || value.type === "tween/number");
}