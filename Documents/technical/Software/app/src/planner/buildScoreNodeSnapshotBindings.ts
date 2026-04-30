import type { ScoreNodeId } from "../math/scoreTypes.ts";
import type { Snapshot } from "./Snapshot.ts";
import type { ScoreNodeSnapshotBindings } from "./buildScoreWaveTimeline.ts";

/**
 * Rebuilds score-node-to-snapshot bindings from a snapshot that carries
 * score-node metadata on its projected visual entities.
 */
export function buildScoreNodeSnapshotBindings(
    snapshot: Snapshot,
): Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>> {
    const bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>> = {};

    for (const claim of Object.values(snapshot.claims)) {
        if (!claim.scoreNodeId) {
            continue;
        }

        pushBinding(bindingsByScoreNodeId, claim.scoreNodeId, "claimVizIds", claim.id);
    }

    for (const claimAggregator of Object.values(snapshot.claimAggregators)) {
        if (!claimAggregator.scoreNodeId) {
            continue;
        }

        pushBinding(
            bindingsByScoreNodeId,
            claimAggregator.scoreNodeId,
            "claimAggregatorVizIds",
            claimAggregator.id,
        );
    }

    for (const junction of Object.values(snapshot.junctions)) {
        if (!junction.scoreNodeId) {
            continue;
        }

        pushBinding(bindingsByScoreNodeId, junction.scoreNodeId, "junctionVizIds", junction.id);
    }

    for (const junctionAggregator of Object.values(snapshot.junctionAggregators)) {
        if (!junctionAggregator.scoreNodeId) {
            continue;
        }

        pushBinding(
            bindingsByScoreNodeId,
            junctionAggregator.scoreNodeId,
            "junctionAggregatorVizIds",
            junctionAggregator.id,
        );
    }

    for (const confidenceConnector of Object.values(snapshot.confidenceConnectors)) {
        if (!confidenceConnector.scoreNodeId) {
            continue;
        }

        pushBinding(
            bindingsByScoreNodeId,
            confidenceConnector.scoreNodeId,
            "confidenceConnectorVizIds",
            confidenceConnector.id,
        );
    }

    for (const deliveryConnector of Object.values(snapshot.deliveryConnectors)) {
        if (!deliveryConnector.scoreNodeId) {
            continue;
        }

        pushBinding(
            bindingsByScoreNodeId,
            deliveryConnector.scoreNodeId,
            "deliveryConnectorVizIds",
            deliveryConnector.id,
        );
    }

    for (const relevanceConnector of Object.values(snapshot.relevanceConnectors)) {
        if (!relevanceConnector.scoreNodeId) {
            continue;
        }

        pushBinding(
            bindingsByScoreNodeId,
            relevanceConnector.scoreNodeId,
            "relevanceConnectorVizIds",
            relevanceConnector.id,
        );
    }

    return bindingsByScoreNodeId;
}

function pushBinding<TKey extends keyof ScoreNodeSnapshotBindings>(
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    scoreNodeId: ScoreNodeId,
    key: TKey,
    value: NonNullable<ScoreNodeSnapshotBindings[TKey]> extends readonly (infer TItem)[] ? TItem : never,
): void {
    const bindings = bindingsByScoreNodeId[scoreNodeId] ?? {};
    const current = bindings[key] ?? [];

    bindingsByScoreNodeId[scoreNodeId] = {
        ...bindings,
        [key]: [...current, value],
    } as ScoreNodeSnapshotBindings;
}