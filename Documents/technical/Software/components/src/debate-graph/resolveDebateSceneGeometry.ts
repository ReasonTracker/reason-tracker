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
		const targetDepth = args.options.aggregatorDepth
			* (args.frame.claims[connection.targetClaimOccurrenceId]?.sourcesScale ?? 1);
		const sourcePort = horizontalPort({
			center: { x: sourceClaim.x, y: sourceClaim.y + (sourceClaim.height / 2) },
			outwardX: -1,
			width: args.options.claimHeight * connection.sourceScale,
		});
		const targetPort = horizontalPort({
			center: {
				x: targetClaim.x + targetClaim.width + targetDepth,
				y: targetClaim.y + (targetClaim.height / 2) + connection.targetSideOffset,
			},
			outwardX: 1,
			width: args.options.claimHeight * connection.deliveryScale,
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
				side: connection.side,
				sourcePort,
				sourceShellWidth: sourcePort.shellWidth,
				targetPort,
				volumeTransitions: connection.volumeTransitions,
			}));
			continue;
		}

		const relevanceStates = connection.relevanceConnectorOccurrenceIds.map(
			(id) => getRelevanceState(args.frame, id),
		);
		const junctionSpan = relevanceStates.reduce(
			(totalWidth, relevance) => totalWidth + (args.options.claimHeight * relevance.scale),
			0,
		);
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
			width: targetPort.shellWidth,
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
			side: connection.side,
			sourcePort: deliverySourcePort,
			targetPort,
			volumeTransitions: connection.volumeTransitions,
		}));

		const junctionPoints: [Point, Point, Point, Point] = [
			{ x: junctionCenter.x - (junctionSpan / 2), y: junctionCenter.y - (targetPort.shellWidth / 2) },
			{ x: junctionCenter.x + (junctionSpan / 2), y: junctionCenter.y - (sourcePort.shellWidth / 2) },
			{ x: junctionCenter.x + (junctionSpan / 2), y: junctionCenter.y + (sourcePort.shellWidth / 2) },
			{ x: junctionCenter.x - (junctionSpan / 2), y: junctionCenter.y + (targetPort.shellWidth / 2) },
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
	side: SceneBandGeometry["side"]
	sourcePort: AttachmentPort
	sourceShellWidth?: number
	targetPort: AttachmentPort
	volumeTransitions: ConnectorVolumeTransition[]
}): SceneBandGeometry {
	const sourceShellWidth = args.sourceShellWidth ?? args.shellWidth;
	const fittedRoute = fitPathGeometryCorners({
		offsetEnvelope: {
			maxOffset: Math.max(sourceShellWidth, args.shellWidth) / 2,
			minOffset: -(Math.max(sourceShellWidth, args.shellWidth) / 2),
		},
		points: args.route,
	}).points;
	const shell = buildBand(
		fittedRoute,
		sourceShellWidth,
		args.shellWidth,
		args.shellReveal,
		"open",
		"center",
		sourceShellWidth,
		args.shellWidth,
	);
	const fluid = args.volumeTransitions.length > 0
		? buildMovingVolumeBand({
			placement: args.side,
			route: fittedRoute,
			shellWidth: Math.max(sourceShellWidth, args.shellWidth),
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
			args.shellWidth,
		);

	return {
		diagnosticIssues: [...shell.issues, ...fluid.issues],
		fluidPathData: fluid.pathData,
		id: args.id,
		kind: args.kind,
		outlineWidth: args.outlineWidth,
		shellPathData: shell.pathData,
		side: args.side,
		sourcePort: args.sourcePort,
		targetPort: args.targetPort,
	};
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
	const instructions: PathGeometryInstruction[] = [
		{ kind: "open" as const, startPositionPercent: 0, type: "extremity" as const },
		{ ...sourceOffsets, type: "offsets" as const },
	];
	if (safeReveal >= 1 - GEOMETRY_EPSILON && !sameOffsets(sourceOffsets, targetOffsets)) {
		instructions.push({
			kind: "curved",
			lengthPx: Math.max(sourceShellWidth, targetShellWidth, 1),
			startPositionPercent: 50,
			type: "transition",
		});
		instructions.push({ ...targetOffsets, type: "offsets" as const });
	}
	if (revealExtremity === "curved" && safeReveal < 1 - GEOMETRY_EPSILON) {
		const routeLength = estimateRouteLength(route);
		const lengthPx = Math.max(safeSourceWidth, safeTargetWidth, 1);
		const frontierDistance = safeReveal * (routeLength + lengthPx);
		const startPositionPercent = routeLength <= GEOMETRY_EPSILON
			? 0
			: ((frontierDistance - lengthPx) / routeLength) * 100;
		instructions.push({
			allowOverflow: true,
			collapseOffset: sourceOffsets.offsetB,
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