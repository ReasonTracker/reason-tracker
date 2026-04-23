import { AbsoluteFill, useVideoConfig } from "remotion";
import { DebateRenderer } from "@reasontracker/components";

import {
    type AddClaimCommand,
    type ClaimId,
    type ConfidenceConnectorId,
    type Debate,
    type DebateId,
    layoutDebate,
    type Operation,
    Planner,
    type RelevanceConnectorId,
    Reducer,
    type ScoreId,
} from "../../engine/src/index.ts";

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
            claimSide: "proMain",
            connectorSide: "proMain",
        },
    },
};

interface Episode0001StoryboardAction {
    scriptBeat: string;
    command: AddClaimCommand;
}

const episode0001BaseActions: Episode0001StoryboardAction[] = [
    {
        scriptBeat: "To start, we add that converting Elm Street will increase foot traffic to local shops by 15%.",
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
        } satisfies AddClaimCommand,
    },
    {
        scriptBeat: "Someone points out that the conversion will divert traffic down residential streets and endanger the lives of children.",
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
        } satisfies AddClaimCommand,
    },
    {
        scriptBeat: "We add that child safety is more important than local shop profit.",
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
        } satisfies AddClaimCommand,
    },
    {
        scriptBeat: "The city realizes unused railroad tracks can be converted into a new street, cancelling out the traffic problem.",
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
        } satisfies AddClaimCommand,
    },
    {
        scriptBeat: "A con is that the conversion will cost 2 million dollars.",
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
        } satisfies AddClaimCommand,
    },
    {
        scriptBeat: "We add that the increase in revenue will pay off the expense in under 2 years, meeting the city's investment requirements.",
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
        } satisfies AddClaimCommand,
    },
] as const;

const episode0001EndSegmentActions: Episode0001StoryboardAction[] = [
    {
        scriptBeat: "At the end, we add that weekend street events would drive even more visitors onto Elm Street.",
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
        } satisfies AddClaimCommand,
    },
    {
        scriptBeat: "We also add that outdoor dining would keep shoppers on the street longer.",
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
        } satisfies AddClaimCommand,
    },
    {
        scriptBeat: "We end that section by adding a con that delivery disruptions could reduce some shop visits.",
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
        } satisfies AddClaimCommand,
    },
];

const planner = new Planner();
const reducer = new Reducer();
const episode0001EndRun = buildEpisode0001Run(
    episode0001Debate,
    [...episode0001BaseActions, ...episode0001EndSegmentActions],
    planner,
    reducer,
);
const episode0001EndLayout = layoutDebate(episode0001EndRun.finalState);


export const Episode0001 = () => {
    const { height, width } = useVideoConfig();

    return (
        <AbsoluteFill
            style={{
                background: "#000000",
            }}
        >
            <DebateRenderer
                debate={episode0001EndRun.finalState}
                layout={episode0001EndLayout}
                viewportHeightPx={height}
                viewportWidthPx={width}
            />
        </AbsoluteFill>
    );
};

type Episode0001Run = {
    initialState: Debate;
    steps: Episode0001Step[];
    finalState: Debate;
};

type Episode0001Step = {
    step: number;
    scriptBeat: string;
    command: AddClaimCommand;
    stateBefore: Debate;
    operations: Episode0001OperationReplayEntry[];
    stateAfter: Debate;
};

type Episode0001OperationReplayEntry = {
    stepOperation: number;
    timelineOperation: number;
    operation: Operation;
    stateBefore: Debate;
    stateAfter: Debate;
};

function buildEpisode0001Run(
    initialState: Debate,
    storyboardActions: readonly Episode0001StoryboardAction[],
    replayPlanner: Planner,
    replayReducer: Reducer,
): Episode0001Run {
    const plannerResults = replayPlanner.plan(
        storyboardActions.map((action) => action.command),
        initialState,
    );
    let workingState = initialState;
    let timelineOperation = 0;
    const steps = storyboardActions.map((action, stepIndex) => {
        const stateBefore = workingState;
        const operations = plannerResults[stepIndex]?.operations ?? [];
        const operationReplay = operations.map((operation, operationIndex) => {
            const operationStateBefore = workingState;
            workingState = replayReducer.apply(workingState, operation);
            timelineOperation += 1;

            return {
                stepOperation: operationIndex + 1,
                timelineOperation,
                operation,
                stateBefore: operationStateBefore,
                stateAfter: workingState,
            };
        });

        return {
            step: stepIndex + 1,
            scriptBeat: action.scriptBeat,
            command: action.command,
            stateBefore,
            operations: operationReplay,
            stateAfter: workingState,
        };
    });

    return {
        initialState,
        steps,
        finalState: workingState,
    };
}
