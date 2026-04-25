import "../../website/site/css/brand.css";
import "../../website/site/css/brand-sequence.css";
import type { ComponentType } from "react";
import { Composition } from "remotion";

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
				id="ComponentVisualizerPathGeometry"
				component={pathGeometryVisualizerComposition}
				durationInFrames={1}
				fps={30}
				height={1080}
				schema={pathGeometryVisualizerSchema}
				defaultProps={{ "pipeWidth": 128, "fluidLeadingExtremity": { "kind": "open" as const, "startPositionPercent": 0 }, "fluidSections": [{ "type": "offsets" as const, "offsetA": -64, "offsetB": 28 }, { "type": "transition" as const, "startPositionPercent": 45, "lengthPx": 171, "kind": "linear" as const }, { "type": "offsets" as const, "offsetA": -64, "offsetB": -32 }], "fluidTrailingExtremity": { "kind": "linear" as const, "startPositionPercent": 80, "lengthPx": 53, "collapseOffset": -64 } }}
				width={1920}
			/>
		</>
	);
};
