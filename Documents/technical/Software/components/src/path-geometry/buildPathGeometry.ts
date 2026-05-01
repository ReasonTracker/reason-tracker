/**
 * Shared path-geometry builder.
 *
 * The README in this folder is the authoritative behavior spec.
 */

// AGENT NOTE: Keep tunable numeric geometry constants grouped here.
/** Small tolerance for treating numeric values as effectively equal. */
const GEOMETRY_EPSILON = 1e-6;
/** Smallest arc bulge that is still worth rendering as an SVG arc instead of a line. */
const MIN_RENDERABLE_ARC_SAGITTA_PX = 0.01;
/** Maximum routed-path span represented by one sampled segment in a curved transition. */
const CURVED_TRANSITION_SAMPLE_LENGTH_PX = 12;
/** Minimum number of sampled segments used to approximate a curved transition. */
const CURVED_TRANSITION_MIN_SAMPLE_SEGMENTS = 6;

//#region Geometry primitives

export interface Point {
	x: number;
	y: number;
}

export interface Waypoint extends Point {
	radius?: number;
}

//#endregion

//#region Builder input

export interface OffsetSection {
	offsetA: number;
	offsetB: number;
}

export interface PathOffsetsInstruction extends OffsetSection {
	type: "offsets";
}

export type PathGeometryTransitionKind = "curved" | "linear";

export interface PathTransitionInstruction {
	type: "transition";
	startPositionPercent: number;
	lengthPx: number;
	kind: PathGeometryTransitionKind;
}

export type PathGeometryExtremityKind = "curved" | "open" | "linear";

export interface PathOpenExtremityInstruction {
	type: "extremity";
	kind: "open";
	startPositionPercent: number;
}

export interface PathLinearExtremityInstruction {
	type: "extremity";
	kind: "linear";
	startPositionPercent: number;
	lengthPx: number;
	collapseOffset: number;
}

export interface PathCurvedExtremityInstruction {
	type: "extremity";
	kind: "curved";
	startPositionPercent: number;
	lengthPx: number;
	collapseOffset: number;
}

export type PathExtremityInstruction =
	| PathOpenExtremityInstruction
	| PathLinearExtremityInstruction
	| PathCurvedExtremityInstruction;

export type PathGeometryInstruction =
	| PathOffsetsInstruction
	| PathTransitionInstruction
	| PathExtremityInstruction;

export interface PathGeometryInput {
	points: Waypoint[];
	instructions: PathGeometryInstruction[];
}

//#endregion

//#region Geometry output

export type PathGeometryCommand =
	| { kind: "moveTo"; x: number; y: number }
	| { kind: "lineTo"; x: number; y: number }
	| {
		kind: "arc";
		rx: number;
		ry: number;
		xAxisRotation: number;
		largeArc: boolean;
		sweep: boolean;
		x: number;
		y: number;
	};

export type PathGeometryIssueCode =
	| "insufficient-points"
	| "missing-offsets"
	| "instruction-position-out-of-range"
	| "invalid-instruction-order"
	| "invalid-instruction-range"
	| "transition-missing-active-offsets"
	| "transition-missing-next-offsets"
	| "extremity-missing-active-offsets"
	| "extremity-missing-next-offsets"
	| "extremity-invalid-position"
	| "degenerate-segment"
	| "radius-clamped"
	| "radius-ignored"
	| "geometry-collapsed";

export interface PathGeometryIssue {
	code: PathGeometryIssueCode;
	message: string;
	severity: "warning" | "error";
	instructionIndex?: number;
	waypointIndex?: number;
	segmentIndex?: number;
}

export interface PathGeometry {
	boundaryAPathCommands: PathGeometryCommand[];
	boundaryBPathCommands: PathGeometryCommand[];
	issues: PathGeometryIssue[];
}

//#endregion

type CenterlinePart =
	| {
		kind: "line";
		startPoint: Point;
		endPoint: Point;
		startDistance: number;
		endDistance: number;
	}
	| {
		kind: "arc";
		center: Point;
		radius: number;
		startAngle: number;
		deltaAngle: number;
		startDistance: number;
		endDistance: number;
	};

interface PathProfileSegment {
	startDistance: number;
	endDistance: number;
	nominalStartDistance: number;
	nominalEndDistance: number;
	fromSection: OffsetSection;
	toSection: OffsetSection;
	transitionKind?: PathGeometryTransitionKind;
}

interface CenterlineEvaluation {
	point: Point;
	tangent: Point;
}

interface PreparedFilletCorner {
	bisectorDirection: Point;
	cornerPoint: Point;
	incomingDirection: Point;
	outgoingDirection: Point;
	sharedSegmentClampReported: boolean;
	tangentDistance: number;
	tangentFactor: number;
	turnAngle: number;
	turnSign: number;
	waypointIndex: number;
}

export function buildPathGeometry(input: PathGeometryInput): PathGeometry {
	const issues: PathGeometryIssue[] = [];

	if (input.points.length < 2) {
		issues.push({
			code: "insufficient-points",
			message: "At least two waypoints are required to build path geometry.",
			severity: "error",
		});
		return { boundaryAPathCommands: [], boundaryBPathCommands: [], issues };
	}

	const centerline = buildCenterlineParts(input.points, issues);

	if (centerline.parts.length === 0 || centerline.totalLength <= GEOMETRY_EPSILON) {
		issues.push({
			code: "geometry-collapsed",
			message: "The routed centerline collapsed before geometry could be built.",
			severity: "error",
		});
		return { boundaryAPathCommands: [], boundaryBPathCommands: [], issues };
	}

	const profileSegments = buildProfileSegments(
		input.instructions,
		centerline.totalLength,
		issues,
	);

	if (profileSegments.length === 0) {
		if (input.instructions.length === 0) {
			issues.push({
				code: "missing-offsets",
				message: "No drawable offsets profile could be built from the instruction sequence.",
				severity: "error",
			});
		}
		return { boundaryAPathCommands: [], boundaryBPathCommands: [], issues };
	}

	const boundaryAPathCommands = buildBoundaryPathCommands(
		centerline.parts,
		profileSegments,
		(section) => section.offsetA,
	);
	const boundaryBPathCommands = buildBoundaryPathCommands(
		centerline.parts,
		profileSegments,
		(section) => section.offsetB,
	);

	if (boundaryAPathCommands.length === 0 || boundaryBPathCommands.length === 0) {
		issues.push({
			code: "geometry-collapsed",
			message: "The geometry collapsed while building boundary paths.",
			severity: "error",
		});
	}

	return { boundaryAPathCommands, boundaryBPathCommands, issues };
}

function buildCenterlineParts(
	points: Waypoint[],
	issues: PathGeometryIssue[],
): { parts: CenterlinePart[]; totalLength: number } {
	const parts: CenterlinePart[] = [];
	const preparedFilletCorners = prepareFilletCorners(points, issues);
	let currentPoint = points[0];
	let distance = 0;
	let previousStepEndedWithFillet = false;

	for (let waypointIndex = 1; waypointIndex < points.length - 1; waypointIndex += 1) {
		const cornerPoint = points[waypointIndex];
		const fillet = resolvePreparedFilletCorner(preparedFilletCorners[waypointIndex]);

		const lineEndPoint = fillet?.startPoint ?? cornerPoint;
		distance = appendLinePart(
			parts,
			currentPoint,
			lineEndPoint,
			distance,
			waypointIndex - 1,
			issues,
			previousStepEndedWithFillet || !!fillet,
		);

		if (fillet) {
			const arcLength = Math.abs(fillet.deltaAngle) * fillet.radius;
			parts.push({
				kind: "arc",
				center: fillet.center,
				radius: fillet.radius,
				startAngle: fillet.startAngle,
				deltaAngle: fillet.deltaAngle,
				startDistance: distance,
				endDistance: distance + arcLength,
			});
			distance += arcLength;
			currentPoint = fillet.endPoint;
			previousStepEndedWithFillet = true;
			continue;
		}

		currentPoint = cornerPoint;
		previousStepEndedWithFillet = false;
	}

	distance = appendLinePart(
		parts,
		currentPoint,
		points[points.length - 1],
		distance,
		points.length - 2,
		issues,
		previousStepEndedWithFillet,
	);

	return { parts, totalLength: distance };
}

function prepareFilletCorners(
	points: Waypoint[],
	issues: PathGeometryIssue[],
): Array<PreparedFilletCorner | undefined> {
	const preparedFilletCorners = new Array<PreparedFilletCorner | undefined>(points.length).fill(undefined);

	for (let waypointIndex = 1; waypointIndex < points.length - 1; waypointIndex += 1) {
		preparedFilletCorners[waypointIndex] = prepareFilletCorner(
			points[waypointIndex - 1],
			points[waypointIndex],
			points[waypointIndex + 1],
			waypointIndex,
			issues,
		);
	}

	clampPreparedFilletCornersToSharedSegments(points, preparedFilletCorners, issues);
	return preparedFilletCorners;
}

function prepareFilletCorner(
	previousPoint: Waypoint,
	cornerPoint: Waypoint,
	nextPoint: Waypoint,
	waypointIndex: number,
	issues: PathGeometryIssue[],
): PreparedFilletCorner | undefined {
	if (!cornerPoint.radius || cornerPoint.radius <= GEOMETRY_EPSILON) {
		return undefined;
	}

	const incomingVector = subtractPoint(cornerPoint, previousPoint);
	const outgoingVector = subtractPoint(nextPoint, cornerPoint);
	const incomingLength = lengthOfPoint(incomingVector);
	const outgoingLength = lengthOfPoint(outgoingVector);

	if (incomingLength <= GEOMETRY_EPSILON || outgoingLength <= GEOMETRY_EPSILON) {
		issues.push({
			code: "radius-ignored",
			message: "A corner radius was ignored because an adjacent segment is degenerate.",
			severity: "warning",
			waypointIndex,
		});
		return undefined;
	}

	const incomingDirection = scalePoint(incomingVector, 1 / incomingLength);
	const outgoingDirection = scalePoint(outgoingVector, 1 / outgoingLength);
	const turnCross = crossProduct(incomingDirection, outgoingDirection);
	const turnAngle = Math.acos(clampNumber(dotProduct(incomingDirection, outgoingDirection), -1, 1));

	if (Math.abs(turnCross) <= GEOMETRY_EPSILON || turnAngle <= GEOMETRY_EPSILON) {
		issues.push({
			code: "radius-ignored",
			message: "A corner radius was ignored because the path does not turn at that waypoint.",
			severity: "warning",
			waypointIndex,
		});
		return undefined;
	}

	const tangentFactor = Math.tan(turnAngle / 2);
	if (tangentFactor <= GEOMETRY_EPSILON) {
		issues.push({
			code: "radius-ignored",
			message: "A corner radius was ignored because the turn geometry is not usable.",
			severity: "warning",
			waypointIndex,
		});
		return undefined;
	}

	const maxRadius = Math.min(incomingLength, outgoingLength) / tangentFactor;
	let radius = cornerPoint.radius;

	if (radius > maxRadius) {
		radius = maxRadius;
		issues.push({
			code: "radius-clamped",
			message: "A corner radius was clamped so the fillet stays within adjacent segments.",
			severity: "warning",
			waypointIndex,
		});
	}

	if (radius <= GEOMETRY_EPSILON) {
		issues.push({
			code: "radius-ignored",
			message: "A corner radius was ignored after clamping collapsed it to zero.",
			severity: "warning",
			waypointIndex,
		});
		return undefined;
	}

	const tangentDistance = radius * tangentFactor;
	const turnSign = turnCross > 0 ? 1 : -1;
	const inwardNormalA = turnSign > 0 ? leftNormal(incomingDirection) : rightNormal(incomingDirection);
	const inwardNormalB = turnSign > 0 ? leftNormal(outgoingDirection) : rightNormal(outgoingDirection);
	const bisectorDirection = normalizePoint(addPoint(inwardNormalA, inwardNormalB));

	if (!bisectorDirection) {
		issues.push({
			code: "radius-ignored",
			message: "A corner radius was ignored because the fillet bisector could not be resolved.",
			severity: "warning",
			waypointIndex,
		});
		return undefined;
	}

	return {
		bisectorDirection,
		cornerPoint,
		incomingDirection,
		outgoingDirection,
		sharedSegmentClampReported: false,
		tangentDistance,
		tangentFactor,
		turnAngle,
		turnSign,
		waypointIndex,
	};
}

function clampPreparedFilletCornersToSharedSegments(
	points: Waypoint[],
	preparedFilletCorners: Array<PreparedFilletCorner | undefined>,
	issues: PathGeometryIssue[],
): void {
	for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
		const segmentLength = distanceBetweenPoints(points[segmentIndex], points[segmentIndex + 1]);
		const outgoingCorner = segmentIndex > 0 ? preparedFilletCorners[segmentIndex] : undefined;
		const incomingCorner = segmentIndex + 1 < points.length - 1
			? preparedFilletCorners[segmentIndex + 1]
			: undefined;
		const requiredLength = (outgoingCorner?.tangentDistance ?? 0) + (incomingCorner?.tangentDistance ?? 0);

		if (segmentLength <= GEOMETRY_EPSILON || requiredLength <= segmentLength + GEOMETRY_EPSILON) {
			continue;
		}

		const scale = segmentLength / requiredLength;
		clampPreparedFilletCornerTangentDistance(
			outgoingCorner,
			outgoingCorner ? outgoingCorner.tangentDistance * scale : 0,
			issues,
		);
		clampPreparedFilletCornerTangentDistance(
			incomingCorner,
			incomingCorner ? incomingCorner.tangentDistance * scale : 0,
			issues,
		);
	}
}

function clampPreparedFilletCornerTangentDistance(
	preparedFilletCorner: PreparedFilletCorner | undefined,
	nextTangentDistance: number,
	issues: PathGeometryIssue[],
): void {
	if (!preparedFilletCorner) {
		return;
	}

	const clampedTangentDistance = clampNumber(nextTangentDistance, 0, preparedFilletCorner.tangentDistance);
	if (preparedFilletCorner.tangentDistance - clampedTangentDistance <= GEOMETRY_EPSILON) {
		return;
	}

	preparedFilletCorner.tangentDistance = clampedTangentDistance;

	if (preparedFilletCorner.sharedSegmentClampReported) {
		return;
	}

	preparedFilletCorner.sharedSegmentClampReported = true;
	issues.push({
		code: "radius-clamped",
		message: "A corner radius was clamped so adjacent fillets fit within their shared segment.",
		severity: "warning",
		waypointIndex: preparedFilletCorner.waypointIndex,
	});
}

function resolvePreparedFilletCorner(
	preparedFilletCorner: PreparedFilletCorner | undefined,
):
	| {
		center: Point;
		radius: number;
		startPoint: Point;
		endPoint: Point;
		startAngle: number;
		deltaAngle: number;
	}
	| undefined {
	if (!preparedFilletCorner || preparedFilletCorner.tangentDistance <= GEOMETRY_EPSILON) {
		return undefined;
	}

	const radius = preparedFilletCorner.tangentDistance / preparedFilletCorner.tangentFactor;
	if (radius <= GEOMETRY_EPSILON) {
		return undefined;
	}

	const startPoint = subtractPoint(
		preparedFilletCorner.cornerPoint,
		scalePoint(preparedFilletCorner.incomingDirection, preparedFilletCorner.tangentDistance),
	);
	const endPoint = addPoint(
		preparedFilletCorner.cornerPoint,
		scalePoint(preparedFilletCorner.outgoingDirection, preparedFilletCorner.tangentDistance),
	);
	const centerDistance = radius / Math.cos(preparedFilletCorner.turnAngle / 2);
	const center = addPoint(
		preparedFilletCorner.cornerPoint,
		scalePoint(preparedFilletCorner.bisectorDirection, centerDistance),
	);
	const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
	const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
	const deltaAngle = resolveArcDeltaAngle(startAngle, endAngle, preparedFilletCorner.turnSign);

	return { center, radius, startPoint, endPoint, startAngle, deltaAngle };
}

function buildProfileSegments(
	instructions: PathGeometryInstruction[],
	totalLength: number,
	issues: PathGeometryIssue[],
): PathProfileSegment[] {
	if (instructions.length === 0) {
		return [];
	}

	const firstInstruction = instructions[0];
	const lastInstruction = instructions[instructions.length - 1];

	if (firstInstruction.type !== "extremity" || lastInstruction.type !== "extremity") {
		issues.push({
			code: "invalid-instruction-order",
			message: "Instruction sequences must start and end with an extremity instruction.",
			severity: "error",
		});
		return [];
	}

	if (instructions.length < 3 || instructions[1].type !== "offsets") {
		issues.push({
			code: "extremity-missing-next-offsets",
			message: "A leading extremity requires a following offsets instruction.",
			severity: "error",
			instructionIndex: 0,
		});
		return [];
	}

	if (instructions[instructions.length - 2].type !== "offsets") {
		issues.push({
			code: "extremity-missing-active-offsets",
			message: "A trailing extremity requires active offsets before it.",
			severity: "error",
			instructionIndex: instructions.length - 1,
		});
		return [];
	}

	const segments: PathProfileSegment[] = [];
	let cursor = firstInstruction.kind === "open"
		? clampStartPositionPercent(firstInstruction.startPositionPercent, totalLength, issues, 0)
		: clampNumber(resolvePathDistance(firstInstruction.startPositionPercent, totalLength), 0, totalLength);
	let instructionIndex = 1;
	let activeSection = extractOffsetSection(instructions[1]);

	if (firstInstruction.kind !== "open") {
		const nominalLeadingStart = resolvePathDistance(firstInstruction.startPositionPercent, totalLength);
		const leadingLength = clampLengthPx(
			firstInstruction.lengthPx,
			totalLength,
			issues,
			0,
		);
		const nominalLeadingEnd = nominalLeadingStart + leadingLength;
		const leadingStart = clampNumber(nominalLeadingStart, 0, totalLength);
		const leadingEnd = clampNumber(nominalLeadingEnd, 0, totalLength);
		const collapsedSection = {
			offsetA: firstInstruction.collapseOffset,
			offsetB: firstInstruction.collapseOffset,
		};
		pushProfileSegment(
			segments,
			leadingStart,
			leadingEnd,
			collapsedSection,
			activeSection,
			firstInstruction.kind,
			nominalLeadingStart,
			nominalLeadingEnd,
		);
		cursor = leadingEnd;
	}

	instructionIndex += 1;

	while (instructionIndex < instructions.length - 1) {
		const instruction = instructions[instructionIndex];

		if (instruction.type === "offsets") {
			issues.push({
				code: "invalid-instruction-order",
				message: "Offsets instructions should be separated by transitions or terminal extremities.",
				severity: "warning",
				instructionIndex,
			});
			activeSection = extractOffsetSection(instruction);
			instructionIndex += 1;
			continue;
		}

		if (instruction.type === "extremity") {
			issues.push({
				code: "extremity-invalid-position",
				message: "Extremity instructions are valid only at the start and end of the sequence.",
				severity: "error",
				instructionIndex,
			});
			instructionIndex += 1;
			continue;
		}

		const nextInstruction = instructions[instructionIndex + 1];

		if (instructionIndex + 1 >= instructions.length - 1 || !nextInstruction || nextInstruction.type !== "offsets") {
			issues.push({
				code: "transition-missing-next-offsets",
				message: "A transition requires a following offsets instruction.",
				severity: "error",
				instructionIndex,
			});
			break;
		}

		const nextSection = extractOffsetSection(nextInstruction);
		let transitionStart = clampStartPositionPercent(
			instruction.startPositionPercent,
			totalLength,
			issues,
			instructionIndex,
		);
		const transitionLength = clampLengthPx(
			instruction.lengthPx,
			totalLength,
			issues,
			instructionIndex,
		);

		if (transitionStart < cursor) {
			issues.push({
				code: "invalid-instruction-order",
				message: "A transition started before the previous visible section finished; it was clamped forward.",
				severity: "warning",
				instructionIndex,
			});
			transitionStart = cursor;
		}

		const transitionEnd = clampNumber(transitionStart + transitionLength, transitionStart, totalLength);
		pushProfileSegment(segments, cursor, transitionStart, activeSection, activeSection);
		pushProfileSegment(
			segments,
			transitionStart,
			transitionEnd,
			activeSection,
			nextSection,
			instruction.kind,
		);
		activeSection = nextSection;
		cursor = transitionEnd;
		instructionIndex += 2;
	}

	const trailingExtremity = lastInstruction;
	let nominalTrailingStart = trailingExtremity.kind === "open"
		? clampStartPositionPercent(
			trailingExtremity.startPositionPercent,
			totalLength,
			issues,
			instructions.length - 1,
		)
		: resolvePathDistance(trailingExtremity.startPositionPercent, totalLength);
	let trailingStart = clampNumber(nominalTrailingStart, 0, totalLength);

	if (trailingStart < cursor) {
		issues.push({
			code: "invalid-instruction-order",
			message: "A trailing extremity started before the previous visible section finished; it was clamped forward.",
			severity: "warning",
			instructionIndex: instructions.length - 1,
		});
		trailingStart = cursor;
		nominalTrailingStart = cursor;
	}

	let nominalTrailingEnd = nominalTrailingStart;
	let trailingEnd = trailingStart;

	if (trailingExtremity.kind !== "open") {
		const trailingLength = clampLengthPx(
			trailingExtremity.lengthPx,
			totalLength,
			issues,
			instructions.length - 1,
		);
		nominalTrailingEnd = nominalTrailingStart + trailingLength;
		trailingEnd = clampNumber(nominalTrailingEnd, trailingStart, totalLength);
	}

	pushProfileSegment(segments, cursor, trailingStart, activeSection, activeSection);

	if (trailingExtremity.kind !== "open") {
		const collapsedSection = {
			offsetA: trailingExtremity.collapseOffset,
			offsetB: trailingExtremity.collapseOffset,
		};
		pushProfileSegment(
			segments,
			trailingStart,
			trailingEnd,
			activeSection,
			collapsedSection,
			trailingExtremity.kind,
			nominalTrailingStart,
			nominalTrailingEnd,
		);
	}

	return segments;
}

function buildBoundaryPathCommands(
	parts: CenterlinePart[],
	profileSegments: PathProfileSegment[],
	selectOffset: (section: OffsetSection) => number,
): PathGeometryCommand[] {
	const commands: PathGeometryCommand[] = [];

	for (const profileSegment of profileSegments) {
		const fromOffset = selectOffset(profileSegment.fromSection);
		const toOffset = selectOffset(profileSegment.toSection);

		if (Math.abs(fromOffset - toOffset) > GEOMETRY_EPSILON) {
			appendVaryingOffsetSegment(commands, parts, profileSegment, selectOffset);
			continue;
		}

		appendConstantOffsetSegments(commands, parts, profileSegment, fromOffset);
	}

	return commands;
}

function appendVaryingOffsetSegment(
	commands: PathGeometryCommand[],
	parts: CenterlinePart[],
	profileSegment: PathProfileSegment,
	selectOffset: (section: OffsetSection) => number,
): void {
	if (profileSegment.endDistance - profileSegment.startDistance <= GEOMETRY_EPSILON) {
		return;
	}
	const sampleCount = resolveVaryingSegmentSampleCount(profileSegment);

	for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
		const interpolation = sampleCount <= 0 ? 0 : sampleIndex / sampleCount;
		const distance = interpolateNumber(
			profileSegment.startDistance,
			profileSegment.endDistance,
			interpolation,
		);
		const part = findCenterlinePartAtDistance(parts, distance);
		if (!part) {
			continue;
		}

		const point = evaluateBoundaryPoint(
			part,
			profileSegment,
			distance,
			selectOffset,
		);

		if (sampleIndex === 0) {
			appendPointCommand(commands, point);
			continue;
		}

		appendLineCommand(commands, point);
	}
}

function appendConstantOffsetSegments(
	commands: PathGeometryCommand[],
	parts: CenterlinePart[],
	profileSegment: PathProfileSegment,
	offset: number,
): void {
	if (profileSegment.endDistance - profileSegment.startDistance <= GEOMETRY_EPSILON) {
		return;
	}

	for (const part of parts) {
		const overlapStart = Math.max(profileSegment.startDistance, part.startDistance);
		const overlapEnd = Math.min(profileSegment.endDistance, part.endDistance);

		if (overlapEnd - overlapStart <= GEOMETRY_EPSILON) {
			continue;
		}

		appendConstantOffsetPart(commands, part, overlapStart, overlapEnd, offset);
	}
}

function appendConstantOffsetPart(
	commands: PathGeometryCommand[],
	part: CenterlinePart,
	startDistance: number,
	endDistance: number,
	offset: number,
): void {
	const startPoint = evaluateConstantOffsetPoint(part, startDistance, offset);
	const endPoint = evaluateConstantOffsetPoint(part, endDistance, offset);
	appendPointCommand(commands, startPoint);

	if (part.kind === "line") {
		appendLineCommand(commands, endPoint);
		return;
	}

	const boundaryRadius = calculateBoundaryArcRadius(part, offset);
	if (boundaryRadius <= GEOMETRY_EPSILON) {
		appendLineCommand(commands, endPoint);
		return;
	}

	const startAngle = calculateAngleAtDistance(part, startDistance);
	const endAngle = calculateAngleAtDistance(part, endDistance);
	const deltaAngle = resolveArcDeltaAngle(startAngle, endAngle, part.deltaAngle >= 0 ? 1 : -1);
	if (shouldRenderArcAsLine(boundaryRadius, deltaAngle)) {
		appendLineCommand(commands, endPoint);
		return;
	}

	commands.push({
		kind: "arc",
		rx: boundaryRadius,
		ry: boundaryRadius,
		xAxisRotation: 0,
		largeArc: Math.abs(deltaAngle) > Math.PI,
		sweep: deltaAngle > 0,
		x: endPoint.x,
		y: endPoint.y,
	});
}

function evaluateBoundaryPoint(
	part: CenterlinePart,
	profileSegment: PathProfileSegment,
	distance: number,
	selectOffset: (section: OffsetSection) => number,
): Point {
	const centerline = evaluateCenterlinePart(part, distance);
	const left = leftNormal(centerline.tangent);
	const span = profileSegment.nominalEndDistance - profileSegment.nominalStartDistance;
	const interpolation = span <= GEOMETRY_EPSILON
		? 0
		: (distance - profileSegment.nominalStartDistance) / span;
	const fromOffset = selectOffset(profileSegment.fromSection);
	const toOffset = selectOffset(profileSegment.toSection);
	const offset = interpolateNumber(
		fromOffset,
		toOffset,
		resolveTransitionInterpolation(profileSegment.transitionKind, interpolation),
	);

	return addPoint(centerline.point, scalePoint(left, offset));
}

function resolveVaryingSegmentSampleCount(profileSegment: PathProfileSegment): number {
	if (profileSegment.transitionKind !== "curved") {
		return 1;
	}

	const span = profileSegment.endDistance - profileSegment.startDistance;
	return Math.max(
		CURVED_TRANSITION_MIN_SAMPLE_SEGMENTS,
		Math.ceil(span / CURVED_TRANSITION_SAMPLE_LENGTH_PX),
	);
}

function resolveTransitionInterpolation(
	transitionKind: PathGeometryTransitionKind | undefined,
	interpolation: number,
): number {
	const clampedInterpolation = clampNumber(interpolation, 0, 1);
	if (transitionKind !== "curved") {
		return clampedInterpolation;
	}

	return Math.sin((Math.PI * clampedInterpolation) / 2);
}

function evaluateConstantOffsetPoint(
	part: CenterlinePart,
	distance: number,
	offset: number,
): Point {
	if (part.kind === "line") {
		const centerline = evaluateCenterlinePart(part, distance);
		return addPoint(centerline.point, scalePoint(leftNormal(centerline.tangent), offset));
	}

	const angle = calculateAngleAtDistance(part, distance);
	const radial = { x: Math.cos(angle), y: Math.sin(angle) };
	return addPoint(part.center, scalePoint(radial, calculateBoundaryArcRadius(part, offset)));
}

function calculateAngleAtDistance(part: Extract<CenterlinePart, { kind: "arc" }>, distance: number): number {
	const span = part.endDistance - part.startDistance;
	const interpolation = span <= GEOMETRY_EPSILON ? 0 : (distance - part.startDistance) / span;
	return part.startAngle + part.deltaAngle * clampNumber(interpolation, 0, 1);
}

function calculateBoundaryArcRadius(
	part: Extract<CenterlinePart, { kind: "arc" }>,
	offset: number,
): number {
	return part.deltaAngle >= 0 ? part.radius - offset : part.radius + offset;
}

function shouldRenderArcAsLine(boundaryRadius: number, deltaAngle: number): boolean {
	if (boundaryRadius <= GEOMETRY_EPSILON) {
		return true;
	}

	const sagitta = boundaryRadius * (1 - Math.cos(Math.abs(deltaAngle) / 2));
	return sagitta <= MIN_RENDERABLE_ARC_SAGITTA_PX;
}

function findCenterlinePartAtDistance(
	parts: CenterlinePart[],
	distance: number,
): CenterlinePart | undefined {
	for (const part of parts) {
		if (distance >= part.startDistance - GEOMETRY_EPSILON && distance <= part.endDistance + GEOMETRY_EPSILON) {
			return part;
		}
	}

	return parts.at(-1);
}

function appendPointCommand(commands: PathGeometryCommand[], point: Point): void {
	appendEndpointCommand(commands, point);
}

function appendLineCommand(commands: PathGeometryCommand[], point: Point): void {
	appendEndpointCommand(commands, point);
}

function appendEndpointCommand(commands: PathGeometryCommand[], point: Point): void {
	if (commands.length === 0) {
		commands.push({ kind: "moveTo", x: point.x, y: point.y });
		return;
	}

	const currentPoint = getCommandEndpoint(commands[commands.length - 1]);
	if (!currentPoint || !pointsEqual(currentPoint, point)) {
		commands.push({ kind: "lineTo", x: point.x, y: point.y });
	}
}

function getCommandEndpoint(command: PathGeometryCommand | undefined): Point | undefined {
	if (!command) {
		return undefined;
	}

	return { x: command.x, y: command.y };
}

function evaluateCenterlinePart(part: CenterlinePart, distance: number): CenterlineEvaluation {
	if (part.kind === "line") {
		const span = part.endDistance - part.startDistance;
		const interpolation = span <= GEOMETRY_EPSILON ? 0 : (distance - part.startDistance) / span;
		const direction = normalizePoint(subtractPoint(part.endPoint, part.startPoint)) ?? { x: 1, y: 0 };
		return {
			point: interpolatePoint(part.startPoint, part.endPoint, clampNumber(interpolation, 0, 1)),
			tangent: direction,
		};
	}

	const span = part.endDistance - part.startDistance;
	const interpolation = span <= GEOMETRY_EPSILON ? 0 : (distance - part.startDistance) / span;
	const angle = part.startAngle + part.deltaAngle * clampNumber(interpolation, 0, 1);
	const radial = { x: Math.cos(angle), y: Math.sin(angle) };
	return {
		point: addPoint(part.center, scalePoint(radial, part.radius)),
		tangent: part.deltaAngle >= 0 ? leftNormal(radial) : rightNormal(radial),
	};
}

function appendLinePart(
	parts: CenterlinePart[],
	startPoint: Point,
	endPoint: Point,
	startDistance: number,
	segmentIndex: number,
	issues: PathGeometryIssue[],
	allowCollapsed: boolean = false,
): number {
	const segmentLength = distanceBetweenPoints(startPoint, endPoint);

	if (segmentLength <= GEOMETRY_EPSILON) {
		if (allowCollapsed) {
			return startDistance;
		}

		issues.push({
			code: "degenerate-segment",
			message: "A degenerate centerline segment was ignored.",
			severity: "warning",
			segmentIndex,
		});
		return startDistance;
	}

	parts.push({
		kind: "line",
		startPoint,
		endPoint,
		startDistance,
		endDistance: startDistance + segmentLength,
	});

	return startDistance + segmentLength;
}

function pushProfileSegment(
	segments: PathProfileSegment[],
	startDistance: number,
	endDistance: number,
	fromSection: OffsetSection,
	toSection: OffsetSection,
	transitionKind?: PathGeometryTransitionKind,
	nominalStartDistance: number = startDistance,
	nominalEndDistance: number = endDistance,
): void {
	if (endDistance - startDistance <= GEOMETRY_EPSILON) {
		return;
	}

	segments.push({
		startDistance,
		endDistance,
		nominalStartDistance,
		nominalEndDistance,
		fromSection,
		toSection,
		transitionKind,
	});
}

function resolvePathDistance(startPositionPercent: number, totalLength: number): number {
	return (totalLength * startPositionPercent) / 100;
}

function extractOffsetSection(instruction: PathOffsetsInstruction): OffsetSection {
	return { offsetA: instruction.offsetA, offsetB: instruction.offsetB };
}

function clampStartPositionPercent(
	startPositionPercent: number,
	totalLength: number,
	issues: PathGeometryIssue[],
	instructionIndex: number,
): number {
	const clampedPercent = clampNumber(startPositionPercent, 0, 100);

	if (clampedPercent !== startPositionPercent) {
		issues.push({
			code: "instruction-position-out-of-range",
			message: "An instruction start position percent was clamped into the routed path length.",
			severity: "warning",
			instructionIndex,
		});
	}

	return (totalLength * clampedPercent) / 100;
}

function clampLengthPx(
	lengthPx: number,
	totalLength: number,
	issues: PathGeometryIssue[],
	instructionIndex: number,
): number {
	const clampedLength = clampNumber(lengthPx, 0, totalLength);

	if (clampedLength !== lengthPx) {
		issues.push({
			code: "invalid-instruction-range",
			message: "A pixel span was clamped into the routed path length.",
			severity: "warning",
			instructionIndex,
		});
	}

	return clampedLength;
}

function resolveArcDeltaAngle(startAngle: number, endAngle: number, turnSign: number): number {
	let deltaAngle = endAngle - startAngle;

	if (turnSign > 0) {
		while (deltaAngle <= 0) {
			deltaAngle += Math.PI * 2;
		}
		return deltaAngle;
	}

	while (deltaAngle >= 0) {
		deltaAngle -= Math.PI * 2;
	}
	return deltaAngle;
}

function addPoint(a: Point, b: Point): Point {
	return { x: a.x + b.x, y: a.y + b.y };
}

function subtractPoint(a: Point, b: Point): Point {
	return { x: a.x - b.x, y: a.y - b.y };
}

function scalePoint(point: Point, scalar: number): Point {
	return { x: point.x * scalar, y: point.y * scalar };
}

function interpolatePoint(a: Point, b: Point, interpolation: number): Point {
	return {
		x: interpolateNumber(a.x, b.x, interpolation),
		y: interpolateNumber(a.y, b.y, interpolation),
	};
}

function interpolateNumber(a: number, b: number, interpolation: number): number {
	return a + (b - a) * interpolation;
}

function normalizePoint(point: Point): Point | undefined {
	const magnitude = lengthOfPoint(point);
	if (magnitude <= GEOMETRY_EPSILON) {
		return undefined;
	}
	return { x: point.x / magnitude, y: point.y / magnitude };
}

function lengthOfPoint(point: Point): number {
	return Math.hypot(point.x, point.y);
}

function distanceBetweenPoints(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function dotProduct(a: Point, b: Point): number {
	return a.x * b.x + a.y * b.y;
}

function crossProduct(a: Point, b: Point): number {
	return a.x * b.y - a.y * b.x;
}

function leftNormal(point: Point): Point {
	return { x: -point.y, y: point.x };
}

function rightNormal(point: Point): Point {
	return { x: point.y, y: -point.x };
}

function clampNumber(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

function pointsEqual(a: Point, b: Point): boolean {
	return Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;
}