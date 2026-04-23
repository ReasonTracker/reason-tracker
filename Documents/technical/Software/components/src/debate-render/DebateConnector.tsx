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
    layer: DebateConnectorLayer;
    outlineWidth: number;
    pipeWidth: number;
    side: Side;
}

export type DebateConnectorLayer = "pipeWalls" | "pipeInterior" | "fluid";

export const DebateConnector = ({
    centerlinePoints,
    fluidWidth,
    layer,
    outlineWidth,
    pipeWidth,
    side,
}: DebateConnectorProps) => {
    if (layer === "fluid") {
        if (fluidWidth <= 0.5) {
            return null;
        }

        const fluidGeometry = buildBandGeometry(centerlinePoints, fluidWidth);
        return fluidGeometry.closedPathData.length > 0
            ? <path d={fluidGeometry.closedPathData} fill={resolveSideStroke(side)} stroke="none" />
            : null;
    }

    const pipeGeometry = buildBandGeometry(centerlinePoints, pipeWidth);

    if (layer === "pipeInterior") {
        return pipeGeometry.closedPathData.length > 0
            ? <path d={pipeGeometry.closedPathData} fill={resolveSideFill(side, PIPE_INTERIOR_ALPHA)} stroke="none" />
            : null;
    }

    return (
        <g>
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
