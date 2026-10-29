import type {
	ClaimFrameState,
	ConfidenceConnectionFrameState,
	ConnectorVolumeTransition,
} from "../animation/DebateAnimationPlan.ts";
import type { Point } from "./Point.ts";
import { resolveDeliveryAggregatorWidth } from "../layout/buildDebateFrame.ts";
import type { PlannerOptions } from "../animation/contracts.ts";
import { buildPathVolumeGeometry } from "./path-geometry/buildPathVolumeGeometry.ts";
import type {
	PathGeometry,
	PathGeometryCommand,
} from "./path-geometry/buildPathGeometry.ts";
import { resolveDebateGraphOutlineWidth } from "./debateGraphOutline.ts";

const GEOMETRY_EPSILON = 1e-6;

export type DeliveryAggregatorQuad = [Point, Point, Point, Point];

export type DeliveryAggregatorFlowGeometry = {
	fluid: PathGeometry[]
	id: string
	outlineWidth: number
	shell: DeliveryAggregatorQuad
	side: "proMain" | "conMain"
};

export type DeliveryAggregatorGeometry = {
	/** Children-side edge x, where incoming confidence connectors land. */
	childEdgeX: number
	flows: DeliveryAggregatorFlowGeometry[]
	id: string
	outlineWidth: number
	/** Claim-top, children-top, children-bottom, claim-bottom. */
	points: DeliveryAggregatorQuad
	side: "proMain" | "conMain"
	width: number
};

/**
 * Builds the trapezoid on a claim's children-facing side. Its claim-side edge matches the
 * claim box, its children-side edge matches the claim's base scale, and its width comes from
 * `resolveDeliveryAggregatorWidth`. Incoming confidence connectors continue through it,
 * scaled from the children-side edge to the claim-side edge.
 */
export function resolveDeliveryAggregatorGeometry(args: {
	claimBounds: { height: number; width: number; x: number; y: number }
	claimState: ClaimFrameState
	options: PlannerOptions
	relevanceScales: readonly number[]
}): DeliveryAggregatorGeometry | undefined {
	const relevanceWidth = args.options.claimHeight * args.relevanceScales.reduce(
		(sum, scale) => sum + Math.max(0, scale),
		0,
	);
	if (relevanceWidth <= GEOMETRY_EPSILON) {
		return undefined;
	}

	const childEdgeHeight = args.options.claimHeight * Math.max(0, args.claimState.sourcesScale);
	const width = resolveDeliveryAggregatorWidth({
		childEdgeHeight,
		claimEdgeHeight: args.claimBounds.height,
		relevanceWidth,
	});
	const claimEdgeX = args.claimBounds.x + args.claimBounds.width;
	const childEdgeX = claimEdgeX + width;
	const centerY = args.claimBounds.y + (args.claimBounds.height / 2);

	return {
		childEdgeX,
		flows: [],
		id: `delivery-aggregator:${args.claimState.id}`,
		outlineWidth: resolveDebateGraphOutlineWidth(Math.max(
			args.claimState.scale,
			args.claimState.sourcesScale,
			...args.relevanceScales,
		)),
		points: [
			{ x: claimEdgeX, y: args.claimBounds.y },
			{ x: childEdgeX, y: centerY - (childEdgeHeight / 2) },
			{ x: childEdgeX, y: centerY + (childEdgeHeight / 2) },
			{ x: claimEdgeX, y: args.claimBounds.y + args.claimBounds.height },
		],
		side: args.claimState.displaySide,
		width,
	};
}

export function resolveDeliveryAggregatorFlowGeometry(args: {
	aggregator: DeliveryAggregatorGeometry
	connection: ConfidenceConnectionFrameState
	options: PlannerOptions
	transitionLengthPx: number
	volumeTransitions: ConnectorVolumeTransition[]
}): DeliveryAggregatorFlowGeometry | undefined {
	if (args.connection.shellReveal < 1 - GEOMETRY_EPSILON || args.aggregator.width <= GEOMETRY_EPSILON) {
		return undefined;
	}

	const centerY = (args.aggregator.points[1].y + args.aggregator.points[2].y) / 2;
	const childHeight = args.aggregator.points[2].y - args.aggregator.points[1].y;
	const claimHeight = args.aggregator.points[3].y - args.aggregator.points[0].y;
	const flowScale = childHeight <= GEOMETRY_EPSILON ? 0 : claimHeight / childHeight;
	const portY = centerY + args.connection.targetSideOffset;
	const windowWidth = args.options.claimHeight * Math.max(0, args.connection.deliveryScale);
	const shellWidth = args.options.claimHeight * Math.max(0, args.connection.deliveryTargetScale);
	const shellInterval = anchoredInterval(portY, windowWidth, shellWidth, args.connection.displaySide);
	const warpCommand = (command: PathGeometryCommand): PathGeometryCommand => {
		if (command.kind === "arc") {
			throw new Error("Delivery aggregator volume must use a straight reference path.");
		}
		const progress = (args.aggregator.childEdgeX - command.x) / args.aggregator.width;
		const scale = 1 + ((flowScale - 1) * progress);
		return { ...command, y: centerY + ((command.y - centerY) * scale) };
	};
	// Fluid entering from the delivery pipe matches its outlet, which tapers to `deliveryTargetScale`.
	const outletRatio = windowWidth <= GEOMETRY_EPSILON ? 0 : shellWidth / windowWidth;
	const fluid = buildPathVolumeGeometry({
		placement: args.connection.displaySide === "proMain" ? "negativeEdge" : "positiveEdge",
		points: [
			{ x: args.aggregator.childEdgeX, y: portY },
			{ x: args.aggregator.points[0].x, y: portY },
		],
		shellWidth: windowWidth,
		stableValue: args.connection.aggregatorScore * outletRatio,
		transitionLengthPx: args.transitionLengthPx,
		transitions: args.volumeTransitions.map((transition) => ({
			...transition,
			finalValue: transition.finalValue * outletRatio,
			initialValue: transition.initialValue * outletRatio,
		})),
	}).map((region) => ({
		...region,
		boundaryAPathCommands: region.boundaryAPathCommands.map(warpCommand),
		boundaryBPathCommands: region.boundaryBPathCommands.map(warpCommand),
	}));

	const [top, bottom] = shellInterval;
	return {
		fluid,
		id: `${args.connection.id}:aggregator-flow`,
		outlineWidth: resolveDebateGraphOutlineWidth(args.connection.deliveryScale),
		shell: [
			{ x: args.aggregator.points[0].x, y: centerY + ((top - centerY) * flowScale) },
			{ x: args.aggregator.childEdgeX, y: top },
			{ x: args.aggregator.childEdgeX, y: bottom },
			{ x: args.aggregator.points[0].x, y: centerY + ((bottom - centerY) * flowScale) },
		],
		side: args.connection.displaySide,
	};
}

/** Pro-main content hugs the bottom of the delivery window and con-main content hugs the top. */
function anchoredInterval(
	portY: number,
	windowWidth: number,
	width: number,
	side: "proMain" | "conMain",
): [number, number] {
	return side === "proMain"
		? [portY + (windowWidth / 2) - width, portY + (windowWidth / 2)]
		: [portY - (windowWidth / 2), portY - (windowWidth / 2) + width];
}
