import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import type {
    ApplyCommandResult,
    Claim,
    ClaimId,
    ConfidenceConnectorId,
    RelevanceConnectorId,
    ScoreChangeWaveTimelineRun,
    ScoreGraph,
    ScoreNodeId,
    Snapshot,
    ScoreWaveStep,
    TargetRelation,
} from "../../app/src/app.ts";
import {
    buildProjectedCommandScoreWaveTimelines,
    calculateScoreChanges,
} from "../../app/src/app.ts";
import {
    GRAPH_PADDING_PX,
    getPlannerSnapshotSceneBounds,
    getPlannerSnapshotViewportTarget,
    renderPlannerSnapshotScene,
    type Bounds,
    type PlannerSnapshotRenderMode,
} from "@reasontracker/components";

import { Fade } from "./shared/Fade";
import { PlannerRenderSurface } from "./shared/PlannerRenderSurface";
import { buildTimelineTimes, type TimelineEntry } from "./shared/timeline";
import { getZoomMotionState } from "./shared/zoomMotion";

const EPISODE001_FPS = 30;

// AGENT NOTE: Keep Episode001 pacing grouped here so frame timing stays easy to tune.
/** Seconds spent fading the graph in and out. */
const EPISODE001_BACKGROUND_FADE_SECONDS = 0.7;
/** Seconds to hold on the initial graph before the first command animation. */
const EPISODE001_OPENING_HOLD_SECONDS = 1.2;
/** Seconds to hold on the final graph before fading out. */
const EPISODE001_END_HOLD_SECONDS = 2;

/** Seconds spent moving the camera toward the next action target. */
const EPISODE001_CAMERA_MOVE_SECONDS = 0.6;
/** Padding retained between the focused graph target and the video frame. */
const EPISODE001_CAMERA_VIEWPORT_PADDING_PX = 100;

const MAIN_CLAIM_ID = "claim-main" as ClaimId;
const MAIN_SCORE_NODE_ID = "score-main" as ScoreNodeId;

const FOOT_TRAFFIC_CLAIM_ID = "claim-foot-traffic" as ClaimId;
const SAFETY_RISK_CLAIM_ID = "claim-safety-risk" as ClaimId;
const SAFETY_PRIORITY_CLAIM_ID = "claim-safety-priority" as ClaimId;
const RAILROAD_STREET_CLAIM_ID = "claim-railroad-street" as ClaimId;
const COST_CLAIM_ID = "claim-cost" as ClaimId;
const PAYBACK_CLAIM_ID = "claim-payback" as ClaimId;
const FOOT_TRAFFIC_EVENTS_CLAIM_ID = "claim-foot-traffic-events" as ClaimId;
const FOOT_TRAFFIC_DINING_CLAIM_ID = "claim-foot-traffic-dining" as ClaimId;
const FOOT_TRAFFIC_DELIVERIES_CLAIM_ID = "claim-foot-traffic-deliveries" as ClaimId;

const FOOT_TRAFFIC_CONNECTOR_ID = "connector-foot-traffic" as ConfidenceConnectorId;
const SAFETY_RISK_CONNECTOR_ID = "connector-safety-risk" as ConfidenceConnectorId;
const SAFETY_PRIORITY_CONNECTOR_ID = "connector-safety-priority" as RelevanceConnectorId;
const RAILROAD_STREET_CONNECTOR_ID = "connector-railroad-street" as ConfidenceConnectorId;
const COST_CONNECTOR_ID = "connector-cost" as ConfidenceConnectorId;
const PAYBACK_CONNECTOR_ID = "connector-payback" as RelevanceConnectorId;
const FOOT_TRAFFIC_EVENTS_CONNECTOR_ID = "connector-foot-traffic-events" as ConfidenceConnectorId;
const FOOT_TRAFFIC_DINING_CONNECTOR_ID = "connector-foot-traffic-dining" as ConfidenceConnectorId;
const FOOT_TRAFFIC_DELIVERIES_CONNECTOR_ID = "connector-foot-traffic-deliveries" as ConfidenceConnectorId;

const FOOT_TRAFFIC_SCORE_NODE_ID = "score-foot-traffic" as ScoreNodeId;
const SAFETY_RISK_SCORE_NODE_ID = "score-safety-risk" as ScoreNodeId;
const SAFETY_PRIORITY_SCORE_NODE_ID = "score-safety-priority" as ScoreNodeId;
const RAILROAD_STREET_SCORE_NODE_ID = "score-railroad-street" as ScoreNodeId;
const COST_SCORE_NODE_ID = "score-cost" as ScoreNodeId;
const PAYBACK_SCORE_NODE_ID = "score-payback" as ScoreNodeId;
const FOOT_TRAFFIC_EVENTS_SCORE_NODE_ID = "score-foot-traffic-events" as ScoreNodeId;
const FOOT_TRAFFIC_DINING_SCORE_NODE_ID = "score-foot-traffic-dining" as ScoreNodeId;
const FOOT_TRAFFIC_DELIVERIES_SCORE_NODE_ID = "score-foot-traffic-deliveries" as ScoreNodeId;

type Episode001ActionId =
    | "addFootTraffic"
    | "addSafetyRisk"
    | "addSafetyPriority"
    | "addRailroadStreet"
    | "addCost"
    | "addPayback"
    | "addFootTrafficEvents"
    | "addFootTrafficDining"
    | "addFootTrafficDeliveries";

type Episode001Connection =
    | {
        type: "confidence";
        id: ConfidenceConnectorId;
        scoreNodeId: ScoreNodeId;
        targetRelationship: TargetRelation;
    }
    | {
        type: "relevance";
        id: RelevanceConnectorId;
        scoreNodeId: ScoreNodeId;
        targetRelationship: TargetRelation;
    };

type Episode001Command = {
    type: "claim/add";
    targetScoreNodeId: ScoreNodeId;
    claim: Claim;
    connection: Episode001Connection;
};

type Episode001StoryboardAction = {
    id: Episode001ActionId;
    command: Episode001Command;
    waitAfterSeconds: number;
};

type Episode001ViewportTarget = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type Episode001CameraMovePlan = {
    id: string;
    name: string;
    target: Episode001ViewportTarget;
};

type Episode001GraphClip = {
    id: string;
    animated: boolean;
    mode: PlannerSnapshotRenderMode;
    name: string;
    snapshot: Snapshot;
};

type Episode001Plan = {
    cameraMoves: Episode001CameraMovePlan[];
    graphClips: Episode001GraphClip[];
    finalSnapshot: ScoreChangeWaveTimelineRun<Episode001Command>["finalSnapshot"];
    initialViewportTarget: Episode001ViewportTarget;
    initialSnapshot: ScoreChangeWaveTimelineRun<Episode001Command>["initialSnapshot"];
    timelineEntries: TimelineEntry<string>[];
    viewportBounds: Bounds;
};

type Episode001ProjectionData = {
    claimContentById: Record<ClaimId, string>;
    initialGraph: ScoreGraph;
};

type Episode001GraphEventTimes = Record<string, { from: number; durationInFrames: number }>;

const episode001MainClaim: Claim = {
    id: MAIN_CLAIM_ID,
    content: "Fictional City would benefit overall from converting Elm Street to pedestrian use only.",
};

const episode001StoryboardActions: readonly Episode001StoryboardAction[] = [
    {
        id: "addFootTraffic",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreNodeId: MAIN_SCORE_NODE_ID,
            claim: {
                id: FOOT_TRAFFIC_CLAIM_ID,
                content: "Converting Elm Street to pedestrian use only will increase foot traffic to local shops by 15%.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_CONNECTOR_ID,
                scoreNodeId: FOOT_TRAFFIC_SCORE_NODE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addSafetyRisk",
        waitAfterSeconds: 0.8,
        command: {
            type: "claim/add",
            targetScoreNodeId: MAIN_SCORE_NODE_ID,
            claim: {
                id: SAFETY_RISK_CLAIM_ID,
                content: "The conversion will divert traffic down residential streets and endanger the lives of children.",
            },
            connection: {
                type: "confidence",
                id: SAFETY_RISK_CONNECTOR_ID,
                scoreNodeId: SAFETY_RISK_SCORE_NODE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addSafetyPriority",
        waitAfterSeconds: 0.8,
        command: {
            type: "claim/add",
            targetScoreNodeId: SAFETY_RISK_SCORE_NODE_ID,
            claim: {
                id: SAFETY_PRIORITY_CLAIM_ID,
                content: "Child safety is more important than local shop profit.",
            },
            connection: {
                type: "relevance",
                id: SAFETY_PRIORITY_CONNECTOR_ID,
                scoreNodeId: SAFETY_PRIORITY_SCORE_NODE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addRailroadStreet",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreNodeId: SAFETY_RISK_SCORE_NODE_ID,
            claim: {
                id: RAILROAD_STREET_CLAIM_ID,
                content: "Unused railroad tracks can be converted into a new street, cancelling out the traffic diversion problem.",
            },
            connection: {
                type: "confidence",
                id: RAILROAD_STREET_CONNECTOR_ID,
                scoreNodeId: RAILROAD_STREET_SCORE_NODE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addCost",
        waitAfterSeconds: 0.8,
        command: {
            type: "claim/add",
            targetScoreNodeId: MAIN_SCORE_NODE_ID,
            claim: {
                id: COST_CLAIM_ID,
                content: "The conversion will cost 2 million dollars.",
            },
            connection: {
                type: "confidence",
                id: COST_CONNECTOR_ID,
                scoreNodeId: COST_SCORE_NODE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addPayback",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreNodeId: COST_SCORE_NODE_ID,
            claim: {
                id: PAYBACK_CLAIM_ID,
                content: "The increase in revenue will pay off the expense in under 2 years, meeting the city's investment requirements.",
            },
            connection: {
                type: "relevance",
                id: PAYBACK_CONNECTOR_ID,
                scoreNodeId: PAYBACK_SCORE_NODE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addFootTrafficEvents",
        waitAfterSeconds: 0.6,
        command: {
            type: "claim/add",
            targetScoreNodeId: FOOT_TRAFFIC_SCORE_NODE_ID,
            claim: {
                id: FOOT_TRAFFIC_EVENTS_CLAIM_ID,
                content: "Weekend street events would drive even more visitors onto Elm Street.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_EVENTS_CONNECTOR_ID,
                scoreNodeId: FOOT_TRAFFIC_EVENTS_SCORE_NODE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addFootTrafficDining",
        waitAfterSeconds: 0.6,
        command: {
            type: "claim/add",
            targetScoreNodeId: FOOT_TRAFFIC_SCORE_NODE_ID,
            claim: {
                id: FOOT_TRAFFIC_DINING_CLAIM_ID,
                content: "Outdoor dining would keep shoppers on Elm Street for longer visits.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_DINING_CONNECTOR_ID,
                scoreNodeId: FOOT_TRAFFIC_DINING_SCORE_NODE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addFootTrafficDeliveries",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreNodeId: FOOT_TRAFFIC_SCORE_NODE_ID,
            claim: {
                id: FOOT_TRAFFIC_DELIVERIES_CLAIM_ID,
                content: "Delivery disruptions could reduce some shop visits during the transition.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_DELIVERIES_CONNECTOR_ID,
                scoreNodeId: FOOT_TRAFFIC_DELIVERIES_SCORE_NODE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
] as const;

const episode001ProjectionData = buildEpisode001ProjectionData();
const episode001ScoreChangeRun = calculateScoreChanges({
    graph: episode001ProjectionData.initialGraph,
    commands: episode001StoryboardActions.map((action) => action.command),
    applyCommand: applyEpisode001CommandToScoreGraph,
});
const episode001WaveTimelineRun = buildProjectedCommandScoreWaveTimelines({
    scoreChangeRun: episode001ScoreChangeRun,
    projectionOptions: {
        claimContentById: episode001ProjectionData.claimContentById,
    },
    includeScaleAndOrderSteps: true,
});
const episode001Plan = buildEpisode001Plan(episode001WaveTimelineRun);
// --- SNAPSHOT LOGGING FOR DEBUG ---
if (typeof window !== "undefined" && (window as any).console) {
    // Log all snapshots in the plan for inspection
    for (const clip of episode001Plan.graphClips) {
        // Print a summary header and the snapshot object
        console.log(
            `[Episode001] Snapshot: ${clip.id} | ${clip.name}`,
            clip.snapshot
        );
    }
}
const episode001Timeline = buildTimelineTimes(episode001Plan.timelineEntries, EPISODE001_FPS);

export const EPISODE001_DURATION_IN_FRAMES = episode001Timeline.totalDurationInFrames;

export const Episode001 = () => {
    const graphEventTimes = episode001Timeline.times;
    const graphFadeFrom = graphEventTimes.BackgroundFadeIn.from;
    const graphFadeDurationInFrames = graphEventTimes.BackgroundFadeout.from
        + graphEventTimes.BackgroundFadeout.durationInFrames
        - graphFadeFrom;

    return (
        <AbsoluteFill style={{ background: "#000000" }}>
            <Fade
                from={graphFadeFrom}
                durationInFrames={graphFadeDurationInFrames}
                fadeInFrames={graphEventTimes.BackgroundFadeIn.durationInFrames}
                fadeOutFrames={graphEventTimes.BackgroundFadeout.durationInFrames}
                name="Graph Fade"
            >
                <Episode001GraphSurface
                    cameraMoves={episode001Plan.cameraMoves}
                    finalSnapshot={episode001Plan.finalSnapshot}
                    graphClips={episode001Plan.graphClips}
                    graphEventTimes={graphEventTimes}
                    initialSnapshot={episode001Plan.initialSnapshot}
                    initialViewportTarget={episode001Plan.initialViewportTarget}
                    viewportBounds={episode001Plan.viewportBounds}
                />
            </Fade>

            {episode001Plan.graphClips.map((clip) => (
                <Sequence
                    key={clip.id}
                    from={graphEventTimes[clip.id].from}
                    durationInFrames={graphEventTimes[clip.id].durationInFrames}
                    name={clip.name}
                    layout="none"
                >
                    <span style={{ display: "none" }} />
                </Sequence>
            ))}
        </AbsoluteFill>
    );
};

function buildEpisode001ProjectionData(): Episode001ProjectionData {
    const claimContentById = {
        [episode001MainClaim.id]: episode001MainClaim.content,
    } satisfies Record<ClaimId, string>;
    const claimIdByScoreNodeId: Partial<Record<ScoreNodeId, ClaimId>> = {
        [MAIN_SCORE_NODE_ID]: episode001MainClaim.id,
    };
    const confidenceConnectorIdByScoreNodeId: Partial<Record<ScoreNodeId, ConfidenceConnectorId>> = {};

    for (const action of episode001StoryboardActions) {
        const targetClaimId = claimIdByScoreNodeId[action.command.targetScoreNodeId];

        if (!targetClaimId) {
            throw new Error(`Episode001 target score node is missing a claim mapping: ${action.command.targetScoreNodeId}`);
        }

        claimContentById[action.command.claim.id] = action.command.claim.content;
        claimIdByScoreNodeId[action.command.connection.scoreNodeId] = action.command.claim.id;

        if (action.command.connection.type === "confidence") {
            confidenceConnectorIdByScoreNodeId[action.command.connection.scoreNodeId] = action.command.connection.id;
            continue;
        }

        const targetConfidenceConnectorId = confidenceConnectorIdByScoreNodeId[action.command.targetScoreNodeId];

        if (!targetConfidenceConnectorId) {
            throw new Error(`Episode001 relevance target is missing a confidence connector: ${action.command.targetScoreNodeId}`);
        }

    }

    return {
        claimContentById,
        initialGraph: buildEpisode001InitialGraph(),
    };
}

function buildEpisode001InitialGraph(): ScoreGraph {
    return {
        nodes: {
            [MAIN_SCORE_NODE_ID]: {
                id: MAIN_SCORE_NODE_ID,
                claimId: episode001MainClaim.id,
                affects: "Score",
            },
        },
    };
}

function applyEpisode001CommandToScoreGraph(
    graph: ScoreGraph,
    command: Episode001Command,
): ApplyCommandResult {
    if (graph.nodes[command.connection.scoreNodeId]) {
        throw new Error(`Episode001 score node already exists: ${command.connection.scoreNodeId}`);
    }

    if (!graph.nodes[command.targetScoreNodeId]) {
        throw new Error(`Episode001 target score node is missing: ${command.targetScoreNodeId}`);
    }

    return {
        graph: {
            ...graph,
            nodes: {
                ...graph.nodes,
                [command.connection.scoreNodeId]: {
                    id: command.connection.scoreNodeId,
                    claimId: command.claim.id,
                    parentId: command.targetScoreNodeId,
                    proParent: command.connection.targetRelationship === "proTarget",
                    affects: command.connection.type === "confidence" ? "Score" : "Relevance",
                },
            },
        },
        directScoreNodeIds: [command.connection.scoreNodeId],
    };
}

function buildEpisode001Plan(
    waveTimelineRun: ScoreChangeWaveTimelineRun<Episode001Command>,
): Episode001Plan {
    const cameraMoves: Episode001CameraMovePlan[] = [];
    const graphClips: Episode001GraphClip[] = [];
    const timelineEntries: TimelineEntry<string>[] = [
        ["BackgroundFadeIn", EPISODE001_BACKGROUND_FADE_SECONDS],
    ];
    const initialHoldSeconds = Math.max(0, EPISODE001_OPENING_HOLD_SECONDS - EPISODE001_CAMERA_MOVE_SECONDS);

    if (initialHoldSeconds > 0) {
        graphClips.push({
            id: "initialHold",
            animated: false,
            mode: "order",
            name: "Initial Hold",
            snapshot: waveTimelineRun.initialSnapshot,
        });
        timelineEntries.push(["initialHold", initialHoldSeconds]);
    }

    let currentSnapshot = waveTimelineRun.initialSnapshot;

    for (const [commandIndex, commandTimeline] of waveTimelineRun.commandTimelines.entries()) {
        const command = episode001StoryboardActions[commandIndex]?.command;
        const action = episode001StoryboardActions[commandIndex];

        if (!action || !command) {
            throw new Error(`Episode001 storyboard action is missing for command index ${commandIndex}`);
        }

        const cameraMoveId = getEpisode001CameraMoveId(action.id);
        cameraMoves.push({
            id: cameraMoveId,
            name: `Camera ${action.id}`,
            target: getEpisode001ViewportTarget(commandTimeline.timeline.finalSnapshot),
        });
        graphClips.push({
            id: cameraMoveId,
            animated: false,
            mode: "order",
            name: `Camera: ${command.claim.content}`,
            snapshot: currentSnapshot,
        });
        timelineEntries.push([cameraMoveId, EPISODE001_CAMERA_MOVE_SECONDS]);
        for (const [stepIndex, step] of commandTimeline.timeline.steps.entries()) {
            const id = getEpisode001StepId(commandIndex, stepIndex);
            graphClips.push({
                id,
                animated: true,
                mode: getEpisode001StepRenderMode(step),
                name: describeEpisode001StepName(step, command),
                snapshot: step.snapshot,
            });
            timelineEntries.push([id, getScoreWaveStepDurationSeconds(step)]);
        }

        const hasNextAction = commandIndex < episode001StoryboardActions.length - 1;
        const waitAfterSeconds = hasNextAction
            ? Math.max(0, action.waitAfterSeconds - EPISODE001_CAMERA_MOVE_SECONDS)
            : action.waitAfterSeconds;

        if (waitAfterSeconds > 0) {
            const holdId = getEpisode001HoldId(action.id);
            graphClips.push({
                id: holdId,
                animated: false,
                mode: "order",
                name: `Hold: ${command.claim.content}`,
                snapshot: commandTimeline.timeline.finalSnapshot,
            });
            timelineEntries.push([holdId, waitAfterSeconds]);
        }

        currentSnapshot = commandTimeline.timeline.finalSnapshot;
    }

    graphClips.push({
        id: "finalHold",
        animated: false,
        mode: "order",
        name: "Final Hold",
        snapshot: waveTimelineRun.finalSnapshot,
    });

    timelineEntries.push(
        ["finalHold", EPISODE001_END_HOLD_SECONDS],
        ["BackgroundFadeout", EPISODE001_BACKGROUND_FADE_SECONDS],
    );

    const viewportBounds = buildEpisode001ViewportBounds(graphClips, waveTimelineRun.initialSnapshot, waveTimelineRun.finalSnapshot);

    return {
        cameraMoves: cameraMoves.map((move) => ({
            ...move,
            target: offsetEpisode001ViewportTarget(move.target, viewportBounds),
        })),
        finalSnapshot: waveTimelineRun.finalSnapshot,
        graphClips,
        initialViewportTarget: offsetEpisode001ViewportTarget(
            getPlannerSnapshotViewportTarget({
                snapshot: waveTimelineRun.initialSnapshot,
                percent: 1,
                mode: "order",
            }),
            viewportBounds,
        ),
        initialSnapshot: waveTimelineRun.initialSnapshot,
        timelineEntries,
        viewportBounds,
    };
}

function getEpisode001StepId(commandIndex: number, stepIndex: number): string {
    return `command-${commandIndex + 1}-step-${stepIndex + 1}`;
}

function getEpisode001CameraMoveId(actionId: Episode001ActionId): string {
    return `camera-${actionId}`;
}

function getEpisode001HoldId(actionId: Episode001ActionId): string {
    return `hold-${actionId}`;
}

function getScoreWaveStepDurationSeconds(step: ScoreWaveStep): number {
    switch (step.type) {
        case "firstFill":
            return 0.65;
        case "voila":
            return 0.7;
        case "sprout":
            return 0.75;
        case "relevanceConnectorAdjust":
        case "confidenceConnectorAdjust":
        case "deliveryConnectorAdjust":
        case "claimAdjust":
            return 0.55;
        case "junctionAggregatorAdjust":
        case "junctionAdjust":
        case "claimAggregatorAdjust":
            return 0.45;
        case "scale":
        case "order":
            return 0.75;
    }

    throw new Error(`Unsupported Episode001 score wave step type: ${String(step.type)}`);
}

function describeScoreWaveStep(step: ScoreWaveStep): string {
    switch (step.type) {
        case "firstFill":
            return "First Fill";
        case "voila":
            return "Voila";
        case "sprout":
            return "Sprout";
        case "relevanceConnectorAdjust":
            return "Relevance Connector Adjust";
        case "junctionAggregatorAdjust":
            return "Junction Aggregator Adjust";
        case "confidenceConnectorAdjust":
            return "Confidence Connector Adjust";
        case "junctionAdjust":
            return "Junction Adjust";
        case "deliveryConnectorAdjust":
            return "Delivery Connector Adjust";
        case "claimAggregatorAdjust":
            return "Claim Aggregator Adjust";
        case "claimAdjust":
            return "Claim Adjust";
        case "scale":
            return "Scale";
        case "order":
            return "Order";
    }

    throw new Error(`Unsupported Episode001 score wave step label: ${String(step.type)}`);
}

function describeEpisode001StepName(step: ScoreWaveStep, command: Episode001Command): string {
    const baseLabel = describeScoreWaveStep(step);

    return `${baseLabel}: ${command.claim.content}`;
}

function getEpisode001StepRenderMode(step: ScoreWaveStep): PlannerSnapshotRenderMode {
    return step.type;
}

function getEpisode001ViewportTarget(snapshot: Snapshot): Episode001ViewportTarget {
    return getPlannerSnapshotViewportTarget({
        snapshot,
        percent: 1,
        mode: "order",
    });
}

function buildEpisode001ViewportBounds(
    graphClips: readonly Episode001GraphClip[],
    initialSnapshot: Snapshot,
    finalSnapshot: Snapshot,
): Bounds {
    let bounds = mergeEpisode001Bounds(
        undefined,
        getPlannerSnapshotSceneBounds({
            snapshot: initialSnapshot,
            percent: 1,
            mode: "order",
        }),
    );

    for (const clip of graphClips) {
        bounds = mergeEpisode001Bounds(
            bounds,
            getPlannerSnapshotSceneBounds({
                snapshot: clip.snapshot,
                percent: 1,
                mode: clip.mode,
            }),
        );
    }

    bounds = mergeEpisode001Bounds(
        bounds,
        getPlannerSnapshotSceneBounds({
            snapshot: finalSnapshot,
            percent: 1,
            mode: "order",
        }),
    );

    return bounds ?? {
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
    };
}

function mergeEpisode001Bounds(current: Bounds | undefined, next: Bounds): Bounds {
    if (!current) {
        return next;
    }

    return {
        minX: Math.min(current.minX, next.minX),
        minY: Math.min(current.minY, next.minY),
        maxX: Math.max(current.maxX, next.maxX),
        maxY: Math.max(current.maxY, next.maxY),
    };
}


function offsetEpisode001ViewportTarget(
    target: Episode001ViewportTarget,
    viewportBounds: Bounds,
): Episode001ViewportTarget {
    return {
        ...target,
        x: target.x + GRAPH_PADDING_PX - viewportBounds.minX,
        y: target.y + GRAPH_PADDING_PX - viewportBounds.minY,
    };
}

const Episode001GraphSurface = ({
    cameraMoves,
    finalSnapshot,
    graphClips,
    graphEventTimes,
    initialSnapshot,
    initialViewportTarget,
    viewportBounds,
}: {
    cameraMoves: readonly Episode001CameraMovePlan[];
    finalSnapshot: Snapshot;
    graphClips: readonly Episode001GraphClip[];
    graphEventTimes: Episode001GraphEventTimes;
    initialSnapshot: Snapshot;
    initialViewportTarget: Episode001ViewportTarget;
    viewportBounds: Bounds;
}) => {
    const currentFrame = useCurrentFrame();
    const { width: frameWidth, height: frameHeight } = useVideoConfig();
    const activeClip = resolveEpisode001ActiveClip(currentFrame, graphClips, graphEventTimes);
    const activeSegment = activeClip ? graphEventTimes[activeClip.id] : undefined;
    const percent = !activeClip || !activeClip.animated || !activeSegment
        ? 1
        : interpolate(
            currentFrame,
            [activeSegment.from, activeSegment.from + Math.max(1, activeSegment.durationInFrames - 1)],
            [0, 1],
            {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
            },
        );
    const snapshot = activeClip?.snapshot ?? (currentFrame < getEpisode001FirstClipStart(graphClips, graphEventTimes)
        ? initialSnapshot
        : finalSnapshot);
    const mode = activeClip?.mode ?? "order";
    const result = renderPlannerSnapshotScene({
        snapshot,
        percent,
        mode,
        viewportBounds,
    });

    return (
        <PlannerRenderSurface
            result={result}
            fitToFrame={false}
            sceneStyle={buildEpisode001GraphCameraStyle({
                cameraMoves,
                frame: currentFrame,
                frameHeight,
                frameWidth,
                graphEventTimes,
                initialViewportTarget,
            })}
        />
    );
};

function resolveEpisode001ActiveClip(
    frame: number,
    graphClips: readonly Episode001GraphClip[],
    graphEventTimes: Episode001GraphEventTimes,
) {
    for (const clip of graphClips) {
        const segment = graphEventTimes[clip.id];

        if (!segment) {
            continue;
        }

        if (frame >= segment.from && frame < segment.from + segment.durationInFrames) {
            return clip;
        }
    }

    return undefined;
}

function getEpisode001FirstClipStart(
    graphClips: readonly Episode001GraphClip[],
    graphEventTimes: Episode001GraphEventTimes,
): number {
    let firstClipStart = Number.POSITIVE_INFINITY;

    for (const clip of graphClips) {
        const segment = graphEventTimes[clip.id];

        if (!segment) {
            continue;
        }

        firstClipStart = Math.min(firstClipStart, segment.from);
    }

    return Number.isFinite(firstClipStart) ? firstClipStart : 0;
}

function buildEpisode001GraphCameraStyle(args: {
    cameraMoves: readonly Episode001CameraMovePlan[];
    frame: number;
    frameHeight: number;
    frameWidth: number;
    graphEventTimes: Episode001GraphEventTimes;
    initialViewportTarget: Episode001ViewportTarget;
}) {
    const camera = resolveEpisode001CameraState(args);

    return {
        transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})`,
        transformOrigin: "top left",
    };
}

function resolveEpisode001CameraState(args: {
    cameraMoves: readonly Episode001CameraMovePlan[];
    frame: number;
    frameHeight: number;
    frameWidth: number;
    graphEventTimes: Episode001GraphEventTimes;
    initialViewportTarget: Episode001ViewportTarget;
}) {
    let currentState = getEpisode001CameraFocusState(
        args.initialViewportTarget,
        args.frameWidth,
        args.frameHeight,
    );

    for (const move of args.cameraMoves) {
        const segment = args.graphEventTimes[move.id];

        if (!segment) {
            continue;
        }

        const nextState = getEpisode001CameraFocusState(move.target, args.frameWidth, args.frameHeight);

        if (args.frame < segment.from) {
            return currentState;
        }

        const endFrame = segment.from + segment.durationInFrames;

        if (args.frame >= endFrame) {
            currentState = nextState;
            continue;
        }

        return getZoomMotionState({
            frame: args.frame,
            startFrame: segment.from,
            durationInFrames: segment.durationInFrames,
            startScale: currentState.scale,
            endScale: nextState.scale,
            targetX: nextState.targetX,
            targetY: nextState.targetY,
            startScreenX: currentState.translateX + nextState.targetX * currentState.scale,
            endScreenX: nextState.targetScreenX,
            startScreenY: currentState.translateY + nextState.targetY * currentState.scale,
            endScreenY: nextState.targetScreenY,
        });
    }

    return currentState;
}

function getEpisode001CameraFocusState(
    target: Episode001ViewportTarget,
    frameWidth: number,
    frameHeight: number,
) {
    const availableWidth = Math.max(1, frameWidth - EPISODE001_CAMERA_VIEWPORT_PADDING_PX * 2);
    const availableHeight = Math.max(1, frameHeight - EPISODE001_CAMERA_VIEWPORT_PADDING_PX * 2);
    const scale = Math.min(availableWidth / target.width, availableHeight / target.height);

    return {
        targetScreenX: frameWidth / 2,
        targetScreenY: frameHeight / 2,
        targetX: target.x,
        targetY: target.y,
        scale,
        translateX: frameWidth / 2 - target.x * scale,
        translateY: frameHeight / 2 - target.y * scale,
    };
}