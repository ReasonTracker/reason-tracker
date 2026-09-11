import { Scoreboard } from "@reasontracker/components";
import { resolveAnimationFrame } from "@planner/DebateAnimationPlan.ts";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";

import { DebateAnimationSurface } from "./DebateAnimationSurface";
import {
	compileEpisodeScript,
	resolveGraphPlayback,
	type CompiledEpisodeScript,
	type GraphPlayback,
	resolveSceneObjectStates,
} from "./compileEpisodeScript";
import type { ClaimCameraScript } from "./graphCameraBounds";
import { compileSceneCamera, resolveCanvasCameraTransform } from "./sceneCamera";
import { SceneObjectSurface } from "./SceneObjectSurface";

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

const VIEWPORT_STYLE = {
	overflow: "hidden",
	position: "relative",
} as const;

const CANVAS_LAYER_STYLE = {
	height: "100%",
	left: 0,
	overflow: "visible",
	position: "absolute",
	top: 0,
	transformOrigin: "0 0",
	width: "100%",
} as const;

const CAMERA_LAYER_STYLE = {
	inset: 0,
	position: "absolute",
} as const;

const CANVAS_GRAPH_STYLE = {
	position: "absolute",
	zIndex: 0,
} as const;

const CAMERA_GRAPH_STYLE = {
	...CAMERA_LAYER_STYLE,
	zIndex: 0,
} as const;

const SCOREBOARD_STYLE = {
	position: "absolute",
	zIndex: 1,
} as const;

export type DeclarativeEpisodeProps = {
	camera?: ClaimCameraScript
	episode: CompiledEpisodeScript
	mediaSources?: Readonly<Record<string, string>>
};

export function DeclarativeEpisode({ camera, episode, mediaSources = {} }: DeclarativeEpisodeProps) {
	const frame = useCurrentFrame();
	const playback = resolveGraphPlayback(episode, frame);
	const sceneObjects = resolveSceneObjectStates(episode, frame);
	const cameraBounds = camera?.resolveBounds(frame) ?? playback?.animation.plan.bounds;
	const canvasTransform = cameraBounds
		? resolveCanvasCameraTransform(cameraBounds, episode.composition)
		: undefined;
	const renderSceneObjects = (anchor: "canvas" | "camera") => sceneObjects
		.filter((sceneObject) => sceneObject.anchor === anchor)
		.map((sceneObject) => (
			<SceneObjectSurface
				key={sceneObject.key}
				mediaSources={mediaSources}
				sceneObject={sceneObject}
			/>
		));
	const renderGraph = (anchor: "canvas" | "camera") => {
		if (!playback || playback.animation.anchor !== anchor) {
			return null;
		}
		const graphStyle = anchor === "canvas"
			? {
				...CANVAS_GRAPH_STYLE,
				height: playback.animation.plan.bounds.height,
				left: playback.animation.plan.bounds.minX,
				top: playback.animation.plan.bounds.minY,
				width: playback.animation.plan.bounds.width,
			}
			: CAMERA_GRAPH_STYLE;
		return (
			<div style={graphStyle}>
				<DebateAnimationSurface
					claimScoreVisibility={playback.animation.claimScoreVisibility}
					claimTextReveals={episode.claimTextReveals}
					debateCore={playback.animation.debateCore}
					hideScores={playback.animation.hideScores}
					plan={playback.animation.plan}
					stepId={playback.stepId}
					stepProgress={playback.stepProgress}
				/>
			</div>
		);
	};
	const renderScoreboard = (anchor: "canvas" | "camera") => {
		if (!playback) {
			return null;
		}
		const scoreboard = playback.animation.scoreboard;
		if (!scoreboard || scoreboard.anchor !== anchor) {
			return null;
		}
		const graphFrame = resolveGraphFrame(playback);
		const mainClaim = Object.values(graphFrame.claims).find(
			(claim) => claim.claimId === playback.animation.debateCore.mainClaimId,
		);
		return (
			<div
				data-graph-id={playback.animation.graph}
				style={{ ...SCOREBOARD_STYLE, left: scoreboard.x, top: scoreboard.y }}
			>
				<Scoreboard
					height={scoreboard.height}
					numberWidth={scoreboard.numberWidth}
					score={mainClaim?.rawScore ?? 0}
					thermometerWidth={scoreboard.thermometerWidth}
				/>
			</div>
		);
	};
	const renderCaptions = (anchor: "canvas" | "camera") => episode.actions.map((action) => {
		if (action.action.type !== "captions.show" || action.action.anchor !== anchor) {
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
			<AbsoluteFill style={VIEWPORT_STYLE}>
				<div
					style={{
						...CANVAS_LAYER_STYLE,
						...(canvasTransform
							? { transform: `translate(${canvasTransform.translateX}px, ${canvasTransform.translateY}px) scale(${canvasTransform.scale})` }
							: {}),
					}}
				>
					{renderSceneObjects("canvas")}
					{renderGraph("canvas")}
					{renderScoreboard("canvas")}
					{renderCaptions("canvas")}
				</div>
				<div style={CAMERA_LAYER_STYLE}>
					{renderSceneObjects("camera")}
					{renderGraph("camera")}
					{renderScoreboard("camera")}
					{renderCaptions("camera")}
				</div>
			</AbsoluteFill>
		</>
	);
}

function resolveGraphFrame(playback: GraphPlayback) {
	return playback.stepId
		? resolveAnimationFrame(playback.animation.plan, playback.stepId, playback.stepProgress)
		: playback.animation.plan.openingFrame;
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