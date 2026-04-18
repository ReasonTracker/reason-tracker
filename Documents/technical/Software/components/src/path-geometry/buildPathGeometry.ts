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
 * Offsets are measured perpendicular to the centerline direction.
 *
 * Convention:
 * - negative = left side of path
 * - positive = right side of path
 */
export interface OffsetBand {
	/**
	 * Inner boundary offset from centerline.
	 *
	 * Example:
	 * - -5 means 5 units to the left
	 * - +4 means 4 units to the right
	 */
	innerOffset: number;

	/**
	 * Outer boundary offset from centerline.
	 *
	 * Must be >= innerOffset.
	 */
	outerOffset: number;
}

/**
 * Band profile across the path.
 *
 * Allows the band to change over distance (taper, shift, etc).
 *
 * `t` is normalized distance along the path, from 0 at the start to 1 at the end.
 */
export type BandProfile = (t: number) => OffsetBand;

//#endregion

//#region Builder input

/**
 * Input to the geometry builder.
 */
export interface PathGeometryInput {
	/**
	 * Centerline path.
	 *
	 * Must contain at least two ordered waypoints.
	 */
	points: Waypoint[];

	/**
	 * Defines how the band is positioned relative to the centerline.
	 *
	 * This replaces "side" and "width" concepts.
	 *
	 * Examples:
	 * - centered pipe: [-w/2, +w/2]
	 * - fluid on one side: [4, 5]
	 * - multi-fluid segments: different ranges
	 */
	band: BandProfile;

	/**
	 * Progress along path (for animation).
	 *
	 * Range:
	 * - 0 = nothing
	 * - 1 = full path
	 *
	 * Geometry should be truncated accordingly.
	 */
	progress: number;
}

//#endregion

//#region Geometry output

/**
 * Structured path commands (SVG-compatible).
 *
 * These map directly to SVG path instructions, but are explicit and typed.
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
	  }
	| { kind: "closePath" };

/** Supported diagnostic codes emitted while building path geometry. */
export type PathGeometryIssueCode =
	| "insufficient-points"
	| "progress-out-of-range"
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
 * Represents a closed shape that can be filled by a renderer.
 */
export interface PathGeometry {
	/** Closed shape commands in renderer-agnostic path order. */
	commands: PathGeometryCommand[];

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

interface SamplePoint extends Point {
	distance: number;
}

/**
 * Build path geometry for a band along a centerline.
 *
 * The implementation must:
 * - walk the centerline path
 * - compute normals at each segment
 * - offset points using band profile
 * - construct left and right boundaries
 * - join boundaries correctly (line or arc)
 * - close the shape
 *
 * Output must represent a valid closed path.
 *
 * This function does NOT:
 * - render anything
 * - validate layout correctness
 *
 * @param input Builder inputs for the centerline path, band profile, and reveal progress.
 * The builder should prefer returning geometry plus diagnostics over failing silently.
 * Clamped radii and adjusted progress should surface as warnings.
 * Invalid or collapsed geometry should surface as errors.
 *
 * @returns Closed path geometry commands plus diagnostics for the currently revealed portion of the path.
 */
export function buildPathGeometry(
	input: PathGeometryInput,
): PathGeometry {
	const issues: PathGeometryIssue[] = [];
	const progress = clampProgress(input.progress, issues);
	const points = removeDegenerateWaypoints(input.points, issues);

	if (points.length < 2) {
		issues.push({
			code: "insufficient-points",
			message: "Path geometry requires at least two distinct waypoints.",
			severity: "error",
		});

		return { commands: [], issues };
	}

	const corners = buildFilletCorners(points, issues);
	const centerline = buildCenterlineParts(points, corners);

	if (centerline.length === 0) {
		issues.push({
			code: "geometry-collapsed",
			message: "Centerline collapsed before geometry could be constructed.",
			severity: "error",
		});

		return { commands: [], issues };
	}

	const totalLength = centerline.at(-1)?.endDistance ?? 0;

	if (totalLength <= GEOMETRY_EPSILON || progress <= GEOMETRY_EPSILON) {
		return { commands: [], issues };
	}

	const revealedCenterline = clipCenterlinePartsByProgress(centerline, totalLength * progress);

	if (revealedCenterline.length === 0) {
		return { commands: [], issues };
	}

	const outerBoundary = buildBoundarySegments(
		revealedCenterline,
		totalLength,
		input.band,
		"outerOffset",
		issues,
	);
	const hasOuterBandError = issues.some(
		(issue) => issue.severity === "error" && issue.code === "invalid-band",
	);

	if (hasOuterBandError) {
		return { commands: [], issues };
	}

	const innerBoundary = buildBoundarySegments(
		revealedCenterline,
		totalLength,
		input.band,
		"innerOffset",
		issues,
	);
	const hasInnerBandError = issues.some(
		(issue) => issue.severity === "error" && issue.code === "invalid-band",
	);

	if (hasInnerBandError) {
		return { commands: [], issues };
	}

	if (outerBoundary.length === 0 || innerBoundary.length === 0) {
		issues.push({
			code: "geometry-collapsed",
			message: "Offset geometry collapsed before a closed path could be constructed.",
			severity: "error",
		});

		return { commands: [], issues };
	}

	const commands = buildClosedPathCommands(outerBoundary, innerBoundary);

	if (commands.length === 0) {
		issues.push({
			code: "geometry-collapsed",
			message: "No drawable path commands could be produced.",
			severity: "error",
		});
	}

	return { commands, issues };
}

function addPoints(a: Point, b: Point): Point {
	return { x: a.x + b.x, y: a.y + b.y };
}

function buildBoundarySegments(
	centerline: CenterlinePart[],
	totalLength: number,
	bandProfile: BandProfile,
	offsetKey: keyof OffsetBand,
	issues: PathGeometryIssue[],
): BoundarySegment[] {
	const boundary: BoundarySegment[] = [];

	for (let partIndex = 0; partIndex < centerline.length; partIndex += 1) {
		const part = centerline[partIndex];
		const bandStart = readBandAtDistance(part.startDistance, totalLength, bandProfile, issues, partIndex);

		if (!bandStart) {
			return [];
		}

		const bandEnd = readBandAtDistance(part.endDistance, totalLength, bandProfile, issues, partIndex);

		if (!bandEnd) {
			return [];
		}

		const segments =
			part.kind === "line"
				? buildLineBoundarySegments(part, bandStart, bandEnd, offsetKey)
				: buildArcBoundarySegments(part, totalLength, bandProfile, offsetKey, bandStart, bandEnd, issues, partIndex);

		for (const segment of segments) {
			appendBoundarySegment(boundary, segment);
		}
	}

	return boundary;
}

function buildArcBoundarySegments(
	part: ArcCenterlinePart,
	totalLength: number,
	bandProfile: BandProfile,
	offsetKey: keyof OffsetBand,
	bandStart: OffsetBand,
	bandEnd: OffsetBand,
	issues: PathGeometryIssue[],
	partIndex: number,
): BoundarySegment[] {
	const midpointDistance = interpolateNumber(part.startDistance, part.endDistance, 0.5);
	const bandMiddle = readBandAtDistance(midpointDistance, totalLength, bandProfile, issues, partIndex);

	if (!bandMiddle) {
		return [];
	}

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

	return sampleArcBoundarySegments(part, totalLength, bandProfile, offsetKey, issues, partIndex);
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

function buildClosedPathCommands(
	outerBoundary: BoundarySegment[],
	innerBoundary: BoundarySegment[],
): PathGeometryCommand[] {
	if (outerBoundary.length === 0 || innerBoundary.length === 0) {
		return [];
	}

	const boundary = [...outerBoundary, ...reverseBoundarySegments(innerBoundary)];
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

	commands.push({ kind: "closePath" });

	return commands;
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

function clipCenterlinePartsByProgress(
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
function clampProgress(progress: number, issues: PathGeometryIssue[]): number {
	const clampedProgress = clampNumber(progress, 0, 1);

	if (clampedProgress !== progress) {
		issues.push({
			code: "progress-out-of-range",
			message: "Progress was clamped into the supported range of 0 to 1.",
			severity: "warning",
		});
	}

	return clampedProgress;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
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

function calculateOffsetArcRadius(part: ArcCenterlinePart, offset: number): number {
	const curvatureDirection = part.deltaAngle >= 0 ? 1 : -1;

	return part.radius + curvatureDirection * offset;
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

function pointsEqual(a: Point, b: Point): boolean {
	return Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;
}

function pointOnCircle(center: Point, angle: number, radius: number): Point {
	return {
		x: center.x + Math.cos(angle) * radius,
		y: center.y + Math.sin(angle) * radius,
	};
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
				message: "A zero-length segment was ignored while building the centerline.",
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

function rightNormal(direction: Point): Point {
	return { x: direction.y, y: -direction.x };
}

function offsetsCanUseExactArc(start: number, middle: number, end: number): boolean {
	return (
		Math.abs(start - middle) <= OFFSET_ARC_EPSILON &&
		Math.abs(middle - end) <= OFFSET_ARC_EPSILON &&
		Math.abs(start - end) <= OFFSET_ARC_EPSILON
	);
}

function readBandAtDistance(
	distance: number,
	totalLength: number,
	bandProfile: BandProfile,
	issues: PathGeometryIssue[],
	partIndex: number,
): OffsetBand | null {
	const t = totalLength <= GEOMETRY_EPSILON ? 0 : clampNumber(distance / totalLength, 0, 1);
	const band = bandProfile(t);

	if (band.outerOffset < band.innerOffset) {
		issues.push({
			code: "invalid-band",
			message: "Band profile returned an outer offset that is smaller than the inner offset.",
			severity: "error",
			segmentIndex: partIndex,
		});
		return null;
	}

	return band;
}

function reverseBoundarySegment(segment: BoundarySegment): BoundarySegment {
	if (segment.kind === "line") {
		return { end: segment.start, kind: "line", start: segment.end };
	}

	return {
		end: segment.start,
		kind: "arc",
		largeArc: segment.largeArc,
		radius: segment.radius,
		start: segment.end,
		sweep: !segment.sweep,
	};
}

function reverseBoundarySegments(segments: BoundarySegment[]): BoundarySegment[] {
	return [...segments].reverse().map(reverseBoundarySegment);
}

function sampleArcBoundarySegments(
	part: ArcCenterlinePart,
	totalLength: number,
	bandProfile: BandProfile,
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
		const band = readBandAtDistance(distance, totalLength, bandProfile, issues, partIndex);

		if (!band) {
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

function appendPoint(points: Point[], point: Point): void {
	const previous = points.at(-1);

	if (!previous || !pointsEqual(previous, point)) {
		points.push(clonePoint(point));
	}
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