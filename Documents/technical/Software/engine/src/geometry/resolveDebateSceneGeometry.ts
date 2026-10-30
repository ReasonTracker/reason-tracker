import type {
	ConnectorVolumeTransition,
	DebateFrame,
	RelevanceConnectionFrameState,
} from "../animation/DebateAnimationPlan.ts";
import type { Point } from "./Point.ts";
import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "../layout/buildPresentationGraphFromDebateCore.ts";
import type { PlannerOptions } from "../animation/contracts.ts";
import {
	buildPathGeometry,
	fitPathGeometryCorners,
	type PathGeometryCommand,
	type PathGeometryInstruction,
	type PathGeometryIssue,
	type Waypoint,
} from "./path-geometry/buildPathGeometry.ts";
import { buildPathVolumeGeometry } from "./path-geometry/buildPathVolumeGeometry.ts";
import {
	clamp01,
	dotProduct,
	estimateRouteLength,
	normalizePoint,
} from "./path-geometry/pathGeometryMath.ts";
import {
	resolveDeliveryAggregatorFlowGeometry,
	resolveDeliveryAggregatorGeometry,
	type DeliveryAggregatorGeometry,
} from "./resolveDeliveryAggregatorGeometry.ts";
import { calculateConnectorCorridor } from "./calculateConnectorCorridor.ts";
import { resolveDebateGraphOutlineWidth } from "./debateGraphOutline.ts";

const GEOMETRY_EPSILON = 1e-6;
/** Makes the settled delivery taper occupy its full route. */
const DELIVERY_TAPER_START_POSITION_PERCENT = 0;
/** Maximum routed-path span represented by one segment in a moving taper profile. */
const MOVING_TAPER_SAMPLE_LENGTH_PX = 1;

export type AttachmentPort = {
	center: Point
	outwardNormal: Point
	shellWidth: number
	tangent: Point
};

/** The two long side edges of one pipe region. A band may hold several regions. */
export type PipeSides = {
	boundaryA: PathGeometryCommand[]
	boundaryB: PathGeometryCommand[]
};

export type SceneBandGeometry = {
	diagnosticIssues: PathGeometryIssue[]
	fluid: PipeSides[]
	id: string
	kind: "confidence" | "delivery" | "relevance"
	outlineWidth: number
	shell: PipeSides[]
	side: "proMain" | "conMain"
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	sourcePort: AttachmentPort
	targetPort: AttachmentPort
};

export type ClaimGeometry = {
	height: number
	id: string
	outlineWidth: number
	width: number
	x: number
	y: number
};


export type DebateSceneGeometry = {
	bands: SceneBandGeometry[]
	claims: Record<string, ClaimGeometry>
	deliveryAggregators: DeliveryAggregatorGeometry[]
};

export function resolveDebateSceneGeometry(args: {
	frame: DebateFrame
	options: PlannerOptions
}): DebateSceneGeometry {
	const claims = Object.fromEntries(
		Object.values(args.frame.claims).map((claim) => {
			const width = args.options.claimWidth * Math.max(0, claim.scale);
			const height = args.options.claimHeight * Math.max(0, claim.scale);
			return [claim.id, {
				height,
				id: claim.id,
				outlineWidth: resolveDebateGraphOutlineWidth(claim.scale),
				width,
				x: claim.position.x - (width / 2),
				y: claim.position.y - (height / 2),
			}];
		}),
	) as Record<string, ClaimGeometry>;
	const bands: SceneBandGeometry[] = [];
	const deliveryAggregators: DeliveryAggregatorGeometry[] = [];
	const aggregators = new Map<string, DeliveryAggregatorGeometry>();
	const confidenceConnections = Object.values(args.frame.confidenceConnections);

	for (const connection of confidenceConnections) {
		const claimState = args.frame.claims[connection.sourceClaimOccurrenceId];
		if (!claimState) {
			continue;
		}
		const relevanceStates = connection.relevanceConnectorOccurrenceIds.map(
			(id) => getRelevanceState(args.frame, id),
		);
		const aggregator = resolveDeliveryAggregatorGeometry({
			claimBounds: getClaimGeometry(claims, connection.sourceClaimOccurrenceId),
			claimState,
			options: args.options,
			relevanceScales: relevanceStates.map((relevance) => relevance.scale),
		});
		if (!aggregator) {
			continue;
		}

		aggregators.set(connection.sourceClaimOccurrenceId, aggregator);
		deliveryAggregators.push(aggregator);
		for (const relevance of relevanceStates) {
			bands.push(buildRelevanceBand({
				bottomEdge: [aggregator.points[3], aggregator.points[2]],
				claims,
				options: args.options,
				relevance,
			}));
		}
	}

	for (const connection of confidenceConnections) {
		const sourceClaim = getClaimGeometry(claims, connection.sourceClaimOccurrenceId);
		const targetClaim = getClaimGeometry(claims, connection.targetClaimOccurrenceId);
		const aggregator = aggregators.get(connection.targetClaimOccurrenceId);
		const sourcePort = horizontalPort({
			center: { x: sourceClaim.x, y: sourceClaim.y + (sourceClaim.height / 2) },
			outwardX: -1,
			width: args.options.claimHeight * connection.sourceScale,
		});
		const targetPort = horizontalPort({
			center: {
				x: targetClaim.x + targetClaim.width
					+ (aggregator?.width ?? 0),
				y: targetClaim.y + (targetClaim.height / 2) + connection.targetSideOffset,
			},
			outwardX: 1,
			width: args.options.claimHeight * connection.deliveryTargetScale,
		});
		const route = resolveRoute(sourcePort, targetPort, args.options);
		const targetShellWidth = args.options.claimHeight * connection.deliveryScale;

		bands.push(buildSceneBand({
			fluidScore: connection.score,
			id: `${connection.id}:delivery`,
			kind: "delivery",
			outlineWidth: resolveDebateGraphOutlineWidth(connection.deliveryScale),
			route,
			shellReveal: connection.shellReveal,
			shellWidth: targetPort.shellWidth,
			shellPlacement: connection.displaySide,
			side: connection.displaySide,
			sourceClaimOccurrenceId: connection.sourceClaimOccurrenceId,
			sourcePort,
			sourceShellWidth: sourcePort.shellWidth,
			targetShellWidth,
			targetPort,
			widthTransitionStartPositionPercent: DELIVERY_TAPER_START_POSITION_PERCENT,
			volumeTransitions: connection.volumeTransitions,
		}));
		if (aggregator) {
			// The aggregator transitions repeat the pipe's previous-step transitions, so they share its
			// front length, and the front keeps the pace it had across the pipe.
			const transitionLengthPx = resolveDeliveryFrontLength({
				sourceShellWidth: sourcePort.shellWidth,
				targetShellWidth,
				transitions: connection.aggregatorVolumeTransitions,
			});
			const pace = (estimateRouteLength(route) + transitionLengthPx)
				/ Math.max(GEOMETRY_EPSILON, aggregator.width + transitionLengthPx);
			const flow = resolveDeliveryAggregatorFlowGeometry({
				aggregator,
				connection,
				options: args.options,
				transitionLengthPx,
				volumeTransitions: connection.aggregatorVolumeTransitions.map((transition) => ({
					...transition,
					progress: clamp01(transition.progress * pace),
				})),
			});
			if (flow) {
				aggregator.flows.push(flow);
			}
		}
	}

	return { bands, claims, deliveryAggregators };
}

/**
 * Routes one relevance connector from its claim's left side into the bottom edge of
 * the delivery aggregator it modifies. `targetSideOffset` is measured along that edge
 * from its center.
 */
function buildRelevanceBand(args: {
	bottomEdge: [Point, Point]
	claims: Record<string, ClaimGeometry>
	options: PlannerOptions
	relevance: RelevanceConnectionFrameState
}): SceneBandGeometry {
	const sourceClaim = getClaimGeometry(args.claims, args.relevance.sourceClaimOccurrenceId);
	const shellWidth = args.options.claimHeight * args.relevance.scale;
	const sourcePort = horizontalPort({
		center: { x: sourceClaim.x, y: sourceClaim.y + (sourceClaim.height / 2) },
		outwardX: -1,
		width: shellWidth,
	});
	const [edgeStart, edgeEnd] = args.bottomEdge;
	const targetPort = edgePort({
		edgeEnd,
		edgeStart,
		offset: args.relevance.targetSideOffset,
		oppositePoint: {
			x: (edgeStart.x + edgeEnd.x) / 2,
			y: Math.max(edgeStart.y, edgeEnd.y) + args.options.claimHeight,
		},
		width: shellWidth,
	});

	return buildSceneBand({
		fluidScore: args.relevance.score,
		id: `${args.relevance.id}:relevance`,
		kind: "relevance",
		outlineWidth: resolveDebateGraphOutlineWidth(args.relevance.scale),
		route: resolveRoute(sourcePort, targetPort, args.options),
		shellReveal: args.relevance.shellReveal,
		shellWidth,
		side: args.relevance.displaySide,
		sourceClaimOccurrenceId: args.relevance.sourceClaimOccurrenceId,
		sourcePort,
		targetPort,
		volumeTransitions: args.relevance.volumeTransitions,
	});
}

function buildSceneBand(args: {
	fluidScore: number
	id: string
	kind: SceneBandGeometry["kind"]
	outlineWidth: number
	route: Waypoint[]
	shellReveal: number
	shellWidth: number
	shellPlacement?: "center" | "proMain" | "conMain"
	side: SceneBandGeometry["side"]
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	sourcePort: AttachmentPort
	sourceShellWidth?: number
	targetShellWidth?: number
	targetPort: AttachmentPort
	volumeTransitions: ConnectorVolumeTransition[]
	widthTransitionStartPositionPercent?: number
}): SceneBandGeometry {
	const sourceShellWidth = args.sourceShellWidth ?? args.shellWidth;
	const targetShellWidth = args.targetShellWidth ?? args.shellWidth;
	const fittedRoute = fitPathGeometryCorners({
		offsetEnvelope: {
			maxOffset: Math.max(sourceShellWidth, targetShellWidth) / 2,
			minOffset: -(Math.max(sourceShellWidth, targetShellWidth) / 2),
		},
		points: args.route,
	}).points;
	const growingFluidTransition = resolveGrowingFluidTransition(args.volumeTransitions);
	const shell = growingFluidTransition && args.widthTransitionStartPositionPercent !== undefined
		? buildMovingTaperShellBand({
			finalValue: growingFluidTransition.finalValue,
			initialValue: growingFluidTransition.initialValue,
			placement: args.shellPlacement ?? "center",
			progress: growingFluidTransition.progress,
			route: fittedRoute,
			sourceShellWidth,
			targetShellWidth,
			widthTransitionStartPositionPercent: args.widthTransitionStartPositionPercent,
		})
		: buildBand(
			fittedRoute,
			sourceShellWidth,
			args.shellWidth,
			args.shellReveal,
			"open",
			args.shellPlacement ?? "center",
			sourceShellWidth,
			targetShellWidth,
			args.widthTransitionStartPositionPercent,
		);
	const fluid = growingFluidTransition && args.widthTransitionStartPositionPercent !== undefined
		? buildBand(
			fittedRoute,
			sourceShellWidth * clamp01(growingFluidTransition.finalValue),
			targetShellWidth * clamp01(growingFluidTransition.finalValue),
			growingFluidTransition.progress,
			"curved",
			args.side,
			sourceShellWidth,
			targetShellWidth,
			args.widthTransitionStartPositionPercent,
		)
		: args.volumeTransitions.length > 0
			? buildMovingVolumeBand({
				placement: args.side,
				route: fittedRoute,
				shellWidth: Math.max(sourceShellWidth, targetShellWidth),
				stableValue: args.fluidScore,
				transitions: args.volumeTransitions,
			})
			: buildBand(
				fittedRoute,
				sourceShellWidth * clamp01(args.fluidScore),
				args.shellWidth * clamp01(args.fluidScore),
				1,
				"open",
				args.side,
				sourceShellWidth,
				targetShellWidth,
				args.widthTransitionStartPositionPercent,
			);

	return {
		diagnosticIssues: [...shell.issues, ...fluid.issues],
		fluid: fluid.sides,
		id: args.id,
		kind: args.kind,
		outlineWidth: args.outlineWidth,
		shell: shell.sides,
		side: args.side,
		sourceClaimOccurrenceId: args.sourceClaimOccurrenceId,
		sourcePort: args.sourcePort,
		targetPort: args.targetPort,
	};
}

function resolveGrowingFluidTransition(
	transitions: ConnectorVolumeTransition[],
): ConnectorVolumeTransition | undefined {
	return transitions.length === 1
		&& (transitions[0]?.initialValue ?? 0) <= GEOMETRY_EPSILON
		&& (transitions[0]?.finalValue ?? 0) > GEOMETRY_EPSILON
		? transitions[0]
		: undefined;
}

/** Front length a delivery pipe uses for these transitions, matching `buildSceneBand`. */
function resolveDeliveryFrontLength(args: {
	sourceShellWidth: number
	targetShellWidth: number
	transitions: ConnectorVolumeTransition[]
}): number {
	const growingFluidTransition = resolveGrowingFluidTransition(args.transitions);
	if (growingFluidTransition) {
		const finalValue = clamp01(growingFluidTransition.finalValue);
		return Math.max(args.sourceShellWidth * finalValue, args.targetShellWidth * finalValue, 1);
	}
	return Math.max(args.sourceShellWidth, args.targetShellWidth);
}

function buildMovingTaperShellBand(args: {
	finalValue: number
	initialValue: number
	placement: "center" | "proMain" | "conMain"
	progress: number
	route: Waypoint[]
	sourceShellWidth: number
	targetShellWidth: number
	widthTransitionStartPositionPercent: number
}): BandSides {
	const routeLength = estimateRouteLength(args.route);
	if (routeLength <= GEOMETRY_EPSILON) {
		return EMPTY_BAND_SIDES;
	}

	const finalValue = clamp01(args.finalValue);
	const transitionLength = Math.max(
		args.sourceShellWidth * finalValue,
		args.targetShellWidth * finalValue,
		1,
	);
	const frontierEnd = clamp01(args.progress) * (routeLength + transitionLength);
	const frontierStart = frontierEnd - transitionLength;
	const taperStart = routeLength * clamp01(args.widthTransitionStartPositionPercent / 100);
	const sourceOffsets = resolveBandOffsets(
		args.sourceShellWidth,
		args.placement,
		args.sourceShellWidth,
	);
	const initialTargetOffsets = resolveBandOffsets(
		args.targetShellWidth * clamp01(args.initialValue),
		args.placement,
		args.targetShellWidth,
	);
	const settledTargetOffsets = resolveBandOffsets(
		args.targetShellWidth,
		args.placement,
		args.targetShellWidth,
	);
	const sampleDistances = new Set<number>([0, routeLength]);
	for (
		let distance = MOVING_TAPER_SAMPLE_LENGTH_PX;
		distance < routeLength;
		distance += MOVING_TAPER_SAMPLE_LENGTH_PX
	) {
		sampleDistances.add(distance);
	}
	for (const distance of [taperStart, frontierStart, frontierEnd]) {
		sampleDistances.add(Math.min(routeLength, Math.max(0, distance)));
	}

	const distances = [...sampleDistances].sort((left, right) => left - right);
	const offsets = distances.map((distance) => {
		const taperProgress = routeLength - taperStart <= GEOMETRY_EPSILON
			? 1
			: curvedTransitionProgress((distance - taperStart) / (routeLength - taperStart));
		const initialOffsets = interpolateBandOffsets(
			sourceOffsets,
			initialTargetOffsets,
			taperProgress,
		);
		const settledOffsets = interpolateBandOffsets(
			sourceOffsets,
			settledTargetOffsets,
			taperProgress,
		);
		const settledWeight = distance <= frontierStart
			? 1
			: distance >= frontierEnd
				? 0
				: 1 - curvedTransitionProgress((distance - frontierStart) / transitionLength);

		return interpolateBandOffsets(initialOffsets, settledOffsets, settledWeight);
	});
	const instructions: PathGeometryInstruction[] = [
		{ kind: "open", startPositionPercent: 0, type: "extremity" },
		{ ...offsets[0]!, type: "offsets" },
	];
	for (let index = 1; index < distances.length; index += 1) {
		const previousDistance = distances[index - 1]!;
		const distance = distances[index]!;
		instructions.push({
			kind: "linear",
			lengthPx: distance - previousDistance,
			startPositionPercent: (previousDistance / routeLength) * 100,
			type: "transition",
		});
		instructions.push({ ...offsets[index]!, type: "offsets" });
	}
	instructions.push({ kind: "open", startPositionPercent: 100, type: "extremity" });
	return toBandSides([buildPathGeometry({ instructions, points: args.route })]);
}

function interpolateBandOffsets(
	from: { offsetA: number; offsetB: number },
	to: { offsetA: number; offsetB: number },
	progress: number,
): { offsetA: number; offsetB: number } {
	return {
		offsetA: from.offsetA + ((to.offsetA - from.offsetA) * progress),
		offsetB: from.offsetB + ((to.offsetB - from.offsetB) * progress),
	};
}

function curvedTransitionProgress(value: number): number {
	const progress = clamp01(value);
	return (1 - Math.cos(Math.PI * progress)) / 2;
}

function buildMovingVolumeBand(args: {
	placement: "proMain" | "conMain"
	route: Waypoint[]
	shellWidth: number
	stableValue: number
	transitions: ConnectorVolumeTransition[]
}): BandSides {
	return toBandSides(buildPathVolumeGeometry({
		placement: args.placement === "proMain" ? "negativeEdge" : "positiveEdge",
		points: args.route,
		shellWidth: args.shellWidth,
		stableValue: args.stableValue,
		transitions: args.transitions,
	}));
}

function buildBand(
	route: Waypoint[],
	sourceWidth: number,
	targetWidth: number,
	reveal: number,
	revealExtremity: "curved" | "open",
	placement: "center" | "proMain" | "conMain",
	sourceShellWidth: number,
	targetShellWidth: number,
	widthTransitionStartPositionPercent = 50,
): BandSides {
	const safeSourceWidth = Math.max(0, sourceWidth);
	const safeTargetWidth = Math.max(0, targetWidth);
	const safeReveal = clamp01(reveal);
	if (
		Math.max(safeSourceWidth, safeTargetWidth) <= GEOMETRY_EPSILON
		|| safeReveal <= GEOMETRY_EPSILON
	) {
		return EMPTY_BAND_SIDES;
	}

	const sourceOffsets = resolveBandOffsets(
		safeSourceWidth,
		placement,
		sourceShellWidth,
	);
	const targetOffsets = resolveBandOffsets(
		safeTargetWidth,
		placement,
		targetShellWidth,
	);
	const routeLength = estimateRouteLength(route);
	const instructions: PathGeometryInstruction[] = [
		{ kind: "open" as const, startPositionPercent: 0, type: "extremity" as const },
		{ ...sourceOffsets, type: "offsets" as const },
	];
	if (!sameOffsets(sourceOffsets, targetOffsets)) {
		const settledTransitionLength = routeLength * (1 - (widthTransitionStartPositionPercent / 100));
		instructions.push({
			clipAtTrailingExtremity: true,
			kind: "curved",
			lengthPx: settledTransitionLength,
			startPositionPercent: widthTransitionStartPositionPercent,
			type: "transition",
		});
		instructions.push({ ...targetOffsets, type: "offsets" as const });
	}
	if (revealExtremity === "curved" && safeReveal < 1 - GEOMETRY_EPSILON) {
		const lengthPx = Math.max(safeSourceWidth, safeTargetWidth, 1);
		const frontierDistance = safeReveal * (routeLength + lengthPx);
		const startPositionPercent = routeLength <= GEOMETRY_EPSILON
			? 0
			: ((frontierDistance - lengthPx) / routeLength) * 100;
		instructions.push({
			allowOverflow: true,
			collapseOffset: sourceOffsets.offsetA,
			kind: "curved",
			lengthPx,
			startPositionPercent,
			type: "extremity",
		});
	} else {
		instructions.push({
			kind: "open",
			startPositionPercent: safeReveal * 100,
			type: "extremity",
		});
	}
	const geometry = buildPathGeometry({
		instructions,
		points: route,
	});

	return toBandSides([geometry]);
}

type BandSides = {
	issues: PathGeometryIssue[]
	sides: PipeSides[]
};

const EMPTY_BAND_SIDES: BandSides = { issues: [], sides: [] };

function toBandSides(geometries: ReturnType<typeof buildPathGeometry>[]): BandSides {
	return {
		issues: geometries.flatMap((geometry) => geometry.issues),
		sides: geometries.map((geometry) => ({
			boundaryA: geometry.boundaryAPathCommands,
			boundaryB: geometry.boundaryBPathCommands,
		})),
	};
}

function resolveBandOffsets(
	width: number,
	placement: "center" | "proMain" | "conMain",
	shellWidth: number,
): { offsetA: number; offsetB: number } {
	if (placement === "center") {
		return { offsetA: width / 2, offsetB: -(width / 2) };
	}

	return placement === "proMain"
		? { offsetA: -(shellWidth / 2), offsetB: -(shellWidth / 2) + width }
		: { offsetA: shellWidth / 2, offsetB: (shellWidth / 2) - width };
}

function sameOffsets(
	left: { offsetA: number; offsetB: number },
	right: { offsetA: number; offsetB: number },
): boolean {
	return Math.abs(left.offsetA - right.offsetA) <= GEOMETRY_EPSILON
		&& Math.abs(left.offsetB - right.offsetB) <= GEOMETRY_EPSILON;
}

function resolveRoute(
	source: AttachmentPort,
	target: AttachmentPort,
	options: PlannerOptions,
): Waypoint[] {
	const distance = Math.hypot(
		source.center.x - target.center.x,
		source.center.y - target.center.y,
	);
	if (distance <= GEOMETRY_EPSILON) {
		return [source.center, target.center];
	}

	const corridor = calculateConnectorCorridor({
		bendRun: (Math.abs(target.center.x - source.center.x) * (1 - options.connectorStraightShare)) / 2,
		straightShare: options.connectorStraightShare,
	});

	return [
		source.center,
		addScaled(source.center, source.outwardNormal, corridor.bendRun),
		addScaled(target.center, target.outwardNormal, corridor.bendRun),
		target.center,
	];
}

function horizontalPort(args: {
	center: Point
	outwardX: -1 | 1
	width: number
}): AttachmentPort {
	return {
		center: args.center,
		outwardNormal: { x: args.outwardX, y: 0 },
		shellWidth: Math.max(0, args.width),
		tangent: { x: 0, y: 1 },
	};
}

function addScaled(
	point: Point,
	vector: Point,
	distance: number,
): Waypoint {
	return {
		x: point.x + (vector.x * distance),
		y: point.y + (vector.y * distance),
	};
}

function edgePort(args: {
	edgeEnd: Point
	edgeStart: Point
	offset: number
	oppositePoint: Point
	width: number
}): AttachmentPort {
	const tangent = normalizePoint({
		x: args.edgeEnd.x - args.edgeStart.x,
		y: args.edgeEnd.y - args.edgeStart.y,
	}, GEOMETRY_EPSILON) ?? { x: 0, y: 1 };
	const edgeCenter = {
		x: (args.edgeStart.x + args.edgeEnd.x) / 2,
		y: (args.edgeStart.y + args.edgeEnd.y) / 2,
	};
	const center = addScaled(edgeCenter, tangent, args.offset);
	const normalA = { x: -tangent.y, y: tangent.x };
	const normalB = { x: tangent.y, y: -tangent.x };
	const towardOpposite = {
		x: args.oppositePoint.x - center.x,
		y: args.oppositePoint.y - center.y,
	};
	const outwardNormal = dotProduct(normalA, towardOpposite) >= dotProduct(normalB, towardOpposite)
		? normalA
		: normalB;

	return {
		center,
		outwardNormal,
		shellWidth: Math.max(0, args.width),
		tangent,
	};
}

function getClaimGeometry(
	claims: Record<string, ClaimGeometry>,
	id: string,
): ClaimGeometry {
	const claim = claims[id];
	if (!claim) {
		throw new Error(`Missing claim geometry: ${id}`);
	}

	return claim;
}

function getRelevanceState(
	frame: DebateFrame,
	id: PresentationConnectorOccurrenceId,
): RelevanceConnectionFrameState {
	const connection = frame.relevanceConnections[id];
	if (!connection) {
		throw new Error(`Missing relevance connection frame state: ${id}`);
	}

	return connection;
}
