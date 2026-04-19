import {
	buildPathGeometry,
	type PathGeometryInstruction,
	type PathGeometryInput,
} from "../../../../components/src/index";
import { createElement } from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";

import {
	pathGeometryBoundariesToClosedSvgPathData,
	pathGeometryCommandsToSvgPathData,
} from "./pathGeometryCommandsToSvgPathData";

// AGENT NOTE: Keep tunable numeric preview constants grouped here.
/** Width of the Remotion preview canvas in pixels. */
const CANVAS_WIDTH = 1920;

/** Height of the Remotion preview canvas in pixels. */
const CANVAS_HEIGHT = 1080;

/** Stroke width used for the two open boundary outlines in the preview. */
const GEOMETRY_OUTLINE_STROKE_WIDTH = 5;

const VISUALIZER_POINTS = [
	{ x: 1600, y: 360 },
	{ x: 1120, y: 360, radius: 120 },
	{ x: 700, y: 780, radius: 120 },
	{ x: 260, y: 780 },
] satisfies Array<{ x: number; y: number; radius?: number }>;

const pipeWidthSchema = z.number().min(1).step(1);

const offsetsSectionSchema = z.object({
	type: z.literal("offsets"),
	offsetA: z.number(),
	offsetB: z.number(),
});

const linearExtremitySchema = z.object({
	kind: z.literal("linear"),
	lengthPx: z.number().min(0).step(1),
	collapseOffset: z.number(),
});

const openExtremitySchema = z.object({
	kind: z.literal("open"),
});

const extremityEditorSchema = z.discriminatedUnion("kind", [
	openExtremitySchema,
	linearExtremitySchema,
]);

const transitionStepSchema = z.object({
	type: z.literal("transition"),
	startPositionPercent: z.number().min(0).max(100),
	lengthPx: z.number().min(0).step(1),
	kind: z.enum(["linear"]),
});

export const pathGeometryVisualizerSchema = z.object({
	pipeWidth: pipeWidthSchema,
	fluidLeadingExtremity: extremityEditorSchema,
	fluidSections: z.array(
		z.discriminatedUnion("type", [offsetsSectionSchema, transitionStepSchema]),
	).min(1),
	fluidTrailingExtremity: extremityEditorSchema,
});

export type PathGeometryVisualizerProps = z.infer<
	typeof pathGeometryVisualizerSchema
>;

export const PathGeometryVisualizer = (
	props: PathGeometryVisualizerProps,
) => {
	const pipeInput: PathGeometryInput = {
		points: VISUALIZER_POINTS,
		instructions: [
			{ type: "extremity", kind: "open" },
			{
				type: "offsets",
				offsetA: -props.pipeWidth / 2,
				offsetB: props.pipeWidth / 2,
			},
			{ type: "extremity", kind: "open" },
		],
	};
	const fluidInput: PathGeometryInput = {
		points: VISUALIZER_POINTS,
		instructions: normalizeFluidInstructions(props),
	};
	const pipeGeometry = buildPathGeometry(pipeInput);
	const fluidGeometry = buildPathGeometry(fluidInput);
	const pipeBoundaryAPathData = pathGeometryCommandsToSvgPathData(
		pipeGeometry.boundaryAPathCommands,
	);
	const pipeBoundaryBPathData = pathGeometryCommandsToSvgPathData(
		pipeGeometry.boundaryBPathCommands,
	);
	const pipeClosedPathData = pathGeometryBoundariesToClosedSvgPathData(
		pipeGeometry.boundaryAPathCommands,
		pipeGeometry.boundaryBPathCommands,
	);
	const fluidBoundaryAPathData = pathGeometryCommandsToSvgPathData(
		fluidGeometry.boundaryAPathCommands,
	);
	const fluidBoundaryBPathData = pathGeometryCommandsToSvgPathData(
		fluidGeometry.boundaryBPathCommands,
	);
	const fluidClosedPathData = pathGeometryBoundariesToClosedSvgPathData(
		fluidGeometry.boundaryAPathCommands,
		fluidGeometry.boundaryBPathCommands,
	);
	const centerlinePathData = buildCenterlineGuidePathData(VISUALIZER_POINTS);

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
				d: pipeClosedPathData,
				fill: "rgba(148, 163, 184, 0.18)",
				stroke: "none",
			}),
			createElement("path", {
				d: pipeBoundaryAPathData,
				fill: "none",
				stroke: "#e2e8f0",
				strokeLinecap: "butt",
				strokeLinejoin: "round",
				strokeWidth: GEOMETRY_OUTLINE_STROKE_WIDTH,
			}),
			createElement("path", {
				d: pipeBoundaryBPathData,
				fill: "none",
				stroke: "#e2e8f0",
				strokeLinecap: "butt",
				strokeLinejoin: "round",
				strokeWidth: GEOMETRY_OUTLINE_STROKE_WIDTH,
			}),
			createElement("path", {
				d: fluidClosedPathData,
				fill: "rgba(125, 211, 252, 0.52)",
				stroke: "none",
			}),
			createElement("path", {
				d: fluidBoundaryAPathData,
				fill: "none",
				stroke: "#7dd3fc",
				strokeLinecap: "butt",
				strokeLinejoin: "round",
				strokeWidth: GEOMETRY_OUTLINE_STROKE_WIDTH - 1,
			}),
			createElement("path", {
				d: fluidBoundaryBPathData,
				fill: "none",
				stroke: "#7dd3fc",
				strokeLinecap: "butt",
				strokeLinejoin: "round",
				strokeWidth: GEOMETRY_OUTLINE_STROKE_WIDTH - 1,
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
				`${fluidInput.instructions.length} fluid instructions, ${VISUALIZER_POINTS.length} fixed path waypoints`,
			),
			createElement(
				"div",
				{ style: { color: "#94a3b8", fontSize: 18, lineHeight: 1.45, marginTop: 8 } },
				"This visualizer uses one fixed routed path, one width control for the pipe shell, and separate start-to-end controls for the fluid inside it.",
			),
			createElement(
				"div",
				{ style: { color: pipeGeometry.issues.length + fluidGeometry.issues.length === 0 ? "#86efac" : "#fbbf24", fontSize: 16, marginTop: 18 } },
				pipeGeometry.issues.length + fluidGeometry.issues.length === 0
					? "No geometry issues reported for the pipe or fluid."
					: `Geometry issues: ${[...pipeGeometry.issues, ...fluidGeometry.issues].map((issue) => issue.code).join(", ")}`,
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

function normalizeFluidInstructions(
	props: PathGeometryVisualizerProps,
): PathGeometryInstruction[] {
	const instructions: PathGeometryInstruction[] = [
		normalizeExtremityInstruction(props.fluidLeadingExtremity),
	];

	for (const section of props.fluidSections) {
		if (section.type === "offsets") {
			instructions.push({
				type: "offsets",
				offsetA: section.offsetA,
				offsetB: section.offsetB,
			});
			continue;
		}

		instructions.push({
			type: "transition",
			startPositionPercent: section.startPositionPercent,
			lengthPx: section.lengthPx,
			kind: "linear",
		});
	}

	instructions.push(normalizeExtremityInstruction(props.fluidTrailingExtremity));

	return instructions;
}

function normalizeExtremityInstruction(
	extremity: PathGeometryVisualizerProps["fluidLeadingExtremity"],
): PathGeometryInstruction {
	if (extremity.kind === "linear") {
		return {
			type: "extremity",
			kind: "linear",
			lengthPx: extremity.lengthPx,
			collapseOffset: extremity.collapseOffset,
		};
	}

	return { type: "extremity", kind: "open" };
}