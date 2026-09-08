import "../../website/site/css/brand.css";
import "../../website/site/css/brand-sequence.css";
import type { ComponentType } from "react";
import { Composition } from "remotion";

import episode0001Spec from "./Episode0001/episode.json";
import episode0002Spec from "./Episode0002/episode.json";
import episode0004Spec from "./Episode0004/episode.json";
import episode0005Spec from "./Episode0005/episode.json";
import {
	PathGeometryVisualizer,
	pathGeometryVisualizerSchema,
} from "./component-visualizers/path-geometry/PathGeometryVisualizer";
import { createDeclarativeEpisode } from "./shared/DeclarativeEpisode";

const episode0001 = createDeclarativeEpisode(episode0001Spec);
const episode0001Composition = episode0001.component as ComponentType<Record<string, unknown>>;
const episode0002 = createDeclarativeEpisode(episode0002Spec);
const episode0002Composition = episode0002.component as ComponentType<Record<string, unknown>>;
const episode0004 = createDeclarativeEpisode(episode0004Spec);
const episode0004Composition = episode0004.component as ComponentType<Record<string, unknown>>;
const episode0005 = createDeclarativeEpisode(episode0005Spec);
const episode0005Composition = episode0005.component as ComponentType<Record<string, unknown>>;
const pathGeometryVisualizerComposition =
	PathGeometryVisualizer as ComponentType<Record<string, unknown>>;

export const RemotionRoot = () => {
	return (
		<>
			<Composition
				id={episode0001.episode.composition.id}
				component={episode0001Composition}
				durationInFrames={episode0001.episode.durationInFrames}
				fps={episode0001.episode.composition.fps}
				height={episode0001.episode.composition.height}
				width={episode0001.episode.composition.width}
			/>
			<Composition
				id={episode0002.episode.composition.id}
				component={episode0002Composition}
				durationInFrames={episode0002.episode.durationInFrames}
				fps={episode0002.episode.composition.fps}
				height={episode0002.episode.composition.height}
				width={episode0002.episode.composition.width}
			/>
			<Composition
				id={episode0004.episode.composition.id}
				component={episode0004Composition}
				durationInFrames={episode0004.episode.durationInFrames}
				fps={episode0004.episode.composition.fps}
				height={episode0004.episode.composition.height}
				width={episode0004.episode.composition.width}
			/>
			<Composition
				id={episode0005.episode.composition.id}
				component={episode0005Composition}
				durationInFrames={episode0005.episode.durationInFrames}
				fps={episode0005.episode.composition.fps}
				height={episode0005.episode.composition.height}
				width={episode0005.episode.composition.width}
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
