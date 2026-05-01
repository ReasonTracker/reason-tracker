import type { TweenBoolean, TweenNumber, TweenPoint } from "../utils.ts";
import type { ScorePropagationStep } from "../math/calculateScoreChanges.ts";
import type { ScoreNodeId } from "../math/scoreTypes.ts";
import { buildScoreNodeSnapshotBindings } from "./buildScoreNodeSnapshotBindings.ts";
import { settleSnapshot } from "./settleSnapshot.ts";
import type {
    ClaimAggregatorVizId,
    ClaimVizId,
    ConfidenceConnectorVizId,
    DeliveryConnectorVizId,
    JunctionAggregatorVizId,
    JunctionVizId,
    RelevanceConnectorVizId,
    Snapshot,
} from "./Snapshot.ts";

export type ScoreWaveStepType =
    | "firstFill"
    | "voila"
    | "sprout"
    | "relevanceConnectorAdjust"
    | "junctionAggregatorAdjust"
    | "confidenceConnectorAdjust"
    | "junctionAdjust"
    | "deliveryConnectorAdjust"
    | "claimAggregatorAdjust"
    | "claimAdjust"
    | "scale"
    | "order";

export type ScoreNodeSnapshotBindings = {
    claimVizIds?: readonly ClaimVizId[];
    relevanceConnectorVizIds?: readonly RelevanceConnectorVizId[];
    junctionAggregatorVizIds?: readonly JunctionAggregatorVizId[];
    confidenceConnectorVizIds?: readonly ConfidenceConnectorVizId[];
    junctionVizIds?: readonly JunctionVizId[];
    deliveryConnectorVizIds?: readonly DeliveryConnectorVizId[];
    claimAggregatorVizIds?: readonly ClaimAggregatorVizId[];
};

export type ScoreWaveStep = {
    type: ScoreWaveStepType;
    snapshot: Snapshot;
    scoreNodeIds: ScoreNodeId[];
};

export type ScoreWaveTimeline = {
    initialSnapshot: Snapshot;
    steps: ScoreWaveStep[];
    finalSnapshot: Snapshot;
};

type PropagationGroup = {
    propagationGroupId: string;
    propagationGroupType: "node" | "cycle";
    steps: ScorePropagationStep[];
};

type ScoreWaveStepBuilder = {
    type: Exclude<ScoreWaveStepType, "scale" | "order">;
    apply: (snapshot: Snapshot, steps: readonly ScorePropagationStep[]) => Snapshot;
};

type ScoreWaveStepMode = "all" | "scoreOnly";

function buildFirstFillStepBuilders(
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): ScoreWaveStepBuilder[] {
    return [{
        type: "firstFill",
        apply: (snapshot, currentSteps) => applyFirstFillUpdates(snapshot, currentSteps, bindingsByScoreNodeId),
    }];
}

function applyFirstFillUpdates(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): Snapshot {
    let nextSnapshot = cloneSnapshot(snapshot);

    nextSnapshot = applyConnectorFirstFillRevealUpdates(
        applyScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "relevanceConnectorVizIds"),
        steps,
        bindingsByScoreNodeId,
        "relevanceConnectorVizIds",
    );
    nextSnapshot = applyAnimatedScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "junctionAggregatorVizIds");
    nextSnapshot = applyConnectorFirstFillRevealUpdates(
        applyAnimatedScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "confidenceConnectorVizIds"),
        steps,
        bindingsByScoreNodeId,
        "confidenceConnectorVizIds",
    );
    nextSnapshot = applyAnimatedJunctionUpdates(nextSnapshot, steps, bindingsByScoreNodeId);
    nextSnapshot = applyConnectorFirstFillRevealUpdates(
        applyScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "deliveryConnectorVizIds"),
        steps,
        bindingsByScoreNodeId,
        "deliveryConnectorVizIds",
    );
    nextSnapshot = applyAnimatedScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "claimAggregatorVizIds");
    nextSnapshot = applyScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "claimVizIds");

    return nextSnapshot;
}

/**
 * Builds the planner-side score wave timeline from math propagation data.
 *
 * This is intentionally limited to score-flow snapshots. Layout, visibility,
 * and ordering projection can layer on top later.
 */
export function buildScoreWaveTimeline(args: {
    snapshot: Snapshot;
    propagation: readonly ScorePropagationStep[];
    bindingsByScoreNodeId?: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>;
    includeScaleAndOrderSteps?: boolean;
    includeFallbackStep?: boolean;
    stepMode?: ScoreWaveStepMode;
    forcedStepType?: Extract<ScoreWaveStepType, "firstFill">;
    scaleTargetSnapshot?: Snapshot;
}): ScoreWaveTimeline {
    const bindingsByScoreNodeId = mergeBindingsByScoreNodeId(
        buildScoreNodeSnapshotBindings(args.snapshot),
        args.bindingsByScoreNodeId,
    );
    const initialSnapshot = settleSnapshot(args.snapshot);
    let currentSnapshot = initialSnapshot;
    const steps: ScoreWaveStep[] = [];
    const propagationGroups = groupPropagationSteps(args.propagation);

    for (const propagationGroup of propagationGroups) {
        const stepBuilders = args.forcedStepType === "firstFill"
            ? buildFirstFillStepBuilders(bindingsByScoreNodeId)
            : buildScoreWaveStepBuilders(
                propagationGroup.steps,
                bindingsByScoreNodeId,
                args.stepMode ?? "all",
                args.includeFallbackStep ?? true,
            );

        for (const stepBuilder of stepBuilders) {
            const stepSnapshot = stepBuilder.apply(currentSnapshot, propagationGroup.steps);
            steps.push({
                type: stepBuilder.type,
                snapshot: stepSnapshot,
                scoreNodeIds: [...new Set(propagationGroup.steps.map((step) => step.scoreNodeId))],
            });
            currentSnapshot = settleSnapshot(stepSnapshot);
        }
    }

    if (args.includeScaleAndOrderSteps ?? true) {
        const scaleSnapshot = args.scaleTargetSnapshot
            ? buildScaleTransitionSnapshot({
                beforeSnapshot: currentSnapshot,
                afterSnapshot: args.scaleTargetSnapshot,
            })
            : settleSnapshot(resetSnapshotAnimationTypes(currentSnapshot));

        steps.push({
            type: "scale",
            snapshot: scaleSnapshot,
            scoreNodeIds: [],
        });
        currentSnapshot = settleSnapshot(scaleSnapshot);

        currentSnapshot = settleSnapshot(resetSnapshotAnimationTypes(currentSnapshot));
        steps.push({
            type: "order",
            snapshot: currentSnapshot,
            scoreNodeIds: [],
        });
    }

    return {
        initialSnapshot: cloneSnapshot(initialSnapshot),
        steps,
        finalSnapshot: currentSnapshot,
    };
}

function groupPropagationSteps(
    propagation: readonly ScorePropagationStep[],
): PropagationGroup[] {
    const groups: PropagationGroup[] = [];
    let currentGroup: PropagationGroup | undefined;

    for (const step of propagation) {
        if (
            !currentGroup ||
            currentGroup.propagationGroupId !== step.propagationGroupId
        ) {
            currentGroup = {
                propagationGroupId: step.propagationGroupId,
                propagationGroupType: step.propagationGroupType,
                steps: [],
            };
            groups.push(currentGroup);
        }

        currentGroup.steps.push(step);
    }

    return groups;
}

function buildScoreWaveStepBuilders(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    stepMode: ScoreWaveStepMode,
    includeFallbackStep: boolean,
): ScoreWaveStepBuilder[] {
    const bindings = steps.map((step) => bindingsByScoreNodeId[step.scoreNodeId] ?? {});
    const stepBuilders: ScoreWaveStepBuilder[] = [];

    if (bindings.some((binding) => (binding.relevanceConnectorVizIds?.length ?? 0) > 0)) {
        stepBuilders.push({
            type: "relevanceConnectorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "relevanceConnectorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.junctionAggregatorVizIds?.length ?? 0) > 0)) {
        stepBuilders.push({
            type: "junctionAggregatorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "junctionAggregatorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.confidenceConnectorVizIds?.length ?? 0) > 0)) {
        stepBuilders.push({
            type: "confidenceConnectorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "confidenceConnectorVizIds"),
        });
    }

    if (stepMode === "all" && bindings.some((binding) => (binding.junctionVizIds?.length ?? 0) > 0)) {
        stepBuilders.push({
            type: "junctionAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedJunctionUpdates(snapshot, currentSteps, bindingsByScoreNodeId),
        });
    }

    if (bindings.some((binding) => (binding.deliveryConnectorVizIds?.length ?? 0) > 0)) {
        stepBuilders.push({
            type: "deliveryConnectorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "deliveryConnectorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.claimAggregatorVizIds?.length ?? 0) > 0)) {
        stepBuilders.push({
            type: "claimAggregatorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "claimAggregatorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.claimVizIds?.length ?? 0) > 0)) {
        stepBuilders.push({
            type: "claimAdjust",
            apply: (snapshot, currentSteps) =>
                applyScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "claimVizIds"),
        });
    }

    if (stepBuilders.length === 0 && includeFallbackStep) {
        stepBuilders.push({
            type: "claimAdjust",
            apply: (snapshot) => cloneSnapshot(snapshot),
        });
    }

    return stepBuilders;
}

function applyScoreUpdates(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey:
        | "claimVizIds"
        | "claimAggregatorVizIds"
        | "junctionAggregatorVizIds"
        | "confidenceConnectorVizIds"
        | "deliveryConnectorVizIds"
        | "relevanceConnectorVizIds",
): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);

    for (const step of steps) {
        const bindings = bindingsByScoreNodeId[step.scoreNodeId] ?? {};
        const targetScore = resolveStepScore(step);

        switch (bindingKey) {
            case "claimVizIds": {
                const bindingIds = bindings.claimVizIds ?? [];

                for (const id of bindingIds) {
                    const claim = nextSnapshot.claims[id];

                    if (!claim) {
                        continue;
                    }

                    nextSnapshot.claims[id] = {
                        ...claim,
                        score: tweenToScore(claim.score, targetScore),
                    };
                }
                break;
            }

            case "claimAggregatorVizIds": {
                const bindingIds = bindings.claimAggregatorVizIds ?? [];

                for (const id of bindingIds) {
                    const aggregator = nextSnapshot.claimAggregators[id];

                    if (!aggregator) {
                        continue;
                    }

                    nextSnapshot.claimAggregators[id] = {
                        ...aggregator,
                        score: tweenToScore(aggregator.score, targetScore),
                    };
                }
                break;
            }

            case "junctionAggregatorVizIds": {
                const bindingIds = bindings.junctionAggregatorVizIds ?? [];

                for (const id of bindingIds) {
                    const aggregator = nextSnapshot.junctionAggregators[id];

                    if (!aggregator) {
                        continue;
                    }

                    nextSnapshot.junctionAggregators[id] = {
                        ...aggregator,
                        score: tweenToScore(aggregator.score, targetScore),
                    };
                }
                break;
            }

            case "confidenceConnectorVizIds": {
                const bindingIds = bindings.confidenceConnectorVizIds ?? [];

                for (const id of bindingIds) {
                    const connector = nextSnapshot.confidenceConnectors[id];

                    if (!connector) {
                        continue;
                    }

                    nextSnapshot.confidenceConnectors[id] = {
                        ...connector,
                        score: tweenToScore(connector.score, targetScore),
                    };
                }
                break;
            }

            case "deliveryConnectorVizIds": {
                const bindingIds = bindings.deliveryConnectorVizIds ?? [];

                for (const id of bindingIds) {
                    const connector = nextSnapshot.deliveryConnectors[id];

                    if (!connector) {
                        continue;
                    }

                    nextSnapshot.deliveryConnectors[id] = {
                        ...connector,
                        score: tweenToScore(connector.score, targetScore),
                    };
                }
                break;
            }

            case "relevanceConnectorVizIds": {
                const bindingIds = bindings.relevanceConnectorVizIds ?? [];

                for (const id of bindingIds) {
                    const connector = nextSnapshot.relevanceConnectors[id];

                    if (!connector) {
                        continue;
                    }

                    nextSnapshot.relevanceConnectors[id] = {
                        ...connector,
                        score: tweenToScore(connector.score, targetScore),
                    };
                }
                break;
            }
        }
    }

    return nextSnapshot;
}

function applyAnimatedScoreUpdates(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey:
        | "claimAggregatorVizIds"
        | "junctionAggregatorVizIds"
        | "confidenceConnectorVizIds"
        | "deliveryConnectorVizIds"
        | "relevanceConnectorVizIds",
): Snapshot {
    const nextSnapshot = applyScoreUpdates(snapshot, steps, bindingsByScoreNodeId, bindingKey);

    switch (bindingKey) {
        case "claimAggregatorVizIds": {
            return markClaimAggregatorsProgressive(nextSnapshot, steps, bindingsByScoreNodeId);
        }

        case "junctionAggregatorVizIds": {
            return markJunctionAggregatorsProgressive(nextSnapshot, steps, bindingsByScoreNodeId);
        }

        case "confidenceConnectorVizIds": {
            return markConnectorsProgressive(nextSnapshot, steps, bindingsByScoreNodeId, bindingKey);
        }

        case "deliveryConnectorVizIds": {
            return markConnectorsProgressive(nextSnapshot, steps, bindingsByScoreNodeId, bindingKey);
        }

        case "relevanceConnectorVizIds": {
            return markConnectorsProgressive(nextSnapshot, steps, bindingsByScoreNodeId, bindingKey);
        }
    }
}

function applyAnimatedJunctionUpdates(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);
    const junctionVizIds = collectBoundIds(steps, bindingsByScoreNodeId, "junctionVizIds");

    for (const junctionVizId of junctionVizIds) {
        const junction = nextSnapshot.junctions[junctionVizId];

        if (!junction) {
            continue;
        }

        nextSnapshot.junctions[junctionVizId] = {
            ...junction,
            animationType: "progressive",
        };
    }

    return nextSnapshot;
}

function markClaimAggregatorsProgressive(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);
    const claimAggregatorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, "claimAggregatorVizIds");

    for (const claimAggregatorVizId of claimAggregatorVizIds) {
        const claimAggregator = nextSnapshot.claimAggregators[claimAggregatorVizId];

        if (!claimAggregator) {
            continue;
        }

        nextSnapshot.claimAggregators[claimAggregatorVizId] = {
            ...claimAggregator,
            animationType: "progressive",
        };
    }

    return nextSnapshot;
}

function markJunctionAggregatorsProgressive(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);
    const junctionAggregatorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, "junctionAggregatorVizIds");

    for (const junctionAggregatorVizId of junctionAggregatorVizIds) {
        const junctionAggregator = nextSnapshot.junctionAggregators[junctionAggregatorVizId];

        if (!junctionAggregator) {
            continue;
        }

        nextSnapshot.junctionAggregators[junctionAggregatorVizId] = {
            ...junctionAggregator,
            animationType: "progressive",
        };
    }

    return nextSnapshot;
}

function markConnectorsProgressive(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey:
        | "confidenceConnectorVizIds"
        | "deliveryConnectorVizIds"
        | "relevanceConnectorVizIds",
): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);

    switch (bindingKey) {
        case "confidenceConnectorVizIds": {
            const connectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, bindingKey);

            for (const connectorVizId of connectorVizIds) {
                const connector = nextSnapshot.confidenceConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.confidenceConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                    };
                }
            }
            break;
        }

        case "deliveryConnectorVizIds": {
            const connectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, bindingKey);

            for (const connectorVizId of connectorVizIds) {
                const connector = nextSnapshot.deliveryConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.deliveryConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                    };
                }
            }
            break;
        }

        case "relevanceConnectorVizIds": {
            const connectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, bindingKey);

            for (const connectorVizId of connectorVizIds) {
                const connector = nextSnapshot.relevanceConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.relevanceConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                    };
                }
            }
            break;
        }
    }

    return nextSnapshot;
}

function applyConnectorFirstFillRevealUpdates(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey:
        | "confidenceConnectorVizIds"
        | "deliveryConnectorVizIds"
        | "relevanceConnectorVizIds",
): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);

    switch (bindingKey) {
        case "confidenceConnectorVizIds": {
            const connectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, bindingKey);

            for (const connectorVizId of connectorVizIds) {
                const connector = nextSnapshot.confidenceConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.confidenceConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                        fluidRevealProgress: tweenToScore(connector.fluidRevealProgress, 1),
                        pipeRevealProgress: tweenToScore(connector.pipeRevealProgress, 1),
                    };
                }
            }
            break;
        }

        case "deliveryConnectorVizIds": {
            const connectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, bindingKey);

            for (const connectorVizId of connectorVizIds) {
                const connector = nextSnapshot.deliveryConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.deliveryConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                        fluidRevealProgress: tweenToScore(connector.fluidRevealProgress, 1),
                        pipeRevealProgress: tweenToScore(connector.pipeRevealProgress, 1),
                    };
                }
            }
            break;
        }

        case "relevanceConnectorVizIds": {
            const connectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, bindingKey);

            for (const connectorVizId of connectorVizIds) {
                const connector = nextSnapshot.relevanceConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.relevanceConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                        fluidRevealProgress: tweenToScore(connector.fluidRevealProgress, 1),
                        pipeRevealProgress: tweenToScore(connector.pipeRevealProgress, 1),
                    };
                }
            }
            break;
        }
    }

    return nextSnapshot;
}

function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey: "junctionVizIds",
): Set<JunctionVizId>;
function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey: "claimAggregatorVizIds",
): Set<ClaimAggregatorVizId>;
function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey: "junctionAggregatorVizIds",
): Set<JunctionAggregatorVizId>;
function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey: "confidenceConnectorVizIds",
): Set<ConfidenceConnectorVizId>;
function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey: "deliveryConnectorVizIds",
): Set<DeliveryConnectorVizId>;
function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey: "relevanceConnectorVizIds",
): Set<RelevanceConnectorVizId>;
function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey:
        | "confidenceConnectorVizIds"
        | "deliveryConnectorVizIds"
        | "relevanceConnectorVizIds",
): Set<ConfidenceConnectorVizId | DeliveryConnectorVizId | RelevanceConnectorVizId>;
function collectBoundIds(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    bindingKey:
        | "junctionVizIds"
        | "claimAggregatorVizIds"
        | "junctionAggregatorVizIds"
        | "confidenceConnectorVizIds"
        | "deliveryConnectorVizIds"
        | "relevanceConnectorVizIds",
): Set<
    JunctionVizId
    | ClaimAggregatorVizId
    | JunctionAggregatorVizId
    | ConfidenceConnectorVizId
    | DeliveryConnectorVizId
    | RelevanceConnectorVizId
> {
    const ids = new Set<
        JunctionVizId
        | ClaimAggregatorVizId
        | JunctionAggregatorVizId
        | ConfidenceConnectorVizId
        | DeliveryConnectorVizId
        | RelevanceConnectorVizId
    >();

    for (const step of steps) {
        const bindings = bindingsByScoreNodeId[step.scoreNodeId];

        if (!bindings) {
            continue;
        }

        switch (bindingKey) {
            case "junctionVizIds": {
                for (const id of bindings.junctionVizIds ?? []) {
                    ids.add(id);
                }
                break;
            }

            case "claimAggregatorVizIds": {
                for (const id of bindings.claimAggregatorVizIds ?? []) {
                    ids.add(id);
                }
                break;
            }

            case "junctionAggregatorVizIds": {
                for (const id of bindings.junctionAggregatorVizIds ?? []) {
                    ids.add(id);
                }
                break;
            }

            case "confidenceConnectorVizIds": {
                for (const id of bindings.confidenceConnectorVizIds ?? []) {
                    ids.add(id);
                }
                break;
            }

            case "deliveryConnectorVizIds": {
                for (const id of bindings.deliveryConnectorVizIds ?? []) {
                    ids.add(id);
                }
                break;
            }

            case "relevanceConnectorVizIds": {
                for (const id of bindings.relevanceConnectorVizIds ?? []) {
                    ids.add(id);
                }
                break;
            }
        }
    }

    return ids;
}

function resetSnapshotAnimationTypes(snapshot: Snapshot): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);

    for (const claimAggregatorId of Object.keys(nextSnapshot.claimAggregators) as ClaimAggregatorVizId[]) {
        nextSnapshot.claimAggregators[claimAggregatorId] = {
            ...nextSnapshot.claimAggregators[claimAggregatorId],
            animationType: "uniform",
        };
    }

    for (const junctionId of Object.keys(nextSnapshot.junctions) as JunctionVizId[]) {
        nextSnapshot.junctions[junctionId] = {
            ...nextSnapshot.junctions[junctionId],
            animationType: "uniform",
        };
    }

    for (const junctionAggregatorId of Object.keys(nextSnapshot.junctionAggregators) as JunctionAggregatorVizId[]) {
        nextSnapshot.junctionAggregators[junctionAggregatorId] = {
            ...nextSnapshot.junctionAggregators[junctionAggregatorId],
            animationType: "uniform",
        };
    }

    for (const confidenceConnectorId of Object.keys(nextSnapshot.confidenceConnectors) as ConfidenceConnectorVizId[]) {
        nextSnapshot.confidenceConnectors[confidenceConnectorId] = {
            ...nextSnapshot.confidenceConnectors[confidenceConnectorId],
            animationType: "uniform",
        };
    }

    for (const deliveryConnectorId of Object.keys(nextSnapshot.deliveryConnectors) as DeliveryConnectorVizId[]) {
        nextSnapshot.deliveryConnectors[deliveryConnectorId] = {
            ...nextSnapshot.deliveryConnectors[deliveryConnectorId],
            animationType: "uniform",
        };
    }

    for (const relevanceConnectorId of Object.keys(nextSnapshot.relevanceConnectors) as RelevanceConnectorVizId[]) {
        nextSnapshot.relevanceConnectors[relevanceConnectorId] = {
            ...nextSnapshot.relevanceConnectors[relevanceConnectorId],
            animationType: "uniform",
        };
    }

    return nextSnapshot;
}

function buildScaleTransitionSnapshot(args: {
    beforeSnapshot: Snapshot;
    afterSnapshot: Snapshot;
}): Snapshot {
    return {
        claims: buildScaleClaimMap(args.beforeSnapshot.claims, args.afterSnapshot.claims),
        claimAggregators: buildScaleClaimAggregatorMap(args.beforeSnapshot.claimAggregators, args.afterSnapshot.claimAggregators),
        junctions: buildScaleJunctionMap(args.beforeSnapshot.junctions, args.afterSnapshot.junctions),
        junctionAggregators: buildScaleJunctionAggregatorMap(args.beforeSnapshot.junctionAggregators, args.afterSnapshot.junctionAggregators),
        confidenceConnectors: buildScaleConfidenceConnectorMap(args.beforeSnapshot.confidenceConnectors, args.afterSnapshot.confidenceConnectors),
        deliveryConnectors: buildScaleConnectorMap(args.beforeSnapshot.deliveryConnectors, args.afterSnapshot.deliveryConnectors),
        relevanceConnectors: buildScaleConnectorMap(args.beforeSnapshot.relevanceConnectors, args.afterSnapshot.relevanceConnectors),
    };
}

function buildScaleClaimMap<TId extends string, TEntity extends { position: TweenPoint; score: TweenNumber; scale: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById = {} as Record<TId, TEntity>;

    for (const id of collectMapIds(beforeById, afterById)) {
        const before = beforeById[id];
        const after = afterById[id];

        if (before && after) {
            nextById[id] = {
                ...after,
                position: tweenPoint(before.position, after.position),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
            };
            continue;
        }

        if (after) {
            nextById[id] = after;
            continue;
        }

        if (before) {
            nextById[id] = {
                ...before,
                scale: tweenNumber(readTweenNumber(before.scale), 0),
            };
        }
    }

    return nextById;
}

function buildScaleClaimAggregatorMap<TId extends string, TEntity extends { animationType: "uniform" | "progressive"; position: TweenPoint; score: TweenNumber; scale: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById = {} as Record<TId, TEntity>;

    for (const id of collectMapIds(beforeById, afterById)) {
        const before = beforeById[id];
        const after = afterById[id];

        if (before && after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
                position: tweenPoint(before.position, after.position),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
            };
            continue;
        }

        if (after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
            };
            continue;
        }

        if (before) {
            nextById[id] = {
                ...before,
                animationType: "uniform",
                scale: tweenNumber(readTweenNumber(before.scale), 0),
            };
        }
    }

    return nextById;
}

function buildScaleJunctionMap<TId extends string, TEntity extends { animationType: "uniform" | "progressive"; leftHeight: TweenNumber; position: TweenPoint; rightHeight: TweenNumber; scale: TweenNumber; visible: TweenBoolean; width: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById = {} as Record<TId, TEntity>;

    for (const id of collectMapIds(beforeById, afterById)) {
        const before = beforeById[id];
        const after = afterById[id];

        if (before && after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
                leftHeight: tweenNumber(readTweenNumber(before.leftHeight), readTweenNumber(after.leftHeight)),
                position: tweenPoint(before.position, after.position),
                rightHeight: tweenNumber(readTweenNumber(before.rightHeight), readTweenNumber(after.rightHeight)),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                visible: tweenBoolean(readTweenBoolean(before.visible), readTweenBoolean(after.visible)),
                width: tweenNumber(readTweenNumber(before.width), readTweenNumber(after.width)),
            };
            continue;
        }

        if (after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
            };
            continue;
        }

        if (before) {
            nextById[id] = {
                ...before,
                animationType: "uniform",
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                visible: tweenBoolean(readTweenBoolean(before.visible), false),
            };
        }
    }

    return nextById;
}

function buildScaleJunctionAggregatorMap<TId extends string, TEntity extends { animationType: "uniform" | "progressive"; position: TweenPoint; score: TweenNumber; scale: TweenNumber; visible: TweenBoolean }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById = {} as Record<TId, TEntity>;

    for (const id of collectMapIds(beforeById, afterById)) {
        const before = beforeById[id];
        const after = afterById[id];

        if (before && after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
                position: tweenPoint(before.position, after.position),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
                visible: tweenBoolean(readTweenBoolean(before.visible), readTweenBoolean(after.visible)),
            };
            continue;
        }

        if (after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
            };
            continue;
        }

        if (before) {
            nextById[id] = {
                ...before,
                animationType: "uniform",
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                visible: tweenBoolean(readTweenBoolean(before.visible), false),
            };
        }
    }

    return nextById;
}

function buildScaleConfidenceConnectorMap<TId extends string, TEntity extends { animationType: "uniform" | "progressive"; scale: TweenNumber; score: TweenNumber; visible: TweenBoolean }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById = {} as Record<TId, TEntity>;

    for (const id of collectMapIds(beforeById, afterById)) {
        const before = beforeById[id];
        const after = afterById[id];

        if (before && after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
                visible: tweenBoolean(readTweenBoolean(before.visible), readTweenBoolean(after.visible)),
            };
            continue;
        }

        if (after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
            };
            continue;
        }

        if (before) {
            nextById[id] = {
                ...before,
                animationType: "uniform",
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                visible: tweenBoolean(readTweenBoolean(before.visible), false),
            };
        }
    }

    return nextById;
}

function buildScaleConnectorMap<TId extends string, TEntity extends { animationType: "uniform" | "progressive"; scale: TweenNumber; score: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById = {} as Record<TId, TEntity>;

    for (const id of collectMapIds(beforeById, afterById)) {
        const before = beforeById[id];
        const after = afterById[id];

        if (before && after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
            };
            continue;
        }

        if (after) {
            nextById[id] = {
                ...after,
                animationType: "uniform",
            };
            continue;
        }

        if (before) {
            nextById[id] = {
                ...before,
                animationType: "uniform",
                scale: tweenNumber(readTweenNumber(before.scale), 0),
            };
        }
    }

    return nextById;
}

function collectMapIds<TId extends string>(
    beforeById: Record<TId, unknown>,
    afterById: Record<TId, unknown>,
): TId[] {
    return [...new Set<TId>([
        ...(Object.keys(beforeById) as TId[]),
        ...(Object.keys(afterById) as TId[]),
    ])];
}

function resolveStepScore(step: ScorePropagationStep): number {
    if (step.after) {
        return step.after.value;
    }

    if (step.changeType === "removed") {
        return 0;
    }

    if (step.before) {
        return step.before.value;
    }

    return 0;
}

function tweenToScore(current: TweenNumber, next: number): TweenNumber {
    const from = readTweenNumber(current);

    if (from === next) {
        return next;
    }

    return {
        type: "tween/number",
        from,
        to: next,
    };
}

function tweenNumber(from: number, to: number): TweenNumber {
    if (from === to) {
        return to;
    }

    return {
        type: "tween/number",
        from,
        to,
    };
}

function tweenBoolean(from: boolean, to: boolean): TweenBoolean {
    if (from === to) {
        return to;
    }

    return {
        type: "tween/boolean",
        from,
        to,
    };
}

function tweenPoint(from: TweenPoint, to: TweenPoint): TweenPoint {
    return {
        x: tweenNumber(readTweenNumber(from.x), readTweenNumber(to.x)),
        y: tweenNumber(readTweenNumber(from.y), readTweenNumber(to.y)),
    };
}

function readTweenBoolean(value: TweenBoolean): boolean {
    return typeof value === "boolean" ? value : value.to;
}

function readTweenNumber(value: TweenNumber): number {
    return typeof value === "number" ? value : value.to;
}

function cloneSnapshot(snapshot: Snapshot): Snapshot {
    return {
        claims: { ...snapshot.claims },
        claimAggregators: { ...snapshot.claimAggregators },
        junctions: { ...snapshot.junctions },
        junctionAggregators: { ...snapshot.junctionAggregators },
        confidenceConnectors: { ...snapshot.confidenceConnectors },
        deliveryConnectors: { ...snapshot.deliveryConnectors },
        relevanceConnectors: { ...snapshot.relevanceConnectors },
    };
}

function mergeBindingsByScoreNodeId(
    base: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    overrides?: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>> {
    if (!overrides) {
        return base;
    }

    const scoreNodeIds = new Set<ScoreNodeId>([
        ...(Object.keys(base) as ScoreNodeId[]),
        ...(Object.keys(overrides) as ScoreNodeId[]),
    ]);

    const merged: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>> = {};

    for (const scoreNodeId of scoreNodeIds) {
        merged[scoreNodeId] = mergeBindings(base[scoreNodeId], overrides[scoreNodeId]);
    }

    return merged;
}

function mergeBindings(
    base?: ScoreNodeSnapshotBindings,
    overrides?: ScoreNodeSnapshotBindings,
): ScoreNodeSnapshotBindings {
    return {
        claimVizIds: overrides?.claimVizIds ?? base?.claimVizIds,
        claimAggregatorVizIds: overrides?.claimAggregatorVizIds ?? base?.claimAggregatorVizIds,
        junctionVizIds: overrides?.junctionVizIds ?? base?.junctionVizIds,
        junctionAggregatorVizIds: overrides?.junctionAggregatorVizIds ?? base?.junctionAggregatorVizIds,
        confidenceConnectorVizIds: overrides?.confidenceConnectorVizIds ?? base?.confidenceConnectorVizIds,
        deliveryConnectorVizIds: overrides?.deliveryConnectorVizIds ?? base?.deliveryConnectorVizIds,
        relevanceConnectorVizIds: overrides?.relevanceConnectorVizIds ?? base?.relevanceConnectorVizIds,
    };
}