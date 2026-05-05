import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import type { ClaimId } from "../../../app/src/debate-core/Claim.ts";
import type {
    ConfidenceConnectorId,
    RelevanceConnectorId,
} from "../../../app/src/debate-core/Connector.ts";
import type {
    ClaimAggregatorVizId,
    ClaimVizId,
    ConfidenceConnectorVizId,
    DeliveryConnectorVizId,
    JunctionAggregatorVizId,
    JunctionVizId,
    RelevanceConnectorVizId,
} from "../../../app/src/planner/Snapshot.ts";

export const mainClaimId = "episode-0002-claim-main" as ClaimId;
export const c1ClaimId = "episode-0002-claim-c1" as ClaimId;
const c2ClaimId = "episode-0002-claim-c2" as ClaimId;
const c3ClaimId = "episode-0002-claim-c3" as ClaimId;
const c4ClaimId = "episode-0002-claim-c4" as ClaimId;
const c5ClaimId = "episode-0002-claim-c5" as ClaimId;
const c6ClaimId = "episode-0002-claim-c6" as ClaimId;

const c1ConfidenceConnectorId = "episode-0002-confidence-main-c1" as ConfidenceConnectorId;
export const c2ConfidenceConnectorId = "episode-0002-confidence-main-c2" as ConfidenceConnectorId;
const c3RelevanceConnectorId = "episode-0002-relevance-c3-c2" as RelevanceConnectorId;
const c4ConfidenceConnectorId = "episode-0002-confidence-c1-c4" as ConfidenceConnectorId;
const c5ConfidenceConnectorId = "episode-0002-confidence-c1-c5" as ConfidenceConnectorId;
const c6ConfidenceConnectorId = "episode-0002-confidence-c1-c6" as ConfidenceConnectorId;

export const mainClaimVizId = "episode-0002-claim-viz-main" as ClaimVizId;
export const c1ClaimVizId = "episode-0002-claim-viz-c1" as ClaimVizId;
const c2ClaimVizId = "episode-0002-claim-viz-c2" as ClaimVizId;
const c3ClaimVizId = "episode-0002-claim-viz-c3" as ClaimVizId;
export const c4ClaimVizId = "episode-0002-claim-viz-c4" as ClaimVizId;
export const c5ClaimVizId = "episode-0002-claim-viz-c5" as ClaimVizId;
export const c6ClaimVizId = "episode-0002-claim-viz-c6" as ClaimVizId;

export const mainClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-main" as ClaimAggregatorVizId;
export const c1ClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-c1" as ClaimAggregatorVizId;
const c2ClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-c2" as ClaimAggregatorVizId;
const c3ClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-c3" as ClaimAggregatorVizId;
export const c4ClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-c4" as ClaimAggregatorVizId;
export const c5ClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-c5" as ClaimAggregatorVizId;
export const c6ClaimAggregatorVizId = "episode-0002-claim-aggregator-viz-c6" as ClaimAggregatorVizId;

const c1JunctionAggregatorVizId = "episode-0002-junction-aggregator-viz-c1" as JunctionAggregatorVizId;
export const c2JunctionAggregatorVizId = "episode-0002-junction-aggregator-viz-c2" as JunctionAggregatorVizId;
export const c4JunctionAggregatorVizId = "episode-0002-junction-aggregator-viz-c4" as JunctionAggregatorVizId;
export const c5JunctionAggregatorVizId = "episode-0002-junction-aggregator-viz-c5" as JunctionAggregatorVizId;
export const c6JunctionAggregatorVizId = "episode-0002-junction-aggregator-viz-c6" as JunctionAggregatorVizId;

const c1JunctionVizId = "episode-0002-junction-viz-c1" as JunctionVizId;
export const c2JunctionVizId = "episode-0002-junction-viz-c2" as JunctionVizId;
export const c4JunctionVizId = "episode-0002-junction-viz-c4" as JunctionVizId;
export const c5JunctionVizId = "episode-0002-junction-viz-c5" as JunctionVizId;
export const c6JunctionVizId = "episode-0002-junction-viz-c6" as JunctionVizId;

const c1ConfidenceConnectorVizId = "episode-0002-confidence-connector-viz-c1" as ConfidenceConnectorVizId;
const c2ConfidenceConnectorVizId = "episode-0002-confidence-connector-viz-c2" as ConfidenceConnectorVizId;
const c4ConfidenceConnectorVizId = "episode-0002-confidence-connector-viz-c4" as ConfidenceConnectorVizId;
const c5ConfidenceConnectorVizId = "episode-0002-confidence-connector-viz-c5" as ConfidenceConnectorVizId;
const c6ConfidenceConnectorVizId = "episode-0002-confidence-connector-viz-c6" as ConfidenceConnectorVizId;

export const c1DeliveryConnectorVizId = "episode-0002-delivery-connector-viz-c1" as DeliveryConnectorVizId;
export const c2DeliveryConnectorVizId = "episode-0002-delivery-connector-viz-c2" as DeliveryConnectorVizId;
export const c4DeliveryConnectorVizId = "episode-0002-delivery-connector-viz-c4" as DeliveryConnectorVizId;
export const c5DeliveryConnectorVizId = "episode-0002-delivery-connector-viz-c5" as DeliveryConnectorVizId;
export const c6DeliveryConnectorVizId = "episode-0002-delivery-connector-viz-c6" as DeliveryConnectorVizId;
const c3RelevanceConnectorVizId = "episode-0002-relevance-connector-viz-c3" as RelevanceConnectorVizId;

export const claimHalfWidth = 180;
const leftPad = 340;
const layerWidth = 540;
const secondColumnFullCenterX = leftPad + layerWidth;
export const thirdColumnFullCenterX = leftPad + layerWidth * 2;
const secondColumnClaimLeftEdgeX = secondColumnFullCenterX - claimHalfWidth;
export const thirdColumnClaimLeftEdgeX = thirdColumnFullCenterX - claimHalfWidth;

export const secondLayerClaimScale = .6;
export const thirdLayerClaimScale = .4;

const mainClaimPosition = { x: leftPad, y: 460 };
const mainClaimAggregatorPosition = { x: leftPad, y: 540 };
const mainClaimRightEdgePosition = { x: mainClaimPosition.x + claimHalfWidth, y: mainClaimPosition.y };

const c1ClaimPosition = {
    x: secondColumnClaimLeftEdgeX + (claimHalfWidth * secondLayerClaimScale),
    y: 220,
};
const c1ClaimAggregatorPosition = { x: c1ClaimPosition.x, y: 300 };
const c1ClaimLeftEdgePosition = { x: secondColumnClaimLeftEdgeX, y: c1ClaimPosition.y };
export const c1ClaimRightEdgePosition = {
    x: c1ClaimPosition.x + (claimHalfWidth * secondLayerClaimScale),
    y: c1ClaimPosition.y,
};

const c2ClaimPosition = {
    x: secondColumnClaimLeftEdgeX + (claimHalfWidth * secondLayerClaimScale),
    y: 760,
};
const c2ClaimAggregatorPosition = { x: c2ClaimPosition.x, y: 840 };
const c2ClaimLeftEdgePosition = { x: secondColumnClaimLeftEdgeX, y: c2ClaimPosition.y };

const c3ClaimPosition = {
    x: thirdColumnClaimLeftEdgeX + (claimHalfWidth * thirdLayerClaimScale),
    y: 760,
};
const c3ClaimAggregatorPosition = { x: c3ClaimPosition.x, y: 820 };
const c3ClaimLeftEdgePosition = { x: thirdColumnClaimLeftEdgeX, y: c3ClaimPosition.y };

const c4ClaimPosition = {
    x: thirdColumnClaimLeftEdgeX + (claimHalfWidth * thirdLayerClaimScale),
    y: 80,
};
const c4ClaimAggregatorPosition = { x: c4ClaimPosition.x, y: 140 };
const c4ClaimLeftEdgePosition = { x: thirdColumnClaimLeftEdgeX, y: c4ClaimPosition.y };

const c5ClaimPosition = {
    x: thirdColumnClaimLeftEdgeX + (claimHalfWidth * thirdLayerClaimScale),
    y: 260,
};
const c5ClaimAggregatorPosition = { x: c5ClaimPosition.x, y: 320 };
const c5ClaimLeftEdgePosition = { x: thirdColumnClaimLeftEdgeX, y: c5ClaimPosition.y };

const c6ClaimPosition = {
    x: thirdColumnClaimLeftEdgeX + (claimHalfWidth * thirdLayerClaimScale),
    y: 440,
};
const c6ClaimAggregatorPosition = { x: c6ClaimPosition.x, y: 500 };
const c6ClaimLeftEdgePosition = { x: thirdColumnClaimLeftEdgeX, y: c6ClaimPosition.y };

const c1MainTargetSideOffset = -44;
const c2MainTargetSideOffset = 44;
const c4C1TargetSideOffset = -36;
const c5C1TargetSideOffset = 0;
const c6C1TargetSideOffset = 36;

export const step0001RenderState: DebateSnapshotRenderState = {
    debateCore: {
        id: "episode-0002-debate" as DebateSnapshotRenderState["debateCore"]["id"],
        description: "Episode 0002 authored debate snapshot.",
        name: "Episode 0002 Debate",
        mainClaimId,
        claims: {
            [mainClaimId]: {
                id: mainClaimId,
                content: "Main",
            },
            [c1ClaimId]: {
                id: c1ClaimId,
                content: "C1",
            },
            [c2ClaimId]: {
                id: c2ClaimId,
                content: "C2",
            },
            [c3ClaimId]: {
                id: c3ClaimId,
                content: "C3",
            },
            [c4ClaimId]: {
                id: c4ClaimId,
                content: "C4",
            },
            [c5ClaimId]: {
                id: c5ClaimId,
                content: "C5",
            },
            [c6ClaimId]: {
                id: c6ClaimId,
                content: "C6",
            },
        },
        connectors: {
            [c1ConfidenceConnectorId]: {
                id: c1ConfidenceConnectorId,
                type: "confidence",
                source: c1ClaimId,
                targetClaimId: mainClaimId,
                targetRelationship: "proTarget",
            },
            [c2ConfidenceConnectorId]: {
                id: c2ConfidenceConnectorId,
                type: "confidence",
                source: c2ClaimId,
                targetClaimId: mainClaimId,
                targetRelationship: "conTarget",
            },
            [c3RelevanceConnectorId]: {
                id: c3RelevanceConnectorId,
                type: "relevance",
                source: c3ClaimId,
                targetConfidenceConnectorId: c2ConfidenceConnectorId,
                targetRelationship: "proTarget",
            },
            [c4ConfidenceConnectorId]: {
                id: c4ConfidenceConnectorId,
                type: "confidence",
                source: c4ClaimId,
                targetClaimId: c1ClaimId,
                targetRelationship: "proTarget",
            },
            [c5ConfidenceConnectorId]: {
                id: c5ConfidenceConnectorId,
                type: "confidence",
                source: c5ClaimId,
                targetClaimId: c1ClaimId,
                targetRelationship: "proTarget",
            },
            [c6ConfidenceConnectorId]: {
                id: c6ConfidenceConnectorId,
                type: "confidence",
                source: c6ClaimId,
                targetClaimId: c1ClaimId,
                targetRelationship: "conTarget",
            },
        },
    },
    snapshot: {
        [mainClaimVizId]: {
            type: "claim",
            id: mainClaimVizId,
            claimId: mainClaimId,
            position: mainClaimPosition,
            scale: 1,
            scourcesScale: 1,
            score: 1,
            side: "proMain",
        },
        [c1ClaimVizId]: {
            type: "claim",
            id: c1ClaimVizId,
            claimId: c1ClaimId,
            position: c1ClaimPosition,
            scale: secondLayerClaimScale,
            scourcesScale: 1,
            score: 1,
            side: "proMain",
        },
        [c2ClaimVizId]: {
            type: "claim",
            id: c2ClaimVizId,
            claimId: c2ClaimId,
            position: c2ClaimPosition,
            scale: secondLayerClaimScale,
            scourcesScale: 1,
            score: 1,
            side: "conMain",
        },
        [c3ClaimVizId]: {
            type: "claim",
            id: c3ClaimVizId,
            claimId: c3ClaimId,
            position: c3ClaimPosition,
            scale: thirdLayerClaimScale,
            scourcesScale: 1,
            score: 1,
            side: "conMain",
        },
        [c4ClaimVizId]: {
            type: "claim",
            id: c4ClaimVizId,
            claimId: c4ClaimId,
            position: c4ClaimPosition,
            scale: thirdLayerClaimScale,
            scourcesScale: 1,
            score: 1,
            side: "proMain",
        },
        [c5ClaimVizId]: {
            type: "claim",
            id: c5ClaimVizId,
            claimId: c5ClaimId,
            position: c5ClaimPosition,
            scale: thirdLayerClaimScale,
            scourcesScale: 1,
            score: 1,
            side: "proMain",
        },
        [c6ClaimVizId]: {
            type: "claim",
            id: c6ClaimVizId,
            claimId: c6ClaimId,
            position: c6ClaimPosition,
            scale: thirdLayerClaimScale,
            scourcesScale: 1,
            score: 1,
            side: "conMain",
        },
        [mainClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: mainClaimAggregatorVizId,
            animationType: "uniform",
            claimId: mainClaimId,
            deliveryConnectorVizIds: [
                c1DeliveryConnectorVizId,
                c2DeliveryConnectorVizId,
            ],
            position: mainClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c1ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c1ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c1ClaimId,
            deliveryConnectorVizIds: [
                c4DeliveryConnectorVizId,
                c5DeliveryConnectorVizId,
                c6DeliveryConnectorVizId,
            ],
            position: c1ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c2ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c2ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c2ClaimId,
            deliveryConnectorVizIds: [],
            position: c2ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c3ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c3ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c3ClaimId,
            deliveryConnectorVizIds: [],
            position: c3ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c4ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c4ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c4ClaimId,
            deliveryConnectorVizIds: [],
            position: c4ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c5ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c5ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c5ClaimId,
            deliveryConnectorVizIds: [],
            position: c5ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c6ClaimAggregatorVizId]: {
            type: "claimAggregator",
            id: c6ClaimAggregatorVizId,
            animationType: "uniform",
            claimId: c6ClaimId,
            deliveryConnectorVizIds: [],
            position: c6ClaimAggregatorPosition,
            scale: 1,
            score: 1,
        },
        [c1JunctionVizId]: {
            type: "junction",
            id: c1JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c1ConfidenceConnectorId,
            junctionAggregatorVizId: c1JunctionAggregatorVizId,
            position: c1ClaimLeftEdgePosition,
            scale: 1,
            visible: false,
        },
        [c2JunctionVizId]: {
            type: "junction",
            id: c2JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c2ConfidenceConnectorId,
            junctionAggregatorVizId: c2JunctionAggregatorVizId,
            position: c2ClaimLeftEdgePosition,
            scale: 1,
            visible: true,
        },
        [c4JunctionVizId]: {
            type: "junction",
            id: c4JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c4ConfidenceConnectorId,
            junctionAggregatorVizId: c4JunctionAggregatorVizId,
            position: c4ClaimLeftEdgePosition,
            scale: 1,
            visible: false,
        },
        [c5JunctionVizId]: {
            type: "junction",
            id: c5JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c5ConfidenceConnectorId,
            junctionAggregatorVizId: c5JunctionAggregatorVizId,
            position: c5ClaimLeftEdgePosition,
            scale: 1,
            visible: false,
        },
        [c6JunctionVizId]: {
            type: "junction",
            id: c6JunctionVizId,
            animationType: "uniform",
            confidenceConnectorId: c6ConfidenceConnectorId,
            junctionAggregatorVizId: c6JunctionAggregatorVizId,
            position: c6ClaimLeftEdgePosition,
            scale: 1,
            visible: false,
        },
        [c1JunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: c1JunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: c1ConfidenceConnectorId,
            position: c1ClaimLeftEdgePosition,
            relevanceConnectorVizIds: [],
            scale: 1,
            score: 1,
            visible: false,
        },
        [c2JunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: c2JunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: c2ConfidenceConnectorId,
            position: c2ClaimLeftEdgePosition,
            relevanceConnectorVizIds: [c3RelevanceConnectorVizId],
            scale: 1,
            score: 1,
            visible: true,
        },
        [c4JunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: c4JunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: c4ConfidenceConnectorId,
            position: c4ClaimLeftEdgePosition,
            relevanceConnectorVizIds: [],
            scale: 1,
            score: 1,
            visible: false,
        },
        [c5JunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: c5JunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: c5ConfidenceConnectorId,
            position: c5ClaimLeftEdgePosition,
            relevanceConnectorVizIds: [],
            scale: 1,
            score: 1,
            visible: false,
        },
        [c6JunctionAggregatorVizId]: {
            type: "junctionAggregator",
            id: c6JunctionAggregatorVizId,
            animationType: "uniform",
            confidenceConnectorId: c6ConfidenceConnectorId,
            position: c6ClaimLeftEdgePosition,
            relevanceConnectorVizIds: [],
            scale: 1,
            score: 1,
            visible: false,
        },
        [c1ConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: c1ConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c1ConfidenceConnectorId,
            sourceClaimVizId: c1ClaimVizId,
            targetJunctionVizId: c1JunctionVizId,
            visible: false,
            scale: secondLayerClaimScale,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
            source: c1ClaimLeftEdgePosition,
            target: c1ClaimLeftEdgePosition,
        },
        [c2ConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: c2ConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c2ConfidenceConnectorId,
            sourceClaimVizId: c2ClaimVizId,
            targetJunctionVizId: c2JunctionVizId,
            visible: true,
            scale: secondLayerClaimScale,
            score: 1,
            side: "conMain",
            direction: "sourceToTarget",
            source: c2ClaimLeftEdgePosition,
            target: c2ClaimLeftEdgePosition,
        },
        [c4ConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: c4ConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c4ConfidenceConnectorId,
            sourceClaimVizId: c4ClaimVizId,
            targetJunctionVizId: c4JunctionVizId,
            visible: false,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
            source: c4ClaimLeftEdgePosition,
            target: c4ClaimLeftEdgePosition,
        },
        [c5ConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: c5ConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c5ConfidenceConnectorId,
            sourceClaimVizId: c5ClaimVizId,
            targetJunctionVizId: c5JunctionVizId,
            visible: false,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
            source: c5ClaimLeftEdgePosition,
            target: c5ClaimLeftEdgePosition,
        },
        [c6ConfidenceConnectorVizId]: {
            type: "confidenceConnector",
            id: c6ConfidenceConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c6ConfidenceConnectorId,
            sourceClaimVizId: c6ClaimVizId,
            targetJunctionVizId: c6JunctionVizId,
            visible: false,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "conMain",
            direction: "sourceToTarget",
            source: c6ClaimLeftEdgePosition,
            target: c6ClaimLeftEdgePosition,
        },
        [c1DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c1DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c1ConfidenceConnectorId,
            sourceJunctionVizId: c1JunctionVizId,
            targetClaimVizId: mainClaimVizId,
            scale: secondLayerClaimScale,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
            source: c1ClaimLeftEdgePosition,
            target: mainClaimRightEdgePosition,
            targetSideOffset: c1MainTargetSideOffset,
        },
        [c2DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c2DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c2ConfidenceConnectorId,
            sourceJunctionVizId: c2JunctionVizId,
            targetClaimVizId: mainClaimVizId,
            scale: secondLayerClaimScale,
            score: 1,
            side: "conMain",
            direction: "sourceToTarget",
            source: c2ClaimLeftEdgePosition,
            target: mainClaimRightEdgePosition,
            targetSideOffset: c2MainTargetSideOffset,
        },
        [c4DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c4DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c4ConfidenceConnectorId,
            sourceJunctionVizId: c4JunctionVizId,
            targetClaimVizId: c1ClaimVizId,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
            source: c4ClaimLeftEdgePosition,
            target: c1ClaimRightEdgePosition,
            targetSideOffset: c4C1TargetSideOffset,
        },
        [c5DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c5DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c5ConfidenceConnectorId,
            sourceJunctionVizId: c5JunctionVizId,
            targetClaimVizId: c1ClaimVizId,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "proMain",
            direction: "sourceToTarget",
            source: c5ClaimLeftEdgePosition,
            target: c1ClaimRightEdgePosition,
            targetSideOffset: c5C1TargetSideOffset,
        },
        [c6DeliveryConnectorVizId]: {
            type: "deliveryConnector",
            id: c6DeliveryConnectorVizId,
            animationType: "progressive",
            confidenceConnectorId: c6ConfidenceConnectorId,
            sourceJunctionVizId: c6JunctionVizId,
            targetClaimVizId: c1ClaimVizId,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "conMain",
            direction: "sourceToTarget",
            source: c6ClaimLeftEdgePosition,
            target: c1ClaimRightEdgePosition,
            targetSideOffset: c6C1TargetSideOffset,
        },
        [c3RelevanceConnectorVizId]: {
            type: "relevanceConnector",
            id: c3RelevanceConnectorVizId,
            animationType: "progressive",
            relevanceConnectorId: c3RelevanceConnectorId,
            sourceClaimVizId: c3ClaimVizId,
            targetJunctionAggregatorVizId: c2JunctionAggregatorVizId,
            scale: thirdLayerClaimScale,
            score: 1,
            side: "conMain",
            direction: "sourceToTarget",
            source: c3ClaimLeftEdgePosition,
            target: c2ClaimLeftEdgePosition,
        },
    },
};