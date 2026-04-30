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
    SnapshotWaypoint,
    Snapshot,
} from "./Snapshot.ts";

export type ScoreWaveStepType =
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

export type ScoreWaveSpecialCase = "firstFill";

export type ScoreNodeSnapshotBindings = {
    claimVizIds?: readonly ClaimVizId[];
    relevanceConnectorVizIds?: readonly RelevanceConnectorVizId[];
    junctionAggregatorVizIds?: readonly JunctionAggregatorVizId[];
    confidenceConnectorVizIds?: readonly ConfidenceConnectorVizId[];
    junctionVizIds?: readonly JunctionVizId[];
    deliveryConnectorVizIds?: readonly DeliveryConnectorVizId[];
    claimAggregatorVizIds?: readonly ClaimAggregatorVizId[];
};

export type ScoreWaveFrame = {
    stepType: ScoreWaveStepType;
    snapshot: Snapshot;
    scoreNodeIds: ScoreNodeId[];
    propagationGroupId?: string;
    propagationGroupType?: "node" | "cycle";
    changeSource?: "command" | "propagation" | "mixed";
    impactMode?: "direct" | "variant-average";
    specialCase?: ScoreWaveSpecialCase;
};

export type ScoreWaveTimeline = {
    initialSnapshot: Snapshot;
    frames: ScoreWaveFrame[];
    finalSnapshot: Snapshot;
};

type PropagationGroup = {
    propagationGroupId: string;
    propagationGroupType: "node" | "cycle";
    steps: ScorePropagationStep[];
};

type ScoreWavePhase = {
    stepType: Exclude<ScoreWaveStepType, "scale" | "order">;
    apply: (snapshot: Snapshot, steps: readonly ScorePropagationStep[]) => Snapshot;
};

type ScoreWavePhaseMode = "all" | "scoreOnly";

function buildFirstFillPhases(
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): ScoreWavePhase[] {
    return [{
        stepType: "claimAdjust",
        apply: (snapshot, currentSteps) => applyFirstFillUpdates(snapshot, currentSteps, bindingsByScoreNodeId),
    }];
}

function applyFirstFillUpdates(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): Snapshot {
    let nextSnapshot = cloneSnapshot(snapshot);

    nextSnapshot = applyScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "relevanceConnectorVizIds");
    nextSnapshot = applyAnimatedScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "junctionAggregatorVizIds");
    nextSnapshot = applyAnimatedScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "confidenceConnectorVizIds");
    nextSnapshot = applyAnimatedJunctionUpdates(nextSnapshot, steps, bindingsByScoreNodeId);
    nextSnapshot = applyScoreUpdates(nextSnapshot, steps, bindingsByScoreNodeId, "deliveryConnectorVizIds");
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
    includeScaleAndOrderFrames?: boolean;
    includeFallbackPhase?: boolean;
    phaseMode?: ScoreWavePhaseMode;
    specialCase?: ScoreWaveSpecialCase;
    scaleTargetSnapshot?: Snapshot;
}): ScoreWaveTimeline {
    const bindingsByScoreNodeId = mergeBindingsByScoreNodeId(
        buildScoreNodeSnapshotBindings(args.snapshot),
        args.bindingsByScoreNodeId,
    );
    const initialSnapshot = settleSnapshot(args.snapshot);
    let currentSnapshot = initialSnapshot;
    const frames: ScoreWaveFrame[] = [];
    const propagationGroups = groupPropagationSteps(args.propagation);

    for (const propagationGroup of propagationGroups) {
        const phases = args.specialCase === "firstFill"
            ? buildFirstFillPhases(bindingsByScoreNodeId)
            : buildScoreWavePhases(
                propagationGroup.steps,
                bindingsByScoreNodeId,
                args.phaseMode ?? "all",
                args.includeFallbackPhase ?? true,
            );

        for (const phase of phases) {
            const frameSnapshot = phase.apply(currentSnapshot, propagationGroup.steps);
            frames.push({
                stepType: phase.stepType,
                snapshot: frameSnapshot,
                scoreNodeIds: propagationGroup.steps.map((step) => step.scoreNodeId),
                propagationGroupId: propagationGroup.propagationGroupId,
                propagationGroupType: propagationGroup.propagationGroupType,
                changeSource: summarizeChangeSource(propagationGroup.steps),
                impactMode: propagationGroup.steps[0]?.impactMode,
                specialCase: args.specialCase,
            });
            currentSnapshot = settleSnapshot(frameSnapshot);
        }
    }

    if (args.includeScaleAndOrderFrames ?? true) {
        const scaleSnapshot = args.scaleTargetSnapshot
            ? buildScaleTransitionSnapshot({
                beforeSnapshot: currentSnapshot,
                afterSnapshot: args.scaleTargetSnapshot,
            })
            : settleSnapshot(resetSnapshotAnimationTypes(currentSnapshot));

        frames.push({
            stepType: "scale",
            snapshot: scaleSnapshot,
            scoreNodeIds: [],
        });
        currentSnapshot = settleSnapshot(scaleSnapshot);

        currentSnapshot = settleSnapshot(resetSnapshotAnimationTypes(currentSnapshot));
        frames.push({
            stepType: "order",
            snapshot: currentSnapshot,
            scoreNodeIds: [],
        });
    }

    return {
        initialSnapshot: cloneSnapshot(initialSnapshot),
        frames,
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

function buildScoreWavePhases(
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
    phaseMode: ScoreWavePhaseMode,
    includeFallbackPhase: boolean,
): ScoreWavePhase[] {
    const bindings = steps.map((step) => bindingsByScoreNodeId[step.scoreNodeId] ?? {});
    const phases: ScoreWavePhase[] = [];

    if (bindings.some((binding) => (binding.relevanceConnectorVizIds?.length ?? 0) > 0)) {
        phases.push({
            stepType: "relevanceConnectorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "relevanceConnectorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.junctionAggregatorVizIds?.length ?? 0) > 0)) {
        phases.push({
            stepType: "junctionAggregatorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "junctionAggregatorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.confidenceConnectorVizIds?.length ?? 0) > 0)) {
        phases.push({
            stepType: "confidenceConnectorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "confidenceConnectorVizIds"),
        });
    }

    if (phaseMode === "all" && bindings.some((binding) => (binding.junctionVizIds?.length ?? 0) > 0)) {
        phases.push({
            stepType: "junctionAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedJunctionUpdates(snapshot, currentSteps, bindingsByScoreNodeId),
        });
    }

    if (bindings.some((binding) => (binding.deliveryConnectorVizIds?.length ?? 0) > 0)) {
        phases.push({
            stepType: "deliveryConnectorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "deliveryConnectorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.claimAggregatorVizIds?.length ?? 0) > 0)) {
        phases.push({
            stepType: "claimAggregatorAdjust",
            apply: (snapshot, currentSteps) =>
                applyAnimatedScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "claimAggregatorVizIds"),
        });
    }

    if (bindings.some((binding) => (binding.claimVizIds?.length ?? 0) > 0)) {
        phases.push({
            stepType: "claimAdjust",
            apply: (snapshot, currentSteps) =>
                applyScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "claimVizIds"),
        });
    }

    if (phases.length === 0 && includeFallbackPhase) {
        phases.push({
            stepType: "claimAdjust",
            apply: (snapshot) => cloneSnapshot(snapshot),
        });
    }

    return phases;
}

function summarizeChangeSource(
    steps: readonly ScorePropagationStep[],
): ScoreWaveFrame["changeSource"] {
    const sources = new Set(steps.map((step) => step.changeSource));

    if (sources.size === 0) {
        return undefined;
    }

    if (sources.size === 1) {
        return steps[0]?.changeSource;
    }

    return "mixed";
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
    const connectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, bindingKey);

    for (const connectorVizId of connectorVizIds) {
        switch (bindingKey) {
            case "confidenceConnectorVizIds": {
                const connector = nextSnapshot.confidenceConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.confidenceConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                    };
                }
                break;
            }

            case "deliveryConnectorVizIds": {
                const connector = nextSnapshot.deliveryConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.deliveryConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                    };
                }
                break;
            }

            case "relevanceConnectorVizIds": {
                const connector = nextSnapshot.relevanceConnectors[connectorVizId];

                if (connector) {
                    nextSnapshot.relevanceConnectors[connectorVizId] = {
                        ...connector,
                        animationType: "progressive",
                    };
                }
                break;
            }
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

function buildScaleConfidenceConnectorMap<TId extends string, TEntity extends { animationType: "uniform" | "progressive"; centerlinePoints: SnapshotWaypoint[]; scale: TweenNumber; score: TweenNumber; source: TweenPoint; target: TweenPoint; visible: TweenBoolean }>(
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
                centerlinePoints: tweenWaypointList(before.centerlinePoints, after.centerlinePoints),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
                source: tweenPoint(before.source, after.source),
                target: tweenPoint(before.target, after.target),
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

function buildScaleConnectorMap<TId extends string, TEntity extends { animationType: "uniform" | "progressive"; centerlinePoints: SnapshotWaypoint[]; scale: TweenNumber; score: TweenNumber; source: TweenPoint; target: TweenPoint }>(
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
                centerlinePoints: tweenWaypointList(before.centerlinePoints, after.centerlinePoints),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
                source: tweenPoint(before.source, after.source),
                target: tweenPoint(before.target, after.target),
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

function tweenWaypointList(
    from: readonly SnapshotWaypoint[],
    to: readonly SnapshotWaypoint[],
): SnapshotWaypoint[] {
    if (from.length !== to.length) {
        throw new Error(
            `Cannot tween connector centerline points with different waypoint counts during scale transition: ${from.length} vs ${to.length}.`,
        );
    }

    return from.map((fromWaypoint, index) => tweenWaypoint(fromWaypoint, to[index]!));
}

function tweenWaypoint(from: SnapshotWaypoint, to: SnapshotWaypoint): SnapshotWaypoint {
    const radius = tweenOptionalNumber(from.radius, to.radius);

    return radius === undefined
        ? {
            x: tweenNumber(readTweenNumber(from.x), readTweenNumber(to.x)),
            y: tweenNumber(readTweenNumber(from.y), readTweenNumber(to.y)),
        }
        : {
            x: tweenNumber(readTweenNumber(from.x), readTweenNumber(to.x)),
            y: tweenNumber(readTweenNumber(from.y), readTweenNumber(to.y)),
            radius,
        };
}

function tweenOptionalNumber(
    from: TweenNumber | undefined,
    to: TweenNumber | undefined,
): TweenNumber | undefined {
    if (from === undefined && to === undefined) {
        return undefined;
    }

    return tweenNumber(readOptionalTweenNumber(from), readOptionalTweenNumber(to));
}

function readTweenBoolean(value: TweenBoolean): boolean {
    return typeof value === "boolean" ? value : value.to;
}

function readOptionalTweenNumber(value: TweenNumber | undefined): number {
    return value === undefined ? 0 : readTweenNumber(value);
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