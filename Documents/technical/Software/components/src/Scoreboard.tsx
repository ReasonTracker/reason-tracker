import type { CSSProperties } from "react";

// AGENT NOTE: Keep scoreboard proportions and palette values together for visual tuning.
const SCOREBOARD_BORDER_WIDTH = 5;
const SCOREBOARD_RADIUS = 50;
const CELL_PADDING = 10;
const THERMOMETER_INSET = 10;
const MARKER_THICKNESS = 5;
const MIN_DISPLAY_SCORE = 1;
const MAX_DISPLAY_SCORE = 99;
const DEFAULT_TRANSITION_DURATION_MS = 300;
const DEFAULT_HEIGHT = 400;
const DEFAULT_NUMBER_WIDTH = 220;
const DEFAULT_THERMOMETER_WIDTH = 165;
const COLORS = {
	background: "#080b10",
	con: "var(--con)",
	neutral: "#8a8f98",
	pro: "var(--pro)",
};

const DIGIT_SEGMENTS: Readonly<Record<string, readonly string[]>> = {
	"0": ["top", "upperLeft", "upperRight", "lowerLeft", "lowerRight", "bottom"],
	"1": ["upperRight", "lowerRight"],
	"2": ["top", "upperRight", "middle", "lowerLeft", "bottom"],
	"3": ["top", "upperRight", "middle", "lowerRight", "bottom"],
	"4": ["upperLeft", "upperRight", "middle", "lowerRight"],
	"5": ["top", "upperLeft", "middle", "lowerRight", "bottom"],
	"6": ["top", "upperLeft", "middle", "lowerLeft", "lowerRight", "bottom"],
	"7": ["top", "upperRight", "lowerRight"],
	"8": ["top", "upperLeft", "upperRight", "middle", "lowerLeft", "lowerRight", "bottom"],
	"9": ["top", "upperLeft", "upperRight", "middle", "lowerRight", "bottom"],
};

const SEGMENT_PATHS = [
	{ id: "top", d: "M 13 5 L 57 5 L 64 12 L 57 19 L 13 19 L 6 12 Z" },
	{ id: "upperLeft", d: "M 5 14 L 12 21 L 12 52 L 5 59 L 0 54 L 0 19 Z" },
	{ id: "upperRight", d: "M 65 14 L 70 19 L 70 54 L 65 59 L 58 52 L 58 21 Z" },
	{ id: "middle", d: "M 13 53 L 57 53 L 64 60 L 57 67 L 13 67 L 6 60 Z" },
	{ id: "lowerLeft", d: "M 5 61 L 12 68 L 12 99 L 5 106 L 0 101 L 0 66 Z" },
	{ id: "lowerRight", d: "M 65 61 L 70 66 L 70 101 L 65 106 L 58 99 L 58 68 Z" },
	{ id: "bottom", d: "M 13 101 L 57 101 L 64 108 L 57 115 L 13 115 L 6 108 Z" },
];

export type ScoreboardProps = {
	height?: number
	numberWidth?: number
	/** Signed main-claim balance from -1 (con) through 1 (pro). */
	score: number
	showNumbers?: boolean
	showThermometer?: boolean
	style?: CSSProperties
	thermometerWidth?: number
	transitionDurationMs?: number
};

export function Scoreboard({
	height = DEFAULT_HEIGHT,
	numberWidth = DEFAULT_NUMBER_WIDTH,
	score,
	showNumbers = true,
	showThermometer = true,
	style,
	thermometerWidth = DEFAULT_THERMOMETER_WIDTH,
	transitionDurationMs = DEFAULT_TRANSITION_DURATION_MS,
}: ScoreboardProps) {
	const signedScore = clampSignedScore(score);
	const proScore = toDisplayScore((signedScore + 1) / 2);
	const conScore = toDisplayScore((1 - signedScore) / 2);
	const duration = Math.max(0, transitionDurationMs);
	const resolvedHeight = resolveDimension(height, DEFAULT_HEIGHT);
	const resolvedNumberWidth = resolveDimension(numberWidth, DEFAULT_NUMBER_WIDTH);
	const resolvedThermometerWidth = resolveDimension(thermometerWidth, DEFAULT_THERMOMETER_WIDTH);
	const columnGap = showNumbers && showThermometer ? SCOREBOARD_BORDER_WIDTH : 0;

	return (
		<div
			aria-label={`Scoreboard: ${proScore}% in favor and ${conScore}% against`}
			role="img"
			style={{
				...scoreboardStyle,
				columnGap,
				gridTemplateColumns: resolveGridTemplateColumns({
					numberWidth: resolvedNumberWidth,
					showNumbers,
					showThermometer,
					thermometerWidth: resolvedThermometerWidth,
				}),
				height: resolvedHeight,
				transitionDuration: `${duration}ms`,
				width: resolveScoreboardWidth({
					columnGap,
					numberWidth: resolvedNumberWidth,
					showNumbers,
					showThermometer,
					thermometerWidth: resolvedThermometerWidth,
				}),
				...style,
			}}
		>
			<div
				style={{
					...thermometerStyle,
					opacity: showThermometer ? 1 : 0,
					transform: showThermometer ? "scaleX(1)" : "scaleX(0)",
					transitionDuration: `${duration}ms`,
				}}
			>
				<div style={{ ...proFillStyle, height: `${proScore}%`, transitionDuration: `${duration}ms` }} />
				{[25, 50, 75].map((position) => (
					<div key={position} style={{ ...markerStyle, top: `${position}%` }} />
				))}
			</div>
			<ScoreCell color={COLORS.pro} score={proScore} shown={showNumbers} transitionDuration={duration} />
			<ScoreCell color={COLORS.con} score={conScore} shown={showNumbers} transitionDuration={duration} />
		</div>
	);
}

function ScoreCell({
	color,
	score,
	shown,
	transitionDuration,
}: {
	color: string
	score: number
	shown: boolean
	transitionDuration: number
}) {
	return (
		<div
			style={{
				...scoreCellStyle,
				color,
				opacity: shown ? 1 : 0,
				transform: shown ? "translateX(0)" : "translateX(24px)",
				transitionDuration: `${transitionDuration}ms`,
			}}
		>
			<ScoreDigits value={score} />
		</div>
	);
}

function ScoreDigits({ value }: { value: number }) {
	return (
		<div style={digitsStyle}>
			{[...String(value).padStart(2, "0")].map((digit, index) => (
				<SevenSegmentDigit digit={digit} key={`${digit}:${index}`} />
			))}
		</div>
	);
}

function SevenSegmentDigit({ digit }: { digit: string }) {
	const activeSegments = DIGIT_SEGMENTS[digit] ?? [];
	return (
		<svg aria-hidden="true" preserveAspectRatio="xMidYMid meet" style={digitStyle} viewBox="0 0 70 120">
			{SEGMENT_PATHS.map((segment) => (
				<path
					d={segment.d}
					fill="currentColor"
					key={segment.id}
					opacity={activeSegments.includes(segment.id) ? 1 : 0.2}
				/>
			))}
		</svg>
	);
}

function clampSignedScore(score: number): number {
	return Number.isFinite(score) ? Math.min(1, Math.max(-1, score)) : 0;
}

function toDisplayScore(score: number): number {
	const share = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
	return Math.min(MAX_DISPLAY_SCORE, Math.max(MIN_DISPLAY_SCORE, Math.round(share * 100)));
}

function resolveDimension(value: number, fallback: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function resolveGridTemplateColumns(args: {
	numberWidth: number
	showNumbers: boolean
	showThermometer: boolean
	thermometerWidth: number
}): string {
	return `${args.showThermometer ? args.thermometerWidth : 0}px ${args.showNumbers ? args.numberWidth : 0}px`;
}

function resolveScoreboardWidth(args: {
	columnGap: number
	numberWidth: number
	showNumbers: boolean
	showThermometer: boolean
	thermometerWidth: number
}): number {
	return (args.showThermometer ? args.thermometerWidth : 0)
		+ (args.showNumbers ? args.numberWidth : 0)
		+ args.columnGap
		+ SCOREBOARD_BORDER_WIDTH * 2;
}

const scoreboardStyle: CSSProperties = {
	backgroundColor: COLORS.neutral,
	border: `${SCOREBOARD_BORDER_WIDTH}px solid ${COLORS.neutral}`,
	borderRadius: SCOREBOARD_RADIUS,
	boxSizing: "border-box",
	display: "grid",
	gridTemplateAreas: '"thermometer pro" "thermometer con"',
	gridTemplateColumns: `${DEFAULT_THERMOMETER_WIDTH}px ${DEFAULT_NUMBER_WIDTH}px`,
	gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
	overflow: "hidden",
	rowGap: SCOREBOARD_BORDER_WIDTH,
	transition: "grid-template-columns ease, column-gap ease, width ease",
};

const thermometerStyle: CSSProperties = {
	backgroundColor: COLORS.con,
	border: `${THERMOMETER_INSET}px solid ${COLORS.background}`,
	borderRadius: `${SCOREBOARD_RADIUS - SCOREBOARD_BORDER_WIDTH}px 0 0 ${SCOREBOARD_RADIUS - SCOREBOARD_BORDER_WIDTH}px`,
	boxSizing: "border-box",
	gridArea: "thermometer",
	overflow: "hidden",
	position: "relative",
	transformOrigin: "left center",
	transition: "opacity ease, transform ease",
};

const proFillStyle: CSSProperties = {
	backgroundColor: COLORS.pro,
	borderBottom: `${MARKER_THICKNESS}px solid ${COLORS.background}`,
	boxSizing: "border-box",
	left: 0,
	position: "absolute",
	top: 0,
	transition: "height ease",
	width: "100%",
};

const markerStyle: CSSProperties = {
	backgroundColor: COLORS.background,
	height: MARKER_THICKNESS,
	position: "absolute",
	right: 0,
	width: "50%",
};

const scoreCellStyle: CSSProperties = {
	alignItems: "center",
	backgroundColor: COLORS.background,
	display: "flex",
	justifyContent: "center",
	minWidth: 0,
	overflow: "hidden",
	padding: CELL_PADDING,
	transition: "opacity ease, transform ease",
};

const digitsStyle: CSSProperties = {
	display: "flex",
	gap: 8,
	height: "100%",
	justifyContent: "center",
};

const digitStyle: CSSProperties = {
	aspectRatio: "5 / 9",
	flex: "0 0 auto",
	height: "100%",
};