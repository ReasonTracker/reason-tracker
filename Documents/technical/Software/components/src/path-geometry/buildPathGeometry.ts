/**
 * Path-geometry contracts and the builder entrypoint.
 *
 * Keep broader scope and boundary notes in this folder's README.
 */

// AGENT NOTE: Keep tunable numeric geometry constants grouped here.
/**
 * Small distance threshold used to treat two numbers or points as effectively the same.
 *
 * In plain terms, this is the tolerance for "close enough to zero" when the math would
 * otherwise create unstable geometry from tiny floating-point differences.
 */
const GEOMETRY_EPSILON = 1e-6;

/**
 * Largest angle span, in radians, that one sampled line segment is allowed to cover when
 * approximating a curved arc with straight segments.
 *
 * Lower values make sampled fallback arcs look smoother but create more segments.
 * Higher values create fewer segments but can make curves look more faceted.
 */
const MAX_ARC_SAMPLE_ANGLE_RADIANS = Math.PI / 12;

/**
 * Small tolerance used when deciding whether offset values are uniform enough to emit one
 * exact SVG arc command instead of falling back to several straight line segments.
 *
 * In plain terms, this controls how similar the sampled offsets must be before the code
 * treats them as "effectively the same offset."
 */
const OFFSET_ARC_EPSILON = 1e-4;

/**
 * Size of the width-handoff window, expressed as a percentage of the full path length.
 *
 * The start band is held until the transition start percent, then the offsets hand off to the
 * end band over this short span.
 */
const BAND_TRANSITION_SPAN_PERCENT = 4;

//#region Geometry primitives

/** 2D point in world coordinates. */
export interface Point {
	/** Horizontal world coordinate. */
	x: number;

	/** Vertical world coordinate. */
	y: number;
}

/**
 * Centerline waypoint.
 *
 * The full path is an ordered list of waypoints.
 * First = source, last = target.
 */
export interface Waypoint extends Point {
	/**
	 * Optional corner radius used when generating arc joins.
	 *
	 * If omitted, corners may be treated as sharp.
	 */
	radius?: number;
}

//#endregion

//#region Band contracts

/**
 * Offset band definition at a specific point along the path.
 *
 * Offsets are measured perpendicular to the reference path direction.
 *
 * Convention:
 * - negative = left side of path
 * - positive = right side of path
 */
export interface OffsetBand {
	/**
	 * Inner boundary offset from the reference path.
	 *
	 * Example:
	 * - -5 means 5 units to the left
	 * - +4 means 4 units to the right
	 */
	innerOffset: number;

	/**
	 * Outer boundary offset from the reference path.
	 *
	 * Must be >= innerOffset.
	 */
	outerOffset: number;
}

//#endregion

//#region Builder input

/**
 * Input to the geometry builder.
 */
export interface PathGeometryInput {
	/**
	 * Reference path.
	 *
	 * Must contain at least two ordered waypoints.
	 */
	points: Waypoint[];

	/**
	 * Band used from path start until the width transition begins.
	 */
	startBand: OffsetBand;

	/**
	 * Band used after the width transition finishes.
	 *
	 * If omitted, the full path uses `startBand`.
	 */
	endBand?: OffsetBand;

	/**
	 * Path distance, expressed as 0 to 100, where the band begins changing from `startBand`
	 * toward `endBand`.
	 *
	 * The handoff uses a short built-in transition span instead of changing across the full path.
	 */
	transitionStartPercent?: number;

	/**
	 * Reveal amount, expressed as 0 to 100 of the path length.
	 *
	 * This truncates the produced geometry. It does not control where width changes begin.
	 */
	revealPercent: number;
}

//#endregion

//#region Geometry output

/**
 * Structured path commands (SVG-compatible).
 *
 * These map directly to SVG path instructions, but are explicit and typed.
 * The commands in this file describe open path boundaries.
 */
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

/** Supported diagnostic codes emitted while building path geometry. */
export type PathGeometryIssueCode =
	| "insufficient-points"
	| "reveal-out-of-range"
	| "transition-start-out-of-range"
	| "degenerate-segment"
	| "invalid-band"
	| "radius-clamped"
	| "radius-ignored"
	| "geometry-collapsed";

/** Diagnostic emitted when the builder has to warn or fail on input geometry. */
export interface PathGeometryIssue {
	/** Stable issue code for programmatic handling. */
	code: PathGeometryIssueCode;

	/** Human-readable explanation of what went wrong or what was adjusted. */
	message: string;

	/** Whether the issue is informational enough to render or severe enough to treat as invalid. */
	severity: "warning" | "error";

	/** Optional waypoint index related to the issue, when applicable. */
	waypointIndex?: number;

	/** Optional segment index related to the issue, when applicable. */
	segmentIndex?: number;
}

/**
 * Output geometry.
 *
 * The band is represented as two open boundary paths.
 */
export interface PathGeometry {
	/** Open commands describing the outer boundary of the band. */
	outerPathCommands: PathGeometryCommand[];

	/** Open commands describing the inner boundary of the band. */
	innerPathCommands: PathGeometryCommand[];

	/** Diagnostics describing clamped, ignored, or invalid geometry conditions. */
	issues: PathGeometryIssue[];
}

//#endregion

interface FilletCorner {
	center: Point;
	deltaAngle: number;
	end: Point;
	radius: number;
	start: Point;
	startAngle: number;
}

interface LineCenterlinePart {
	kind: "line";
	start: Point;
	end: Point;
	startDistance: number;
	endDistance: number;
}

interface ArcCenterlinePart {
	kind: "arc";
	center: Point;
	deltaAngle: number;
	end: Point;
	endDistance: number;
	radius: number;
	start: Point;
	startAngle: number;
	startDistance: number;
}

type CenterlinePart = LineCenterlinePart | ArcCenterlinePart;

interface LineBoundarySegment {
	kind: "line";
	start: Point;
	end: Point;
}

interface ArcBoundarySegment {
	kind: "arc";
	start: Point;
	end: Point;
	radius: number;
	largeArc: boolean;
	sweep: boolean;
}

type BoundarySegment = LineBoundarySegment | ArcBoundarySegment;

/**
 * Build path geometry for a band along a reference path.
 *
 * The implementation:
 * - walks the reference path
 * - computes normals at each segment
 * - resolves the active band from `startBand`, `endBand`, and `transitionStartPercent`
 * - constructs open inner and outer boundaries
 * - preserves arc joins where possible
 *
 * The builder returns open boundaries. It does not add closure behavior.
 */
export function buildPathGeometry(
	input: PathGeometryInput,
): PathGeometry {
	const issues: PathGeometryIssue[] = [];
	const revealFraction = clampRevealPercent(input.revealPercent, issues);
	const points = removeDegenerateWaypoints(input.points, issues);

	if (points.length < 2) {
		issues.push({
			code: "insufficient-points",
			message: "Path geometry requires at least two distinct waypoints.",
			severity: "error",
		});

		return { innerPathCommands: [], outerPathCommands: [], issues };
	}

	const startBand = input.startBand;
	const endBand = input.endBand ?? input.startBand;
	const transitionStartFraction = clampTransitionStartPercent(
		input.transitionStartPercent ?? 100,
		issues,
	);

	if (startBand.outerOffset < startBand.innerOffset || endBand.outerOffset < endBand.innerOffset) {
		issues.push({
			code: "invalid-band",
			message: "Band offsets must keep outerOffset greater than or equal to innerOffset.",
			severity: "error",
		});

		return { innerPathCommands: [], outerPathCommands: [], issues };
	}

	const corners = buildFilletCorners(points, issues);
	const centerline = buildCenterlineParts(points, corners);

	if (centerline.length === 0) {
		issues.push({
			code: "geometry-collapsed",
			message: "Reference path collapsed before geometry could be constructed.",
			severity: "error",
		});

		return { innerPathCommands: [], outerPathCommands: [], issues };
	}

	const totalLength = centerline.at(-1)?.endDistance ?? 0;

	if (totalLength <= GEOMETRY_EPSILON || revealFraction <= GEOMETRY_EPSILON) {
		return { innerPathCommands: [], outerPathCommands: [], issues };
	}

	const revealedCenterline = clipCenterlinePartsByReveal(centerline, totalLength * revealFraction);

	if (revealedCenterline.length === 0) {
		return { innerPathCommands: [], outerPathCommands: [], issues };
	}

	const outerBoundary = buildBoundarySegments(
		revealedCenterline,
		totalLength,
		startBand,
		endBand,
		transitionStartFraction,
		"outerOffset",
		issues,
	);
	const innerBoundary = buildBoundarySegments(
		revealedCenterline,
		totalLength,
		startBand,
		endBand,
		transitionStartFraction,
		"innerOffset",
		issues,
	);

	if (outerBoundary.length === 0 || innerBoundary.length === 0) {
		issues.push({
			code: "geometry-collapsed",
			message: "Offset geometry collapsed before open boundaries could be constructed.",
			severity: "error",
		});

		return { innerPathCommands: [], outerPathCommands: [], issues };
	}

	const outerPathCommands = buildBoundaryPathCommands(outerBoundary);
	const innerPathCommands = buildBoundaryPathCommands(innerBoundary);

	if (outerPathCommands.length === 0 || innerPathCommands.length === 0) {
		issues.push({
			code: "geometry-collapsed",
			message: "No drawable boundary commands could be produced.",
			severity: "error",
		});
	}

	return {
		innerPathCommands,
		outerPathCommands,
		issues,
	};
}

function addPoints(a: Point, b: Point): Point {
	return { x: a.x + b.x, y: a.y + b.y };
}

function appendBoundarySegment(segments: BoundarySegment[], segment: BoundarySegment): void {
	if (segment.kind === "line" && pointsEqual(segment.start, segment.end)) {
		return;
	}

	if (segment.kind === "arc" && (segment.radius <= GEOMETRY_EPSILON || pointsEqual(segment.start, segment.end))) {
		return;
	}

	const previous = segments.at(-1);

	if (!previous) {
		segments.push(segment);
		return;
	}

	if (!pointsEqual(previous.end, segment.start)) {
		segments.push({ end: segment.start, kind: "line", start: previous.end });
	}

	segments.push(segment);
}

function appendPoint(points: Point[], point: Point): void {
	const previous = points.at(-1);

	if (!previous || !pointsEqual(previous, point)) {
		points.push(clonePoint(point));
	}
}

function buildArcBoundarySegments(
	part: ArcCenterlinePart,
	totalLength: number,
	startBand: OffsetBand,
	endBand: OffsetBand,
	transitionStartFraction: number,
	offsetKey: keyof OffsetBand,
	issues: PathGeometryIssue[],
	partIndex: number,
): BoundarySegment[] {
	const midpointDistance = interpolateNumber(part.startDistance, part.endDistance, 0.5);
	const bandStart = resolveBandAtDistance(part.startDistance, totalLength, startBand, endBand, transitionStartFraction);
	const bandMiddle = resolveBandAtDistance(midpointDistance, totalLength, startBand, endBand, transitionStartFraction);
	const bandEnd = resolveBandAtDistance(part.endDistance, totalLength, startBand, endBand, transitionStartFraction);

	const startOffset = bandStart[offsetKey];
	const middleOffset = bandMiddle[offsetKey];
	const endOffset = bandEnd[offsetKey];

	if (
		calculateOffsetArcRadius(part, startOffset) <= GEOMETRY_EPSILON ||
		calculateOffsetArcRadius(part, middleOffset) <= GEOMETRY_EPSILON ||
		calculateOffsetArcRadius(part, endOffset) <= GEOMETRY_EPSILON
	) {
		issues.push({
			code: "geometry-collapsed",
			message:
				"Offset geometry collapsed because the requested band crosses the center of a rounded corner.",
			severity: "error",
			segmentIndex: partIndex,
		});

		return [];
	}

	if (offsetsCanUseExactArc(startOffset, middleOffset, endOffset)) {
		const exactArc = buildExactArcBoundarySegment(part, startOffset, middleOffset, endOffset);

		if (!exactArc) {
			return [];
		}

		return [exactArc];
	}

	return sampleArcBoundarySegments(
		part,
		totalLength,
		startBand,
		endBand,
		transitionStartFraction,
		offsetKey,
		issues,
		partIndex,
	);
}

function buildBoundaryPathCommands(boundary: BoundarySegment[]): PathGeometryCommand[] {
	if (boundary.length === 0) {
		return [];
	}

	const [startSegment] = boundary;
	const commands: PathGeometryCommand[] = [
		{ kind: "moveTo", x: startSegment.start.x, y: startSegment.start.y },
	];
	let currentPoint = startSegment.start;

	for (const segment of boundary) {
		if (!pointsEqual(currentPoint, segment.start)) {
			commands.push({ kind: "lineTo", x: segment.start.x, y: segment.start.y });
			currentPoint = segment.start;
		}

		if (segment.kind === "line") {
			if (pointsEqual(currentPoint, segment.end)) {
				continue;
			}

			commands.push({ kind: "lineTo", x: segment.end.x, y: segment.end.y });
			currentPoint = segment.end;
			continue;
		}

		if (segment.radius <= GEOMETRY_EPSILON || pointsEqual(currentPoint, segment.end)) {
			continue;
		}

		commands.push({
			kind: "arc",
			largeArc: segment.largeArc,
			rx: segment.radius,
			ry: segment.radius,
			sweep: segment.sweep,
			x: segment.end.x,
			xAxisRotation: 0,
			y: segment.end.y,
		});
		currentPoint = segment.end;
	}

	return commands;
}

function buildBoundarySegments(
	centerline: CenterlinePart[],
	totalLength: number,
	startBand: OffsetBand,
	endBand: OffsetBand,
	transitionStartFraction: number,
	offsetKey: keyof OffsetBand,
	issues: PathGeometryIssue[],
): BoundarySegment[] {
	const boundary: BoundarySegment[] = [];

	for (let partIndex = 0; partIndex < centerline.length; partIndex += 1) {
		const part = centerline[partIndex];
		const bandStart = resolveBandAtDistance(
			part.startDistance,
			totalLength,
			startBand,
			endBand,
			transitionStartFraction,
		);
		const bandEnd = resolveBandAtDistance(
			part.endDistance,
			totalLength,
			startBand,
			endBand,
			transitionStartFraction,
		);

		const segments =
			part.kind === "line"
				? buildLineBoundarySegments(part, bandStart, bandEnd, offsetKey)
				: buildArcBoundarySegments(
					part,
					totalLength,
					startBand,
					endBand,
					transitionStartFraction,
					offsetKey,
					issues,
					partIndex,
				);

		for (const segment of segments) {
			appendBoundarySegment(boundary, segment);
		}
	}

	return boundary;
}

function buildCenterlineParts(
	points: Waypoint[],
	corners: Map<number, FilletCorner>,
): CenterlinePart[] {
	const parts: CenterlinePart[] = [];
	let distance = 0;

	for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
		const segmentStart = corners.get(segmentIndex)?.end ?? points[segmentIndex];
		const segmentEnd = corners.get(segmentIndex + 1)?.start ?? points[segmentIndex + 1];
		const segmentLength = vectorLength(subtractPoints(segmentEnd, segmentStart));

		if (segmentLength > GEOMETRY_EPSILON) {
			parts.push({
				end: clonePoint(segmentEnd),
				endDistance: distance + segmentLength,
				kind: "line",
				start: clonePoint(segmentStart),
				startDistance: distance,
			});
			distance += segmentLength;
		}

		const corner = corners.get(segmentIndex + 1);

		if (!corner) {
			continue;
		}

		const arcLength = Math.abs(corner.deltaAngle) * corner.radius;

		if (arcLength <= GEOMETRY_EPSILON) {
			continue;
		}

		parts.push({
			center: clonePoint(corner.center),
			deltaAngle: corner.deltaAngle,
			end: clonePoint(corner.end),
			endDistance: distance + arcLength,
			kind: "arc",
			radius: corner.radius,
			start: clonePoint(corner.start),
			startAngle: corner.startAngle,
			startDistance: distance,
		});
		distance += arcLength;
	}

	return parts;
}

function buildExactArcBoundarySegment(
	part: ArcCenterlinePart,
	startOffset: number,
	middleOffset: number,
	endOffset: number,
): ArcBoundarySegment | null {
	const averageOffset = (startOffset + middleOffset + endOffset) / 3;
	const radius = calculateOffsetArcRadius(part, averageOffset);

	if (radius <= GEOMETRY_EPSILON) {
		return null;
	}

	const endAngle = part.startAngle + part.deltaAngle;

	return {
		end: pointOnCircle(part.center, endAngle, radius),
		kind: "arc",
		largeArc: Math.abs(part.deltaAngle) > Math.PI,
		radius,
		start: pointOnCircle(part.center, part.startAngle, radius),
		sweep: part.deltaAngle > 0,
	};
}

function buildFilletCorners(
	points: Waypoint[],
	issues: PathGeometryIssue[],
): Map<number, FilletCorner> {
	const corners = new Map<number, FilletCorner>();

	for (let waypointIndex = 1; waypointIndex < points.length - 1; waypointIndex += 1) {
		const requestedRadius = points[waypointIndex].radius;

		if (requestedRadius === undefined || requestedRadius <= GEOMETRY_EPSILON) {
			continue;
		}

		const previousSegment = subtractPoints(points[waypointIndex], points[waypointIndex - 1]);
		const nextSegment = subtractPoints(points[waypointIndex + 1], points[waypointIndex]);
		const previousLength = vectorLength(previousSegment);
		const nextLength = vectorLength(nextSegment);

		if (previousLength <= GEOMETRY_EPSILON || nextLength <= GEOMETRY_EPSILON) {
			issues.push({
				code: "radius-ignored",
				message: "Corner radius was ignored because one adjacent segment is degenerate.",
				severity: "warning",
				waypointIndex,
			});

			continue;
		}

		const incomingDirection = scalePoint(previousSegment, 1 / previousLength);
		const outgoingDirection = scalePoint(nextSegment, 1 / nextLength);
		const turnCross = crossProduct(incomingDirection, outgoingDirection);
		const turnAngle = Math.acos(clampNumber(dotProduct(incomingDirection, outgoingDirection), -1, 1));

		if (
			Math.abs(turnCross) <= GEOMETRY_EPSILON ||
			turnAngle <= GEOMETRY_EPSILON ||
			Math.PI - turnAngle <= GEOMETRY_EPSILON
		) {
			issues.push({
				code: "radius-ignored",
				message: "Corner radius was ignored because the waypoint does not form a usable turn.",
				severity: "warning",
				waypointIndex,
			});

			continue;
		}

		const requestedTrim = requestedRadius * Math.tan(turnAngle / 2);
		const maxTrim = Math.min(previousLength, nextLength) / 2;
		const trim = Math.min(requestedTrim, maxTrim);

		if (trim <= GEOMETRY_EPSILON) {
			issues.push({
				code: "radius-ignored",
				message: "Corner radius was ignored because no valid fillet could fit at this waypoint.",
				severity: "warning",
				waypointIndex,
			});

			continue;
		}

		if (trim + GEOMETRY_EPSILON < requestedTrim) {
			issues.push({
				code: "radius-clamped",
				message: "Corner radius was clamped to fit the adjacent segment lengths.",
				severity: "warning",
				waypointIndex,
			});
		}

		const radius = trim / Math.tan(turnAngle / 2);
		const start = subtractPoints(points[waypointIndex], scalePoint(incomingDirection, trim));
		const end = addPoints(points[waypointIndex], scalePoint(outgoingDirection, trim));
		const turnNormal =
			turnCross > 0
				? normalizePoint(addPoints(leftNormal(incomingDirection), leftNormal(outgoingDirection)))
				: normalizePoint(addPoints(rightNormal(incomingDirection), rightNormal(outgoingDirection)));

		if (!turnNormal) {
			issues.push({
				code: "radius-ignored",
				message: "Corner radius was ignored because the turn bisector could not be constructed.",
				severity: "warning",
				waypointIndex,
			});

			continue;
		}

		const centerDistance = radius / Math.cos(turnAngle / 2);
		const center = addPoints(points[waypointIndex], scalePoint(turnNormal, centerDistance));
		const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
		const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
		const deltaAngle = normalizeSweep(startAngle, endAngle, turnCross > 0);

		corners.set(waypointIndex, {
			center,
			deltaAngle,
			end,
			radius,
			start,
			startAngle,
		});
	}

	return corners;
}

function buildLineBoundarySegments(
	part: LineCenterlinePart,
	bandStart: OffsetBand,
	bandEnd: OffsetBand,
	offsetKey: keyof OffsetBand,
): BoundarySegment[] {
	const direction = normalizePoint(subtractPoints(part.end, part.start));

	if (!direction) {
		return [];
	}

	const normal = rightNormal(direction);
	const start = addPoints(part.start, scalePoint(normal, bandStart[offsetKey]));
	const end = addPoints(part.end, scalePoint(normal, bandEnd[offsetKey]));

	if (pointsEqual(start, end)) {
		return [];
	}

	return [{ end, kind: "line", start }];
}

function calculateOffsetArcRadius(part: ArcCenterlinePart, offset: number): number {
	const curvatureDirection = part.deltaAngle >= 0 ? 1 : -1;

	return part.radius + curvatureDirection * offset;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

function clampRevealPercent(revealPercent: number, issues: PathGeometryIssue[]): number {
	const clampedRevealPercent = clampNumber(revealPercent, 0, 100);

	if (clampedRevealPercent !== revealPercent) {
		issues.push({
			code: "reveal-out-of-range",
			message: "Reveal percent was clamped into the supported range of 0 to 100.",
			severity: "warning",
		});
	}

	return clampedRevealPercent / 100;
}

function clampTransitionStartPercent(
	transitionStartPercent: number,
	issues: PathGeometryIssue[],
): number {
	const clampedTransitionStartPercent = clampNumber(transitionStartPercent, 0, 100);

	if (clampedTransitionStartPercent !== transitionStartPercent) {
		issues.push({
			code: "transition-start-out-of-range",
			message: "Transition start percent was clamped into the supported range of 0 to 100.",
			severity: "warning",
		});
	}

	return clampedTransitionStartPercent / 100;
}

function clipCenterlinePartsByReveal(
	parts: CenterlinePart[],
	revealedLength: number,
): CenterlinePart[] {
	if (parts.length === 0 || revealedLength <= GEOMETRY_EPSILON) {
		return [];
	}

	const clippedParts: CenterlinePart[] = [];

	for (const part of parts) {
		if (part.startDistance >= revealedLength - GEOMETRY_EPSILON) {
			break;
		}

		if (part.endDistance <= revealedLength + GEOMETRY_EPSILON) {
			clippedParts.push(part);
			continue;
		}

		const ratio = (revealedLength - part.startDistance) / (part.endDistance - part.startDistance);

		if (part.kind === "line") {
			clippedParts.push({
				end: interpolatePoint(part.start, part.end, ratio),
				endDistance: revealedLength,
				kind: "line",
				start: part.start,
				startDistance: part.startDistance,
			});
		} else {
			const clippedDeltaAngle = part.deltaAngle * ratio;
			const endAngle = part.startAngle + clippedDeltaAngle;
			clippedParts.push({
				center: part.center,
				deltaAngle: clippedDeltaAngle,
				end: pointOnCircle(part.center, endAngle, part.radius),
				endDistance: revealedLength,
				kind: "arc",
				radius: part.radius,
				start: part.start,
				startAngle: part.startAngle,
				startDistance: part.startDistance,
			});
		}

		break;
	}

	return clippedParts;
}

function clonePoint(point: Point): Point {
	return { x: point.x, y: point.y };
}

function crossProduct(a: Point, b: Point): number {
	return a.x * b.y - a.y * b.x;
}

function dotProduct(a: Point, b: Point): number {
	return a.x * b.x + a.y * b.y;
}

function interpolateNumber(start: number, end: number, ratio: number): number {
	return start + (end - start) * ratio;
}

function interpolatePoint(start: Point, end: Point, ratio: number): Point {
	return {
		x: interpolateNumber(start.x, end.x, ratio),
		y: interpolateNumber(start.y, end.y, ratio),
	};
}

function interpolateBand(startBand: OffsetBand, endBand: OffsetBand, ratio: number): OffsetBand {
	return {
		innerOffset: interpolateNumber(startBand.innerOffset, endBand.innerOffset, ratio),
		outerOffset: interpolateNumber(startBand.outerOffset, endBand.outerOffset, ratio),
	};
}

function leftNormal(direction: Point): Point {
	return { x: -direction.y, y: direction.x };
}

function normalizePoint(point: Point): Point | null {
	const length = vectorLength(point);

	if (length <= GEOMETRY_EPSILON) {
		return null;
	}

	return scalePoint(point, 1 / length);
}

function normalizeSweep(startAngle: number, endAngle: number, positiveDirection: boolean): number {
	let delta = endAngle - startAngle;

	if (positiveDirection) {
		while (delta <= 0) {
			delta += Math.PI * 2;
		}
	} else {
		while (delta >= 0) {
			delta -= Math.PI * 2;
		}
	}

	return delta;
}

function offsetsCanUseExactArc(start: number, middle: number, end: number): boolean {
	return (
		Math.abs(start - middle) <= OFFSET_ARC_EPSILON &&
		Math.abs(middle - end) <= OFFSET_ARC_EPSILON &&
		Math.abs(start - end) <= OFFSET_ARC_EPSILON
	);
}

function pointOnCircle(center: Point, angle: number, radius: number): Point {
	return {
		x: center.x + Math.cos(angle) * radius,
		y: center.y + Math.sin(angle) * radius,
	};
}

function pointsEqual(a: Point, b: Point): boolean {
	return Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;
}

function pointsEqualBand(a: OffsetBand, b: OffsetBand): boolean {
	return (
		Math.abs(a.innerOffset - b.innerOffset) <= GEOMETRY_EPSILON &&
		Math.abs(a.outerOffset - b.outerOffset) <= GEOMETRY_EPSILON
	);
}

function removeDegenerateWaypoints(
	points: Waypoint[],
	issues: PathGeometryIssue[],
): Waypoint[] {
	const deduped: Waypoint[] = [];

	for (let index = 0; index < points.length; index += 1) {
		const point = points[index];
		const previous = deduped.at(-1);

		if (previous && pointsEqual(previous, point)) {
			issues.push({
				code: "degenerate-segment",
				message: "A zero-length segment was ignored while building the reference path.",
				severity: "warning",
				segmentIndex: Math.max(0, index - 1),
				waypointIndex: index,
			});
			continue;
		}

		deduped.push(point);
	}

	return deduped;
}

function resolveBandAtDistance(
	distance: number,
	totalLength: number,
	startBand: OffsetBand,
	endBand: OffsetBand,
	transitionStartFraction: number,
): OffsetBand {
	const t = totalLength <= GEOMETRY_EPSILON ? 0 : clampNumber(distance / totalLength, 0, 1);
	const transitionEndFraction = clampNumber(
		transitionStartFraction + BAND_TRANSITION_SPAN_PERCENT / 100,
		transitionStartFraction,
		1,
	);

	if (
		pointsEqualBand(startBand, endBand) ||
		transitionStartFraction >= 1 - GEOMETRY_EPSILON ||
		transitionEndFraction <= transitionStartFraction + GEOMETRY_EPSILON
	) {
		return cloneBand(startBand);
	}

	if (t <= transitionStartFraction) {
		return cloneBand(startBand);
	}

	if (t >= transitionEndFraction) {
		return cloneBand(endBand);
	}

	return interpolateBand(
		startBand,
		endBand,
		(t - transitionStartFraction) / (transitionEndFraction - transitionStartFraction),
	);
}

function cloneBand(band: OffsetBand): OffsetBand {
	return {
		innerOffset: band.innerOffset,
		outerOffset: band.outerOffset,
	};
}

function rightNormal(direction: Point): Point {
	return { x: direction.y, y: -direction.x };
}

function sampleArcBoundarySegments(
	part: ArcCenterlinePart,
	totalLength: number,
	startBand: OffsetBand,
	endBand: OffsetBand,
	transitionStartFraction: number,
	offsetKey: keyof OffsetBand,
	issues: PathGeometryIssue[],
	partIndex: number,
): BoundarySegment[] {
	const sampleCount = Math.max(
		2,
		Math.ceil(Math.abs(part.deltaAngle) / MAX_ARC_SAMPLE_ANGLE_RADIANS),
	);
	const points: Point[] = [];

	for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
		const ratio = sampleIndex / sampleCount;
		const distance = interpolateNumber(part.startDistance, part.endDistance, ratio);
		const band = resolveBandAtDistance(
			distance,
			totalLength,
			startBand,
			endBand,
			transitionStartFraction,
		);

		if (band.outerOffset < band.innerOffset) {
			issues.push({
				code: "invalid-band",
				message: "Band offsets must keep outerOffset greater than or equal to innerOffset.",
				severity: "error",
				segmentIndex: partIndex,
			});
			return [];
		}

		const radius = calculateOffsetArcRadius(part, band[offsetKey]);
		const angle = part.startAngle + part.deltaAngle * ratio;
		appendPoint(points, pointOnCircle(part.center, angle, radius));
	}

	const segments: BoundarySegment[] = [];

	for (let index = 1; index < points.length; index += 1) {
		if (pointsEqual(points[index - 1], points[index])) {
			continue;
		}

		segments.push({ end: points[index], kind: "line", start: points[index - 1] });
	}

	return segments;
}

function scalePoint(point: Point, scalar: number): Point {
	return { x: point.x * scalar, y: point.y * scalar };
}

function subtractPoints(a: Point, b: Point): Point {
	return { x: a.x - b.x, y: a.y - b.y };
}

function vectorLength(point: Point): number {
	return Math.hypot(point.x, point.y);
}
