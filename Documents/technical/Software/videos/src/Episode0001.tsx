import { AbsoluteFill } from "remotion";

import {
    type AddClaimCommand,
    type ClaimId,
    type ConnectorId,
    type Debate,
    type DebateId,
    type Operation,
    Planner,
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

const FOOT_TRAFFIC_CONNECTOR_ID = "connector-foot-traffic" as ConnectorId;
const SAFETY_RISK_CONNECTOR_ID = "connector-safety-risk" as ConnectorId;
const SAFETY_PRIORITY_CONNECTOR_ID = "connector-safety-priority" as ConnectorId;
const RAILROAD_STREET_CONNECTOR_ID = "connector-railroad-street" as ConnectorId;
const COST_CONNECTOR_ID = "connector-cost" as ConnectorId;
const PAYBACK_CONNECTOR_ID = "connector-payback" as ConnectorId;

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
            connector: {
                type: "claim-to-claim",
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
            connector: {
                type: "claim-to-claim",
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
            connector: {
                type: "claim-to-connector",
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
            connector: {
                type: "claim-to-claim",
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
            connector: {
                type: "claim-to-claim",
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
            connector: {
                type: "claim-to-claim",
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
const episode0001Operations = episode0001PlannerResults.flatMap((result) => result.operations);
const episode0001ReducerReplay = buildEpisode0001ReducerReplay(episode0001Operations, episode0001Debate, reducer);
const episode0001FinalState =
    episode0001ReducerReplay.length > 0
        ? episode0001ReducerReplay[episode0001ReducerReplay.length - 1].state
        : episode0001Debate;
const episode0001Json = JSON.stringify(episode0001FinalState, null, 2);
console.log("Episode0001 reducer replay", episode0001ReducerReplay);


export const Episode0001 = () => {
    return (
        <AbsoluteFill
            style={{
                background: "radial-gradient(circle at top, #1f3a5f 0%, #0f172a 45%, #080b12 100%)",
                color: "#d9f4ff",
                fontFamily: '"IBM Plex Mono", "Fira Code", monospace',
                padding: 72,
            }}
        >
            <AbsoluteFill
                style={{
                    background: "linear-gradient(180deg, rgba(10, 18, 31, 0.78) 0%, rgba(8, 12, 20, 0.94) 100%)",
                    border: "1px solid rgba(125, 211, 252, 0.22)",
                    borderRadius: 36,
                    boxShadow: "0 32px 80px rgba(0, 0, 0, 0.35)",
                    inset: 48,
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        alignItems: "center",
                        borderBottom: "1px solid rgba(125, 211, 252, 0.18)",
                        display: "flex",
                        gap: 18,
                        justifyContent: "space-between",
                        padding: "28px 36px",
                    }}
                >
                    <div style={{ display: "flex", gap: 14 }}>
                        <div style={{ background: "#f97316", borderRadius: 999, height: 14, width: 14 }} />
                        <div style={{ background: "#facc15", borderRadius: 999, height: 14, width: 14 }} />
                        <div style={{ background: "#22c55e", borderRadius: 999, height: 14, width: 14 }} />
                    </div>
                    <div
                        style={{
                            color: "#7dd3fc",
                            fontSize: 24,
                            fontWeight: 600,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                        }}
                    >
                        Episode0001
                    </div>
                </div>
                <div
                    style={{
                        color: "#93c5fd",
                        fontSize: 22,
                        letterSpacing: "0.04em",
                        padding: "30px 36px 12px",
                        textTransform: "uppercase",
                    }}
                >
                    Reducer replay final state
                </div>
                <div
                    style={{
                        color: "#e0f2fe",
                        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
                        fontSize: 54,
                        fontWeight: 700,
                        lineHeight: 1.05,
                        padding: "0 36px",
                    }}
                >
                    Elm Street commands replayed through the reducer, showing the final debate state before animation polish.
                </div>
                <div
                    style={{
                        flex: 1,
                        overflowX: "auto",
                        overflowY: "auto",
                        padding: "28px 36px 42px",
                    }}
                >
                    <pre
                        style={{
                            color: "#d9f4ff",
                            fontSize: 24,
                            lineHeight: 1.45,
                            margin: 0,
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {episode0001Json}
                    </pre>
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

type Episode0001ReducerReplayEntry = {
    operationIndex: number;
    operation: Operation;
    state: Debate;
};

function buildEpisode0001ReducerReplay(
    operations: readonly Operation[],
    initialState: Debate,
    replayReducer: Reducer,
): Episode0001ReducerReplayEntry[] {
    let workingState = initialState;

    return operations.map((operation, index) => {
        workingState = replayReducer.apply(workingState, operation);

        return {
            operationIndex: index + 1,
            operation,
            state: workingState,
        };
    });
}
