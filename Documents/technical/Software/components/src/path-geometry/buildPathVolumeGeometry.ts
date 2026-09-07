import {
	buildPathGeometry,
	resolvePathOffsetPointAtDistance,
	type OffsetSection,
	type PathGeometry,
	type PathGeometryInstruction,
	type Waypoint,
} from "./buildPathGeometry";

const GEOMETRY_EPSILON = 1e-6;

export type PathVolumePlacement = "center" | "negativeEdge" | "positiveEdge";

export type PathVolumeTransition = {
	finalValue: number
	initialValue: number
	progress: number
};

export type PathVolumeGeometryInput = {
	placement: PathVolumePlacement
	points: Waypoint[]
	shellWidth: number
	stableValue: number
	transitions: readonly PathVolumeTransition[]
};

type PositionedTransition = PathVolumeTransition & {
	lengthPx: number
	startPositionPercent: number
};

export function buildPathVolumeGeometry(input: PathVolumeGeometryInput): PathGeometry[] {
	const shellWidth = Math.max(0, input.shellWidth);
	if (shellWidth <= GEOMETRY_EPSILON) {
		return [];
	}

	const routeLength = estimateRouteLength(input.points);
	if (routeLength <= GEOMETRY_EPSILON) {
		return [];
	}

	const transitions = input.transitions
		.filter((transition) => Math.abs(transition.initialValue - transition.finalValue) > GEOMETRY_EPSILON)
		.map((transition) => positionTransition(transition, routeLength, shellWidth))
		.sort((left, right) => left.startPositionPercent - right.startPositionPercent);
	if (transitions.length === 0) {
		const value = clamp01(input.stableValue);
		if (value <= GEOMETRY_EPSILON) {
			return [];
		}

		return [buildPathGeometry({
			instructions: [
				{ kind: "open", startPositionPercent: 0, type: "extremity" },
				{ ...resolveOffsets(value, shellWidth, input.placement), type: "offsets" },
				{ kind: "open", startPositionPercent: 100, type: "extremity" },
			],
			points: input.points,
		})];
	}

	const geometries: PathGeometry[] = [];
	let instructions: PathGeometryInstruction[] | undefined;

	for (const transition of transitions) {
		const initialValue = clamp01(transition.initialValue);
		const finalValue = clamp01(transition.finalValue);
		const initialVisible = initialValue > GEOMETRY_EPSILON;
		const finalVisible = finalValue > GEOMETRY_EPSILON;

		if (!finalVisible && initialVisible) {
			const initialOffsets = resolveOffsets(initialValue, shellWidth, input.placement);
			const collapseOffset = resolveLowerCollapseOffset(
				input.points,
				(transition.startPositionPercent / 100) * routeLength,
				initialOffsets,
			);
			instructions = [
				{
					allowOverflow: true,
					collapseOffset,
					kind: "curved",
					lengthPx: transition.lengthPx,
					startPositionPercent: transition.startPositionPercent,
					type: "extremity",
				},
				{ ...initialOffsets, type: "offsets" },
			];
			continue;
		}

		if (finalVisible && !initialVisible) {
			const finalOffsets = resolveOffsets(finalValue, shellWidth, input.placement);
			const collapseOffset = resolveLowerCollapseOffset(
				input.points,
				((transition.startPositionPercent / 100) * routeLength) + transition.lengthPx,
				finalOffsets,
			);
			instructions ??= [
				{ kind: "open", startPositionPercent: 0, type: "extremity" },
				{ ...finalOffsets, type: "offsets" },
			];
			instructions.push({
				allowOverflow: true,
				collapseOffset,
				kind: "curved",
				lengthPx: transition.lengthPx,
				startPositionPercent: transition.startPositionPercent,
				type: "extremity",
			});
			geometries.push(buildPathGeometry({ instructions, points: input.points }));
			instructions = undefined;
			continue;
		}

		if (!finalVisible && !initialVisible) {
			continue;
		}

		instructions ??= [
			{ kind: "open", startPositionPercent: 0, type: "extremity" },
			{ ...resolveOffsets(finalValue, shellWidth, input.placement), type: "offsets" },
		];
		instructions.push({
			allowOverflow: true,
			kind: "curved",
			lengthPx: transition.lengthPx,
			startPositionPercent: transition.startPositionPercent,
			type: "transition",
		});
		instructions.push({
			...resolveOffsets(initialValue, shellWidth, input.placement),
			type: "offsets",
		});
	}

	if (instructions) {
		instructions.push({ kind: "open", startPositionPercent: 100, type: "extremity" });
		geometries.push(buildPathGeometry({ instructions, points: input.points }));
	}

	return geometries.filter(
		(geometry) => geometry.boundaryAPathCommands.length > 0 && geometry.boundaryBPathCommands.length > 0,
	);
}

function positionTransition(
	transition: PathVolumeTransition,
	routeLength: number,
	transitionLength: number,
): PositionedTransition {
	const frontierDistance = clamp01(transition.progress) * (routeLength + transitionLength);
	return {
		...transition,
		lengthPx: transitionLength,
		startPositionPercent: ((frontierDistance - transitionLength) / routeLength) * 100,
	};
}

function resolveOffsets(
	value: number,
	shellWidth: number,
	placement: PathVolumePlacement,
): OffsetSection {
	const width = shellWidth * clamp01(value);
	if (placement === "center") {
		return { offsetA: width / 2, offsetB: -(width / 2) };
	}

	const collapseOffset = resolveCollapseOffset(shellWidth, placement);
	return placement === "negativeEdge"
		? { offsetA: collapseOffset, offsetB: collapseOffset + width }
		: { offsetA: collapseOffset, offsetB: collapseOffset - width };
}

function resolveCollapseOffset(
	shellWidth: number,
	placement: PathVolumePlacement,
): number {
	if (placement === "center") {
		return 0;
	}

	return placement === "negativeEdge" ? -(shellWidth / 2) : shellWidth / 2;
}

function resolveLowerCollapseOffset(
	points: Waypoint[],
	distance: number,
	offsets: OffsetSection,
): number {
	const pointA = resolvePathOffsetPointAtDistance(points, distance, offsets.offsetA);
	const pointB = resolvePathOffsetPointAtDistance(points, distance, offsets.offsetB);
	if (!pointA || !pointB) {
		return offsets.offsetB;
	}

	return pointA.y >= pointB.y
		? offsets.offsetA
		: offsets.offsetB;
}

function estimateRouteLength(points: Waypoint[]): number {
	let length = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];
		if (previous && current) {
			length += Math.hypot(current.x - previous.x, current.y - previous.y);
		}
	}
	return length;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}