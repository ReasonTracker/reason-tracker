const VIEW_WIDTH = 1920;
const VIEW_HEIGHT = 1080;
const PIVOT_X = VIEW_WIDTH / 2;
const PIVOT_Y = 570;
const BAR_LENGTH = 500;
const HANGING_TRAY_LENGTH = 0;
const TRAY_WIDTH = 300;
const RECTANGLE_WIDTH = 150;
const BLOCK_UNIT_HEIGHT = 110;
const MAX_BEAM_ANGLE_DEGREES = 60;
const READOUT_RADIUS = 400;
const ARROW_READOUT_OFFSET = 24;
const READOUT_TICK_VALUES = [-100, -75, -50, -25, 0, 25, 50, 75, 100];
const READOUT_TICK_LENGTH = 28;

const READOUT_SCORE_RADIUS = READOUT_RADIUS + 24;
const READOUT_LABEL_DISTANCE = 200;
const READOUT_LABEL_FONT_SIZE = 20;
const READOUT_SCORE_FONT_SIZE = 22;
const READOUT_LABEL_WRAP_WIDTH = 200;
const READOUT_LABEL_PADDING = 12;
const READOUT_LABELS: readonly ReadoutLabelProps[] = [
    { scorePercent: 100, text: "The reasoning comes out completely in favor." },
    { scorePercent: 50, text: "The reasons in favor carry about twice as much weight as the reasons against." },
    { scorePercent: 0, text: "The reasons on each side balance out." },
    { scorePercent: -50, text: "The reasons against carry about twice as much weight as the reasons in favor." },
    { scorePercent: -100, text: "The reasoning comes out completely against." },
];
const BEAM_HALF_WIDTH = BAR_LENGTH / 2;
const TRAY_Y = PIVOT_Y + HANGING_TRAY_LENGTH;

const COLORS = {
    beam: "#e2e8f0",
    frame: "#64748b",
    orange: "#f28c28",
    purple: "#ad6cff",
};

export type BalanceScaleProps = {
    scorePercent: number
    scale?: number
    x?: number
    y?: number
};

export function BalanceScale({
    scorePercent,
    scale = 1,
    x = VIEW_WIDTH / 2,
    y = VIEW_HEIGHT / 2,
}: BalanceScaleProps) {
    const normalizedScore = Math.max(-100, Math.min(100, scorePercent));
    const beamAngle = -(normalizedScore / 100) * MAX_BEAM_ANGLE_DEGREES;
    const purpleHeight = BLOCK_UNIT_HEIGHT * (1 + normalizedScore / 100);
    const orangeHeight = BLOCK_UNIT_HEIGHT * (1 - normalizedScore / 100);
    const center = calculateBalanceCenter();
    const placementTransform = `translate(${x - center.x} ${y - center.y}) translate(${center.x} ${center.y}) scale(${scale}) translate(${-center.x} ${-center.y})`;

    return (
        <svg
            aria-label={`Balance scale at ${normalizedScore}%`}
            preserveAspectRatio="xMidYMid meet"
            style={{ height: "100%", width: "100%" }}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        >
            <rect fill="#080b10" height={VIEW_HEIGHT} width={VIEW_WIDTH} />
            <g transform={placementTransform}>
                <g transform={`rotate(${beamAngle} ${PIVOT_X} ${PIVOT_Y})`}>
                    <line
                        stroke={COLORS.beam}
                        strokeLinecap="round"
                        strokeWidth="24"
                        x1={PIVOT_X - BEAM_HALF_WIDTH}
                        x2={PIVOT_X + BEAM_HALF_WIDTH}
                        y1={PIVOT_Y}
                        y2={PIVOT_Y}
                    />
                    <ScaleTray
                        beamAngle={beamAngle}
                        color={COLORS.purple}
                        rectangleHeight={purpleHeight}
                        x={PIVOT_X - BEAM_HALF_WIDTH}
                    />
                    <ScaleTray
                        beamAngle={beamAngle}
                        color={COLORS.orange}
                        rectangleHeight={orangeHeight}
                        x={PIVOT_X + BEAM_HALF_WIDTH}
                    />
                </g>
                <circle cx={PIVOT_X} cy={PIVOT_Y} fill={COLORS.beam} r="28" />
                <path
                    d={buildReadoutArcPath()}
                    fill="none"
                    stroke={COLORS.frame}
                    strokeLinecap="round"
                    strokeWidth="12"
                />
                {READOUT_TICK_VALUES.map((value) => <ReadoutTick key={value} value={value} />)}
                {READOUT_LABELS.map((label) => <ReadoutLabel key={label.scorePercent} {...label} />)}
                <g transform={`rotate(${beamAngle} ${PIVOT_X} ${PIVOT_Y})`}>
                    <line
                        stroke={COLORS.beam}
                        strokeLinecap="round"
                        strokeWidth="14"
                        x1={PIVOT_X}
                        x2={PIVOT_X}
                        y1={PIVOT_Y}
                        y2={PIVOT_Y - READOUT_RADIUS + ARROW_READOUT_OFFSET + 34}
                    />
                    <path
                        d={`M ${PIVOT_X - 22} ${PIVOT_Y - READOUT_RADIUS + ARROW_READOUT_OFFSET + 34} L ${PIVOT_X} ${PIVOT_Y - READOUT_RADIUS + ARROW_READOUT_OFFSET} L ${PIVOT_X + 22} ${PIVOT_Y - READOUT_RADIUS + ARROW_READOUT_OFFSET + 34} Z`}
                        fill={COLORS.beam}
                    />
                </g>
            </g>
        </svg>
    );
}

function calculateBalanceCenter() {
    const horizontalReach = Math.max(
        BEAM_HALF_WIDTH + TRAY_WIDTH / 2,
        ...READOUT_LABELS.map((label) => Math.abs(readoutPointForScore(label.scorePercent, calculateLabelRadius(label.distancePercent)).x - PIVOT_X) + READOUT_LABEL_WRAP_WIDTH / 2 + READOUT_LABEL_PADDING),
    );
    const labelTop = Math.min(...READOUT_LABELS.map((label) => {
        const labelPoint = readoutPointForScore(label.scorePercent, calculateLabelRadius(label.distancePercent));
        return labelPoint.y - READOUT_LABEL_FONT_SIZE - READOUT_LABEL_PADDING - 10;
    }));
    const trayBottom = PIVOT_Y
        + Math.sin(MAX_BEAM_ANGLE_DEGREES * Math.PI / 180) * BEAM_HALF_WIDTH
        + HANGING_TRAY_LENGTH;
    return {
        x: (PIVOT_X - horizontalReach + PIVOT_X + horizontalReach) / 2,
        y: (labelTop + trayBottom) / 2,
    };
}

function buildReadoutArcPath(): string {
    const start = readoutPointForScore(100);
    const end = readoutPointForScore(-100);
    return `M ${start.x} ${start.y} A ${READOUT_RADIUS} ${READOUT_RADIUS} 0 0 1 ${end.x} ${end.y}`;
}

function ReadoutTick({ value }: { value: number }) {
    const outer = readoutPointForScore(value);
    const inner = readoutPointForScore(value, READOUT_RADIUS - READOUT_TICK_LENGTH);
    return (
        <line
            stroke={COLORS.frame}
            strokeLinecap="round"
            strokeWidth="8"
            x1={outer.x}
            x2={inner.x}
            y1={outer.y}
            y2={inner.y}
        />
    );
}

type ReadoutLabelProps = {
    distancePercent?: number
    scorePercent: number
    text: string
};

function ReadoutLabel({ distancePercent, scorePercent, text }: ReadoutLabelProps) {
    const readoutPoint = readoutPointForScore(scorePercent);
    const labelPoint = readoutPointForScore(scorePercent, calculateLabelRadius(distancePercent));
    const scorePoint = readoutPointForScore(scorePercent, READOUT_SCORE_RADIUS);
    const lines = wrapReadoutLabel(text);
    const lineHeight = READOUT_LABEL_FONT_SIZE * 1.2;
    const labelHeight = READOUT_LABEL_FONT_SIZE + (lines.length - 1) * lineHeight + READOUT_LABEL_PADDING * 2;
    const labelTop = labelPoint.y - READOUT_LABEL_FONT_SIZE - READOUT_LABEL_PADDING - 10;
    return (
        <g>
            <line
                stroke={COLORS.frame}
                strokeLinecap="round"
                strokeWidth="4"
                x1={readoutPoint.x}
                x2={labelPoint.x}
                y1={readoutPoint.y}
                y2={labelPoint.y}
            />
            <rect
                fill="#000000"
                height={labelHeight}
                width={READOUT_LABEL_WRAP_WIDTH + READOUT_LABEL_PADDING * 2}
                x={labelPoint.x - READOUT_LABEL_WRAP_WIDTH / 2 - READOUT_LABEL_PADDING}
                y={labelTop}
            />
            <rect
                fill="#000000"
                height={READOUT_SCORE_FONT_SIZE + READOUT_LABEL_PADDING}
                width={formatScoreLabel(scorePercent).length * READOUT_SCORE_FONT_SIZE * 0.7 + READOUT_LABEL_PADDING * 2}
                x={scorePoint.x - (formatScoreLabel(scorePercent).length * READOUT_SCORE_FONT_SIZE * 0.7 + READOUT_LABEL_PADDING * 2) / 2}
                y={scorePoint.y - READOUT_SCORE_FONT_SIZE - READOUT_LABEL_PADDING - 8}
            />
            <text
                fill={COLORS.beam}
                fontFamily="Arial, sans-serif"
                fontSize={READOUT_SCORE_FONT_SIZE}
                fontWeight="700"
                textAnchor="middle"
                x={scorePoint.x}
                y={scorePoint.y - 8}
            >
                {formatScoreLabel(scorePercent)}
            </text>
            <text
                fill={COLORS.beam}
                fontFamily="Arial, sans-serif"
                fontSize={READOUT_LABEL_FONT_SIZE}
                textAnchor="middle"
                x={labelPoint.x}
                y={labelPoint.y - 10}
            >
                {lines.map((line, index) => (
                    <tspan
                        dy={index === 0 ? 0 : lineHeight}
                        key={line}
                        x={labelPoint.x}
                    >
                        {line}
                    </tspan>
                ))}
            </text>
        </g>
    );
}

function calculateLabelRadius(distancePercent = 100): number {
    return READOUT_RADIUS + READOUT_LABEL_DISTANCE * distancePercent / 100;
}

function formatScoreLabel(scorePercent: number): string {
    return `${scorePercent > 0 ? "+" : ""}${scorePercent}%`;
}

function wrapReadoutLabel(text: string): string[] {
    const maximumCharacters = Math.max(1, Math.floor(READOUT_LABEL_WRAP_WIDTH / (READOUT_LABEL_FONT_SIZE * 0.55)));
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
        const nextLine = line ? `${line} ${word}` : word;
        if (nextLine.length > maximumCharacters && line) {
            lines.push(line);
            line = word;
            continue;
        }
        line = nextLine;
    }
    if (line) {
        lines.push(line);
    }
    return lines;
}

function readoutPointForScore(scorePercent: number, radius = READOUT_RADIUS) {
    const angleRadians = (-90 - (scorePercent / 100) * MAX_BEAM_ANGLE_DEGREES) * Math.PI / 180;
    return {
        x: PIVOT_X + radius * Math.cos(angleRadians),
        y: PIVOT_Y + radius * Math.sin(angleRadians),
    };
}

type ScaleTrayProps = {
    beamAngle: number
    color: string
    rectangleHeight: number
    x: number
};

function ScaleTray({ beamAngle, color, rectangleHeight, x }: ScaleTrayProps) {
    return (
        <g transform={`rotate(${-beamAngle} ${x} ${PIVOT_Y})`}>
            <line stroke={COLORS.frame} strokeWidth="10" x1={x} x2={x - 90} y1={PIVOT_Y} y2={TRAY_Y} />
            <line stroke={COLORS.frame} strokeWidth="10" x1={x} x2={x + 90} y1={PIVOT_Y} y2={TRAY_Y} />
            <line
                stroke={COLORS.beam}
                strokeLinecap="round"
                strokeWidth="16"
                x1={x - TRAY_WIDTH / 2}
                x2={x + TRAY_WIDTH / 2}
                y1={TRAY_Y}
                y2={TRAY_Y}
            />
            <rect
                fill={color}
                height={rectangleHeight}
                rx="8"
                width={RECTANGLE_WIDTH}
                x={x - RECTANGLE_WIDTH / 2}
                y={TRAY_Y - rectangleHeight - 14}
            />
        </g>
    );
}