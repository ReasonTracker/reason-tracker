// See 📌README.md in this folder for local coding standards before editing this file.

import type { Tween, TweenBoolean } from "../utils.ts";
import type { ClaimId } from "../debate-core/Claim.ts";
import type { ConfidenceConnectorId, RelevanceConnectorId } from "../debate-core/Connector.ts";


export interface ClaimViz {
    id: ClaimVizId
    claimId: ClaimId
    side: Side
    x: Tween
    y: Tween
    scale: Tween
    confidence: Tween
}

export interface ClaimAggregatorViz {
    id: ClaimAggregatorVizId
    claimId: ClaimId
    confidence: Tween
    scale: Tween
    x: Tween
    y: Tween
    deliveryConnectorVizIds: DeliveryConnectorVizId[]
}

// Always present in the snapshot. visible controls whether it is shown.
export interface JunctionViz {
    id: JunctionVizId
    confidenceConnectorId: ConfidenceConnectorId
    visible: TweenBoolean
    x: Tween
    y: Tween
    scale: Tween
    junctionAggregatorVizId: JunctionAggregatorVizId
}

// Always present in the snapshot. visible controls whether it is shown.
export interface JunctionAggregatorViz {
    id: JunctionAggregatorVizId
    confidenceConnectorId: ConfidenceConnectorId
    visible: TweenBoolean
    confidence: Tween
    scale: Tween
    x: Tween
    y: Tween
    relevanceConnectorVizIds: RelevanceConnectorVizId[]
}

// Always present in the snapshot. visible controls whether it is shown.
export interface ConfidenceConnectorViz {
    id: ConfidenceConnectorVizId
    confidenceConnectorId: ConfidenceConnectorId
    visible: TweenBoolean
    side: Side
    sourceClaimVizId: ClaimVizId
    targetJunctionVizId: JunctionVizId
    sourceX: Tween
    sourceY: Tween
    targetX: Tween
    targetY: Tween
    scale: Tween
    confidence: Tween
}

export interface DeliveryConnectorViz {
    id: DeliveryConnectorVizId
    confidenceConnectorId: ConfidenceConnectorId
    side: Side
    sourceJunctionVizId: JunctionVizId
    targetClaimVizId: ClaimVizId
    sourceX: Tween
    sourceY: Tween
    targetX: Tween
    targetY: Tween
    scale: Tween
    confidence: Tween
}

export interface RelevanceConnectorViz {
    id: RelevanceConnectorVizId
    relevanceConnectorId: RelevanceConnectorId
    side: Side
    sourceClaimVizId: ClaimVizId
    targetJunctionAggregatorVizId: JunctionAggregatorVizId
    sourceX: Tween
    sourceY: Tween
    targetX: Tween
    targetY: Tween
    scale: Tween
    confidence: Tween
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
