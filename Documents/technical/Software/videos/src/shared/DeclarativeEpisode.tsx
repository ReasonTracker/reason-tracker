import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";

import { DebateAnimationSurface } from "./DebateAnimationSurface";
import {
	compileEpisodeScript,
	resolveGraphPlayback,
	resolveScreenObjectStates,
	type CompiledEpisodeScript,
} from "./compileEpisodeScript";
import type { ClaimCameraScript } from "./graphCameraBounds";
import { compileSceneCamera } from "./sceneCamera";
import { ScreenObjectSurface } from "./ScreenObjectSurface";

const CAPTION_CONTAINER_STYLE = {
	alignItems: "center",
	boxSizing: "border-box",
	display: "flex",
	left: "50%",
	position: "absolute",
	transform: "translateX(-50%)",
} as const;

const CLOSED_CAPTION_STYLE = {
	...CAPTION_CONTAINER_STYLE,
	bottom: 80,
} as const;

const CENTERED_CAPTION_STYLE = {
	...CAPTION_CONTAINER_STYLE,
	top: "50%",
	transform: "translate(-50%, -50%)",
} as const;

const CLOSED_CAPTION_TEXT_STYLE = {
	backgroundColor: "rgba(0, 0, 0, 0.68)",
	boxDecorationBreak: "clone",
	color: "#ffffff",
	fontFamily: "Arial, sans-serif",
	fontSize: 42,
	fontWeight: 700,
	lineHeight: 1.3,
	maxWidth: "calc(100vw - 320px)",
	padding: "8px 14px",
	textAlign: "center",
} as const;

const SCENE_BACKGROUND_STYLE = {
	background: "#080b10",
	zIndex: -100,
} as const;

const SCENE_GRAPH_STYLE = {
	inset: 0,
	position: "absolute",
	zIndex: 0,
} as const;

export type DeclarativeEpisodeProps = {
	camera?: ClaimCameraScript
	episode: CompiledEpisodeScript
	mediaSources?: Readonly<Record<string, string>>
};

export function DeclarativeEpisode({ camera, episode, mediaSources = {} }: DeclarativeEpisodeProps) {
	const frame = useCurrentFrame();
	const playback = resolveGraphPlayback(episode, frame);
	const screenObjects = resolveScreenObjectStates(episode, frame);
	const renderScreenObjects = () => screenObjects
		.map((screenObject) => (
			<ScreenObjectSurface
				key={screenObject.key}
				mediaSources={mediaSources}
				screenObject={screenObject}
			/>
		));

	return (
		<>
			{episode.actions.filter((action) => action.durationInFrames > 0).map((action) => (
				<Sequence
					durationInFrames={action.durationInFrames}
					from={action.from}
					key={action.index}
					layout="none"
					name={action.label}
				>
					<span style={{ display: "none" }} />
				</Sequence>
			))}
			<AbsoluteFill style={SCENE_BACKGROUND_STYLE} />
			{playback
				? (
					<div style={SCENE_GRAPH_STYLE}>
						<DebateAnimationSurface
							cameraBounds={camera?.resolveBounds(frame)}
							claimScoreVisibility={playback.animation.claimScoreVisibility}
							claimTextReveals={episode.claimTextReveals}
							debateCore={playback.animation.debateCore}
							graphId={playback.animation.graph}
							hideScores={playback.animation.hideScores}
							plan={playback.animation.plan}
							scoreboard={playback.animation.scoreboard}
							stepId={playback.stepId}
							stepProgress={playback.stepProgress}
						/>
					</div>
				)
				: null}
			{renderScreenObjects()}
			{episode.actions.map((action) => {
				if (action.action.type !== "captions.show") {
					return null;
				}

				return (
					<Sequence
						durationInFrames={action.durationInFrames}
						from={action.from}
						key={action.index}
						layout="none"
						name={action.label}
					>
						<div style={action.action.position === "center" ? CENTERED_CAPTION_STYLE : CLOSED_CAPTION_STYLE}>
							<span style={CLOSED_CAPTION_TEXT_STYLE}>{action.action.text}</span>
						</div>
					</Sequence>
				);
			})}
		</>
	);
}

export function createDeclarativeEpisode(
	input: unknown,
	mediaSources?: Readonly<Record<string, string>>,
) {
	const episode = compileEpisodeScript(input);
	const camera = compileSceneCamera(episode);
	return {
		component: () => (
			<DeclarativeEpisode camera={camera} episode={episode} mediaSources={mediaSources} />
		),
		episode,
	};
}