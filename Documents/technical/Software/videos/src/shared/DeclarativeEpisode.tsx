import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { BalanceScale } from "@reasontracker/components";

import { DebateAnimationSurface } from "./DebateAnimationSurface";
import {
	compileEpisodeScript,
	resolveGraphPlayback,
	type CompiledEpisodeScript,
} from "./compileEpisodeScript";
import type { ClaimCameraScript } from "./graphCameraBounds";
import { EpisodeMedia } from "./EpisodeMedia";
import { compileSceneCamera } from "./sceneCamera";

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
} as const;

export type DeclarativeEpisodeProps = {
	camera?: ClaimCameraScript
	episode: CompiledEpisodeScript
	mediaSources?: Readonly<Record<string, string>>
};

export function DeclarativeEpisode({ camera, episode, mediaSources = {} }: DeclarativeEpisodeProps) {
	const frame = useCurrentFrame();
	const playback = resolveGraphPlayback(episode, frame);
	const renderMedia = (layer: "back" | "front") => episode.actions.map((action) => {
		if (action.action.type !== "media.show" || (action.action.layer ?? "front") !== layer) {
			return null;
		}

		const source = mediaSources[action.action.source];
		if (!source) {
			throw new Error(`Unable to resolve episode media source: ${action.action.source}`);
		}

		return (
			<Sequence
				durationInFrames={action.durationInFrames}
				from={action.from}
				key={action.index}
				layout="none"
				name={action.label}
			>
				<EpisodeMedia
					durationInFrames={action.durationInFrames}
					source={source}
				/>
			</Sequence>
		);
	});

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
			{renderMedia("back")}
			{playback
				? (
					<DebateAnimationSurface
						cameraBounds={camera?.resolveBounds(frame)}
						claimScoreVisibility={playback.animation.claimScoreVisibility}
						claimTextReveals={episode.claimTextReveals}
						debateCore={playback.animation.debateCore}
						graphId={playback.animation.graph}
						plan={playback.animation.plan}
						scoreboard={playback.animation.scoreboard}
						stepId={playback.stepId}
						stepProgress={playback.stepProgress}
					/>
				)
				: null}
			{episode.actions.map((action) => {
				if (action.action.type !== "balance.show") {
					return null;
				}
				const actionProgress = action.durationInFrames <= 1
					? 1
					: Math.min(1, Math.max(0, (frame - action.from) / (action.durationInFrames - 1)));
				const startScorePercent = action.action.startScorePercent ?? 0;
				const scorePercent = startScorePercent
					+ (action.action.scorePercent - startScorePercent) * actionProgress;

				return (
					<Sequence
						durationInFrames={action.durationInFrames}
						from={action.from}
						key={action.index}
						layout="none"
						name={action.label}
					>
						<AbsoluteFill>
							<BalanceScale
								scale={action.action.scale}
								scorePercent={scorePercent}
								x={action.action.x}
								y={action.action.y}
							/>
						</AbsoluteFill>
					</Sequence>
				);
			})}
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
						<div
							style={action.action.position === "center"
								? CENTERED_CAPTION_STYLE
								: CLOSED_CAPTION_STYLE}
						>
							<span style={CLOSED_CAPTION_TEXT_STYLE}>{action.action.text}</span>
						</div>
					</Sequence>
				);
			})}
			{renderMedia("front")}
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