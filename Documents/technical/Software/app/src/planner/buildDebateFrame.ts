import type { DebateCore } from "../debate-core/Debate.ts";
import type {
	PresentationClaimOccurrence,
	PresentationClaimOccurrenceId,
	PresentationConfidenceConnectorOccurrence,
	PresentationConnectorOccurrenceId,
	PresentationRelevanceConnectorOccurrence,
} from "./buildPresentationGraphFromDebateCore.ts";
import type {
	ConfidenceConnectionFrameState,
	DebateFrame,
	Point,
	RelevanceConnectionFrameState,
} from "./DebateAnimationPlan.ts";
import type { PlannerOptions } from "./contracts.ts";
import type { ResolvedPresentationMath } from "./resolvePresentationMath.ts";

// AGENT NOTE: Keep layout geometry tolerances and spacing/shape tuning grouped here.
/** Scales the connector corridor width relative to the largest rendered child. */
const CONNECTOR_COLUMN_WIDTH_MULTIPLIER = 1.5;
/** Smallest rendered width or length treated as nonzero by contour packing. */
const CONTOUR_GEOMETRY_EPSILON = 1e-6;
/**
 * Steepest angle, measured from horizontal, of the aggregator's slanted sides. When the
 * incoming relevance connectors are too narrow to span the height change at this angle,
 * the sides lengthen beyond the connector width instead. A steeper angle allows a
 * narrower trapezoid.
 */
const MAX_AGGREGATOR_SIDE_ANGLE_RADIANS = Math.PI / 4;

/** A horizontal slice of rendered geometry, with linearly changing vertical bounds. */
type ClaimContourSlice = {
	bottomAtLeft: number
	bottomAtRight: number
	left: number
	right: number
	topAtLeft: number
	topAtRight: number
};

/** Rendered geometry in a claim subtree, relative to its root claim. */
type ClaimContour = ClaimContourSlice[];

/** One claim placed in a parent's child column, relative to the parent claim center. */
type ColumnPlacement = {
	center: number
	claimOccurrenceId: PresentationClaimOccurrenceId
	connectorType: "confidence" | "relevance"
	targetSideOffset: number
};

export function buildDebateFrame(args: {
	debateCore: DebateCore
	options: PlannerOptions
	origin?: Point
	resolvedMath: ResolvedPresentationMath
	visualScales?: Partial<Record<PresentationClaimOccurrenceId, number>>
}): DebateFrame {
	const frame: DebateFrame = {
		claims: {},
		confidenceConnections: {},
		relevanceConnections: {},
	};
	const measuredContours = new Map<PresentationClaimOccurrenceId, ClaimContour>();
	const resolvedColumns = new Map<PresentationClaimOccurrenceId, ColumnPlacement[]>();

	const resolveClaimLaneGap = (
		firstClaimOccurrenceId: PresentationClaimOccurrenceId,
		secondClaimOccurrenceId: PresentationClaimOccurrenceId,
	): number => (
		args.options.claimLaneAxisGap * (
			(resolveSourcesScale(args.resolvedMath, firstClaimOccurrenceId)
				+ resolveSourcesScale(args.resolvedMath, secondClaimOccurrenceId)) / 2
		)
	);

	const resolveClaimHalfHeight = (claimOccurrenceId: PresentationClaimOccurrenceId): number => (
		(args.options.claimHeight * resolveVisualScale(args, claimOccurrenceId)) / 2
	);

	const resolveAggregatorWidth = (claimOccurrenceId: PresentationClaimOccurrenceId): number => {
		const claimOccurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		return resolveDeliveryAggregatorWidth({
			childEdgeHeight: args.options.claimHeight
				* resolveSourcesScale(args.resolvedMath, claimOccurrenceId),
			claimEdgeHeight: args.options.claimHeight
				* resolveVisualScale(args, claimOccurrenceId),
			relevanceWidth: args.options.claimHeight
				* resolveAggregatorRelevanceSpan(args.resolvedMath, claimOccurrence),
		});
	};

	const resolveChildColumnOffset = (claimOccurrenceId: PresentationClaimOccurrenceId): number => {
		const claimOccurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const childOccurrences = [
			...getOrderedConfidenceOccurrences(args.resolvedMath, claimOccurrence),
			...getOrderedRelevanceOccurrences(args.resolvedMath, claimOccurrence),
		];
		const childScale = childOccurrences.length > 0
			? Math.max(...childOccurrences.map((occurrence) =>
				resolveVisualScale(args, occurrence.sourceClaimOccurrenceId)))
			: resolveSourcesScale(args.resolvedMath, claimOccurrenceId);
		return (args.options.claimWidth * resolveVisualScale(args, claimOccurrenceId))
			+ (
				args.options.connectorCurveLaneWidth
				+ args.options.connectorDiagonalLaneWidth
				+ args.options.connectorCurveLaneWidth
			) * childScale * CONNECTOR_COLUMN_WIDTH_MULTIPLIER
			+ resolveAggregatorWidth(claimOccurrenceId);
	};

	/**
	 * Places a claim's confidence children at their delivery ports, then stacks the
	 * relevance claims that modify this claim's own delivery below them, starting
	 * under the claim's delivery aggregator.
	 */
	const resolveColumn = (claimOccurrenceId: PresentationClaimOccurrenceId): ColumnPlacement[] => {
		const cached = resolvedColumns.get(claimOccurrenceId);
		if (cached) {
			return cached;
		}

		const claimOccurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const targetSideOffsets = resolveConfidenceTargetSideOffsets({
			claimOccurrence,
			options: args.options,
			resolvedMath: args.resolvedMath,
		});
		const relevanceSideOffsets = resolveRelevanceTargetSideOffsets({
			claimOccurrence,
			options: args.options,
			resolvedMath: args.resolvedMath,
		});
		const items: Array<{
			claimOccurrenceId: PresentationClaimOccurrenceId
			connectorType: "confidence" | "relevance"
			contour: ClaimContour
			preferredCenter: number
			targetSideOffset: number
		}> = getOrderedConfidenceOccurrences(args.resolvedMath, claimOccurrence).map((occurrence) => {
			const targetSideOffset = getRequiredNumber(
				targetSideOffsets[occurrence.id],
				`target side offset for ${occurrence.id}`,
			);
			return {
				claimOccurrenceId: occurrence.sourceClaimOccurrenceId,
				connectorType: "confidence",
				contour: measureClaim(occurrence.sourceClaimOccurrenceId),
				preferredCenter: targetSideOffset,
				targetSideOffset,
			};
		});
		let previousRelevance: {
			claimOccurrenceId: PresentationClaimOccurrenceId
			preferredBottom: number
		} | undefined;
		for (const relevanceOccurrence of getOrderedRelevanceOccurrences(
			args.resolvedMath,
			claimOccurrence,
		)) {
			const relevanceClaimOccurrenceId = relevanceOccurrence.sourceClaimOccurrenceId;
			const halfHeight = resolveClaimHalfHeight(relevanceClaimOccurrenceId);
			const preferredTop = previousRelevance
				? previousRelevance.preferredBottom
					+ resolveClaimLaneGap(previousRelevance.claimOccurrenceId, relevanceClaimOccurrenceId)
				: resolveAggregatorHalfHeight(args, claimOccurrenceId)
					+ (args.options.claimLaneAxisGap
						* resolveSourcesScale(args.resolvedMath, relevanceClaimOccurrenceId));
			items.push({
				claimOccurrenceId: relevanceClaimOccurrenceId,
				connectorType: "relevance",
				contour: measureClaim(relevanceClaimOccurrenceId),
				preferredCenter: preferredTop + halfHeight,
				targetSideOffset: getRequiredNumber(
					relevanceSideOffsets[relevanceOccurrence.id],
					`target side offset for ${relevanceOccurrence.id}`,
				),
			});
			previousRelevance = {
				claimOccurrenceId: relevanceClaimOccurrenceId,
				preferredBottom: preferredTop + (halfHeight * 2),
			};
		}

		const centers = resolvePackedCenters(items.map((item, index) => {
			const previous = items[index - 1];
			return {
				minimumDistanceFromPrevious: previous
					? resolveContourSeparation(
						previous.contour,
						item.contour,
						resolveClaimLaneGap(previous.claimOccurrenceId, item.claimOccurrenceId),
					)
					: 0,
				preferredCenter: item.preferredCenter,
			};
		}));
		const column = items.map((item, index) => ({
			center: centers[index] ?? item.preferredCenter,
			claimOccurrenceId: item.claimOccurrenceId,
			connectorType: item.connectorType,
			targetSideOffset: item.targetSideOffset,
		}));
		resolvedColumns.set(claimOccurrenceId, column);
		return column;
	};

	const measureClaim = (claimOccurrenceId: PresentationClaimOccurrenceId): ClaimContour => {
		const cached = measuredContours.get(claimOccurrenceId);
		if (cached) {
			return cached;
		}

		const claimOccurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const scale = resolveVisualScale(args, claimOccurrenceId);
		const sourcesScale = resolveSourcesScale(args.resolvedMath, claimOccurrenceId);
		const claimWidth = args.options.claimWidth * scale;
		const claimHalfHeight = (args.options.claimHeight * scale) / 2;
		const childHalfHeight = (args.options.claimHeight * sourcesScale) / 2;
		const aggregatorWidth = resolveAggregatorWidth(claimOccurrenceId);
		const contour: ClaimContour = [];
		addContourRectangle(contour, 0, claimWidth, -claimHalfHeight, claimHalfHeight);
		if (aggregatorWidth > 0) {
			addContourSlice(contour, {
				bottomAtLeft: claimHalfHeight,
				bottomAtRight: childHalfHeight,
				left: claimWidth,
				right: claimWidth + aggregatorWidth,
				topAtLeft: -claimHalfHeight,
				topAtRight: -childHalfHeight,
			});
		}

		const childColumnOffset = resolveChildColumnOffset(claimOccurrenceId);
		for (const placement of resolveColumn(claimOccurrenceId)) {
			addTranslatedContour(
				contour,
				measureClaim(placement.claimOccurrenceId),
				childColumnOffset,
				placement.center,
			);
			addPlacementConnectorContour({
				claimWidth,
				placement,
				aggregatorWidth,
				childColumnOffset,
				claimHalfHeight,
				childHalfHeight,
				options: args.options,
				contour,
				resolvedMath: args.resolvedMath,
			});
		}

		measuredContours.set(claimOccurrenceId, contour);
		return contour;
	};

	const layoutClaim = (
		claimOccurrenceId: PresentationClaimOccurrenceId,
		claimLeftEdgeX: number,
		claimCenterY: number,
	): void => {
		const occurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const scale = resolveVisualScale(args, claimOccurrenceId);
		const sourcesScale = resolveSourcesScale(args.resolvedMath, claimOccurrenceId);
		const score = args.resolvedMath.claimScores[claimOccurrenceId];
		const originalContent = args.resolvedMath.originalContents[claimOccurrenceId];
		const derivedContent = args.resolvedMath.derivedContents[claimOccurrenceId];
		const displayContent = args.resolvedMath.displayContents[claimOccurrenceId];
		const originalSide = args.resolvedMath.originalSides[claimOccurrenceId];
		const derivedSide = args.resolvedMath.derivedSides[claimOccurrenceId];
		const displaySide = args.resolvedMath.displaySides[claimOccurrenceId];
		if (!score || !originalContent || !derivedContent || !displayContent || !originalSide || !derivedSide || !displaySide) {
			throw new Error(`Missing resolved presentation values for ${claimOccurrenceId}`);
		}

		frame.claims[claimOccurrenceId] = {
			claimId: occurrence.claimId,
			derivedContent,
			derivedSide,
			displayContent,
			displaySide,
			id: claimOccurrenceId,
			opacity: 1,
			originalContent,
			originalSide,
			originalValue: score.originalValue,
			position: {
				x: claimLeftEdgeX + ((args.options.claimWidth * scale) / 2),
				y: claimCenterY,
			},
			scale,
			sourcesScale,
			value: score.value,
		};

		const column = resolveColumn(claimOccurrenceId);
		if (column.length === 0) {
			return;
		}

		const childLeftEdgeX = claimLeftEdgeX + resolveChildColumnOffset(claimOccurrenceId);
		for (const placement of column) {
			layoutClaim(placement.claimOccurrenceId, childLeftEdgeX, claimCenterY + placement.center);
		}
	};

	const rootClaimOccurrenceId = args.resolvedMath.presentationGraph.rootClaimOccurrenceId;
	const rootScale = resolveVisualScale(args, rootClaimOccurrenceId);
	layoutClaim(
		rootClaimOccurrenceId,
		(args.origin?.x ?? (args.options.claimWidth * rootScale) / 2) - ((args.options.claimWidth * rootScale) / 2),
		args.origin?.y ?? 0,
	);
	buildConnectionStates({
		frame,
		options: args.options,
		resolvedMath: args.resolvedMath,
	});

	return frame;
}

function buildConnectionStates(args: {
	frame: DebateFrame
	options: PlannerOptions
	resolvedMath: ResolvedPresentationMath
}): void {
	for (const claimOccurrence of Object.values(args.resolvedMath.presentationGraph.claimOccurrences)) {
		const confidenceOccurrences = getOrderedConfidenceOccurrences(
			args.resolvedMath,
			claimOccurrence,
		);
		const confidenceOffsets = resolveConfidenceTargetSideOffsets({
			claimOccurrence,
			options: args.options,
			resolvedMath: args.resolvedMath,
		});

		confidenceOccurrences.forEach((occurrence) => {
			const deliveryScale = getRequiredNumber(
				args.resolvedMath.deliveryScales[occurrence.sourceClaimOccurrenceId],
				`delivery scale for ${occurrence.sourceClaimOccurrenceId}`,
			);
			const score = args.resolvedMath.claimScores[occurrence.sourceClaimOccurrenceId];
			const connectorScore = args.resolvedMath.connectorScores[occurrence.id];
			const displaySide = args.resolvedMath.displaySides[occurrence.sourceClaimOccurrenceId];
			if (!score || !connectorScore || !displaySide) {
				throw new Error(`Missing resolved connection values for ${occurrence.id}`);
			}

			const state: ConfidenceConnectionFrameState = {
				confidenceConnectorId: occurrence.confidenceConnectorId,
				deliveryScore: connectorScore.deliveryScore,
				deliveryScale,
				deliveryTargetScale: deliveryScale,
				id: occurrence.id,
				relevanceMultiplier: connectorScore.relevanceMultiplier,
				relevanceConnectorOccurrenceIds: occurrence.relevanceConnectorOccurrenceIds,
				score: score.value,
				shellReveal: 1,
				displaySide,
				sourceClaimOccurrenceId: occurrence.sourceClaimOccurrenceId,
				sourceScale: deliveryScale,
				targetClaimOccurrenceId: occurrence.targetClaimOccurrenceId,
				targetSideOffset: confidenceOffsets[occurrence.id] ?? 0,
				volumeTransitions: [],
			};
			args.frame.confidenceConnections[occurrence.id] = state;
		});

		const relevanceOccurrences = getOrderedRelevanceOccurrences(
			args.resolvedMath,
			claimOccurrence,
		);
		const relevanceOffsets = resolveRelevanceTargetSideOffsets({
			claimOccurrence,
			options: args.options,
			resolvedMath: args.resolvedMath,
		});

		relevanceOccurrences.forEach((relevanceOccurrence) => {
			const relevanceScore = args.resolvedMath.claimScores[
				relevanceOccurrence.sourceClaimOccurrenceId
			];
			const relevanceDisplaySide = args.resolvedMath.displaySides[
				relevanceOccurrence.sourceClaimOccurrenceId
			];
			if (!relevanceScore || !relevanceDisplaySide) {
				throw new Error(`Missing resolved relevance values for ${relevanceOccurrence.id}`);
			}

			const relevanceState: RelevanceConnectionFrameState = {
				id: relevanceOccurrence.id,
				relevanceConnectorId: relevanceOccurrence.relevanceConnectorId,
				scale: resolveDeliveryScale(args.resolvedMath, relevanceOccurrence.sourceClaimOccurrenceId),
				score: relevanceScore.value,
				shellReveal: 1,
				displaySide: relevanceDisplaySide,
				sourceClaimOccurrenceId: relevanceOccurrence.sourceClaimOccurrenceId,
				targetConfidenceConnectorOccurrenceId:
					relevanceOccurrence.targetConfidenceConnectorOccurrenceId,
				targetSideOffset: relevanceOffsets[relevanceOccurrence.id] ?? 0,
				volumeTransitions: [],
			};
			args.frame.relevanceConnections[relevanceOccurrence.id] = relevanceState;
		});
	}
}

function getOrderedConfidenceOccurrences(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrence: PresentationClaimOccurrence,
): PresentationConfidenceConnectorOccurrence[] {
	return claimOccurrence.confidenceConnectorOccurrenceIds
		.map((connectorOccurrenceId) => getConfidenceOccurrence(resolvedMath, connectorOccurrenceId))
		.sort((left, right) => compareConnectorOccurrences(resolvedMath, left, right));
}

/**
 * Returns the relevance connectors that modify this claim's own outgoing confidence
 * delivery. They land on this claim's delivery aggregator and stack in its child column.
 */
function getOrderedRelevanceOccurrences(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrence: PresentationClaimOccurrence,
): PresentationRelevanceConnectorOccurrence[] {
	const outgoingOccurrence = claimOccurrence.incomingConnectorOccurrenceId
		? resolvedMath.presentationGraph.connectorOccurrences[claimOccurrence.incomingConnectorOccurrenceId]
		: undefined;
	if (outgoingOccurrence?.type !== "confidence") {
		return [];
	}

	return outgoingOccurrence.relevanceConnectorOccurrenceIds
		.map((connectorOccurrenceId) => getRelevanceOccurrence(resolvedMath, connectorOccurrenceId))
		.sort((left, right) => compareConnectorOccurrences(resolvedMath, left, right));
}

function compareConnectorOccurrences(
	resolvedMath: ResolvedPresentationMath,
	left: PresentationConfidenceConnectorOccurrence | PresentationRelevanceConnectorOccurrence,
	right: PresentationConfidenceConnectorOccurrence | PresentationRelevanceConnectorOccurrence,
): number {
	const sideDifference = displaySideRank(
		getRequiredDisplaySide(resolvedMath, left.sourceClaimOccurrenceId),
	) - displaySideRank(getRequiredDisplaySide(resolvedMath, right.sourceClaimOccurrenceId));
	return sideDifference || left.id.localeCompare(right.id);
}

function getClaimOccurrence(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrenceId: PresentationClaimOccurrenceId,
): PresentationClaimOccurrence {
	const occurrence = resolvedMath.presentationGraph.claimOccurrences[claimOccurrenceId];
	if (!occurrence) {
		throw new Error(`Missing presentation claim occurrence: ${claimOccurrenceId}`);
	}

	return occurrence;
}

function getConfidenceOccurrence(
	resolvedMath: ResolvedPresentationMath,
	connectorOccurrenceId: PresentationConnectorOccurrenceId,
): PresentationConfidenceConnectorOccurrence {
	const occurrence = resolvedMath.presentationGraph.connectorOccurrences[connectorOccurrenceId];
	if (!occurrence || occurrence.type !== "confidence") {
		throw new Error(`Missing presentation confidence occurrence: ${connectorOccurrenceId}`);
	}

	return occurrence;
}

function getRelevanceOccurrence(
	resolvedMath: ResolvedPresentationMath,
	connectorOccurrenceId: PresentationConnectorOccurrenceId,
): PresentationRelevanceConnectorOccurrence {
	const occurrence = resolvedMath.presentationGraph.connectorOccurrences[connectorOccurrenceId];
	if (!occurrence || occurrence.type !== "relevance") {
		throw new Error(`Missing presentation relevance occurrence: ${connectorOccurrenceId}`);
	}

	return occurrence;
}

/**
 * Horizontal width of a symmetric delivery aggregator. Each slanted side drops half the
 * difference between the claim-side and children-side edge heights. The bottom side is as
 * long as the incoming relevance connectors are wide, unless that would make it steeper
 * than `MAX_AGGREGATOR_SIDE_ANGLE_RADIANS`; then it lengthens to run at that angle.
 */
export function resolveDeliveryAggregatorWidth(args: {
	childEdgeHeight: number
	claimEdgeHeight: number
	relevanceWidth: number
}): number {
	if (args.relevanceWidth <= 0) {
		return 0;
	}

	const drop = Math.abs(args.claimEdgeHeight - args.childEdgeHeight) / 2;
	const sideLength = Math.max(
		args.relevanceWidth,
		drop / Math.sin(MAX_AGGREGATOR_SIDE_ANGLE_RADIANS),
	);
	return Math.sqrt((sideLength ** 2) - (drop ** 2));
}

/**
 * Sum of the scales of the relevance connectors that land on a claim's delivery
 * aggregator. Multiplied by `claimHeight`, this is their combined width.
 */
function resolveAggregatorRelevanceSpan(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrence: PresentationClaimOccurrence,
): number {
	return getOrderedRelevanceOccurrences(resolvedMath, claimOccurrence).reduce(
		(span, relevanceOccurrence) => span + resolveDeliveryScale(
			resolvedMath,
			relevanceOccurrence.sourceClaimOccurrenceId,
		),
		0,
	);
}

/**
 * Half of the taller delivery-aggregator edge. The claim-side edge matches the claim
 * box and the child-side edge matches the claim's pre-relevance `sourcesScale`.
 */
function resolveAggregatorHalfHeight(
	args: {
		options: PlannerOptions
		resolvedMath: ResolvedPresentationMath
		visualScales?: Partial<Record<PresentationClaimOccurrenceId, number>>
	},
	claimOccurrenceId: PresentationClaimOccurrenceId,
): number {
	const claimOccurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
	if (getOrderedRelevanceOccurrences(args.resolvedMath, claimOccurrence).length === 0) {
		return (args.options.claimHeight * resolveVisualScale(args, claimOccurrenceId)) / 2;
	}

	return (args.options.claimHeight * Math.max(
		resolveVisualScale(args, claimOccurrenceId),
		resolveSourcesScale(args.resolvedMath, claimOccurrenceId),
	)) / 2;
}

function resolveConnectionEnvelope(args: {
	options: PlannerOptions
	scale: number
}): { bottomOffset: number; topOffset: number } {
	const pipeWidth = args.options.claimHeight * args.scale;
	return {
		bottomOffset: pipeWidth / 2,
		topOffset: -(pipeWidth / 2),
	};
}

function resolveCenteredOffsets(
	envelopes: Array<{ bottomOffset: number; topOffset: number }>,
): number[] {
	const totalHeight = envelopes.reduce(
		(sum, envelope) => sum + (envelope.bottomOffset - envelope.topOffset),
		0,
	);
	let nextTop = -(totalHeight / 2);

	return envelopes.map((envelope) => {
		const offset = nextTop - envelope.topOffset;
		nextTop += envelope.bottomOffset - envelope.topOffset;
		return offset;
	});
}

function resolveRelevanceTargetSideOffsets(args: {
	claimOccurrence: PresentationClaimOccurrence
	options: PlannerOptions
	resolvedMath: ResolvedPresentationMath
}): Partial<Record<PresentationConnectorOccurrenceId, number>> {
	const relevanceOccurrences = getOrderedRelevanceOccurrences(
		args.resolvedMath,
		args.claimOccurrence,
	);
	const offsets = resolveCenteredOffsets(
		[...relevanceOccurrences].reverse().map((occurrence) => resolveConnectionEnvelope({
			options: args.options,
			scale: resolveDeliveryScale(args.resolvedMath, occurrence.sourceClaimOccurrenceId),
		})),
	).reverse();
	return Object.fromEntries(
		relevanceOccurrences.map((occurrence, index) => [occurrence.id, offsets[index] ?? 0]),
	) as Partial<Record<PresentationConnectorOccurrenceId, number>>;
}

function displaySideRank(side: "proMain" | "conMain"): number {
	return side === "proMain" ? 0 : 1;
}

function getRequiredNumber(value: number | undefined, label: string): number {
	if (value === undefined || !Number.isFinite(value)) {
		throw new Error(`Missing finite ${label}`);
	}

	return value;
}

function resolveSourcesScale(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrenceId: PresentationClaimOccurrenceId,
): number {
	return getRequiredNumber(
		resolvedMath.sourcesScales[claimOccurrenceId],
		`source scale for ${claimOccurrenceId}`,
	);
}

function resolveDeliveryScale(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrenceId: PresentationClaimOccurrenceId,
): number {
	return getRequiredNumber(
		resolvedMath.deliveryScales[claimOccurrenceId],
		`delivery scale for ${claimOccurrenceId}`,
	);
}

/** Rendered claim-box scale: the claim's `sourcesScale` multiplied by its relevance. */
function resolveVisualScale(
	args: {
		resolvedMath: ResolvedPresentationMath
		visualScales?: Partial<Record<PresentationClaimOccurrenceId, number>>
	},
	claimOccurrenceId: PresentationClaimOccurrenceId,
): number {
	return getRequiredNumber(
		args.visualScales?.[claimOccurrenceId]
		?? args.resolvedMath.deliveryScales[claimOccurrenceId],
		`visual scale for ${claimOccurrenceId}`,
	);
}

function resolveDeliveryOffsets(args: {
	baseClaimHeight: number
	connections: Array<{
		fluidShare: number
		shellScale: number
		side: "proMain" | "conMain"
	}>
	parentHeight: number
}): number[] {
	const fluidWidths = args.connections.map((connection) => (
		args.parentHeight * connection.fluidShare
	));
	const totalFluidWidth = fluidWidths.reduce((sum, width) => sum + width, 0);
	let intervalStart = -(totalFluidWidth / 2);

	return args.connections.map((connection, index) => {
		const intervalEnd = intervalStart + (fluidWidths[index] ?? 0);
		const shellWidth = args.baseClaimHeight * connection.shellScale;
		const shellCenter = connection.side === "conMain"
			? intervalStart + (shellWidth / 2)
			: intervalEnd - (shellWidth / 2);
		intervalStart = intervalEnd;
		return shellCenter;
	});
}

function resolveConfidenceTargetSideOffsets(args: {
	claimOccurrence: PresentationClaimOccurrence
	options: PlannerOptions
	resolvedMath: ResolvedPresentationMath
}): Partial<Record<PresentationConnectorOccurrenceId, number>> {
	const confidenceOccurrences = getOrderedConfidenceOccurrences(
		args.resolvedMath,
		args.claimOccurrence,
	);
	const offsets = resolveDeliveryOffsets({
		baseClaimHeight: args.options.claimHeight,
		connections: confidenceOccurrences.map((occurrence) => ({
			fluidShare: getRequiredNumber(
				args.resolvedMath.parentFluidShares[occurrence.sourceClaimOccurrenceId],
				`parent fluid share for ${occurrence.sourceClaimOccurrenceId}`,
			),
			shellScale: resolveDeliveryScale(args.resolvedMath, occurrence.sourceClaimOccurrenceId),
			side: getRequiredDisplaySide(args.resolvedMath, occurrence.sourceClaimOccurrenceId),
		})),
		parentHeight: args.options.claimHeight
			* resolveSourcesScale(args.resolvedMath, args.claimOccurrence.id),
	});
	return Object.fromEntries(
		confidenceOccurrences.map((occurrence, index) => [occurrence.id, offsets[index] ?? 0]),
	) as Partial<Record<PresentationConnectorOccurrenceId, number>>;
}

function addPlacementConnectorContour(args: {
	aggregatorWidth: number
	childColumnOffset: number
	childHalfHeight: number
	claimHalfHeight: number
	claimWidth: number
	contour: ClaimContour
	options: PlannerOptions
	placement: ColumnPlacement
	resolvedMath: ResolvedPresentationMath
}): void {
	const width = args.options.claimHeight * resolveDeliveryScale(
		args.resolvedMath,
		args.placement.claimOccurrenceId,
	);
	if (width <= CONTOUR_GEOMETRY_EPSILON) {
		return;
	}

	const source = { x: args.childColumnOffset, y: args.placement.center };
	let target: Point;
	let targetNormal: Point;
	if (args.placement.connectorType === "confidence") {
		target = {
			x: args.claimWidth + args.aggregatorWidth,
			y: args.placement.targetSideOffset,
		};
		targetNormal = { x: 1, y: 0 };
	} else {
		const edgeStart = {
			x: args.claimWidth,
			y: args.claimHalfHeight,
		};
		const edgeEnd = {
			x: args.claimWidth + args.aggregatorWidth,
			y: args.childHalfHeight,
		};
		const tangent = normalizeVector({
			x: edgeEnd.x - edgeStart.x,
			y: edgeEnd.y - edgeStart.y,
		});
		const edgeCenter = {
			x: (edgeStart.x + edgeEnd.x) / 2,
			y: (edgeStart.y + edgeEnd.y) / 2,
		};
		target = {
			x: edgeCenter.x + (tangent.x * args.placement.targetSideOffset),
			y: edgeCenter.y + (tangent.y * args.placement.targetSideOffset),
		};
		const towardOpposite = {
			x: edgeCenter.x - target.x,
			y: Math.max(edgeStart.y, edgeEnd.y) + args.options.claimHeight - target.y,
		};
		const normalA = { x: -tangent.y, y: tangent.x };
		const normalB = { x: tangent.y, y: -tangent.x };
		targetNormal = dot(normalA, towardOpposite) >= dot(normalB, towardOpposite)
			? normalA
			: normalB;
	}

	addRouteContour({
		contour: args.contour,
		curveLaneWidth: args.options.connectorCurveLaneWidth,
		source,
		sourceNormal: { x: -1, y: 0 },
		target,
		targetNormal,
		width,
	});
}

function addRouteContour(args: {
	contour: ClaimContour
	curveLaneWidth: number
	source: Point
	sourceNormal: Point
	target: Point
	targetNormal: Point
	width: number
}): void {
	const distance = Math.hypot(
		args.source.x - args.target.x,
		args.source.y - args.target.y,
	);
	if (distance <= CONTOUR_GEOMETRY_EPSILON) {
		return;
	}

	const endpointRun = Math.min(args.curveLaneWidth, distance / 3);
	const points: Point[] = [
		args.source,
		addRouteWaypoint(args.source, args.sourceNormal, endpointRun),
		addRouteWaypoint(args.target, args.targetNormal, endpointRun),
		args.target,
	];
	const halfWidth = Math.max(0, args.width) / 2;
	addContourRectangle(
		args.contour,
		args.source.x - halfWidth,
		args.source.x + halfWidth,
		args.source.y - halfWidth,
		args.source.y + halfWidth,
	);
	addContourRectangle(
		args.contour,
		args.target.x - halfWidth,
		args.target.x + halfWidth,
		args.target.y - halfWidth,
		args.target.y + halfWidth,
	);
	for (let index = 0; index < points.length - 1; index += 1) {
		addContourLineBand(args.contour, points[index]!, points[index + 1]!, halfWidth);
	}
	for (let index = 1; index < points.length - 1; index += 1) {
		const previous = points[index - 1]!;
		const corner = points[index]!;
		const next = points[index + 1]!;
		const cornerExtent = Math.min(
			Math.hypot(corner.x - previous.x, corner.y - previous.y),
			Math.hypot(next.x - corner.x, next.y - corner.y),
		);
		addContourRectangle(
			args.contour,
			corner.x - cornerExtent - halfWidth,
			corner.x + cornerExtent + halfWidth,
			corner.y - cornerExtent - halfWidth,
			corner.y + cornerExtent + halfWidth,
		);
	}
}

function addRouteWaypoint(
	point: Point,
	vector: Point,
	distance: number,
): Point {
	return {
		x: point.x + (vector.x * distance),
		y: point.y + (vector.y * distance),
	};
}

function addContourLineBand(
	contour: ClaimContour,
	start: Point,
	end: Point,
	halfWidth: number,
): void {
	const deltaX = end.x - start.x;
	if (Math.abs(deltaX) <= CONTOUR_GEOMETRY_EPSILON) {
		addContourRectangle(
			contour,
			start.x - halfWidth,
			start.x + halfWidth,
			Math.min(start.y, end.y) - halfWidth,
			Math.max(start.y, end.y) + halfWidth,
		);
		return;
	}

	const slope = (end.y - start.y) / deltaX;
	const verticalHalfWidth = halfWidth * Math.sqrt(1 + (slope ** 2));
	const leftPoint = start.x < end.x ? start : end;
	const rightPoint = start.x < end.x ? end : start;
	addContourSlice(contour, {
		bottomAtLeft: leftPoint.y + verticalHalfWidth,
		bottomAtRight: rightPoint.y + verticalHalfWidth,
		left: leftPoint.x,
		right: rightPoint.x,
		topAtLeft: leftPoint.y - verticalHalfWidth,
		topAtRight: rightPoint.y - verticalHalfWidth,
	});
}

function addContourRectangle(
	contour: ClaimContour,
	left: number,
	right: number,
	top: number,
	bottom: number,
): void {
	addContourSlice(contour, {
		bottomAtLeft: bottom,
		bottomAtRight: bottom,
		left,
		right,
		topAtLeft: top,
		topAtRight: top,
	});
}

function addContourSlice(contour: ClaimContour, slice: ClaimContourSlice): void {
	if (
		!Number.isFinite(slice.left)
		|| !Number.isFinite(slice.right)
		|| !Number.isFinite(slice.topAtLeft)
		|| !Number.isFinite(slice.topAtRight)
		|| !Number.isFinite(slice.bottomAtLeft)
		|| !Number.isFinite(slice.bottomAtRight)
	) {
		throw new Error("Cannot add a non-finite claim contour slice");
	}
	contour.push(slice);
}

function addTranslatedContour(
	contour: ClaimContour,
	source: ClaimContour,
	xOffset: number,
	yOffset: number,
): void {
	for (const slice of source) {
		addContourSlice(contour, {
			bottomAtLeft: slice.bottomAtLeft + yOffset,
			bottomAtRight: slice.bottomAtRight + yOffset,
			left: slice.left + xOffset,
			right: slice.right + xOffset,
			topAtLeft: slice.topAtLeft + yOffset,
			topAtRight: slice.topAtRight + yOffset,
		});
	}
}

function resolveContourSeparation(
	upperContour: ClaimContour,
	lowerContour: ClaimContour,
	gap: number,
): number {
	let minimumDistance = 0;
	for (const upper of upperContour) {
		for (const lower of lowerContour) {
			const left = Math.max(upper.left, lower.left);
			const right = Math.min(upper.right, lower.right);
			if (left > right) {
				continue;
			}
			minimumDistance = Math.max(
				minimumDistance,
				contourBottomAt(upper, left) - contourTopAt(lower, left) + gap,
				contourBottomAt(upper, right) - contourTopAt(lower, right) + gap,
			);
		}
	}
	return minimumDistance;
}

function contourTopAt(slice: ClaimContourSlice, x: number): number {
	const proportion = slice.right === slice.left ? 0 : (x - slice.left) / (slice.right - slice.left);
	return slice.topAtLeft + ((slice.topAtRight - slice.topAtLeft) * proportion);
}

function contourBottomAt(slice: ClaimContourSlice, x: number): number {
	const proportion = slice.right === slice.left ? 0 : (x - slice.left) / (slice.right - slice.left);
	return slice.bottomAtLeft + ((slice.bottomAtRight - slice.bottomAtLeft) * proportion);
}

function normalizeVector(vector: Point): Point {
	const magnitude = Math.hypot(vector.x, vector.y);
	if (magnitude <= CONTOUR_GEOMETRY_EPSILON) {
		throw new Error("Cannot normalize a zero-length contour edge");
	}
	return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function dot(left: Point, right: Point): number {
	return (left.x * right.x) + (left.y * right.y);
}

/**
 * Packs ordered column items as close to their preferred centers as possible while
 * keeping each item at least its minimum distance below the previous item.
 */
function resolvePackedCenters(
	items: Array<{ minimumDistanceFromPrevious: number; preferredCenter: number }>,
): number[] {
	const centerOffsets: number[] = [];
	for (const [index, item] of items.entries()) {
		centerOffsets.push(index === 0
			? 0
			: (centerOffsets[index - 1] ?? 0) + item.minimumDistanceFromPrevious);
	}
	const blocks: Array<{ count: number; endIndex: number; sum: number; startIndex: number }> = [];

	for (const [index, item] of items.entries()) {
		blocks.push({
			count: 1,
			endIndex: index,
			sum: item.preferredCenter - (centerOffsets[index] ?? 0),
			startIndex: index,
		});
		while (
			blocks.length > 1
			&& (blocks.at(-2)!.sum / blocks.at(-2)!.count)
			> (blocks.at(-1)!.sum / blocks.at(-1)!.count)
		) {
			const right = blocks.pop()!;
			const left = blocks.pop()!;
			blocks.push({
				count: left.count + right.count,
				endIndex: right.endIndex,
				sum: left.sum + right.sum,
				startIndex: left.startIndex,
			});
		}
	}

	const transformedCenters = new Array<number>(items.length);
	for (const block of blocks) {
		const center = block.sum / block.count;
		for (let index = block.startIndex; index <= block.endIndex; index += 1) {
			transformedCenters[index] = center;
		}
	}

	return items.map((item, index) => (
		(transformedCenters[index] ?? item.preferredCenter) + (centerOffsets[index] ?? 0)
	));
}

function getRequiredDisplaySide(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrenceId: PresentationClaimOccurrenceId,
): "proMain" | "conMain" {
	const side = resolvedMath.displaySides[claimOccurrenceId];
	if (!side) {
		throw new Error(`Missing side for ${claimOccurrenceId}`);
	}

	return side;
}
