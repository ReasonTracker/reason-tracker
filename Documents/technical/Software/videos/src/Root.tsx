import "../../website/site/css/brand.css";
import type { ComponentType } from "react";
import { AbsoluteFill, Composition } from "remotion";

import {
	defaultPathGeometryVisualizerProps,
	PathGeometryVisualizer,
	pathGeometryVisualizerSchema,
} from "./component-visualizers/path-geometry/PathGeometryVisualizer";

const pathGeometryVisualizerComposition =
	PathGeometryVisualizer as ComponentType<Record<string, unknown>>;

export const RemotionRoot = () => {
	return (
		<>
			<Composition
				id="ComponentVisualizerPathGeometry"
				component={pathGeometryVisualizerComposition}
				durationInFrames={1}
				fps={30}
				height={1080}
				schema={pathGeometryVisualizerSchema}
				defaultProps={defaultPathGeometryVisualizerProps}
				width={1920}
			/>
			<Composition
				id="StarterComposition"
				component={StarterComposition}
				durationInFrames={150}
				fps={30}
				height={1080}
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