import type {
	ClaimFrameState,
	ConfidenceConnectionFrameState,
	Point,
} from "@planner/DebateAnimationPlan.ts";
import { resolveDeliveryAggregatorWidth } from "@planner/buildDebateFrame.ts";
import type { PlannerOptions } from "@planner/contracts.ts";
import { resolveDebateGraphOutlineWidth } from "./visualConstants";

const GEOMETRY_EPSILON = 1e-6;

export type DeliveryAggregatorQuad = [Point, Point, Point, Point];

export type DeliveryAggregatorFlowGeometry = {
	fluid?: DeliveryAggregatorQuad
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
 * `resolveDeliveryAggregatorWidth`. Each incoming confidence connector continues through it,
 * scaled from the children-side edge to the claim-side edge.
 */
export function resolveDeliveryAggregatorGeometry(args: {
	claimBounds: { height: number; width: number; x: number; y: number }
	claimState: ClaimFrameState
	incomingConnections: readonly ConfidenceConnectionFrameState[]
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
	const flowScale = childEdgeHeight <= GEOMETRY_EPSILON
		? 0
		: args.claimBounds.height / childEdgeHeight;
	const toClaimEdge = (y: number) => centerY + ((y - centerY) * flowScale);
	const quad = (top: number, bottom: number): DeliveryAggregatorQuad => [
		{ x: claimEdgeX, y: toClaimEdge(top) },
		{ x: childEdgeX, y: top },
		{ x: childEdgeX, y: bottom },
		{ x: claimEdgeX, y: toClaimEdge(bottom) },
	];

	const flows: DeliveryAggregatorFlowGeometry[] = [];
	for (const connection of args.incomingConnections) {
		const landing = resolveLanding(connection, args.options, centerY);
		if (!landing) {
			continue;
		}
		const shellInterval = anchoredInterval(landing.portY, landing.windowWidth, landing.shellWidth, connection.displaySide);
		const fluidInterval = anchoredInterval(landing.portY, landing.windowWidth, landing.fluidWidth, connection.displaySide);
		flows.push({
			fluid: landing.fluidWidth > GEOMETRY_EPSILON ? quad(...fluidInterval) : undefined,
			id: `${connection.id}:aggregator-flow`,
			outlineWidth: resolveDebateGraphOutlineWidth(connection.deliveryScale),
			shell: quad(...shellInterval),
			side: connection.displaySide,
		});
	}

	return {
		childEdgeX,
		flows,
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

/**
 * Matches the delivery band's cross-section where it meets the children-side edge.
 * Returns nothing while that band has not yet fully arrived.
 */
function resolveLanding(
	connection: ConfidenceConnectionFrameState,
	options: PlannerOptions,
	centerY: number,
): { fluidWidth: number; portY: number; shellWidth: number; windowWidth: number } | undefined {
	if (connection.shellReveal < 1 - GEOMETRY_EPSILON) {
		return undefined;
	}
	const transitions = connection.volumeTransitions;
	const arrived = transitions.every((transition) => transition.progress >= 1 - GEOMETRY_EPSILON);
	const growing = transitions.length === 1
		&& (transitions[0]?.initialValue ?? 0) <= GEOMETRY_EPSILON
		&& (transitions[0]?.finalValue ?? 0) > GEOMETRY_EPSILON;
	if (growing && !arrived) {
		return undefined;
	}
	const fluidValue = transitions.length === 0
		? connection.score
		: arrived
			? transitions[transitions.length - 1]!.finalValue
			: transitions[0]!.initialValue;
	const shellWidth = options.claimHeight * Math.max(0, connection.deliveryTargetScale);

	return {
		fluidWidth: shellWidth * Math.min(1, Math.max(0, fluidValue)),
		portY: centerY + connection.targetSideOffset,
		shellWidth,
		windowWidth: options.claimHeight * Math.max(0, connection.deliveryScale),
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
