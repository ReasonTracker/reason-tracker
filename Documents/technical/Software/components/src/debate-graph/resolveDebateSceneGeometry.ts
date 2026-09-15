import type {
	ConfidenceConnectionFrameState,
	ConnectorVolumeTransition,
	DebateFrame,
	Point,
	RelevanceConnectionFrameState,
} from "@planner/DebateAnimationPlan.ts";
import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "@planner/buildPresentationGraphFromDebateCore.ts";
import type { PlannerOptions } from "@planner/contracts.ts";
import {
	buildPathGeometry,
	fitPathGeometryCorners,
	type PathGeometryInstruction,
	type PathGeometryIssue,
	type Waypoint,
} from "../path-geometry/buildPathGeometry";
import { buildPathVolumeGeometry } from "../path-geometry/buildPathVolumeGeometry";
import { pathGeometryBoundariesToClosedSvgPathData } from "../path-geometry/pathGeometrySvg";
import { resolveDebateGraphOutlineWidth } from "./visualConstants";

const GEOMETRY_EPSILON = 1e-6;
// AGENT NOTE: Keep connector-shape tuning constants together below the imports.
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

export type SceneBandGeometry = {
	diagnosticIssues: PathGeometryIssue[]
	fluidPathData: string
	id: string
	kind: "confidence" | "delivery" | "relevance"
	outlineWidth: number
	shellPathData: string
	side: "proMain" | "conMain"
	sourceClaimOccurrenceId: PresentationClaimOccurrenceId
	sourcePort: AttachmentPort
	targetPort: AttachmentPort
};

export type ClaimGeometry = {
	height: number
	id: string
	width: number
	x: number
	y: number
};

export type PolygonGeometry = {
	id: string
	outlineWidth: number
	points: Point[]
	side: "proMain" | "conMain"
};

export type DebateSceneGeometry = {
	bands: SceneBandGeometry[]
	claims: Record<string, ClaimGeometry>
	deliveryAggregators: PolygonGeometry[]
	junctions: PolygonGeometry[]
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
				width,
				x: claim.position.x - (width / 2),
				y: claim.position.y - (height / 2),
			}];
		}),
	) as Record<string, ClaimGeometry>;
	const bands: SceneBandGeometry[] = [];
	const deliveryAggregators: PolygonGeometry[] = [];
	const junctions: PolygonGeometry[] = [];
	const confidenceConnections = Object.values(args.frame.confidenceConnections);
	const connectionsByTargetClaimId = groupConfidenceConnectionsByTarget(confidenceConnections);

	for (const [targetClaimOccurrenceId, targetConnections] of connectionsByTargetClaimId) {
		const targetClaim = getClaimGeometry(claims, targetClaimOccurrenceId);
		const targetState = args.frame.claims[targetClaimOccurrenceId];
		const depth = args.options.aggregatorDepth * (targetState?.sourcesScale ?? 1);
		deliveryAggregators.push({
			id: `delivery-aggregator:${targetClaimOccurrenceId}`,
			outlineWidth: resolveDebateGraphOutlineWidth(Math.max(
				...targetConnections.map((connection) => connection.deliveryScale),
			)),
			points: [
				{ x: targetClaim.x + targetClaim.width, y: targetClaim.y },
				{ x: targetClaim.x + targetClaim.width + depth, y: targetClaim.y },
				{ x: targetClaim.x + targetClaim.width + depth, y: targetClaim.y + targetClaim.height },
				{ x: targetClaim.x + targetClaim.width, y: targetClaim.y + targetClaim.height },
			],
			side: targetState?.side ?? "proMain",
		});
	}

	for (const connection of confidenceConnections) {
		const sourceClaim = getClaimGeometry(claims, connection.sourceClaimOccurrenceId);
		const targetClaim = getClaimGeometry(claims, connection.targetClaimOccurrenceId);
		const sourcePort = horizontalPort({
			center: { x: sourceClaim.x, y: sourceClaim.y + (sourceClaim.height / 2) },
			outwardX: -1,
			width: args.options.claimHeight * connection.sourceScale,
		});
		const targetPort = horizontalPort({
			center: {
				x: targetClaim.x + targetClaim.width,
				y: targetClaim.y + (targetClaim.height / 2) + connection.targetSideOffset,
			},
			outwardX: 1,
			width: args.options.claimHeight * connection.deliveryTargetScale,
		});
		const hasRelevance = connection.relevanceConnectorOccurrenceIds.length > 0;

		if (!hasRelevance) {
			bands.push(buildSceneBand({
				fluidScore: connection.score,
				id: `${connection.id}:delivery`,
				kind: "delivery",
				outlineWidth: resolveDebateGraphOutlineWidth(connection.deliveryScale),
				route: resolveRoute(sourcePort, targetPort, args.options),
				shellReveal: connection.shellReveal,
				shellWidth: targetPort.shellWidth,
				shellPlacement: connection.side,
				side: connection.side,
				sourceClaimOccurrenceId: connection.sourceClaimOccurrenceId,
				sourcePort,
				sourceShellWidth: sourcePort.shellWidth,
				targetShellWidth: args.options.claimHeight * connection.deliveryScale,
				targetPort,
				widthTransitionStartPositionPercent: DELIVERY_TAPER_START_POSITION_PERCENT,
				volumeTransitions: connection.volumeTransitions,
			}));
			continue;
		}

		const relevanceStates = connection.relevanceConnectorOccurrenceIds.map(
			(id) => getRelevanceState(args.frame, id),
		);
		const junctionSpan = args.options.claimHeight * connection.junctionSpan;
		const sourceApproachWidth = (
			args.options.connectorCurveLaneWidth
			+ args.options.connectorDiagonalLaneWidth
		) * connection.sourceScale;
		const junctionCenter = {
			x: sourcePort.center.x - sourceApproachWidth - (junctionSpan / 2),
			y: sourcePort.center.y,
		};
		const confidenceTargetPort = horizontalPort({
			center: { x: junctionCenter.x + (junctionSpan / 2), y: junctionCenter.y },
			outwardX: 1,
			width: sourcePort.shellWidth,
		});
		const deliverySourcePort = horizontalPort({
			center: { x: junctionCenter.x - (junctionSpan / 2), y: junctionCenter.y },
			outwardX: -1,
			width: args.options.claimHeight * connection.deliveryScale,
		});

		bands.push(buildSceneBand({
			fluidScore: connection.score,
			id: `${connection.id}:confidence`,
			kind: "confidence",
			outlineWidth: resolveDebateGraphOutlineWidth(connection.sourceScale),
			route: resolveRoute(sourcePort, confidenceTargetPort, args.options),
			shellReveal: connection.shellReveal,
			shellWidth: sourcePort.shellWidth,
			side: connection.side,
			sourceClaimOccurrenceId: connection.sourceClaimOccurrenceId,
			sourcePort,
			targetPort: confidenceTargetPort,
			volumeTransitions: connection.volumeTransitions,
		}));
		bands.push(buildSceneBand({
			fluidScore: connection.score,
			id: `${connection.id}:delivery`,
			kind: "delivery",
			outlineWidth: resolveDebateGraphOutlineWidth(connection.deliveryScale),
			route: resolveRoute(deliverySourcePort, targetPort, args.options),
			shellReveal: connection.shellReveal,
			shellWidth: targetPort.shellWidth,
			shellPlacement: connection.side,
			side: connection.side,
			sourceClaimOccurrenceId: connection.sourceClaimOccurrenceId,
			sourcePort: deliverySourcePort,
			sourceShellWidth: deliverySourcePort.shellWidth,
			targetShellWidth: deliverySourcePort.shellWidth,
			targetPort,
			widthTransitionStartPositionPercent: DELIVERY_TAPER_START_POSITION_PERCENT,
			volumeTransitions: connection.volumeTransitions,
		}));

		const junctionPoints: [Point, Point, Point, Point] = [
			{ x: junctionCenter.x - (junctionSpan / 2), y: junctionCenter.y - (deliverySourcePort.shellWidth / 2) },
			{ x: junctionCenter.x + (junctionSpan / 2), y: junctionCenter.y - (sourcePort.shellWidth / 2) },
			{ x: junctionCenter.x + (junctionSpan / 2), y: junctionCenter.y + (sourcePort.shellWidth / 2) },
			{ x: junctionCenter.x - (junctionSpan / 2), y: junctionCenter.y + (deliverySourcePort.shellWidth / 2) },
		];
		junctions.push({
			id: `junction:${connection.id}`,
			outlineWidth: resolveDebateGraphOutlineWidth(Math.max(
				connection.sourceScale,
				connection.deliveryScale,
				...relevanceStates.map((relevance) => relevance.scale),
			)),
			points: junctionPoints,
			side: connection.side,
		});

		for (const relevance of relevanceStates) {
			bands.push(buildRelevanceBand({
				connection,
				frame: args.frame,
				claims,
				junctionPoints,
				options: args.options,
				relevance,
			}));
		}
	}

	return { bands, claims, deliveryAggregators, junctions };
}

function buildRelevanceBand(args: {
	connection: ConfidenceConnectionFrameState
	frame: DebateFrame
	claims: Record<string, ClaimGeometry>
	junctionPoints: [Point, Point, Point, Point]
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
	const junctionCenterY = args.junctionPoints.reduce((sum, point) => sum + point.y, 0) / 4;
	const targetPort = edgePort({
		edgeEnd: sourcePort.center.y <= junctionCenterY
			? args.junctionPoints[1]
			: args.junctionPoints[2],
		edgeStart: sourcePort.center.y <= junctionCenterY
			? args.junctionPoints[0]
			: args.junctionPoints[3],
		offset: args.relevance.targetSideOffset,
		oppositePoint: sourcePort.center,
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
		side: args.relevance.side,
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
	const growingFluidTransition = args.volumeTransitions.length === 1
		&& (args.volumeTransitions[0]?.initialValue ?? 0) <= GEOMETRY_EPSILON
		&& (args.volumeTransitions[0]?.finalValue ?? 0) > GEOMETRY_EPSILON
		? args.volumeTransitions[0]
		: undefined;
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
		fluidPathData: fluid.pathData,
		id: args.id,
		kind: args.kind,
		outlineWidth: args.outlineWidth,
		shellPathData: shell.pathData,
		side: args.side,
		sourceClaimOccurrenceId: args.sourceClaimOccurrenceId,
		sourcePort: args.sourcePort,
		targetPort: args.targetPort,
	};
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
}): { issues: PathGeometryIssue[]; pathData: string } {
	const routeLength = estimateRouteLength(args.route);
	if (routeLength <= GEOMETRY_EPSILON) {
		return { issues: [], pathData: "" };
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
	const geometry = buildPathGeometry({ instructions, points: args.route });

	return {
		issues: geometry.issues,
		pathData: pathGeometryBoundariesToClosedSvgPathData(
			geometry.boundaryAPathCommands,
			geometry.boundaryBPathCommands,
		),
	};
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
}): { issues: PathGeometryIssue[]; pathData: string } {
	const geometries = buildPathVolumeGeometry({
		placement: args.placement === "proMain" ? "negativeEdge" : "positiveEdge",
		points: args.route,
		shellWidth: args.shellWidth,
		stableValue: args.stableValue,
		transitions: args.transitions,
	});

	return {
		issues: geometries.flatMap((geometry) => geometry.issues),
		pathData: geometries.map((geometry) => pathGeometryBoundariesToClosedSvgPathData(
			geometry.boundaryAPathCommands,
			geometry.boundaryBPathCommands,
		)).join(" "),
	};
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
): { issues: PathGeometryIssue[]; pathData: string } {
	const safeSourceWidth = Math.max(0, sourceWidth);
	const safeTargetWidth = Math.max(0, targetWidth);
	const safeReveal = clamp01(reveal);
	if (
		Math.max(safeSourceWidth, safeTargetWidth) <= GEOMETRY_EPSILON
		|| safeReveal <= GEOMETRY_EPSILON
	) {
		return { issues: [], pathData: "" };
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

	return {
		issues: geometry.issues,
		pathData: pathGeometryBoundariesToClosedSvgPathData(
			geometry.boundaryAPathCommands,
			geometry.boundaryBPathCommands,
		),
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

	const endpointRun = Math.min(options.connectorCurveLaneWidth, distance / 3);
	const cornerRadius = Math.min(endpointRun, distance / 6);

	return [
		source.center,
		addScaled(source.center, source.outwardNormal, endpointRun, cornerRadius),
		addScaled(target.center, target.outwardNormal, endpointRun, cornerRadius),
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

function edgePort(args: {
	edgeEnd: Point
	edgeStart: Point
	offset: number
	oppositePoint: Point
	width: number
}): AttachmentPort {
	const tangent = normalize({
		x: args.edgeEnd.x - args.edgeStart.x,
		y: args.edgeEnd.y - args.edgeStart.y,
	});
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
	const outwardNormal = dot(normalA, towardOpposite) >= dot(normalB, towardOpposite)
		? normalA
		: normalB;

	return {
		center,
		outwardNormal,
		shellWidth: Math.max(0, args.width),
		tangent,
	};
}

function addScaled(
	point: Point,
	vector: Point,
	distance: number,
	radius?: number,
): Waypoint {
	return {
		x: point.x + (vector.x * distance),
		y: point.y + (vector.y * distance),
		...(radius === undefined ? {} : { radius }),
	};
}

function normalize(vector: Point): Point {
	const length = Math.hypot(vector.x, vector.y);
	if (length <= GEOMETRY_EPSILON) {
		return { x: 0, y: 1 };
	}

	return { x: vector.x / length, y: vector.y / length };
}

function dot(left: Point, right: Point): number {
	return (left.x * right.x) + (left.y * right.y);
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

function groupConfidenceConnectionsByTarget(
	connections: ConfidenceConnectionFrameState[],
): Map<PresentationClaimOccurrenceId, ConfidenceConnectionFrameState[]> {
	const grouped = new Map<PresentationClaimOccurrenceId, ConfidenceConnectionFrameState[]>();

	for (const connection of connections) {
		const entries = grouped.get(connection.targetClaimOccurrenceId) ?? [];
		entries.push(connection);
		grouped.set(connection.targetClaimOccurrenceId, entries);
	}

	return grouped;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function estimateRouteLength(route: Waypoint[]): number {
	let length = 0;
	for (let index = 1; index < route.length; index += 1) {
		const previous = route[index - 1];
		const current = route[index];
		if (previous && current) {
			length += Math.hypot(current.x - previous.x, current.y - previous.y);
		}
	}

	return length;
}