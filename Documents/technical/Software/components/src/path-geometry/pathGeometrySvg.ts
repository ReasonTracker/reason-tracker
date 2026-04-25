import type { PathGeometryCommand } from "./buildPathGeometry";

export function pathGeometryCommandsToSvgPathData(
    commands: PathGeometryCommand[],
): string {
    return commands
        .map((command) => {
            if (command.kind === "moveTo") {
                return `M ${command.x} ${command.y}`;
            }

            if (command.kind === "lineTo") {
                return `L ${command.x} ${command.y}`;
            }

            return `A ${command.rx} ${command.ry} ${command.xAxisRotation} ${command.largeArc ? 1 : 0} ${command.sweep ? 1 : 0} ${command.x} ${command.y}`;
        })
        .join(" ");
}

export function pathGeometryBoundariesToClosedSvgPathData(
    boundaryACommands: PathGeometryCommand[],
    boundaryBCommands: PathGeometryCommand[],
): string {
    const boundaryASegments = commandsToSegments(boundaryACommands);
    const boundaryBSegments = commandsToSegments(boundaryBCommands);

    if (boundaryASegments.length === 0 || boundaryBSegments.length === 0) {
        return "";
    }

    const startPoint = boundaryASegments[0].start;
    const endPointA = boundaryASegments.at(-1)?.end ?? startPoint;
    const endPointB = boundaryBSegments.at(-1)?.end ?? boundaryBSegments[0].start;
    const reversedBoundaryBCommands = reverseBoundarySegments(boundaryBSegments);
    const trailingCommands = reversedBoundaryBCommands.slice(1);

    return [
        `M ${startPoint.x} ${startPoint.y}`,
        ...boundaryASegments.map(segmentToSvgCommand),
        pointsEqual(endPointA, endPointB) ? "" : `L ${endPointB.x} ${endPointB.y}`,
        ...trailingCommands.map((command) => {
            if (command.kind === "moveTo") {
                return "";
            }

            if (command.kind === "lineTo") {
                return `L ${command.x} ${command.y}`;
            }

            return `A ${command.rx} ${command.ry} ${command.xAxisRotation} ${command.largeArc ? 1 : 0} ${command.sweep ? 1 : 0} ${command.x} ${command.y}`;
        }),
        "Z",
    ]
        .filter((part) => part.length > 0)
        .join(" ");
}

type PathSegment =
    | {
        kind: "line";
        start: { x: number; y: number };
        end: { x: number; y: number };
    }
    | {
        kind: "arc";
        start: { x: number; y: number };
        end: { x: number; y: number };
        rx: number;
        ry: number;
        xAxisRotation: number;
        largeArc: boolean;
        sweep: boolean;
    };

function commandsToSegments(commands: PathGeometryCommand[]): PathSegment[] {
    const segments: PathSegment[] = [];
    let currentPoint: { x: number; y: number } | null = null;

    for (const command of commands) {
        if (command.kind === "moveTo") {
            currentPoint = { x: command.x, y: command.y };
            continue;
        }

        if (!currentPoint) {
            continue;
        }

        if (command.kind === "lineTo") {
            const nextPoint = { x: command.x, y: command.y };
            segments.push({ kind: "line", start: currentPoint, end: nextPoint });
            currentPoint = nextPoint;
            continue;
        }

        const nextPoint = { x: command.x, y: command.y };
        segments.push({
            kind: "arc",
            start: currentPoint,
            end: nextPoint,
            rx: command.rx,
            ry: command.ry,
            xAxisRotation: command.xAxisRotation,
            largeArc: command.largeArc,
            sweep: command.sweep,
        });
        currentPoint = nextPoint;
    }

    return segments;
}

function reverseBoundarySegments(
    segments: PathSegment[],
): PathGeometryCommand[] {
    if (segments.length === 0) {
        return [];
    }

    const reversed: PathGeometryCommand[] = [
        { kind: "moveTo", x: segments.at(-1)!.end.x, y: segments.at(-1)!.end.y },
    ];

    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const segment = segments[index];

        if (segment.kind === "line") {
            reversed.push({ kind: "lineTo", x: segment.start.x, y: segment.start.y });
            continue;
        }

        reversed.push({
            kind: "arc",
            rx: segment.rx,
            ry: segment.ry,
            xAxisRotation: segment.xAxisRotation,
            largeArc: segment.largeArc,
            sweep: !segment.sweep,
            x: segment.start.x,
            y: segment.start.y,
        });
    }

    return reversed;
}

function segmentToSvgCommand(segment: PathSegment): string {
    if (segment.kind === "line") {
        return `L ${segment.end.x} ${segment.end.y}`;
    }

    return `A ${segment.rx} ${segment.ry} ${segment.xAxisRotation} ${segment.largeArc ? 1 : 0} ${segment.sweep ? 1 : 0} ${segment.end.x} ${segment.end.y}`;
}

function pointsEqual(
    a: { x: number; y: number },
    b: { x: number; y: number },
): boolean {
    return Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6;
}
