import {
	buildPathGeometry,
	type PathGeometry,
	type PathGeometryInput,
} from "../../../../components/src/index";
import { createElement } from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";

import { pathGeometryCommandsToSvgPathData } from "./pathGeometryCommandsToSvgPathData";

// AGENT NOTE: Keep tunable numeric preview constants grouped here.
/** Width of the Remotion preview canvas in pixels. */
const CANVAS_WIDTH = 1920;

/** Height of the Remotion preview canvas in pixels. */
const CANVAS_HEIGHT = 1080;

/** Stroke width used when drawing the centerline guide. */
const CENTERLINE_STROKE_WIDTH = 4;

/** Stroke width used for the pipe outline in the preview. */
const PIPE_OUTLINE_STROKE_WIDTH = 5;

/** Stroke width used for the fluid outline in the preview. */
const FLUID_OUTLINE_STROKE_WIDTH = 4;

const waypointSchema = z.object({
	x: z.number(),
	y: z.number(),
	radius: z.number().positive().optional(),
});

export const pathGeometryVisualizerSchema = z.object({
	fluidAnchor: z.enum(["top", "bottom"]),
	fluidEndFillPercent: z.number().min(0).max(100).step(1),
	fluidProgressPercent: z.number().min(0).max(100).step(1),
	fluidStartFillPercent: z.number().min(0).max(100).step(1),
	pipeEndWidth: z.number().positive(),
	pipeProgressPercent: z.number().min(0).max(100).step(1),
	pipeStartWidth: z.number().positive(),
	waypoints: z.array(waypointSchema).min(2),
});

export type PathGeometryVisualizerProps = z.infer<
	typeof pathGeometryVisualizerSchema
>;

export const defaultPathGeometryVisualizerProps: PathGeometryVisualizerProps = {
	fluidAnchor: "top",
	fluidEndFillPercent: 35,
	fluidProgressPercent: 75,
	fluidStartFillPercent: 35,
	pipeEndWidth: 60,
	pipeProgressPercent: 50,
	pipeStartWidth: 60,
	waypoints: [
		{ x: 1600, y: 360 },
		{ x: 1120, y: 360, radius: 120 },
		{ x: 700, y: 780, radius: 120 },
		{ x: 260, y: 780 },
	],
};

export const PathGeometryVisualizer = (
	props: PathGeometryVisualizerProps,
) => {
	const pipeProgress = props.pipeProgressPercent / 100;
	const fluidProgress = props.fluidProgressPercent / 100;

	const pipeInput: PathGeometryInput = {
		band: (t) => {
			const pipeWidth = interpolateNumber(props.pipeStartWidth, props.pipeEndWidth, t);
			const pipeHalfWidth = pipeWidth / 2;

			return {
				innerOffset: -pipeHalfWidth,
				outerOffset: pipeHalfWidth,
			};
		},
		points: props.waypoints,
		progress: pipeProgress,
	};

	const fluidInput: PathGeometryInput = {
		band: (t) => {
			const pipeWidth = interpolateNumber(props.pipeStartWidth, props.pipeEndWidth, t);
			const pipeHalfWidth = pipeWidth / 2;
			const fluidFillPercent = interpolateNumber(
				props.fluidStartFillPercent,
				props.fluidEndFillPercent,
				t,
			);
			const fluidWidth = pipeWidth * (fluidFillPercent / 100);

			return props.fluidAnchor === "top"
				? {
					innerOffset: -pipeHalfWidth,
					outerOffset: -pipeHalfWidth + fluidWidth,
				}
				: {
					innerOffset: pipeHalfWidth - fluidWidth,
					outerOffset: pipeHalfWidth,
				};
		},
		points: props.waypoints,
		progress: fluidProgress,
	};

	const pipeGeometry = buildPathGeometry(pipeInput);
	const fluidGeometry = buildPathGeometry(fluidInput);
	const pipePathData = pathGeometryCommandsToSvgPathData(pipeGeometry.commands);
	const fluidPathData = pathGeometryCommandsToSvgPathData(fluidGeometry.commands);
	const allIssues = [...pipeGeometry.issues, ...fluidGeometry.issues];
	const centerlinePathData = buildCenterlineGuidePathData(props.waypoints);

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
				strokeWidth: CENTERLINE_STROKE_WIDTH,
			}),
			createElement("path", {
				d: pipePathData,
				fill: "rgba(219, 234, 254, 0.62)",
				stroke: "none",
			}),
			createElement("path", {
				d: fluidPathData,
				fill: "rgba(56, 189, 248, 0.72)",
				stroke: "none",
			}),
			createElement("path", {
				d: pipePathData,
				fill: "none",
				stroke: "#e2e8f0",
				strokeLinejoin: "round",
				strokeWidth: PIPE_OUTLINE_STROKE_WIDTH,
			}),
			createElement("path", {
				d: fluidPathData,
				fill: "none",
				stroke: "#0f172a",
				strokeLinejoin: "round",
				strokeOpacity: 0.55,
				strokeWidth: FLUID_OUTLINE_STROKE_WIDTH + 2,
			}),
			createElement("path", {
				d: fluidPathData,
				fill: "none",
				stroke: "#7dd3fc",
				strokeLinejoin: "round",
				strokeWidth: FLUID_OUTLINE_STROKE_WIDTH,
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
					maxWidth: 480,
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
				{ style: { color: "#cbd5e1", fontSize: 30, fontWeight: 700, marginTop: 10 } },
				`Pipe at ${Math.round(props.pipeProgressPercent)}%, fluid at ${Math.round(props.fluidProgressPercent)}%`,
			),
			createElement(
				"div",
				{ style: { color: "#94a3b8", fontSize: 18, lineHeight: 1.45, marginTop: 8 } },
				`Pipe width ${Math.round(props.pipeStartWidth)}-${Math.round(props.pipeEndWidth)}px, fluid fill ${Math.round(props.fluidStartFillPercent)}-${Math.round(props.fluidEndFillPercent)}%, anchored to the ${props.fluidAnchor}.`,
			),
			createElement(
				"div",
				{ style: { color: "#94a3b8", fontSize: 18, lineHeight: 1.45, marginTop: 12 } },
				"Right-to-left run that starts horizontal, drops on a 45 degree diagonal, then continues horizontal again. The fluid band stays on one side of the pipe so you can inspect offset behavior through both rounded transitions.",
			),
			createElement(
				"div",
				{ style: { marginTop: 18 } },
				createElement(
					"div",
					{ style: { color: "#cbd5e1", fontSize: 15, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase" } },
					"Legend",
				),
				createElement(
					"div",
					{ style: { alignItems: "center", color: "#cbd5e1", display: "flex", fontSize: 16, gap: 12, marginTop: 10 } },
					createElement("div", {
						style: {
							background: "repeating-linear-gradient(to right, #334155 0 12px, transparent 12px 20px)",
							height: 4,
							width: 44,
						},
					}),
					createElement("span", null, "Dashed guide: routed centerline input"),
				),
				createElement(
					"div",
					{ style: { alignItems: "center", color: "#cbd5e1", display: "flex", fontSize: 16, gap: 12, marginTop: 10 } },
					createElement("div", {
						style: {
							background: "rgba(219, 234, 254, 0.62)",
							border: "3px solid #e2e8f0",
							borderRadius: 999,
							height: 14,
							width: 44,
						},
					}),
					createElement("span", null, "Pipe: start and end width interpolate over path distance"),
				),
				createElement(
					"div",
					{ style: { alignItems: "center", color: "#cbd5e1", display: "flex", fontSize: 16, gap: 12, marginTop: 10 } },
					createElement("div", {
						style: {
							background: "rgba(56, 189, 248, 0.72)",
							border: "3px solid #7dd3fc",
							borderRadius: 999,
							height: 14,
							width: 44,
						},
					}),
					createElement("span", null, "Fluid: start and end fill percentages interpolate over path distance while staying pinned to the selected wall"),
				),
			),
			createElement(
				"div",
				{ style: { color: allIssues.length === 0 ? "#86efac" : "#fbbf24", fontSize: 16, marginTop: 18 } },
				allIssues.length === 0
					? "No geometry issues reported for this preview."
					: `Geometry issues: ${allIssues.map((issue) => issue.code).join(", ")}`,
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

function interpolateNumber(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}