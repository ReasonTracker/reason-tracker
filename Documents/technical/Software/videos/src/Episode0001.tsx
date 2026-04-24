import {
    type AddClaimCommand,
    type ClaimId,
    type ConfidenceConnectorId,
    type Debate,
    type DebateId,
    type RelevanceConnectorId,
    type ScoreId,
} from "../../engine/src/index.ts";

import { EpisodeBrandSequence } from "./shared/EpisodeBrandSequence";
import { EpisodeTemplate } from "./shared/EpisodeTemplate";
import { Fade } from "./shared/Fade";
import {
    CameraMove,
    countGraphEventTransitionSegments,
    getGraphViewportTarget,
    GraphEvents,
    GraphView,
    type GraphActionEntry,
} from "./shared/GraphView";
import { buildTimelineTimes, wait, type TimelineEntry } from "./shared/timeline";

// AGENT NOTE: Keep Episode 1 timing tunables grouped here so graph pacing and camera pacing stay aligned.
export const EPISODE0001_FPS = 30;
export const EPISODE0001_SECONDS_PER_OPERATION = 2;
export const EPISODE0001_CAMERA_MOVE_SECONDS = 0.6;

const EPISODE0001_BACKGROUND_FADE_SECONDS = 0.7;
const EPISODE0001_OPENING_HOLD_SECONDS = 1.2;
const EPISODE0001_BRAND_SECONDS = 3.3;
const EPISODE0001_END_HOLD_SECONDS = 2;

const MAIN_CLAIM_ID = "claim-main" as ClaimId;
const MAIN_SCORE_ID = "score-main" as ScoreId;
const EPISODE_DEBATE_ID = "debate-episode-0001" as DebateId;

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

const FOOT_TRAFFIC_SCORE_ID = "score-foot-traffic" as ScoreId;
const SAFETY_RISK_SCORE_ID = "score-safety-risk" as ScoreId;
const SAFETY_PRIORITY_SCORE_ID = "score-safety-priority" as ScoreId;
const RAILROAD_STREET_SCORE_ID = "score-railroad-street" as ScoreId;
const COST_SCORE_ID = "score-cost" as ScoreId;
const PAYBACK_SCORE_ID = "score-payback" as ScoreId;
const FOOT_TRAFFIC_EVENTS_SCORE_ID = "score-foot-traffic-events" as ScoreId;
const FOOT_TRAFFIC_DINING_SCORE_ID = "score-foot-traffic-dining" as ScoreId;
const FOOT_TRAFFIC_DELIVERIES_SCORE_ID = "score-foot-traffic-deliveries" as ScoreId;

type Episode0001ActionTimelineId =
    | "addFootTraffic"
    | "addSafetyRisk"
    | "addSafetyPriority"
    | "addRailroadStreet"
    | "addCost"
    | "addPayback"
    | "addFootTrafficEvents"
    | "addFootTrafficDining"
    | "addFootTrafficDeliveries";

type Episode0001CameraTimelineId = `camera-${Episode0001ActionTimelineId}`;

type Episode0001TimelineId =
    | Episode0001ActionTimelineId
    | Episode0001CameraTimelineId
    | "BackgroundFadeIn"
    | "brand"
    | "BackgroundFadeout";

interface Episode0001StoryboardAction {
    id: Episode0001ActionTimelineId;
    scriptBeat: string;
    command: AddClaimCommand;
    waitAfterSeconds: number;
}

interface Episode0001CameraMovePlan {
    id: Episode0001CameraTimelineId;
    name: string;
    target: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

interface Episode0001Plan {
    cameraMoves: readonly Episode0001CameraMovePlan[];
    timelineEntries: TimelineEntry<Episode0001TimelineId>[];
}

const episode0001Debate: Debate = {
    id: EPISODE_DEBATE_ID,
    name: "Episode 1 Elm Street",
    description: "Story-driven Elm Street debate used by the first Remotion episode fixture.",
    mainClaimId: MAIN_CLAIM_ID,
    claims: {
        [MAIN_CLAIM_ID]: {
            id: MAIN_CLAIM_ID,
            content: "Fictional City would benefit overall from converting Elm Street to pedestrian use only.",
        },
    },
    connectors: {},
    scores: {
        [MAIN_SCORE_ID]: {
            id: MAIN_SCORE_ID,
            claimId: MAIN_CLAIM_ID,
            incomingScoreIds: [],
            claimConfidence: 1,
            reversibleClaimConfidence: 1,
            connectorConfidence: 1,
            reversibleConnectorConfidence: 1,
            relevance: 1,
            scaleOfSources: 1,
            deliveryScaleOfSources: 1,
            claimSide: "proMain",
            connectorSide: "proMain",
        },
    },
};

const episode0001StoryboardActions: readonly Episode0001StoryboardAction[] = [
    {
        id: "addFootTraffic",
        scriptBeat: "To start, we add that converting Elm Street will increase foot traffic to local shops by 15%.",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreId: MAIN_SCORE_ID,
            claim: {
                id: FOOT_TRAFFIC_CLAIM_ID,
                content: "Converting Elm Street to pedestrian use only will increase foot traffic to local shops by 15%.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_CONNECTOR_ID,
                scoreId: FOOT_TRAFFIC_SCORE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addSafetyRisk",
        scriptBeat: "Someone points out that the conversion will divert traffic down residential streets and endanger the lives of children.",
        waitAfterSeconds: 0.8,
        command: {
            type: "claim/add",
            targetScoreId: MAIN_SCORE_ID,
            claim: {
                id: SAFETY_RISK_CLAIM_ID,
                content: "The conversion will divert traffic down residential streets and endanger the lives of children.",
            },
            connection: {
                type: "confidence",
                id: SAFETY_RISK_CONNECTOR_ID,
                scoreId: SAFETY_RISK_SCORE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addSafetyPriority",
        scriptBeat: "We add that child safety is more important than local shop profit.",
        waitAfterSeconds: 0.8,
        command: {
            type: "claim/add",
            targetScoreId: SAFETY_RISK_SCORE_ID,
            claim: {
                id: SAFETY_PRIORITY_CLAIM_ID,
                content: "Child safety is more important than local shop profit.",
            },
            connection: {
                type: "relevance",
                id: SAFETY_PRIORITY_CONNECTOR_ID,
                scoreId: SAFETY_PRIORITY_SCORE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addRailroadStreet",
        scriptBeat: "The city realizes unused railroad tracks can be converted into a new street, cancelling out the traffic problem.",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreId: SAFETY_RISK_SCORE_ID,
            claim: {
                id: RAILROAD_STREET_CLAIM_ID,
                content: "Unused railroad tracks can be converted into a new street, cancelling out the traffic diversion problem.",
            },
            connection: {
                type: "confidence",
                id: RAILROAD_STREET_CONNECTOR_ID,
                scoreId: RAILROAD_STREET_SCORE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addCost",
        scriptBeat: "A con is that the conversion will cost 2 million dollars.",
        waitAfterSeconds: 0.8,
        command: {
            type: "claim/add",
            targetScoreId: MAIN_SCORE_ID,
            claim: {
                id: COST_CLAIM_ID,
                content: "The conversion will cost 2 million dollars.",
            },
            connection: {
                type: "confidence",
                id: COST_CONNECTOR_ID,
                scoreId: COST_SCORE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addPayback",
        scriptBeat: "We add that the increase in revenue will pay off the expense in under 2 years, meeting the city's investment requirements.",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreId: COST_SCORE_ID,
            claim: {
                id: PAYBACK_CLAIM_ID,
                content: "The increase in revenue will pay off the expense in under 2 years, meeting the city's investment requirements.",
            },
            connection: {
                type: "relevance",
                id: PAYBACK_CONNECTOR_ID,
                scoreId: PAYBACK_SCORE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
    {
        id: "addFootTrafficEvents",
        scriptBeat: "At the end, we add that weekend street events would drive even more visitors onto Elm Street.",
        waitAfterSeconds: 0.6,
        command: {
            type: "claim/add",
            targetScoreId: FOOT_TRAFFIC_SCORE_ID,
            claim: {
                id: FOOT_TRAFFIC_EVENTS_CLAIM_ID,
                content: "Weekend street events would drive even more visitors onto Elm Street.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_EVENTS_CONNECTOR_ID,
                scoreId: FOOT_TRAFFIC_EVENTS_SCORE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addFootTrafficDining",
        scriptBeat: "We also add that outdoor dining would keep shoppers on the street longer.",
        waitAfterSeconds: 0.6,
        command: {
            type: "claim/add",
            targetScoreId: FOOT_TRAFFIC_SCORE_ID,
            claim: {
                id: FOOT_TRAFFIC_DINING_CLAIM_ID,
                content: "Outdoor dining would keep shoppers on Elm Street for longer visits.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_DINING_CONNECTOR_ID,
                scoreId: FOOT_TRAFFIC_DINING_SCORE_ID,
                targetRelationship: "proTarget",
            },
        },
    },
    {
        id: "addFootTrafficDeliveries",
        scriptBeat: "We end that section by adding a con that delivery disruptions could reduce some shop visits.",
        waitAfterSeconds: 1,
        command: {
            type: "claim/add",
            targetScoreId: FOOT_TRAFFIC_SCORE_ID,
            claim: {
                id: FOOT_TRAFFIC_DELIVERIES_CLAIM_ID,
                content: "Delivery disruptions could reduce some shop visits during the transition.",
            },
            connection: {
                type: "confidence",
                id: FOOT_TRAFFIC_DELIVERIES_CONNECTOR_ID,
                scoreId: FOOT_TRAFFIC_DELIVERIES_SCORE_ID,
                targetRelationship: "conTarget",
            },
        },
    },
] as const;

const episode0001Plan = buildEpisode0001Plan();
const episode0001Timeline = buildTimelineTimes(episode0001Plan.timelineEntries, EPISODE0001_FPS);

export const EPISODE0001_DURATION_IN_FRAMES = episode0001Timeline.totalDurationInFrames;

export const Episode0001 = () => {
    const graphEventTimes = episode0001Timeline.times;
    const graphFadeFrom = graphEventTimes.BackgroundFadeIn.from;
    const graphFadeDurationInFrames = graphEventTimes.BackgroundFadeout.from
        + graphEventTimes.BackgroundFadeout.durationInFrames
        - graphFadeFrom;

    return (
        <EpisodeTemplate>
            <Fade
                from={graphFadeFrom}
                durationInFrames={graphFadeDurationInFrames}
                fadeInFrames={graphEventTimes.BackgroundFadeIn.durationInFrames}
                fadeOutFrames={graphEventTimes.BackgroundFadeout.durationInFrames}
                name="Graph Fade"
            >
                <GraphView debate={episode0001Debate}>
                    {episode0001Plan.cameraMoves.map((cameraMove) => (
                        <CameraMove
                            key={cameraMove.id}
                            {...graphEventTimes[cameraMove.id]}
                            name={cameraMove.name}
                            target={cameraMove.target}
                        />
                    ))}
                    {episode0001StoryboardActions.map((action) => (
                        <GraphEvents
                            key={action.id}
                            {...graphEventTimes[action.id]}
                            id={action.id}
                            actions={buildGraphActions(action)}
                        />
                    ))}
                </GraphView>
            </Fade>
            <EpisodeBrandSequence {...graphEventTimes.brand} />
        </EpisodeTemplate>
    );
};

function buildGraphActions(action: Episode0001StoryboardAction): GraphActionEntry[] {
    return [
        {
            id: action.id,
            command: action.command,
        },
    ];
}

function buildEpisode0001Plan(): Episode0001Plan {
    const cameraMoves: Episode0001CameraMovePlan[] = [];
    const timelineEntries: TimelineEntry<Episode0001TimelineId>[] = [
        ["BackgroundFadeIn", EPISODE0001_BACKGROUND_FADE_SECONDS],
    ];
    const openingHoldSeconds = Math.max(0, EPISODE0001_OPENING_HOLD_SECONDS - EPISODE0001_CAMERA_MOVE_SECONDS);

    if (openingHoldSeconds > 0) {
        timelineEntries.push([wait, openingHoldSeconds]);
    }

    let workingDebate = episode0001Debate;
    let brandScheduled = false;

    for (const [actionIndex, action] of episode0001StoryboardActions.entries()) {
        const graphActions = buildGraphActions(action);
        const { nextDebate, transitionSegmentCount } = countGraphEventTransitionSegments({
            debate: workingDebate,
            actions: graphActions,
        });
        const cameraMoveId = getEpisode0001CameraTimelineId(action.id);

        cameraMoves.push({
            id: cameraMoveId,
            name: `Camera ${action.id}`,
            target: getGraphViewportTarget(nextDebate),
        });
        timelineEntries.push([cameraMoveId, EPISODE0001_CAMERA_MOVE_SECONDS]);
        timelineEntries.push([
            action.id,
            transitionSegmentCount * EPISODE0001_SECONDS_PER_OPERATION,
        ]);

        if (!brandScheduled) {
            timelineEntries.push(["brand", EPISODE0001_BRAND_SECONDS]);
            brandScheduled = true;
        }

        const hasNextAction = actionIndex < episode0001StoryboardActions.length - 1;
        const waitAfterSeconds = hasNextAction
            ? Math.max(0, action.waitAfterSeconds - EPISODE0001_CAMERA_MOVE_SECONDS)
            : action.waitAfterSeconds;

        if (waitAfterSeconds > 0) {
            timelineEntries.push([wait, waitAfterSeconds]);
        }

        workingDebate = nextDebate;
    }

    timelineEntries.push(
        [wait, EPISODE0001_END_HOLD_SECONDS],
        ["BackgroundFadeout", EPISODE0001_BACKGROUND_FADE_SECONDS],
    );

    return {
        cameraMoves,
        timelineEntries,
    };
}

function getEpisode0001CameraTimelineId(actionId: Episode0001ActionTimelineId): Episode0001CameraTimelineId {
    return `camera-${actionId}` as Episode0001CameraTimelineId;
}
