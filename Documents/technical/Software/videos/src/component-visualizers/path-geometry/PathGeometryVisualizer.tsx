import {
	buildPathGeometry,
	type PathGeometryInstruction,
	type PathGeometryInput,
} from "../../../../components/src/index";
import { createElement } from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";

import { pathGeometryBoundariesToClosedSvgPathData } from "./pathGeometryCommandsToSvgPathData";

// AGENT NOTE: Keep tunable numeric preview constants grouped here.
/** Width of the Remotion preview canvas in pixels. */
const CANVAS_WIDTH = 1920;

/** Height of the Remotion preview canvas in pixels. */
const CANVAS_HEIGHT = 1080;

/** Stroke width used for the final geometry outline in the preview. */
const GEOMETRY_OUTLINE_STROKE_WIDTH = 5;

const waypointSchema = z.object({
	x: z.number(),
	y: z.number(),
	radius: z.number().positive().optional(),
});

const instructionEditorSchema = z.object({
	type: z.enum(["offsets", "transition", "extremity"]),
	kind: z.enum(["linear", "open"]).optional(),
	startPositionPercent: z.number().min(0).max(100).optional(),
	lengthPx: z.number().min(0).step(1).optional(),
	collapseOffset: z.number().optional(),
	offsetA: z.number().optional(),
	offsetB: z.number().optional(),
});

export const pathGeometryVisualizerSchema = z.object({
	instructions: z.array(instructionEditorSchema).min(1),
	points: z.array(waypointSchema).min(2),
});

export type PathGeometryVisualizerProps = z.infer<
	typeof pathGeometryVisualizerSchema
>;

export const defaultPathGeometryVisualizerProps: PathGeometryVisualizerProps = {
	instructions: [
		{ type: "extremity", kind: "open" },
		{ type: "offsets", offsetA: -64, offsetB: 64 },
		{
			type: "transition",
			startPositionPercent: 36,
			lengthPx: 180,
			kind: "linear",
		},
		{ type: "offsets", offsetA: -64, offsetB: 24 },
		{ type: "extremity", kind: "linear", lengthPx: 36, collapseOffset: 0 },
	],
	points: [
		{ x: 1600, y: 360 },
		{ x: 1120, y: 360, radius: 120 },
		{ x: 700, y: 780, radius: 120 },
		{ x: 260, y: 780 },
	],
};

export const PathGeometryVisualizer = (
	props: PathGeometryVisualizerProps,
) => {
	const input: PathGeometryInput = {
		points: props.points,
		instructions: props.instructions.map(normalizeInstruction),
	};
	const geometry = buildPathGeometry(input);
	const closedPathData = pathGeometryBoundariesToClosedSvgPathData(
		geometry.boundaryAPathCommands,
		geometry.boundaryBPathCommands,
	);
	const centerlinePathData = buildCenterlineGuidePathData(props.points);

	return createElement(
		AbsoluteFill,
		{
			style: {
				background:
					"radial-gradient(circle at top left, #13203e 0%, #08111f 55%, #050a12 100%)",
				color: "#e2e8f0",
				fontFamily: '"Segoe UI", sans-serif',
			},
		},
		createElement(
			"svg",
			{
				style: { height: "100%", width: "100%" },
				viewBox: `0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`,
			},
			createElement("path", {
				d: centerlinePathData,
				fill: "none",
				opacity: 0.6,
				stroke: "#334155",
				strokeDasharray: "14 10",
				strokeWidth: 4,
			}),
			createElement("path", {
				d: closedPathData,
				fill: "rgba(125, 211, 252, 0.28)",
				stroke: "#e2e8f0",
				strokeLinejoin: "round",
				strokeWidth: GEOMETRY_OUTLINE_STROKE_WIDTH,
			}),
		),
		createElement(
			"div",
			{
				style: {
					backdropFilter: "blur(10px)",
					background: "rgba(8, 15, 28, 0.72)",
					border: "1px solid rgba(148, 163, 184, 0.25)",
					borderRadius: 18,
					left: 64,
					maxWidth: 520,
					padding: "22px 24px",
					position: "absolute",
					top: 56,
				},
			},
			createElement(
				"div",
				{ style: { fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" } },
				"Path Geometry Visualizer",
			),
			createElement(
				"div",
				{ style: { color: "#cbd5e1", fontSize: 28, fontWeight: 700, marginTop: 10 } },
				`${props.instructions.length} instructions, ${props.points.length} waypoints`,
			),
			createElement(
				"div",
				{ style: { color: "#94a3b8", fontSize: 18, lineHeight: 1.45, marginTop: 8 } },
				"This visualizer passes points and instructions directly into buildPathGeometry with no visualizer-side geometry translation.",
			),
			createElement(
				"div",
				{ style: { color: geometry.issues.length === 0 ? "#86efac" : "#fbbf24", fontSize: 16, marginTop: 18 } },
				geometry.issues.length === 0
					? "No geometry issues reported for this input."
					: `Geometry issues: ${geometry.issues.map((issue) => issue.code).join(", ")}`,
			),
		),
	);
};

function buildCenterlineGuidePathData(points: { x: number; y: number }[]): string {
	if (points.length === 0) {
		return "";
	}

	const [start, ...rest] = points;

	return [`M ${start.x} ${start.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(" ");
}

function normalizeInstruction(
	instruction: PathGeometryVisualizerProps["instructions"][number],
): PathGeometryInstruction {
	if (instruction.type === "offsets") {
		return {
			type: "offsets",
			offsetA: instruction.offsetA ?? 0,
			offsetB: instruction.offsetB ?? 0,
		};
	}

	if (instruction.type === "transition") {
		return {
			type: "transition",
			startPositionPercent: instruction.startPositionPercent ?? 0,
			lengthPx: instruction.lengthPx ?? 0,
			kind: "linear",
		};
	}

	if (instruction.kind === "linear") {
		return {
			type: "extremity",
			kind: "linear",
			lengthPx: instruction.lengthPx ?? 0,
			collapseOffset: instruction.collapseOffset ?? 0,
		};
	}

	return {
		type: "extremity",
		kind: "open",
	};
}