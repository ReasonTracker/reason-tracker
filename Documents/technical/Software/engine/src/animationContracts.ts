import type { ClaimId } from "./debate-core/Claim.ts";
import type {
	ConfidenceConnectorId,
	RelevanceConnectorId,
} from "./debate-core/Connector.ts";
import type { Point } from "./geometry/Point.ts";

export interface PlannerOptions {
	/** Edge-to-edge gap between sibling claim boxes along a claim lane's lane axis. This gap resolves at local `sourcesScale`. */
	claimLaneAxisGap: number
	/**
	 * Fraction of the connector column reserved for its central straight section.
	 * The remaining width is divided equally between the two endpoint bends.
	 */
	connectorStraightShare: number
	/** Claim width used when resolving claim edges from claim centers. */
	claimWidth: number
	/** Claim height used for claim bounds and derived pipe width. */
	claimHeight: number
}

export type PresentationClaimOccurrenceId = string & {
	readonly __brand: "PresentationClaimOccurrenceId"
};

export type PresentationConnectorOccurrenceId = string & {
	readonly __brand: "PresentationConnectorOccurrenceId"
};

export type PresentationSide = "proMain" | "conMain";

export type ClaimFrameState = {
	claimId: ClaimId
	derivedContent: string
	derivedSide: PresentationSide
	displayContent: string
	displaySide: PresentationSide
	id: PresentationClaimOccurrenceId
	opacity: number
	originalContent: string
	originalSide: PresentationSide
	originalValue: number
	position: Point
	scale: number
	sourcesScale: number
	value: number
};

export type ConnectorVolumeTransition = {
	finalValue: number
	initialValue: number
	progress: number
};

export type ConfidenceConnectionFrameState = {
	/** Fluid level inside the target's delivery aggregator; it trails `score` by one step. */
	aggregatorScore: number
	aggregatorVolumeTransitions: ConnectorVolumeTransition[]
	confidenceConnectorId: ConfidenceConnectorId
	deliveryScore: number
	deliveryScale: number
	deliveryTargetScale: number
	id: PresentationConnectorOccurrenceId
	relevanceMultiplier: number
	relevanceConnectorOccurrenceIds: PresentationConnectorOccurrenceId[]
	score: number
	shellReveal: number
	displaySide: PresentationSide
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	sourceScale: number
	targetClaimOccurrenceId: PresentationClaimOccurrenceId
	targetSideOffset: number
	volumeTransitions: ConnectorVolumeTransition[]
};

export type RelevanceConnectionFrameState = {
	id: PresentationConnectorOccurrenceId
	relevanceConnectorId: RelevanceConnectorId
	scale: number
	score: number
	shellReveal: number
	displaySide: PresentationSide
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	targetConfidenceConnectorOccurrenceId: PresentationConnectorOccurrenceId
	targetSideOffset: number
	volumeTransitions: ConnectorVolumeTransition[]
};

export type DebateFrame = {
	claims: Record<PresentationClaimOccurrenceId, ClaimFrameState>
	confidenceConnections: Record<
		PresentationConnectorOccurrenceId,
		ConfidenceConnectionFrameState
	>
	relevanceConnections: Record<
		PresentationConnectorOccurrenceId,
		RelevanceConnectionFrameState
	>
};
