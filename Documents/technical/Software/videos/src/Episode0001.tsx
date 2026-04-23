import { AbsoluteFill } from "remotion";

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

const FOOT_TRAFFIC_CONNECTOR_ID = "connector-foot-traffic" as ConfidenceConnectorId;
const SAFETY_RISK_CONNECTOR_ID = "connector-safety-risk" as ConfidenceConnectorId;
const SAFETY_PRIORITY_CONNECTOR_ID = "connector-safety-priority" as RelevanceConnectorId;
const RAILROAD_STREET_CONNECTOR_ID = "connector-railroad-street" as ConfidenceConnectorId;
const COST_CONNECTOR_ID = "connector-cost" as ConfidenceConnectorId;
const PAYBACK_CONNECTOR_ID = "connector-payback" as RelevanceConnectorId;

const FOOT_TRAFFIC_SCORE_ID = "score-foot-traffic" as ScoreId;
const SAFETY_RISK_SCORE_ID = "score-safety-risk" as ScoreId;
const SAFETY_PRIORITY_SCORE_ID = "score-safety-priority" as ScoreId;
const RAILROAD_STREET_SCORE_ID = "score-railroad-street" as ScoreId;
const COST_SCORE_ID = "score-cost" as ScoreId;
const PAYBACK_SCORE_ID = "score-payback" as ScoreId;

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

const episode0001Actions = [
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

const planner = new Planner();
const reducer = new Reducer();
const episode0001PlannerResults = planner.plan(episode0001Actions.map((action) => action.command), episode0001Debate);
const episode0001Run = buildEpisode0001Run(episode0001Debate, reducer);
const episode0001Layout = layoutDebate(episode0001Run.finalState);


export const Episode0001 = () => {
    return (
        <AbsoluteFill
            style={{
                background: "#e5e7eb",
                color: "#0f172a",
                fontFamily: '"Segoe UI", sans-serif',
            }}
        >
            {episode0001Layout.nodesInOrder.map((node) => {
                const padding = Math.max(12, Math.round(20 * node.layoutScale));
                const fontSize = Math.max(15, Math.round(24 * node.layoutScale));

                return (
                    <div
                        key={node.scoreId}
                        style={{
                            background: "#ffffff",
                            border: "2px solid #0f172a",
                            boxSizing: "border-box",
                            color: "#0f172a",
                            display: "flex",
                            fontSize,
                            fontWeight: 500,
                            height: node.height,
                            left: node.x,
                            lineHeight: 1.2,
                            overflow: "hidden",
                            padding,
                            position: "absolute",
                            top: node.y,
                            width: node.width,
                        }}
                    >
                        {node.claimContent}
                    </div>
                );
            })}
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
    replayReducer: Reducer,
): Episode0001Run {
    let workingState = initialState;
    let timelineOperation = 0;
    const steps = episode0001Actions.map((action, stepIndex) => {
        const stateBefore = workingState;
        const operations = episode0001PlannerResults[stepIndex]?.operations ?? [];
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
