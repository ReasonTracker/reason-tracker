// See 📌README.md in this folder for local coding standards before editing this file.

import type { CSSProperties, ReactNode } from "react";
import { interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

type BaseFadeProps = {
	children: ReactNode;
	from?: number;
	durationInFrames?: number;
	style?: CSSProperties;
	name?: string;
};

type FadeInConfig =
	| { fadeInFrames: number; fadeInSeconds?: never }
	| { fadeInFrames?: never; fadeInSeconds: number };

type FadeOutConfig =
	| { fadeOutFrames: number; fadeOutSeconds?: never }
	| { fadeOutFrames?: never; fadeOutSeconds: number };

type FadeProps =
	| (BaseFadeProps & FadeInConfig)
	| (BaseFadeProps & FadeOutConfig)
	| (BaseFadeProps & FadeInConfig & FadeOutConfig);

export const Fade = ({
	children,
	from = 0,
	durationInFrames,
	style,
	name = "Fade",
	...fadeConfig
}: FadeProps) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const fadeInFrames = toFadeFrames(
		"fadeInFrames" in fadeConfig ? fadeConfig.fadeInFrames : undefined,
		"fadeInSeconds" in fadeConfig ? fadeConfig.fadeInSeconds : undefined,
		fps,
	);

	const fadeOutFrames = toFadeFrames(
		"fadeOutFrames" in fadeConfig ? fadeConfig.fadeOutFrames : undefined,
		"fadeOutSeconds" in fadeConfig ? fadeConfig.fadeOutSeconds : undefined,
		fps,
	);

	let opacity = 1;

	if (fadeInFrames > 0) {
		opacity *= interpolate(frame, [0, fadeInFrames], [0, 1], {
			extrapolateRight: "clamp",
		});
	}

	if (fadeOutFrames > 0 && durationInFrames != null) {
		const fadeOutStart = Math.max(0, durationInFrames - fadeOutFrames);
		opacity *= interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
			extrapolateLeft: "clamp",
		});
	}

	return (
		<>
			<Sequence from={from} durationInFrames={durationInFrames} name={name} layout="none">
				<div style={{ ...style, opacity }}>{children}</div>
			</Sequence>
			{fadeInFrames > 0 ? (
				<Sequence from={from} durationInFrames={fadeInFrames} name={`${name} In`} layout="none">
					<span style={{ display: "none" }} />
				</Sequence>
			) : null}
			{fadeOutFrames > 0 && durationInFrames != null ? (
				<Sequence
					from={from + Math.max(0, durationInFrames - fadeOutFrames)}
					durationInFrames={fadeOutFrames}
					name={`${name} Out`}
					layout="none"
				>
					<span style={{ display: "none" }} />
				</Sequence>
			) : null}
		</>
	);
};

function toFadeFrames(frames: number | undefined, seconds: number | undefined, fps: number): number {
	if (frames != null) {
		return frames;
	}

	if (seconds != null) {
		return Math.round(seconds * fps);
	}

	return 0;
}