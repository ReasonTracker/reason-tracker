import "../../website/site/css/brand.css";
import "../../website/site/css/brand-sequence.css";
import type { ComponentType } from "react";
import { Composition } from "remotion";

import {
	Episode0001,
	EPISODE0001_DURATION_IN_FRAMES,
	EPISODE0001_FPS,
} from "./Episode0001";
import {
	PathGeometryVisualizer,
	pathGeometryVisualizerSchema,
} from "./component-visualizers/path-geometry/PathGeometryVisualizer";

const episode0001Composition = Episode0001 as ComponentType<Record<string, unknown>>;
const pathGeometryVisualizerComposition =
	PathGeometryVisualizer as ComponentType<Record<string, unknown>>;

export const RemotionRoot = () => {
	return (
		<>
			<Composition
				id="Episode0001"
				component={episode0001Composition}
				durationInFrames={EPISODE0001_DURATION_IN_FRAMES}
				fps={EPISODE0001_FPS}
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
				defaultProps={{ "pipeWidth": 128, "fluidLeadingExtremity": { "kind": "open" as const, "startPositionPercent": 0 }, "fluidSections": [{ "type": "offsets" as const, "offsetA": -64, "offsetB": 28 }, { "type": "transition" as const, "startPositionPercent": 45, "lengthPx": 171, "kind": "linear" as const }, { "type": "offsets" as const, "offsetA": -64, "offsetB": -32 }], "fluidTrailingExtremity": { "kind": "linear" as const, "startPositionPercent": 80, "lengthPx": 53, "collapseOffset": -64 } }}
				width={1920}
			/>
		</>
	);
};
