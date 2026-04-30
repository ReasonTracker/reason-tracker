import type {
    CommandScoreChange,
    ScoreChangeRun,
} from "../math/calculateScoreChanges.ts";
import type { ScoreCalculationAudit } from "../math/calculateScoreRun.ts";
import type { ScoreNodeId } from "../math/scoreTypes.ts";
import type { Snapshot } from "./Snapshot.ts";
import {
    buildScoreWaveTimeline,
    type ScoreNodeSnapshotBindings,
    type ScoreWaveTimeline,
} from "./buildScoreWaveTimeline.ts";

export type CommandScoreWaveTimeline<TCommand> = {
    command: TCommand;
    changedScoreNodeIds: ScoreNodeId[];
    scoreAuditBefore: ScoreCalculationAudit;
    scoreAuditAfter: ScoreCalculationAudit;
    timeline: ScoreWaveTimeline;
};

export type ScoreChangeWaveTimelineRun<TCommand> = {
    initialSnapshot: Snapshot;
    commandTimelines: CommandScoreWaveTimeline<TCommand>[];
    finalSnapshot: Snapshot;
};

/**
 * Converts a score-change run into per-command score-wave timelines.
 *
 * This keeps planner playback aligned with the command sequence while still
 * using the lower-level math propagation order inside each command.
 */
export function buildCommandScoreWaveTimelines<TCommand>(args: {
    scoreChangeRun: ScoreChangeRun<TCommand>;
    initialSnapshot: Snapshot;
    bindingsByScoreNodeId?: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>;
    includeScaleAndOrderFrames?: boolean;
}): ScoreChangeWaveTimelineRun<TCommand> {
    let currentSnapshot = cloneSnapshot(args.initialSnapshot);
    const commandTimelines = args.scoreChangeRun.commandRuns.map((commandRun) => {
        const timeline = buildTimelineForCommand({
            commandRun,
            snapshot: currentSnapshot,
            bindingsByScoreNodeId: args.bindingsByScoreNodeId,
            includeScaleAndOrderFrames: args.includeScaleAndOrderFrames,
        });

        currentSnapshot = timeline.timeline.finalSnapshot;
        return timeline;
    });

    return {
        initialSnapshot: cloneSnapshot(args.initialSnapshot),
        commandTimelines,
        finalSnapshot: currentSnapshot,
    };
}

function buildTimelineForCommand<TCommand>(args: {
    commandRun: CommandScoreChange<TCommand>;
    snapshot: Snapshot;
    bindingsByScoreNodeId?: Partial<Record<ScoreNodeId, ScoreNodeSnapshotBindings>>;
    includeScaleAndOrderFrames?: boolean;
}): CommandScoreWaveTimeline<TCommand> {
    return {
        command: args.commandRun.command,
        changedScoreNodeIds: args.commandRun.changedScoreNodeIds,
        scoreAuditBefore: args.commandRun.scoreAuditBefore,
        scoreAuditAfter: args.commandRun.scoreAuditAfter,
        timeline: buildScoreWaveTimeline({
            snapshot: args.snapshot,
            propagation: args.commandRun.propagation,
            bindingsByScoreNodeId: args.bindingsByScoreNodeId,
            includeScaleAndOrderFrames: args.includeScaleAndOrderFrames,
        }),
    };
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