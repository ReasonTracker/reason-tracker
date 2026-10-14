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

type ClaimLaneCluster = {
	claimOccurrenceIds: PresentationClaimOccurrenceId[]
	confidenceOccurrence: PresentationConfidenceConnectorOccurrence
};

type ClaimLaneClusterLayout = {
	cluster: ClaimLaneCluster
	height: number
	preferredCenter: number
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
	const measuredHeights = new Map<PresentationClaimOccurrenceId, number>();

	const measureClaim = (claimOccurrenceId: PresentationClaimOccurrenceId): number => {
		const cached = measuredHeights.get(claimOccurrenceId);
		if (cached !== undefined) {
			return cached;
		}

		const claimOccurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const scale = resolveVisualScale(args, claimOccurrenceId);
		const clusters = getClaimLaneClusters(args.resolvedMath, claimOccurrence);
		const clustersHeight = clusters.reduce((height, cluster, index) => {
			const clusterHeight = measureClaimLaneCluster(cluster);
			if (index === 0) {
				return clusterHeight;
			}

			const previousCluster = clusters[index - 1];
			if (!previousCluster) {
				throw new Error(`Missing previous claim lane cluster for ${claimOccurrenceId}`);
			}

			return height
				+ resolveClaimLaneGap(
					previousCluster.claimOccurrenceIds.at(-1)!,
					cluster.claimOccurrenceIds[0]!,
				)
				+ clusterHeight;
		}, 0);
		const height = Math.max(args.options.claimHeight * scale, clustersHeight);
		measuredHeights.set(claimOccurrenceId, height);
		return height;
	};

	const measureClaimLaneCluster = (cluster: ClaimLaneCluster): number => (
		cluster.claimOccurrenceIds.reduce((height, memberId, index) => {
			const memberHeight = measureClaim(memberId);
			if (index === 0) {
				return memberHeight;
			}

			const previousMemberId = cluster.claimOccurrenceIds[index - 1];
			if (!previousMemberId) {
				throw new Error(`Missing previous claim in ${cluster.confidenceOccurrence.id}`);
			}

			return height + resolveClaimLaneGap(previousMemberId, memberId) + memberHeight;
		}, 0)
	);

	const resolveClaimLaneGap = (
		firstClaimOccurrenceId: PresentationClaimOccurrenceId,
		secondClaimOccurrenceId: PresentationClaimOccurrenceId,
	): number => (
		args.options.claimLaneAxisGap * (
			(resolveVisualScale(args, firstClaimOccurrenceId)
				+ resolveVisualScale(args, secondClaimOccurrenceId)) / 2
		)
	);

	const layoutClaim = (
		claimOccurrenceId: PresentationClaimOccurrenceId,
		claimLeftEdgeX: number,
		claimCenterY: number,
	): void => {
		const occurrence = getClaimOccurrence(args.resolvedMath, claimOccurrenceId);
		const sourcesScale = resolveVisualScale(args, claimOccurrenceId);
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
				x: claimLeftEdgeX + ((args.options.claimWidth * sourcesScale) / 2),
				y: claimCenterY,
			},
			scale: sourcesScale,
			sourcesScale,
			value: score.value,
		};

		const clusters = getClaimLaneClusters(args.resolvedMath, occurrence);
		if (clusters.length === 0) {
			return;
		}

		const maximumJunctionSpan = Math.max(
			0,
			...occurrence.confidenceConnectorOccurrenceIds.map((connectorOccurrenceId) =>
				resolveConfidenceJunctionSpan(
					args.resolvedMath,
					getConfidenceOccurrence(args.resolvedMath, connectorOccurrenceId),
				)
			),
		);
		const corridorWidth = (
			args.options.connectorCurveLaneWidth
			+ args.options.connectorDiagonalLaneWidth
			+ args.options.connectorCurveLaneWidth
		) * sourcesScale
			+ (args.options.claimHeight * maximumJunctionSpan);
		const sourceLaneLeftEdgeX = claimLeftEdgeX
			+ (args.options.claimWidth * sourcesScale)
			+ corridorWidth;
		const targetSideOffsets = resolveConfidenceTargetSideOffsets({
			claimOccurrence: occurrence,
			options: args.options,
			resolvedMath: args.resolvedMath,
		});
		const clusterLayouts = clusters.map((cluster) => {
			const confidenceHeight = measureClaim(
				cluster.confidenceOccurrence.sourceClaimOccurrenceId,
			);
			const height = measureClaimLaneCluster(cluster);
			const confidenceCenterOffset = -(height / 2) + (confidenceHeight / 2);
			const targetSideOffset = getRequiredNumber(
				targetSideOffsets[cluster.confidenceOccurrence.id],
				`target side offset for ${cluster.confidenceOccurrence.id}`,
			);

			return {
				cluster,
				confidenceCenterOffset,
				height,
				preferredCenter: claimCenterY + targetSideOffset - confidenceCenterOffset,
			};
		});
		const clusterCenters = resolvePackedClusterCenters(clusterLayouts, resolveClaimLaneGap);

		clusterLayouts.forEach((clusterLayout, index) => {
			let memberTop = (clusterCenters[index] ?? clusterLayout.preferredCenter)
				- (clusterLayout.height / 2);
			clusterLayout.cluster.claimOccurrenceIds.forEach((memberId, memberIndex) => {
				const memberHeight = measureClaim(memberId);
				layoutClaim(memberId, sourceLaneLeftEdgeX, memberTop + (memberHeight / 2));
				memberTop += memberHeight;
				const nextMemberId = clusterLayout.cluster.claimOccurrenceIds[memberIndex + 1];
				if (nextMemberId) {
					memberTop += resolveClaimLaneGap(memberId, nextMemberId);
				}
			});
		});
	};

	const rootClaimOccurrenceId = args.resolvedMath.presentationGraph.rootClaimOccurrenceId;
	const rootScale = resolveVisualScale(args, rootClaimOccurrenceId);
	measureClaim(rootClaimOccurrenceId);
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
			const sourceScale = getRequiredNumber(
				args.resolvedMath.sourcesScales[occurrence.sourceClaimOccurrenceId],
				`source scale for ${occurrence.sourceClaimOccurrenceId}`,
			);
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

			const relevanceOccurrences = occurrence.relevanceConnectorOccurrenceIds.map(
				(connectorOccurrenceId) => getRelevanceOccurrence(
					args.resolvedMath,
					connectorOccurrenceId,
				),
			);
			const relevanceOffsets = resolveCenteredOffsets(
				relevanceOccurrences.map((relevanceOccurrence) => resolveConnectionEnvelope({
					options: args.options,
					scale: getRequiredNumber(
						args.resolvedMath.sourcesScales[relevanceOccurrence.sourceClaimOccurrenceId],
						`source scale for ${relevanceOccurrence.sourceClaimOccurrenceId}`,
					),
				})),
			);

			const state: ConfidenceConnectionFrameState = {
				confidenceConnectorId: occurrence.confidenceConnectorId,
				deliveryScore: connectorScore.deliveryScore,
				deliveryScale,
				deliveryTargetScale: deliveryScale,
				id: occurrence.id,
				junctionSpan: resolveConfidenceJunctionSpan(args.resolvedMath, occurrence),
				relevanceMultiplier: connectorScore.relevanceMultiplier,
				relevanceConnectorOccurrenceIds: occurrence.relevanceConnectorOccurrenceIds,
				score: score.value,
				shellReveal: 1,
				displaySide,
				sourceClaimOccurrenceId: occurrence.sourceClaimOccurrenceId,
				sourceScale,
				targetClaimOccurrenceId: occurrence.targetClaimOccurrenceId,
				targetSideOffset: confidenceOffsets[occurrence.id] ?? 0,
				volumeTransitions: [],
			};
			args.frame.confidenceConnections[occurrence.id] = state;

			relevanceOccurrences.forEach((relevanceOccurrence, relevanceIndex) => {
				const relevanceScale = getRequiredNumber(
					args.resolvedMath.sourcesScales[relevanceOccurrence.sourceClaimOccurrenceId],
					`source scale for ${relevanceOccurrence.sourceClaimOccurrenceId}`,
				);
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
					scale: relevanceScale,
					score: relevanceScore.value,
					shellReveal: 1,
					displaySide: relevanceDisplaySide,
					sourceClaimOccurrenceId: relevanceOccurrence.sourceClaimOccurrenceId,
					targetConfidenceConnectorOccurrenceId:
						relevanceOccurrence.targetConfidenceConnectorOccurrenceId,
					targetSideOffset: relevanceOffsets[relevanceIndex] ?? 0,
					volumeTransitions: [],
				};
				args.frame.relevanceConnections[relevanceOccurrence.id] = relevanceState;
			});
		});
	}
}

function getClaimLaneClusters(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrence: PresentationClaimOccurrence,
): ClaimLaneCluster[] {
	return getOrderedConfidenceOccurrences(resolvedMath, claimOccurrence).map(
		(confidenceOccurrence) => ({
			claimOccurrenceIds: [
				confidenceOccurrence.sourceClaimOccurrenceId,
				...confidenceOccurrence.relevanceConnectorOccurrenceIds
					.map((connectorOccurrenceId) =>
						getRelevanceOccurrence(resolvedMath, connectorOccurrenceId)
					)
					.sort((left, right) => compareConnectorOccurrences(resolvedMath, left, right))
					.map((relevanceOccurrence) => relevanceOccurrence.sourceClaimOccurrenceId),
			],
			confidenceOccurrence,
		}),
	);
}

function getOrderedConfidenceOccurrences(
	resolvedMath: ResolvedPresentationMath,
	claimOccurrence: PresentationClaimOccurrence,
): PresentationConfidenceConnectorOccurrence[] {
	return claimOccurrence.confidenceConnectorOccurrenceIds
		.map((connectorOccurrenceId) => getConfidenceOccurrence(resolvedMath, connectorOccurrenceId))
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

function resolveConfidenceJunctionSpan(
	resolvedMath: ResolvedPresentationMath,
	confidenceOccurrence: PresentationConfidenceConnectorOccurrence,
): number {
	return confidenceOccurrence.relevanceConnectorOccurrenceIds.reduce(
		(span, connectorOccurrenceId) => {
			const relevanceOccurrence = getRelevanceOccurrence(
				resolvedMath,
				connectorOccurrenceId,
			);
			return span + getRequiredNumber(
				resolvedMath.sourcesScales[relevanceOccurrence.sourceClaimOccurrenceId],
				`source scale for ${relevanceOccurrence.sourceClaimOccurrenceId}`,
			);
		},
		0,
	);
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

function displaySideRank(side: "proMain" | "conMain"): number {
	return side === "proMain" ? 0 : 1;
}

function getRequiredNumber(value: number | undefined, label: string): number {
	if (value === undefined || !Number.isFinite(value)) {
		throw new Error(`Missing finite ${label}`);
	}

	return value;
}

function resolveVisualScale(
	args: {
		resolvedMath: ResolvedPresentationMath
		visualScales?: Partial<Record<PresentationClaimOccurrenceId, number>>
	},
	claimOccurrenceId: PresentationClaimOccurrenceId,
): number {
	return getRequiredNumber(
		args.visualScales?.[claimOccurrenceId]
		?? args.resolvedMath.sourcesScales[claimOccurrenceId],
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
			shellScale: getRequiredNumber(
				args.resolvedMath.deliveryScales[occurrence.sourceClaimOccurrenceId],
				`delivery scale for ${occurrence.sourceClaimOccurrenceId}`,
			),
			side: getRequiredDisplaySide(args.resolvedMath, occurrence.sourceClaimOccurrenceId),
		})),
		parentHeight: args.options.claimHeight * getRequiredNumber(
			args.resolvedMath.sourcesScales[args.claimOccurrence.id],
			`source scale for ${args.claimOccurrence.id}`,
		),
	});
	return Object.fromEntries(
		confidenceOccurrences.map((occurrence, index) => [occurrence.id, offsets[index] ?? 0]),
	) as Partial<Record<PresentationConnectorOccurrenceId, number>>;
}

function resolvePackedClusterCenters(
	clusterLayouts: ClaimLaneClusterLayout[],
	resolveGap: (
		firstClaimOccurrenceId: PresentationClaimOccurrenceId,
		secondClaimOccurrenceId: PresentationClaimOccurrenceId,
	) => number,
): number[] {
	const centerOffsets: number[] = [];
	for (const [index, clusterLayout] of clusterLayouts.entries()) {
		if (index === 0) {
			centerOffsets.push(0);
			continue;
		}

		const previousClusterLayout = clusterLayouts[index - 1];
		if (!previousClusterLayout) {
			throw new Error(`Missing previous claim lane cluster at ${index}`);
		}

		centerOffsets.push((centerOffsets[index - 1] ?? 0)
			+ (previousClusterLayout.height / 2)
			+ resolveGap(
				previousClusterLayout.cluster.claimOccurrenceIds.at(-1)!,
				clusterLayout.cluster.claimOccurrenceIds[0]!,
			)
			+ (clusterLayout.height / 2));
	}
	const blocks: Array<{ count: number; endIndex: number; sum: number; startIndex: number }> = [];

	for (const [index, clusterLayout] of clusterLayouts.entries()) {
		blocks.push({
			count: 1,
			endIndex: index,
			sum: clusterLayout.preferredCenter - (centerOffsets[index] ?? 0),
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

	const transformedCenters = new Array<number>(clusterLayouts.length);
	for (const block of blocks) {
		const center = block.sum / block.count;
		for (let index = block.startIndex; index <= block.endIndex; index += 1) {
			transformedCenters[index] = center;
		}
	}

	return clusterLayouts.map((clusterLayout, index) => (
		(transformedCenters[index] ?? clusterLayout.preferredCenter) + (centerOffsets[index] ?? 0)
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