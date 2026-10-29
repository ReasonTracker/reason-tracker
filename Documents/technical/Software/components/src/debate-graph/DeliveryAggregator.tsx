import { useId } from "react";
import type { Point } from "@reasontracker/engine/geometry/Point.ts";
import type { DeliveryAggregatorGeometry } from "@reasontracker/engine/geometry/resolveDeliveryAggregatorGeometry.ts";
import { DEBATE_GRAPH_COLORS, debateGraphSideColor } from "./visualConstants";

/**
 * Trapezoid summarizing relevance on a claim, with incoming confidence flowing through it.
 * Rendered in separate layers so every pipe shell in the graph sits below every fluid,
 * and the border sits above both.
 */
export function DeliveryAggregator({
	aggregator,
	layer,
}: {
	aggregator: DeliveryAggregatorGeometry
	layer: "shell" | "fluid" | "border"
}) {
	const clipPathId = useId();
	const outline = toPoints(aggregator.points);
	if (layer === "border") {
		return (
			<polygon
				data-geometry-id={aggregator.id}
				fill="none"
				points={outline}
				stroke={DEBATE_GRAPH_COLORS.border}
				strokeLinejoin="round"
				strokeWidth={aggregator.outlineWidth / 2}
			/>
		);
	}

	return (
		<g data-aggregator-layer={layer} data-geometry-id={aggregator.id}>
			<defs>
				<clipPath id={clipPathId}>
					<polygon points={outline} />
				</clipPath>
			</defs>
			{layer === "shell"
				? (
					<>
						<polygon
							clipPath={`url(#${clipPathId})`}
							fill={DEBATE_GRAPH_COLORS.shell}
							points={outline}
							stroke={debateGraphSideColor(aggregator.side)}
							strokeLinejoin="round"
							strokeWidth={aggregator.outlineWidth * 2}
						/>
						<g clipPath={`url(#${clipPathId})`}>
							{aggregator.flows.map((flow) => (
								<FlowShell flow={flow} key={`${flow.id}:shell`} />
							))}
						</g>
					</>
				)
				: (
					<g clipPath={`url(#${clipPathId})`}>
						{aggregator.flows.map((flow) => flow.fluid
							? (
								<polygon
									data-occurrence-id={flow.id}
									fill={debateGraphSideColor(flow.side)}
									key={`${flow.id}:fluid`}
									points={toPoints(flow.fluid)}
								/>
							)
							: null)}
					</g>
				)}
		</g>
	);
}

function FlowShell({ flow }: { flow: DeliveryAggregatorGeometry["flows"][number] }) {
	const clipPathId = useId();
	const points = toPoints(flow.shell);
	return (
		<>
			<defs>
				<clipPath id={clipPathId}>
					<polygon points={points} />
				</clipPath>
			</defs>
			<polygon
				clipPath={`url(#${clipPathId})`}
				data-occurrence-id={flow.id}
				fill={DEBATE_GRAPH_COLORS.shell}
				points={points}
				stroke={debateGraphSideColor(flow.side)}
				strokeLinejoin="round"
				strokeWidth={flow.outlineWidth * 2}
			/>
		</>
	);
}

function toPoints(points: readonly Point[]): string {
	return points.map((point) => `${point.x},${point.y}`).join(" ");
}
