export type { Claim, ClaimCreate, ClaimId, ClaimPatch } from "./debate-core/Claim.ts";
export type {
    AddClaimCommand,
    ClaimConnectionInput,
    ConfidenceConnectionInput,
    ConnectClaimCommand,
    DebateCommand,
    DeleteClaimCommand,
    DisconnectConnectionCommand,
    RelevanceConnectionInput,
    UpdateClaimCommand,
    UpdateDebateCommand,
} from "./debate-core/Commands.ts";
export type {
    ConfidenceConnector,
    ConfidenceConnectorCreate,
    ConfidenceConnectorId,
    Connector,
    ConnectorCreate,
    ConnectorId,
    ConnectorPatch,
    RelevanceConnector,
    RelevanceConnectorCreate,
    RelevanceConnectorId,
    TargetRelation,
} from "./debate-core/Connector.ts";
export type { Debate, DebateCore, DebateDetails, DebateId, DebatePatch } from "./debate-core/Debate.ts";
export {
    calculateScoreChanges,
    type ApplyCommandResult,
    type ApplyCommandToScoreGraph,
    type CommandScoreChange,
    type ScoreChangeRun,
    type ScorePropagationStep,
} from "./math/calculateScoreChanges.ts";
export type {
    Impact,
    Score,
    ScoreGraph,
    ScoreNode,
    ScoreNodeId,
    Scores,
} from "./math/scoreTypes.ts";
export type {
    AnimationType,
    ClaimAggregatorViz,
    ClaimAggregatorVizId,
    ClaimViz,
    ClaimVizId,
    ConnectorBandPlacement,
    ConnectorVizDirection,
    ConfidenceConnectorViz,
    ConfidenceConnectorVizId,
    DeliveryConnectorViz,
    DeliveryConnectorVizId,
    JunctionAggregatorViz,
    JunctionAggregatorVizId,
    JunctionViz,
    JunctionVizId,
    RelevanceConnectorViz,
    RelevanceConnectorVizId,
    Side,
    Snapshot,
    SnapshotWaypoint,
} from "./planner/Snapshot.ts";
export {
    buildCommandScoreWaveTimelines,
    type CommandScoreWaveTimeline,
    type ScoreChangeWaveTimelineRun,
} from "./planner/buildCommandScoreWaveTimelines.ts";
export {
    buildProjectedCommandScoreWaveTimelines,
} from "./planner/buildProjectedCommandScoreWaveTimelines.ts";
export {
    buildScoreProjectionSnapshot,
    type ScoreProjectionConnectorBandPolicy,
    type ScoreProjectionSnapshotOptions,
} from "./planner/buildScoreProjectionSnapshot.ts";
export {
    buildResolvedSnapshotConnectorGeometryById,
    type ResolvedConnectorPoint,
    type ResolvedConnectorWaypoint,
    type ResolvedSnapshotConnectorGeometry,
} from "./planner/resolveSnapshotConnectorGeometry.ts";
export type {
    ScoreWaveStep,
    ScoreWaveStepType,
    ScoreWaveTimeline,
} from "./planner/buildScoreWaveTimeline.ts";