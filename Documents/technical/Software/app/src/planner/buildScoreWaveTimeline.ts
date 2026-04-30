import type { TweenNumber } from "../utils.ts";
import type { ScorePropagationStep } from "../math/calculateScoreChanges.ts";
import type { ScoreNodeId } from "../math/scoreTypes.ts";
import { buildScoreNodeSnapshotBindings } from "./buildScoreNodeSnapshotBindings.ts";
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
}): ScoreWaveTimeline {
    const bindingsByScoreNodeId = mergeBindingsByScoreNodeId(
        buildScoreNodeSnapshotBindings(args.snapshot),
        args.bindingsByScoreNodeId,
    );
    let currentSnapshot = cloneSnapshot(args.snapshot);
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
            currentSnapshot = phase.apply(currentSnapshot, propagationGroup.steps);
            frames.push({
                stepType: phase.stepType,
                snapshot: currentSnapshot,
                scoreNodeIds: propagationGroup.steps.map((step) => step.scoreNodeId),
                propagationGroupId: propagationGroup.propagationGroupId,
                propagationGroupType: propagationGroup.propagationGroupType,
                changeSource: summarizeChangeSource(propagationGroup.steps),
                impactMode: propagationGroup.steps[0]?.impactMode,
                specialCase: args.specialCase,
            });
        }
    }

    if (args.includeScaleAndOrderFrames ?? true) {
        currentSnapshot = resetSnapshotAnimationTypes(currentSnapshot);
        frames.push({
            stepType: "scale",
            snapshot: currentSnapshot,
            scoreNodeIds: [],
        });

        currentSnapshot = resetSnapshotAnimationTypes(currentSnapshot);
        frames.push({
            stepType: "order",
            snapshot: currentSnapshot,
            scoreNodeIds: [],
        });
    }

    return {
        initialSnapshot: cloneSnapshot(args.snapshot),
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
                applyScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "relevanceConnectorVizIds"),
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
                applyScoreUpdates(snapshot, currentSteps, bindingsByScoreNodeId, "deliveryConnectorVizIds"),
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
    bindingKey: "claimAggregatorVizIds" | "junctionAggregatorVizIds" | "confidenceConnectorVizIds",
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
            return markConfidenceConnectorsProgressive(nextSnapshot, steps, bindingsByScoreNodeId);
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

function markConfidenceConnectorsProgressive(
    snapshot: Snapshot,
    steps: readonly ScorePropagationStep[],
    bindingsByScoreNodeId: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>,
): Snapshot {
    const nextSnapshot = cloneSnapshot(snapshot);
    const confidenceConnectorVizIds = collectBoundIds(steps, bindingsByScoreNodeId, "confidenceConnectorVizIds");

    for (const confidenceConnectorVizId of confidenceConnectorVizIds) {
        const confidenceConnector = nextSnapshot.confidenceConnectors[confidenceConnectorVizId];

        if (!confidenceConnector) {
            continue;
        }

        nextSnapshot.confidenceConnectors[confidenceConnectorVizId] = {
            ...confidenceConnector,
            animationType: "progressive",
        };
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
    bindingKey:
        | "junctionVizIds"
        | "claimAggregatorVizIds"
        | "junctionAggregatorVizIds"
        | "confidenceConnectorVizIds",
): Set<JunctionVizId | ClaimAggregatorVizId | JunctionAggregatorVizId | ConfidenceConnectorVizId> {
    const ids = new Set<JunctionVizId | ClaimAggregatorVizId | JunctionAggregatorVizId | ConfidenceConnectorVizId>();

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

    return nextSnapshot;
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