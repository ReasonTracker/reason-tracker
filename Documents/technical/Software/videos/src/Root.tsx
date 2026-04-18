import "../../website/site/css/brand.css";
import type { ComponentType } from "react";
import { AbsoluteFill, Composition } from "remotion";

import {
	PathGeometryVisualizer,
	pathGeometryVisualizerSchema,
} from "./component-visualizers/path-geometry/PathGeometryVisualizer";

const pathGeometryVisualizerComposition =
	PathGeometryVisualizer as ComponentType<Record<string, unknown>>;

export const RemotionRoot = () => {
	return (
		<>
			<Composition
				id="StarterComposition"
				component={StarterComposition}
				durationInFrames={150}
				fps={30}
				height={1080}
				width={1920}
			/>
			<Composition
				id="ComponentVisualizerPathGeometry"
				component={pathGeometryVisualizerComposition}
				durationInFrames={1}
				fps={30}
				height={1080}
				schema={pathGeometryVisualizerSchema}
				defaultProps={{"fluidAnchor":"bottom" as const,"fluidEndFillPercent":12,"fluidRevealPercent":59,"fluidStartFillPercent":80,"pipeEndWidth":100,"pipeRevealPercent":86,"pipeStartWidth":100,"transitionStartPercent":86,"waypoints":[{"x":1600,"y":360},{"x":1120,"y":360,"radius":120},{"x":700,"y":780,"radius":120},{"x":260,"y":780}]}}
				width={1920}
			/>
		</>
	);
};

const StarterComposition = () => {
	return (
		<AbsoluteFill
			style={{
				alignItems: "center",
				background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
				color: "#f8fafc",
				display: "flex",
				fontFamily: '"Segoe UI", sans-serif',
				fontSize: 72,
				fontWeight: 700,
				justifyContent: "center",
				letterSpacing: "0.04em",
			}}
		>
			Reason Tracker
		</AbsoluteFill>
	);
};