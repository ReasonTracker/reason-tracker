// See 📌README.md in this folder for local coding standards before editing this file.

import type { TweenNumber, TweenBoolean, TweenPoint } from "../utils.ts";
import type { ClaimId } from "../debate-core/Claim.ts";
import type { ConfidenceConnectorId, RelevanceConnectorId } from "../debate-core/Connector.ts";


export interface ClaimViz {
    type: "claim"
    id: ClaimVizId
    claimId: ClaimId
    position: TweenPoint
    scale: TweenNumber
    scourcesScale: TweenNumber
    score: TweenNumber
    side: Side
}

export interface DeliveryAggregatorViz {
    type: "deliveryAggregator"
    id: DeliveryAggregatorVizId
    animationType: AnimationType,
    claimId: ClaimId
    deliveryConnectorVizIds: DeliveryConnectorVizId[]
    scale: TweenNumber
    score: TweenNumber
}

// Always present in the snapshot. visible controls whether it is shown.
export interface JunctionViz {
    type: "junction"
    id: JunctionVizId
    animationType: AnimationType,
    confidenceConnectorId: ConfidenceConnectorId
    relevanceAggregatorVizId: RelevanceAggregatorVizId
    position: TweenPoint
    outgoingConfidenceScale: TweenNumber
    incomingConfidenceScale: TweenNumber
    incomingRelevanceScale: TweenNumber
    visible: TweenBoolean
}

// Always present in the snapshot. visible controls whether it is shown.
export interface RelevanceAggregatorViz {
    type: "relevanceAggregator"
    id: RelevanceAggregatorVizId
    animationType: AnimationType,
    confidenceConnectorId: ConfidenceConnectorId
    relevanceConnectorVizIds: RelevanceConnectorVizId[]
    scale: TweenNumber
    score: TweenNumber
    visible: TweenBoolean
}

interface ConnectorVizBase {
    type: "confidenceConnector" | "deliveryConnector" | "relevanceConnector"
    scale: TweenNumber
    score: TweenNumber
    side: Side
    direction: ConnectorVizDirection
    animationType: AnimationType,
};

// Always present in the snapshot. visible controls whether it is shown.
export interface ConfidenceConnectorViz extends ConnectorVizBase {
    type: "confidenceConnector"
    id: ConfidenceConnectorVizId
    animationType: AnimationType,
    confidenceConnectorId: ConfidenceConnectorId
    sourceClaimVizId: ClaimVizId
    targetJunctionVizId: JunctionVizId
    visible: TweenBoolean
}

export interface DeliveryConnectorViz extends ConnectorVizBase {
    type: "deliveryConnector"
    id: DeliveryConnectorVizId
    confidenceConnectorId: ConfidenceConnectorId
    sourceJunctionVizId: JunctionVizId
    targetClaimVizId: ClaimVizId
    targetSideOffset?: TweenNumber
}

export interface RelevanceConnectorViz extends ConnectorVizBase {
    type: "relevanceConnector"
    id: RelevanceConnectorVizId
    relevanceConnectorId: RelevanceConnectorId
    sourceClaimVizId: ClaimVizId
    targetRelevanceAggregatorVizId: RelevanceAggregatorVizId
    targetSideOffset?: TweenNumber
}

export type VizItem =
    | ClaimViz
    | DeliveryAggregatorViz
    | JunctionViz
    | RelevanceAggregatorViz
    | ConfidenceConnectorViz
    | DeliveryConnectorViz
    | RelevanceConnectorViz;

export type VizItemId =
    | ClaimVizId
    | DeliveryAggregatorVizId
    | JunctionVizId
    | RelevanceAggregatorVizId
    | ConfidenceConnectorVizId
    | DeliveryConnectorVizId
    | RelevanceConnectorVizId;

export type Snapshot = Record<VizItemId, VizItem>;

export type ClaimVizId = string & { readonly __brand: "ClaimVizId" };
export type DeliveryAggregatorVizId = string & { readonly __brand: "DeliveryAggregatorVizId" };
export type JunctionVizId = string & { readonly __brand: "JunctionVizId" };
export type RelevanceAggregatorVizId = string & { readonly __brand: "RelevanceAggregatorVizId" };
export type ConfidenceConnectorVizId = string & { readonly __brand: "ConfidenceConnectorVizId" };
export type DeliveryConnectorVizId = string & { readonly __brand: "DeliveryConnectorVizId" };
export type RelevanceConnectorVizId = string & { readonly __brand: "RelevanceConnectorVizId" };

export type Side = "proMain" | "conMain";
export type AnimationType = "uniform" | "progressive"
export type ConnectorVizDirection = "sourceToTarget" | "targetToSource"

