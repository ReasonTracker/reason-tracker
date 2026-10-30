import { useId } from "react";
import type { SceneBandGeometry } from "@reasontracker/engine/scene-geometry/resolveDebateSceneGeometry.ts";
import {
	pathGeometryBoundariesToClosedSvgPathData,
	pathGeometryCommandsToSvgPathData,
} from "./pathGeometrySvg";
import { DEBATE_GRAPH_COLORS, debateGraphSideColor } from "./visualConstants";

/** Fluid border width as a fraction of the pipe's outline width. */
const FLUID_BORDER_WIDTH_RATIO = 0.5;

/**
 * Draws one connector pipe, one layer at a time so every shell in the graph can sit
 * below every fluid.
 */
export function Pipe({
	band,
	fluidBorder = false,
	layer,
}: {
	band: SceneBandGeometry
	/** Outline the fluid's two long sides only, leaving its start and end edges open. */
	fluidBorder?: boolean
	layer: "shell" | "fluid"
}) {
	const clipPathId = useId();
	const regions = layer === "shell" ? band.shell : band.fluid;
	const pathData = regions
		.map((region) => pathGeometryBoundariesToClosedSvgPathData(region.boundaryA, region.boundaryB))
		.filter((regionPathData) => regionPathData.length > 0)
		.join(" ");
	if (!pathData) {
		return null;
	}

	const color = debateGraphSideColor(band.side);
	const groupAttributes = {
		"data-band-layer": layer,
		"data-geometry-issues": band.diagnosticIssues.map((issue) => issue.code).join(" ") || undefined,
		"data-kind": band.kind,
		"data-occurrence-id": band.id,
	};

	if (layer === "shell") {
		return (
			<g {...groupAttributes}>
				<defs>
					<clipPath id={clipPathId}>
						<path d={pathData} />
					</clipPath>
				</defs>
				<path
					clipPath={`url(#${clipPathId})`}
					d={pathData}
					fill={DEBATE_GRAPH_COLORS.shell}
					stroke={color}
					strokeWidth={band.outlineWidth * 2}
				/>
			</g>
		);
	}

	const sidesPathData = fluidBorder
		? regions
			.flatMap((region) => [region.boundaryA, region.boundaryB])
			.map(pathGeometryCommandsToSvgPathData)
			.filter((sidePathData) => sidePathData.length > 0)
			.join(" ")
		: "";
	return (
		<g {...groupAttributes}>
			<path d={pathData} fill={color} />
			{sidesPathData
				? (
					<path
						d={sidesPathData}
						fill="none"
						stroke={DEBATE_GRAPH_COLORS.border}
						strokeLinejoin="round"
						strokeWidth={band.outlineWidth * FLUID_BORDER_WIDTH_RATIO}
					/>
				)
				: null}
		</g>
	);
}
