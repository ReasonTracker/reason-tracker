// See 📌README.md in this folder for local coding standards before editing this file.

import type { TweenNumber, TweenBoolean, TweenPoint } from "../utils.ts";
import type { Claim, ClaimId } from "../debate-core/Claim.ts";
import type {
    ConfidenceConnector,
    ConfidenceConnectorId,
    RelevanceConnector,
    RelevanceConnectorId,
} from "../debate-core/Connector.ts";
import type { ScoreNodeId } from "../math/scoreTypes.ts";


export interface ClaimViz {
    type: "claim"
    id: ClaimVizId
    claimId: ClaimId
    claim?: Claim
    scoreNodeId?: ScoreNodeId
    position: TweenPoint
    scale: TweenNumber
    score: TweenNumber
    side: Side
}

export interface ClaimAggregatorViz {
    type: "claimAggregator"
    id: ClaimAggregatorVizId
    animationType: AnimationType,
    claimId: ClaimId
    claim?: Claim
    scoreNodeId?: ScoreNodeId
    deliveryConnectorVizIds: DeliveryConnectorVizId[]
    position: TweenPoint
    scale: TweenNumber
    score: TweenNumber
}

// Always present in the snapshot. visible controls whether it is shown.
export interface JunctionViz {
    type: "junction"
    id: JunctionVizId
    animationType: AnimationType,
    confidenceConnectorId?: ConfidenceConnectorId
    confidenceConnector?: ConfidenceConnector
    scoreNodeId?: ScoreNodeId
    junctionAggregatorVizId: JunctionAggregatorVizId
    position: TweenPoint
    leftHeight: TweenNumber
    rightHeight: TweenNumber
    scale: TweenNumber
    visible: TweenBoolean
    width: TweenNumber
}

// Always present in the snapshot. visible controls whether it is shown.
export interface JunctionAggregatorViz {
    type: "junctionAggregator"
    id: JunctionAggregatorVizId
    animationType: AnimationType,
    confidenceConnectorId?: ConfidenceConnectorId
    confidenceConnector?: ConfidenceConnector
    scoreNodeId?: ScoreNodeId
    position: TweenPoint
    relevanceConnectorVizIds: RelevanceConnectorVizId[]
    scale: TweenNumber
    score: TweenNumber
    visible: TweenBoolean
}

export interface SnapshotWaypoint {
    x: TweenNumber
    y: TweenNumber
    radius?: TweenNumber
}

export type ConnectorVizDirection = "sourceToTarget" | "targetToSource"

interface ConnectorVizBase {
    type: "confidenceConnector" | "deliveryConnector" | "relevanceConnector"
    animationType: AnimationType
    scale: TweenNumber
    score: TweenNumber
    side: Side
    source: TweenPoint
    target: TweenPoint
    centerlinePoints: SnapshotWaypoint[]
    direction: ConnectorVizDirection
}

// Always present in the snapshot. visible controls whether it is shown.
export interface ConfidenceConnectorViz extends ConnectorVizBase {
    type: "confidenceConnector"
    id: ConfidenceConnectorVizId
    confidenceConnectorId?: ConfidenceConnectorId
    confidenceConnector?: ConfidenceConnector
    scoreNodeId?: ScoreNodeId
    sourceClaimVizId: ClaimVizId
    targetJunctionVizId: JunctionVizId
    visible: TweenBoolean
}

export interface DeliveryConnectorViz extends ConnectorVizBase {
    type: "deliveryConnector"
    id: DeliveryConnectorVizId
    confidenceConnectorId?: ConfidenceConnectorId
    confidenceConnector?: ConfidenceConnector
    scoreNodeId?: ScoreNodeId
    sourceClaimVizId?: ClaimVizId
    sourceJunctionVizId: JunctionVizId
    targetClaimVizId: ClaimVizId
}

export interface RelevanceConnectorViz extends ConnectorVizBase {
    type: "relevanceConnector"
    id: RelevanceConnectorVizId
    relevanceConnectorId?: RelevanceConnectorId
    relevanceConnector?: RelevanceConnector
    scoreNodeId?: ScoreNodeId
    sourceClaimVizId: ClaimVizId
    targetJunctionAggregatorVizId: JunctionAggregatorVizId
}

export type Snapshot = {
    claims: Record<ClaimVizId, ClaimViz>
    claimAggregators: Record<ClaimAggregatorVizId, ClaimAggregatorViz>
    junctions: Record<JunctionVizId, JunctionViz>
    junctionAggregators: Record<JunctionAggregatorVizId, JunctionAggregatorViz>
    confidenceConnectors: Record<ConfidenceConnectorVizId, ConfidenceConnectorViz>
    deliveryConnectors: Record<DeliveryConnectorVizId, DeliveryConnectorViz>
    relevanceConnectors: Record<RelevanceConnectorVizId, RelevanceConnectorViz>
}

export type ClaimVizId = string & { readonly __brand: "ClaimVizId" };
export type ClaimAggregatorVizId = string & { readonly __brand: "ClaimAggregatorVizId" };
export type JunctionVizId = string & { readonly __brand: "JunctionVizId" };
export type JunctionAggregatorVizId = string & { readonly __brand: "JunctionAggregatorVizId" };
export type ConfidenceConnectorVizId = string & { readonly __brand: "ConfidenceConnectorVizId" };
export type DeliveryConnectorVizId = string & { readonly __brand: "DeliveryConnectorVizId" };
export type RelevanceConnectorVizId = string & { readonly __brand: "RelevanceConnectorVizId" };

export type Side = "proMain" | "conMain";
export type AnimationType = "uniform" | "progressive"
