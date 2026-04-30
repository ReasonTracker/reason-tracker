import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";

import type {
    ApplyCommandResult,
    Claim,
    ClaimId,
    ConfidenceConnector,
    ConfidenceConnectorId,
    RelevanceConnector,
    RelevanceConnectorId,
    ScoreChangeWaveTimelineRun,
    ScoreGraph,
    ScoreNodeId,
    ScoreWaveFrame,
    TargetRelation,
} from "../../app/src/app.ts";
import {
    buildProjectedCommandScoreWaveTimelines,
    calculateScoreChanges,
} from "../../app/src/app.ts";

import { EpisodeBrandSequence } from "./shared/EpisodeBrandSequence";
import { Fade } from "./shared/Fade";
import {
    PlannerScoreWaveFrameSurface,
    PlannerSnapshotSurface,
} from "./shared/PlannerRenderSurface";
import { buildTimelineTimes, wait, type TimelineEntry } from "./shared/timeline";
import { getZoomMotionState } from "./shared/zoomMotion";

const EPISODE001_FPS = 30;

// AGENT NOTE: Keep Episode001 pacing grouped here so frame timing stays easy to tune.
/** Seconds spent fading the graph in and out. */
const EPISODE001_BACKGROUND_FADE_SECONDS = 0.7;
/** Seconds to hold on the initial graph before the first command animation. */
const EPISODE001_OPENING_HOLD_SECONDS = 1.2;
/** Seconds for the brand overlay sequence. */
const EPISODE001_BRAND_SECONDS = 3.3;
/** Seconds to hold on the final graph before fading out. */
const EPISODE001_END_HOLD_SECONDS = 2;

// AGENT NOTE: Keep Episode001 camera framing constants together so the motion
// can be tuned without hunting through composition control flow.
/** Scene-space x coordinate used as the camera target anchor. */
const EPISODE001_CAMERA_TARGET_X = 960;
/** Scene-space y coordinate used as the camera target anchor. */
const EPISODE001_CAMERA_TARGET_Y = 540;
/** Opening camera pose centered on the main claim. */
const EPISODE001_CAMERA_OPENING = { scale: 1.08, screenX: 960, screenY: 560 };
/** Early camera pose that leans toward the first supporting branch. */
const EPISODE001_CAMERA_EARLY = { scale: 1.14, screenX: 860, screenY: 520 };
/** Midway camera pose that widens back out for the growing debate. */
const EPISODE001_CAMERA_MID = { scale: 1, screenX: 960, screenY: 540 };
/** Late camera pose that drifts toward the lower-right additions. */
const EPISODE001_CAMERA_LATE = { scale: 1.06, screenX: 1030, screenY: 510 };
/** Final camera pose that settles back to a neutral centered framing. */
const EPISODE001_CAMERA_SETTLE = { scale: 1, screenX: 960, screenY: 540 };

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

type Episode001FramePlan = {
    id: string;
    frame: ScoreWaveFrame;
    name: string;
};

type Episode001Plan = {
    framePlans: Episode001FramePlan[];
    finalSnapshot: ScoreChangeWaveTimelineRun<Episode001Command>["finalSnapshot"];
    initialSnapshot: ScoreChangeWaveTimelineRun<Episode001Command>["initialSnapshot"];
    timelineEntries: TimelineEntry<string>[];
};

type Episode001ProjectionData = {
    claimById: Record<ClaimId, Claim>;
    confidenceConnectorById: Partial<Record<ConfidenceConnectorId, ConfidenceConnector>>;
    initialGraph: ScoreGraph;
    relevanceConnectorById: Partial<Record<RelevanceConnectorId, RelevanceConnector>>;
};

type Episode001CameraKeyframe = {
    scale: number;
    screenX: number;
    screenY: number;
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
        claimById: episode001ProjectionData.claimById,
        confidenceConnectorById: episode001ProjectionData.confidenceConnectorById,
        relevanceConnectorById: episode001ProjectionData.relevanceConnectorById,
    },
    includeScaleAndOrderFrames: true,
});
const episode001Plan = buildEpisode001Plan(episode001WaveTimelineRun);
const episode001Timeline = buildTimelineTimes(episode001Plan.timelineEntries, EPISODE001_FPS);

export const EPISODE001_DURATION_IN_FRAMES = episode001Timeline.totalDurationInFrames;

export const Episode001 = () => {
    const currentFrame = useCurrentFrame();
    const graphEventTimes = episode001Timeline.times;
    const graphFadeFrom = graphEventTimes.BackgroundFadeIn.from;
    const graphFadeDurationInFrames = graphEventTimes.BackgroundFadeout.from
        + graphEventTimes.BackgroundFadeout.durationInFrames
        - graphFadeFrom;
    const graphCameraStyle = buildEpisode001GraphCameraStyle(currentFrame, graphEventTimes);

    return (
        <AbsoluteFill style={{ background: "#000000" }}>
            <Fade
                from={graphFadeFrom}
                durationInFrames={graphFadeDurationInFrames}
                fadeInFrames={graphEventTimes.BackgroundFadeIn.durationInFrames}
                fadeOutFrames={graphEventTimes.BackgroundFadeout.durationInFrames}
                name="Graph Fade"
            >
                <Sequence
                    from={graphEventTimes.initialHold.from}
                    durationInFrames={graphEventTimes.initialHold.durationInFrames}
                    name="Initial Hold"
                    layout="none"
                >
                    <PlannerSnapshotSurface
                        snapshot={episode001Plan.initialSnapshot}
                        mode="order"
                        percent={1}
                        style={graphCameraStyle}
                    />
                </Sequence>

                {episode001Plan.framePlans.map((framePlan) => (
                    <Sequence
                        key={framePlan.id}
                        from={graphEventTimes[framePlan.id].from}
                        durationInFrames={graphEventTimes[framePlan.id].durationInFrames}
                        name={framePlan.name}
                        layout="none"
                    >
                        <PlannerScoreWaveFrameSurface
                            frame={framePlan.frame}
                            durationInFrames={graphEventTimes[framePlan.id].durationInFrames}
                            style={graphCameraStyle}
                        />
                    </Sequence>
                ))}

                <Sequence
                    from={graphEventTimes.finalHold.from}
                    durationInFrames={graphEventTimes.finalHold.durationInFrames}
                    name="Final Hold"
                    layout="none"
                >
                    <PlannerSnapshotSurface
                        snapshot={episode001Plan.finalSnapshot}
                        mode="order"
                        percent={1}
                        style={graphCameraStyle}
                    />
                </Sequence>
            </Fade>

            <EpisodeBrandSequence
                from={graphEventTimes.brand.from}
                durationInFrames={graphEventTimes.brand.durationInFrames}
            />
        </AbsoluteFill>
    );
};

function buildEpisode001ProjectionData(): Episode001ProjectionData {
    const claimById = {
        [episode001MainClaim.id]: episode001MainClaim,
    } satisfies Record<ClaimId, Claim>;
    const confidenceConnectorById: Partial<Record<ConfidenceConnectorId, ConfidenceConnector>> = {};
    const relevanceConnectorById: Partial<Record<RelevanceConnectorId, RelevanceConnector>> = {};
    const claimIdByScoreNodeId: Partial<Record<ScoreNodeId, ClaimId>> = {
        [MAIN_SCORE_NODE_ID]: episode001MainClaim.id,
    };
    const confidenceConnectorIdByScoreNodeId: Partial<Record<ScoreNodeId, ConfidenceConnectorId>> = {};

    for (const action of episode001StoryboardActions) {
        const targetClaimId = claimIdByScoreNodeId[action.command.targetScoreNodeId];

        if (!targetClaimId) {
            throw new Error(`Episode001 target score node is missing a claim mapping: ${action.command.targetScoreNodeId}`);
        }

        claimById[action.command.claim.id] = action.command.claim;
        claimIdByScoreNodeId[action.command.connection.scoreNodeId] = action.command.claim.id;

        if (action.command.connection.type === "confidence") {
            confidenceConnectorById[action.command.connection.id] = {
                id: action.command.connection.id,
                source: action.command.claim.id,
                targetClaimId,
                targetRelationship: action.command.connection.targetRelationship,
                type: "confidence",
            };
            confidenceConnectorIdByScoreNodeId[action.command.connection.scoreNodeId] = action.command.connection.id;
            continue;
        }

        const targetConfidenceConnectorId = confidenceConnectorIdByScoreNodeId[action.command.targetScoreNodeId];

        if (!targetConfidenceConnectorId) {
            throw new Error(`Episode001 relevance target is missing a confidence connector: ${action.command.targetScoreNodeId}`);
        }

        relevanceConnectorById[action.command.connection.id] = {
            id: action.command.connection.id,
            source: action.command.claim.id,
            targetConfidenceConnectorId,
            targetRelationship: action.command.connection.targetRelationship,
            type: "relevance",
        };
    }

    return {
        claimById,
        confidenceConnectorById,
        initialGraph: buildEpisode001InitialGraph(),
        relevanceConnectorById,
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
    const framePlans: Episode001FramePlan[] = [];
    const timelineEntries: TimelineEntry<string>[] = [
        ["BackgroundFadeIn", EPISODE001_BACKGROUND_FADE_SECONDS],
        ["initialHold", EPISODE001_OPENING_HOLD_SECONDS],
    ];

    for (const [commandIndex, commandTimeline] of waveTimelineRun.commandTimelines.entries()) {
        const command = episode001StoryboardActions[commandIndex]?.command;

        if (!command) {
            throw new Error(`Episode001 storyboard action is missing for command index ${commandIndex}`);
        }

        for (const [frameIndex, frame] of commandTimeline.timeline.frames.entries()) {
            const id = getEpisode001FrameId(commandIndex, frameIndex);
            framePlans.push({
                id,
                frame,
                name: describeEpisode001FrameName(frame, command),
            });
            timelineEntries.push([id, getScoreWaveFrameDurationSeconds(frame)]);
        }

        const waitAfterSeconds = episode001StoryboardActions[commandIndex]?.waitAfterSeconds ?? 0;

        if (waitAfterSeconds > 0) {
            timelineEntries.push([wait, waitAfterSeconds]);
        }
    }

    timelineEntries.push(
        ["finalHold", EPISODE001_END_HOLD_SECONDS],
        ["BackgroundFadeout", EPISODE001_BACKGROUND_FADE_SECONDS],
        ["brand", EPISODE001_BRAND_SECONDS],
    );

    return {
        framePlans,
        finalSnapshot: waveTimelineRun.finalSnapshot,
        initialSnapshot: waveTimelineRun.initialSnapshot,
        timelineEntries,
    };
}

function getEpisode001FrameId(commandIndex: number, frameIndex: number): string {
    return `command-${commandIndex + 1}-frame-${frameIndex + 1}`;
}

function getScoreWaveFrameDurationSeconds(frame: ScoreWaveFrame): number {
    if (frame.specialCase === "firstFill") {
        return 0.65;
    }

    switch (frame.stepType) {
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

    throw new Error(`Unsupported Episode001 score wave step type: ${String(frame.stepType)}`);
}

function describeScoreWaveFrame(frame: ScoreWaveFrame): string {
    if (frame.specialCase === "firstFill") {
        return "First Fill";
    }

    switch (frame.stepType) {
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

    throw new Error(`Unsupported Episode001 score wave frame label: ${String(frame.stepType)}`);
}

function describeEpisode001FrameName(frame: ScoreWaveFrame, command: Episode001Command): string {
    const baseLabel = describeScoreWaveFrame(frame);

    return `${baseLabel}: ${command.claim.content}`;
}

function buildEpisode001GraphCameraStyle(
    frame: number,
    graphEventTimes: Episode001GraphEventTimes,
) {
    const camera = getEpisode001GraphCameraState(frame, graphEventTimes);

    return {
        transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})`,
        transformOrigin: "0 0",
    };
}

function getEpisode001GraphCameraState(
    frame: number,
    graphEventTimes: Episode001GraphEventTimes,
) {
    const openingStart = graphEventTimes.initialHold.from;
    const earlyStart = readEpisode001EventStart(graphEventTimes, "command-2-frame-1", openingStart + 1);
    const midStart = readEpisode001EventStart(graphEventTimes, "command-5-frame-1", earlyStart + 1);
    const lateStart = readEpisode001EventStart(graphEventTimes, "command-8-frame-1", midStart + 1);
    const settleEnd = graphEventTimes.BackgroundFadeout.from + graphEventTimes.BackgroundFadeout.durationInFrames;

    if (frame <= openingStart) {
        return toEpisode001CameraState(EPISODE001_CAMERA_OPENING);
    }

    if (frame < earlyStart) {
        return interpolateEpisode001CameraState({
            frame,
            startFrame: openingStart,
            endFrame: earlyStart,
            start: EPISODE001_CAMERA_OPENING,
            end: EPISODE001_CAMERA_EARLY,
        });
    }

    if (frame < midStart) {
        return interpolateEpisode001CameraState({
            frame,
            startFrame: earlyStart,
            endFrame: midStart,
            start: EPISODE001_CAMERA_EARLY,
            end: EPISODE001_CAMERA_MID,
        });
    }

    if (frame < lateStart) {
        return interpolateEpisode001CameraState({
            frame,
            startFrame: midStart,
            endFrame: lateStart,
            start: EPISODE001_CAMERA_MID,
            end: EPISODE001_CAMERA_LATE,
        });
    }

    return interpolateEpisode001CameraState({
        frame,
        startFrame: lateStart,
        endFrame: settleEnd,
        start: EPISODE001_CAMERA_LATE,
        end: EPISODE001_CAMERA_SETTLE,
    });
}

function interpolateEpisode001CameraState(args: {
    frame: number;
    startFrame: number;
    endFrame: number;
    start: Episode001CameraKeyframe;
    end: Episode001CameraKeyframe;
}) {
    return getZoomMotionState({
        frame: args.frame,
        startFrame: args.startFrame,
        durationInFrames: Math.max(1, args.endFrame - args.startFrame),
        startScale: args.start.scale,
        endScale: args.end.scale,
        targetX: EPISODE001_CAMERA_TARGET_X,
        targetY: EPISODE001_CAMERA_TARGET_Y,
        startScreenX: args.start.screenX,
        endScreenX: args.end.screenX,
        startScreenY: args.start.screenY,
        endScreenY: args.end.screenY,
    });
}

function toEpisode001CameraState(keyframe: Episode001CameraKeyframe) {
    return {
        scale: keyframe.scale,
        translateX: keyframe.screenX - EPISODE001_CAMERA_TARGET_X * keyframe.scale,
        translateY: keyframe.screenY - EPISODE001_CAMERA_TARGET_Y * keyframe.scale,
    };
}

function readEpisode001EventStart(
    graphEventTimes: Episode001GraphEventTimes,
    eventId: string,
    fallback: number,
): number {
    return graphEventTimes[eventId]?.from ?? fallback;
}