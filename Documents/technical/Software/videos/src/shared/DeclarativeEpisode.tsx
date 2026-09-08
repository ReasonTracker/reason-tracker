import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";

import { DebateAnimationSurface } from "./DebateAnimationSurface";
import {
	compileEpisodeScript,
	resolveGraphPlayback,
	type CompiledEpisodeScript,
} from "./compileEpisodeScript";
import type { ClaimCameraScript } from "./graphCameraBounds";
import { compileSceneCamera } from "./sceneCamera";

const CLOSED_CAPTION_STYLE = {
	alignItems: "center",
	boxSizing: "border-box",
	display: "flex",
	justifyContent: "flex-end",
	padding: "0 160px 80px",
} as const;

const CLOSED_CAPTION_TEXT_STYLE = {
	backgroundColor: "rgba(0, 0, 0, 0.68)",
	boxDecorationBreak: "clone",
	color: "#ffffff",
	fontFamily: "Arial, sans-serif",
	fontSize: 42,
	fontWeight: 700,
	lineHeight: 1.3,
	padding: "8px 14px",
	textAlign: "center",
} as const;

export type DeclarativeEpisodeProps = {
	camera?: ClaimCameraScript
	episode: CompiledEpisodeScript
};

export function DeclarativeEpisode({ camera, episode }: DeclarativeEpisodeProps) {
	const frame = useCurrentFrame();
	const playback = resolveGraphPlayback(episode, frame);

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
			{playback
				? (
					<DebateAnimationSurface
						cameraBounds={camera?.resolveBounds(frame)}
						debateCore={playback.animation.debateCore}
						plan={playback.animation.plan}
						stepId={playback.stepId}
						stepProgress={playback.stepProgress}
					/>
				)
				: null}
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
						<AbsoluteFill style={CLOSED_CAPTION_STYLE}>
							<span style={CLOSED_CAPTION_TEXT_STYLE}>{action.action.text}</span>
						</AbsoluteFill>
					</Sequence>
				);
			})}
		</>
	);
}

export function createDeclarativeEpisode(input: unknown) {
	const episode = compileEpisodeScript(input);
	const camera = compileSceneCamera(episode);
	return {
		component: () => <DeclarativeEpisode camera={camera} episode={episode} />,
		episode,
	};
}