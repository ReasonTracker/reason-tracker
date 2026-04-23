import type { Side } from "@reasontracker/engine";

import {
    buildPathGeometry,
    type Waypoint,
} from "../path-geometry";
import {
    pathGeometryBoundariesToClosedSvgPathData,
    pathGeometryCommandsToSvgPathData,
} from "./pathGeometrySvg";

// AGENT NOTE: Keep connector-render tuning constants grouped here.
/** Alpha used for the empty pipe interior behind the fluid layer. */
const PIPE_INTERIOR_ALPHA = 0.18;

export interface DebateConnectorProps {
    centerlinePoints: Waypoint[];
    fluidWidth: number;
    outlineWidth: number;
    pipeWidth: number;
    side: Side;
}

export const DebateConnector = ({
    centerlinePoints,
    fluidWidth,
    outlineWidth,
    pipeWidth,
    side,
}: DebateConnectorProps) => {
    const pipeGeometry = buildBandGeometry(centerlinePoints, pipeWidth);
    const fluidGeometry = fluidWidth > 0.5
        ? buildBandGeometry(centerlinePoints, fluidWidth)
        : undefined;

    return (
        <g>
            {pipeGeometry.closedPathData.length > 0 ? (
                <path d={pipeGeometry.closedPathData} fill={resolveSideFill(side, PIPE_INTERIOR_ALPHA)} stroke="none" />
            ) : null}
            {pipeGeometry.boundaryAPathData.length > 0 ? (
                <path
                    d={pipeGeometry.boundaryAPathData}
                    fill="none"
                    stroke={resolveSideStroke(side)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={outlineWidth}
                />
            ) : null}
            {pipeGeometry.boundaryBPathData.length > 0 ? (
                <path
                    d={pipeGeometry.boundaryBPathData}
                    fill="none"
                    stroke={resolveSideStroke(side)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={outlineWidth}
                />
            ) : null}
            {fluidGeometry && fluidGeometry.closedPathData.length > 0 ? (
                <path d={fluidGeometry.closedPathData} fill={resolveSideStroke(side)} stroke="none" />
            ) : null}
        </g>
    );
};

function buildBandGeometry(centerlinePoints: Waypoint[], width: number): {
    boundaryAPathData: string;
    boundaryBPathData: string;
    closedPathData: string;
} {
    const geometry = buildPathGeometry({
        points: centerlinePoints,
        instructions: [
            { type: "extremity", kind: "open", startPositionPercent: 0 },
            { type: "offsets", offsetA: -(width / 2), offsetB: width / 2 },
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ],
    });

    return {
        boundaryAPathData: pathGeometryCommandsToSvgPathData(geometry.boundaryAPathCommands),
        boundaryBPathData: pathGeometryCommandsToSvgPathData(geometry.boundaryBPathCommands),
        closedPathData: pathGeometryBoundariesToClosedSvgPathData(
            geometry.boundaryAPathCommands,
            geometry.boundaryBPathCommands,
        ),
    };
}

function resolveSideStroke(side: Side): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}

function resolveSideFill(side: Side, alpha: number): string {
    if (side === "proMain") {
        return `hsl(var(--pro-h) 100% var(--pro-l) / ${alpha})`;
    }

    return `hsl(var(--con-h) 100% var(--con-l) / ${alpha})`;
}