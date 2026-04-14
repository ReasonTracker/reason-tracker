// See 📌README.md in this folder for local coding standards before editing this file.

import { Sequence, useCurrentFrame } from "remotion";
import {
	BRAND_SEQUENCE_END_FRAME,
	BRAND_SEQUENCE_TAGLINE,
	TAGLINE_CENTER_OFFSET,
	getBrandSequenceState,
} from "./brandSequenceMotion.ts";

const DEFAULT_BRAND_SEQUENCE_FROM = 0;
const DEFAULT_BRAND_SEQUENCE_DURATION = BRAND_SEQUENCE_END_FRAME;

type EpisodeBrandSequenceProps = {
	from?: number;
	durationInFrames?: number;
};

const EpisodeBrandSequenceContent = ({ durationInFrames = DEFAULT_BRAND_SEQUENCE_DURATION }: Pick<EpisodeBrandSequenceProps, "durationInFrames">) => {
	const frame = useCurrentFrame();
	const motionFrame = getScaledBrandSequenceFrame(frame, durationInFrames);
	const { reasonX, trackerX, wordOpacity, taglineY, taglineOpacity } = getBrandSequenceState(motionFrame);

	return (
		<div style={brandRootStyle} aria-label="Reason Tracker brand sequence">
			<div style={lockupStyle}>
				<span style={{ ...wordStyle, opacity: wordOpacity, transform: `translateX(${reasonX}px)` }}>Reason</span>
				<span style={{ ...wordStyle, opacity: wordOpacity, transform: `translateX(${trackerX}px)` }}>Tracker</span>
			</div>
			<span
				style={{
					...taglineWrapStyle,
					opacity: taglineOpacity,
					transform: `translate(${TAGLINE_CENTER_OFFSET}px, ${taglineY}px)`,
				}}
			>
				<span style={taglineShadowStyle} aria-hidden="true">{BRAND_SEQUENCE_TAGLINE}</span>
				<span style={taglineTextStyle}>{BRAND_SEQUENCE_TAGLINE}</span>
			</span>
		</div>
	);
};

export const EpisodeBrandSequence = ({
	from = DEFAULT_BRAND_SEQUENCE_FROM,
	durationInFrames = DEFAULT_BRAND_SEQUENCE_DURATION,
}: EpisodeBrandSequenceProps) => {
	return (
		<Sequence from={from} durationInFrames={durationInFrames} name="Brand" layout="none">
			<EpisodeBrandSequenceContent durationInFrames={durationInFrames} />
		</Sequence>
	);
};

const getScaledBrandSequenceFrame = (frame: number, duration: number) => {
	const safeDuration = Number.isFinite(duration) ? Math.max(1, duration) : DEFAULT_BRAND_SEQUENCE_DURATION;
	const safeFrame = Number.isFinite(frame) ? Math.max(0, frame) : 0;

	if (safeDuration === DEFAULT_BRAND_SEQUENCE_DURATION) {
		return safeFrame;
	}

	if (safeDuration === 1) {
		return BRAND_SEQUENCE_END_FRAME;
	}

	return (safeFrame / (safeDuration - 1)) * BRAND_SEQUENCE_END_FRAME;
};

const brandRootStyle = {
	position: "absolute",
	inset: 0,
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	background: "rgba(0, 0, 0, 0.72)",
	fontFamily: '"Aptos Display", "Segoe UI", sans-serif',
	color: "#ffffff",
} satisfies React.CSSProperties;

const lockupStyle = {
	display: "flex",
	gap: 18,
	fontSize: 112,
	fontWeight: 600,
	lineHeight: 1,
	letterSpacing: "-0.04em",
} satisfies React.CSSProperties;

const wordStyle = {
	display: "inline-block",
} satisfies React.CSSProperties;

const taglineWrapStyle = {
	position: "relative",
	marginTop: 24,
	fontSize: 28,
	letterSpacing: "0.22em",
	textTransform: "uppercase",
} satisfies React.CSSProperties;

const taglineShadowStyle = {
	position: "absolute",
	inset: 0,
	filter: "blur(16px)",
	color: "rgba(255, 255, 255, 0.25)",
} satisfies React.CSSProperties;

const taglineTextStyle = {
	position: "relative",
} satisfies React.CSSProperties;