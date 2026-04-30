import type {
    CommandScoreChange,
    ScoreChangeRun,
    ScorePropagationStep,
} from "../math/calculateScoreChanges.ts";
import type { TweenBoolean, TweenNumber, TweenPoint } from "../utils.ts";
import type { Snapshot, SnapshotWaypoint } from "./Snapshot.ts";
import {
    type CommandScoreWaveTimeline,
    type ScoreChangeWaveTimelineRun,
} from "./buildCommandScoreWaveTimelines.ts";
import {
    buildScoreProjectionSnapshot,
    type ScoreProjectionSnapshotOptions,
} from "./buildScoreProjectionSnapshot.ts";
import { buildScoreWaveTimeline, type ScoreWaveFrame } from "./buildScoreWaveTimeline.ts";

/**
 * Builds per-command score-wave timelines directly from the score-change run
 * by projecting each before/after score graph into snapshot space.
 */
export function buildProjectedCommandScoreWaveTimelines<TCommand>(args: {
    scoreChangeRun: ScoreChangeRun<TCommand>;
    projectionOptions?: ScoreProjectionSnapshotOptions;
    includeScaleAndOrderFrames?: boolean;
}): ScoreChangeWaveTimelineRun<TCommand> {
    const initialGraph = args.scoreChangeRun.commandRuns[0]?.graphBefore ?? args.scoreChangeRun.finalGraph;
    const initialScores = args.scoreChangeRun.commandRuns[0]?.scoresBefore ?? args.scoreChangeRun.finalScores;
    const initialSnapshot = buildScoreProjectionSnapshot({
        graph: initialGraph,
        scores: initialScores,
        options: args.projectionOptions,
    });

    let currentSnapshot = initialSnapshot;
    const commandTimelines = args.scoreChangeRun.commandRuns.map((commandRun) => {
        const projectedAfterSnapshot = buildScoreProjectionSnapshot({
            graph: commandRun.graphAfter,
            scores: commandRun.scoresAfter,
            options: args.projectionOptions,
        });
        const preparedSnapshot = prepareWaveSnapshot({
            beforeSnapshot: currentSnapshot,
            afterSnapshot: projectedAfterSnapshot,
        });
        const preWaveFrames = buildPreWaveFrames({
            commandRun,
            beforeSnapshot: currentSnapshot,
            preparedSnapshot,
            afterSnapshot: projectedAfterSnapshot,
        });
        const waveInitialSnapshot = preWaveFrames.at(-1)?.snapshot ?? preparedSnapshot;
        const timeline = buildScoreWaveTimeline({
            snapshot: waveInitialSnapshot,
            propagation: commandRun.propagation.filter(
                (step) => !isDirectAddedScorePropagationStep(step),
            ),
            includeScaleAndOrderFrames: args.includeScaleAndOrderFrames,
        });
        const commandTimeline: CommandScoreWaveTimeline<TCommand> = {
            command: commandRun.command,
            changedScoreNodeIds: commandRun.changedScoreNodeIds,
            scoreAuditBefore: commandRun.scoreAuditBefore,
            scoreAuditAfter: commandRun.scoreAuditAfter,
            timeline: {
                initialSnapshot: cloneSnapshot(currentSnapshot),
                frames: [...preWaveFrames, ...timeline.frames],
                finalSnapshot: timeline.finalSnapshot,
            },
        };

        currentSnapshot = projectedAfterSnapshot;
        return commandTimeline;
    });

    return {
        initialSnapshot,
        commandTimelines,
        finalSnapshot: currentSnapshot,
    };
}

function buildPreWaveFrames<TCommand>(args: {
    commandRun: CommandScoreChange<TCommand>;
    beforeSnapshot: Snapshot;
    preparedSnapshot: Snapshot;
    afterSnapshot: Snapshot;
}): ScoreWaveFrame[] {
    const frames: ScoreWaveFrame[] = [];
    const directAddedPropagation = args.commandRun.propagation.filter(isDirectAddedScorePropagationStep);

    if (hasVoilaChanges(args.beforeSnapshot, args.afterSnapshot)) {
        frames.push({
            stepType: "voila",
            snapshot: buildVoilaSnapshot({
                beforeSnapshot: args.beforeSnapshot,
                preparedSnapshot: args.preparedSnapshot,
                afterSnapshot: args.afterSnapshot,
            }),
            scoreNodeIds: [...args.commandRun.changedScoreNodeIds],
            changeSource: "command",
        });
    }

    if (hasSproutChanges(args.beforeSnapshot, args.afterSnapshot)) {
        frames.push({
            stepType: "sprout",
            snapshot: buildSproutSnapshot({
                beforeSnapshot: args.beforeSnapshot,
                preparedSnapshot: args.preparedSnapshot,
                afterSnapshot: args.afterSnapshot,
            }),
            scoreNodeIds: [...args.commandRun.changedScoreNodeIds],
            changeSource: "command",
        });
    }

    if (directAddedPropagation.length > 0) {
        const firstFillTimeline = buildScoreWaveTimeline({
            snapshot: frames.at(-1)?.snapshot ?? args.preparedSnapshot,
            propagation: directAddedPropagation,
            includeScaleAndOrderFrames: false,
            includeFallbackPhase: false,
            phaseMode: "scoreOnly",
            specialCase: "firstFill",
        });

        frames.push(...firstFillTimeline.frames);
    }

    return frames;
}

function prepareWaveSnapshot(args: {
    beforeSnapshot: Snapshot;
    afterSnapshot: Snapshot;
}): Snapshot {
    return {
        claims: mergeClaimMap(args.beforeSnapshot.claims, args.afterSnapshot.claims),
        claimAggregators: mergeClaimAggregatorMap(
            args.beforeSnapshot.claimAggregators,
            args.afterSnapshot.claimAggregators,
        ),
        junctions: mergeJunctionMap(args.beforeSnapshot.junctions, args.afterSnapshot.junctions),
        junctionAggregators: mergeJunctionAggregatorMap(
            args.beforeSnapshot.junctionAggregators,
            args.afterSnapshot.junctionAggregators,
        ),
        confidenceConnectors: mergeConfidenceConnectorMap(
            args.beforeSnapshot.confidenceConnectors,
            args.afterSnapshot.confidenceConnectors,
        ),
        deliveryConnectors: mergeDeliveryConnectorMap(
            args.beforeSnapshot.deliveryConnectors,
            args.afterSnapshot.deliveryConnectors,
        ),
        relevanceConnectors: mergeRelevanceConnectorMap(
            args.beforeSnapshot.relevanceConnectors,
            args.afterSnapshot.relevanceConnectors,
        ),
    };
}

function buildVoilaSnapshot(args: {
    beforeSnapshot: Snapshot;
    preparedSnapshot: Snapshot;
    afterSnapshot: Snapshot;
}): Snapshot {
    return {
        ...cloneSnapshot(args.preparedSnapshot),
        claims: buildVoilaClaimMap(args.beforeSnapshot.claims, args.preparedSnapshot.claims, args.afterSnapshot.claims),
        claimAggregators: buildVoilaClaimAggregatorMap(
            args.beforeSnapshot.claimAggregators,
            args.preparedSnapshot.claimAggregators,
            args.afterSnapshot.claimAggregators,
        ),
    };
}

function buildSproutSnapshot(args: {
    beforeSnapshot: Snapshot;
    preparedSnapshot: Snapshot;
    afterSnapshot: Snapshot;
}): Snapshot {
    return {
        ...cloneSnapshot(args.preparedSnapshot),
        junctions: buildSproutJunctionMap(args.beforeSnapshot.junctions, args.preparedSnapshot.junctions, args.afterSnapshot.junctions),
        junctionAggregators: buildSproutJunctionAggregatorMap(
            args.beforeSnapshot.junctionAggregators,
            args.preparedSnapshot.junctionAggregators,
            args.afterSnapshot.junctionAggregators,
        ),
        confidenceConnectors: buildSproutConfidenceConnectorMap(
            args.beforeSnapshot.confidenceConnectors,
            args.preparedSnapshot.confidenceConnectors,
            args.afterSnapshot.confidenceConnectors,
        ),
        deliveryConnectors: buildSproutConnectorMap(
            args.beforeSnapshot.deliveryConnectors,
            args.preparedSnapshot.deliveryConnectors,
            args.afterSnapshot.deliveryConnectors,
        ),
        relevanceConnectors: buildSproutConnectorMap(
            args.beforeSnapshot.relevanceConnectors,
            args.preparedSnapshot.relevanceConnectors,
            args.afterSnapshot.relevanceConnectors,
        ),
    };
}

function isDirectAddedScorePropagationStep(step: ScorePropagationStep): boolean {
    return step.changeSource === "command" && step.changeType === "added";
}

function hasVoilaChanges(beforeSnapshot: Snapshot, afterSnapshot: Snapshot): boolean {
    return (
        hasMapKeyChanges(beforeSnapshot.claims, afterSnapshot.claims) ||
        hasMapKeyChanges(beforeSnapshot.claimAggregators, afterSnapshot.claimAggregators) ||
        hasClaimPositionsChanged(beforeSnapshot, afterSnapshot)
    );
}

function hasSproutChanges(beforeSnapshot: Snapshot, afterSnapshot: Snapshot): boolean {
    return (
        hasMapKeyChanges(beforeSnapshot.junctions, afterSnapshot.junctions) ||
        hasMapKeyChanges(beforeSnapshot.junctionAggregators, afterSnapshot.junctionAggregators) ||
        hasMapKeyChanges(beforeSnapshot.confidenceConnectors, afterSnapshot.confidenceConnectors) ||
        hasMapKeyChanges(beforeSnapshot.deliveryConnectors, afterSnapshot.deliveryConnectors) ||
        hasMapKeyChanges(beforeSnapshot.relevanceConnectors, afterSnapshot.relevanceConnectors)
    );
}

function hasMapKeyChanges<TId extends string, TEntity>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): boolean {
    const beforeIds = Object.keys(beforeById) as TId[];
    const afterIds = Object.keys(afterById) as TId[];

    if (beforeIds.length !== afterIds.length) {
        return true;
    }

    const beforeSet = new Set(beforeIds);

    return afterIds.some((id) => !beforeSet.has(id));
}

function hasClaimPositionsChanged(beforeSnapshot: Snapshot, afterSnapshot: Snapshot): boolean {
    for (const claimVizId of Object.keys(afterSnapshot.claims) as Array<keyof Snapshot["claims"]>) {
        const before = beforeSnapshot.claims[claimVizId];
        const after = afterSnapshot.claims[claimVizId];

        if (!before || !after) {
            continue;
        }

        if (
            readPointX(before.position) !== readPointX(after.position) ||
            readPointY(before.position) !== readPointY(after.position)
        ) {
            return true;
        }
    }

    return false;
}

function mergeClaimMap<TId extends string, TEntity extends { score: TweenNumber; scale: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const merged: Record<TId, TEntity> = { ...beforeById };
    const afterIds = Object.keys(afterById) as TId[];

    for (const id of afterIds) {
        const before = beforeById[id];
        const after = afterById[id];

        merged[id] = before
            ? {
                ...after,
                score: before.score,
                scale: before.scale,
            }
            : {
                ...after,
                score: 0,
                scale: 0,
            };
    }

    return merged;
}

function buildVoilaClaimMap<TId extends string, TEntity extends { position: TweenPoint; score: TweenNumber; scale: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    preparedById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById: Record<TId, TEntity> = { ...preparedById };

    for (const id of Object.keys(preparedById) as TId[]) {
        const before = beforeById[id];
        const prepared = preparedById[id];
        const after = afterById[id];

        if (!prepared) {
            continue;
        }

        if (before && after) {
            nextById[id] = {
                ...prepared,
                position: tweenPoint(before.position, after.position),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
            };
            continue;
        }

        if (!before && after) {
            nextById[id] = {
                ...prepared,
                scale: tweenNumber(0, readTweenNumber(after.scale)),
                score: 0,
            };
            continue;
        }

        if (before && !after) {
            nextById[id] = {
                ...prepared,
                position: before.position,
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                score: before.score,
            };
        }
    }

    return nextById;
}

function mergeClaimAggregatorMap<TId extends string, TEntity extends { score: TweenNumber; scale: TweenNumber; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const merged: Record<TId, TEntity> = { ...beforeById };

    for (const id of Object.keys(afterById) as TId[]) {
        const before = beforeById[id];
        const after = afterById[id];

        merged[id] = before
            ? {
                ...after,
                score: before.score,
                scale: before.scale,
                animationType: "uniform",
            }
            : {
                ...after,
                score: 0,
                animationType: "uniform",
            };
    }

    return merged;
}

function buildVoilaClaimAggregatorMap<TId extends string, TEntity extends { position: TweenPoint; score: TweenNumber; scale: TweenNumber; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    preparedById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById: Record<TId, TEntity> = { ...preparedById };

    for (const id of Object.keys(preparedById) as TId[]) {
        const before = beforeById[id];
        const prepared = preparedById[id];
        const after = afterById[id];

        if (!prepared) {
            continue;
        }

        if (before && after) {
            nextById[id] = {
                ...prepared,
                position: tweenPoint(before.position, after.position),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                score: before.score,
                animationType: "uniform",
            };
            continue;
        }

        if (!before && after) {
            nextById[id] = {
                ...prepared,
                scale: tweenNumber(0, readTweenNumber(after.scale)),
                score: 0,
                animationType: "uniform",
            };
            continue;
        }

        if (before && !after) {
            nextById[id] = {
                ...prepared,
                position: before.position,
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                score: before.score,
                animationType: "uniform",
            };
        }
    }

    return nextById;
}

function mergeJunctionMap<TId extends string, TEntity extends { scale: TweenNumber; visible: boolean | { type: "tween/boolean"; from: boolean; to: boolean; }; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const merged: Record<TId, TEntity> = { ...beforeById };

    for (const id of Object.keys(afterById) as TId[]) {
        const before = beforeById[id];
        const after = afterById[id];

        merged[id] = before
            ? {
                ...after,
                scale: before.scale,
                visible: before.visible,
                animationType: "uniform",
            }
            : {
                ...after,
                scale: 0,
                visible: false,
                animationType: "uniform",
            };
    }

    return merged;
}

function buildSproutJunctionMap<TId extends string, TEntity extends { position: TweenPoint; leftHeight: TweenNumber; rightHeight: TweenNumber; scale: TweenNumber; visible: TweenBoolean; width: TweenNumber; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    preparedById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById: Record<TId, TEntity> = { ...preparedById };

    for (const id of Object.keys(preparedById) as TId[]) {
        const before = beforeById[id];
        const prepared = preparedById[id];
        const after = afterById[id];

        if (!prepared) {
            continue;
        }

        if (before && after) {
            nextById[id] = {
                ...prepared,
                leftHeight: tweenNumber(readTweenNumber(before.leftHeight), readTweenNumber(after.leftHeight)),
                position: tweenPoint(before.position, after.position),
                rightHeight: tweenNumber(readTweenNumber(before.rightHeight), readTweenNumber(after.rightHeight)),
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                visible: tweenBoolean(readTweenBoolean(before.visible), readTweenBoolean(after.visible)),
                width: tweenNumber(readTweenNumber(before.width), readTweenNumber(after.width)),
                animationType: "progressive",
            };
            continue;
        }

        if (!before && after) {
            nextById[id] = {
                ...prepared,
                leftHeight: tweenNumber(0, readTweenNumber(after.leftHeight)),
                rightHeight: tweenNumber(0, readTweenNumber(after.rightHeight)),
                scale: tweenNumber(0, readTweenNumber(after.scale)),
                visible: tweenBoolean(false, readTweenBoolean(after.visible)),
                width: tweenNumber(0, readTweenNumber(after.width)),
                animationType: "progressive",
            };
            continue;
        }

        if (before && !after) {
            nextById[id] = {
                ...prepared,
                leftHeight: before.leftHeight,
                position: before.position,
                rightHeight: before.rightHeight,
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                visible: tweenBoolean(readTweenBoolean(before.visible), false),
                width: before.width,
                animationType: "progressive",
            };
        }
    }

    return nextById;
}

function mergeJunctionAggregatorMap<TId extends string, TEntity extends { score: TweenNumber; scale: TweenNumber; visible: boolean | { type: "tween/boolean"; from: boolean; to: boolean; }; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const merged: Record<TId, TEntity> = { ...beforeById };

    for (const id of Object.keys(afterById) as TId[]) {
        const before = beforeById[id];
        const after = afterById[id];

        merged[id] = before
            ? {
                ...after,
                score: before.score,
                scale: before.scale,
                visible: before.visible,
                animationType: "uniform",
            }
            : {
                ...after,
                score: 0,
                scale: 0,
                visible: false,
                animationType: "uniform",
            };
    }

    return merged;
}

function buildSproutJunctionAggregatorMap<TId extends string, TEntity extends { position: TweenPoint; score: TweenNumber; scale: TweenNumber; visible: TweenBoolean; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    preparedById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById: Record<TId, TEntity> = { ...preparedById };

    for (const id of Object.keys(preparedById) as TId[]) {
        const before = beforeById[id];
        const prepared = preparedById[id];
        const after = afterById[id];

        if (!prepared) {
            continue;
        }

        if (before && after) {
            nextById[id] = {
                ...prepared,
                position: tweenPoint(before.position, after.position),
                score: before.score,
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                visible: tweenBoolean(readTweenBoolean(before.visible), readTweenBoolean(after.visible)),
                animationType: "progressive",
            };
            continue;
        }

        if (!before && after) {
            nextById[id] = {
                ...prepared,
                score: 0,
                scale: tweenNumber(0, readTweenNumber(after.scale)),
                visible: tweenBoolean(false, readTweenBoolean(after.visible)),
                animationType: "progressive",
            };
            continue;
        }

        if (before && !after) {
            nextById[id] = {
                ...prepared,
                position: before.position,
                score: before.score,
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                visible: tweenBoolean(readTweenBoolean(before.visible), false),
                animationType: "progressive",
            };
        }
    }

    return nextById;
}

function mergeConfidenceConnectorMap<TId extends string, TEntity extends { score: TweenNumber; scale: TweenNumber; visible: boolean | { type: "tween/boolean"; from: boolean; to: boolean; }; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    return mergeJunctionAggregatorMap(beforeById, afterById);
}

function buildSproutConfidenceConnectorMap<TId extends string, TEntity extends { source: TweenPoint; target: TweenPoint; centerlinePoints: SnapshotWaypoint[]; score: TweenNumber; scale: TweenNumber; visible: TweenBoolean; animationType: "uniform" | "progressive" }>(
    beforeById: Record<TId, TEntity>,
    preparedById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById: Record<TId, TEntity> = { ...preparedById };

    for (const id of Object.keys(preparedById) as TId[]) {
        const before = beforeById[id];
        const prepared = preparedById[id];
        const after = afterById[id];

        if (!prepared) {
            continue;
        }

        if (before && after) {
            nextById[id] = {
                ...prepared,
                source: tweenPoint(before.source, after.source),
                target: tweenPoint(before.target, after.target),
                centerlinePoints: tweenWaypointList(before.centerlinePoints, after.centerlinePoints),
                score: before.score,
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
                visible: tweenBoolean(readTweenBoolean(before.visible), readTweenBoolean(after.visible)),
                animationType: "progressive",
            };
            continue;
        }

        if (!before && after) {
            nextById[id] = {
                ...prepared,
                score: 0,
                scale: tweenNumber(0, readTweenNumber(after.scale)),
                visible: tweenBoolean(false, readTweenBoolean(after.visible)),
                animationType: "progressive",
            };
            continue;
        }

        if (before && !after) {
            nextById[id] = {
                ...prepared,
                source: before.source,
                target: before.target,
                centerlinePoints: before.centerlinePoints,
                score: before.score,
                scale: tweenNumber(readTweenNumber(before.scale), 0),
                visible: tweenBoolean(readTweenBoolean(before.visible), false),
                animationType: "progressive",
            };
        }
    }

    return nextById;
}

function mergeDeliveryConnectorMap<TId extends string, TEntity extends { score: TweenNumber; scale: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    return mergeClaimMap(beforeById, afterById);
}

function buildSproutConnectorMap<TId extends string, TEntity extends { source: TweenPoint; target: TweenPoint; centerlinePoints: SnapshotWaypoint[]; score: TweenNumber; scale: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    preparedById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    const nextById: Record<TId, TEntity> = { ...preparedById };

    for (const id of Object.keys(preparedById) as TId[]) {
        const before = beforeById[id];
        const prepared = preparedById[id];
        const after = afterById[id];

        if (!prepared) {
            continue;
        }

        if (before && after) {
            nextById[id] = {
                ...prepared,
                source: tweenPoint(before.source, after.source),
                target: tweenPoint(before.target, after.target),
                centerlinePoints: tweenWaypointList(before.centerlinePoints, after.centerlinePoints),
                score: before.score,
                scale: tweenNumber(readTweenNumber(before.scale), readTweenNumber(after.scale)),
            };
            continue;
        }

        if (!before && after) {
            nextById[id] = {
                ...prepared,
                score: 0,
                scale: tweenNumber(0, readTweenNumber(after.scale)),
            };
            continue;
        }

        if (before && !after) {
            nextById[id] = {
                ...prepared,
                source: before.source,
                target: before.target,
                centerlinePoints: before.centerlinePoints,
                score: before.score,
                scale: tweenNumber(readTweenNumber(before.scale), 0),
            };
        }
    }

    return nextById;
}

function tweenNumber(from: number, to: number): TweenNumber {
    return from === to
        ? to
        : {
            type: "tween/number",
            from,
            to,
        };
}

function tweenBoolean(from: boolean, to: boolean): TweenBoolean {
    return from === to
        ? to
        : {
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
            `Cannot tween connector centerline points with different waypoint counts: ${from.length} vs ${to.length}.`,
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

function readPointX(point: TweenPoint): number {
    return readTweenNumber(point.x);
}

function readPointY(point: TweenPoint): number {
    return readTweenNumber(point.y);
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

function mergeRelevanceConnectorMap<TId extends string, TEntity extends { score: TweenNumber; scale: TweenNumber }>(
    beforeById: Record<TId, TEntity>,
    afterById: Record<TId, TEntity>,
): Record<TId, TEntity> {
    return mergeClaimMap(beforeById, afterById);
}