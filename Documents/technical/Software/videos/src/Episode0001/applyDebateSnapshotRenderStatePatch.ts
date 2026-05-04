import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";

export function applyDebateSnapshotRenderStatePatch(
    baseState: DebateSnapshotRenderState,
    patch: {
        debateCore?: Omit<Partial<DebateSnapshotRenderState["debateCore"]>, "claims" | "connectors"> & {
            claims?: Partial<DebateSnapshotRenderState["debateCore"]["claims"]>;
            connectors?: Partial<DebateSnapshotRenderState["debateCore"]["connectors"]>;
        };
        snapshot?: Partial<DebateSnapshotRenderState["snapshot"]>;
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
        snapshot: mergeRecord(baseState.snapshot, patch.snapshot),
    };
}

function mergeRecord<K extends string | number | symbol, V>(
    baseRecord: Record<K, V>,
    patchRecord: Partial<Record<K, V>> | undefined,
): Record<K, V> {
    return {
        ...baseRecord,
        ...(patchRecord ?? {}),
    } as Record<K, V>;
}