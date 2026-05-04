import type {
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    RelevanceConnectorViz,
    Side,
} from "../../../../app/src/planner/Snapshot.ts";
import { buildPathGeometry, type PathGeometryInstruction, type Waypoint } from "@reasontracker/components/src/path-geometry/buildPathGeometry";
import {
    pathGeometryBoundariesToClosedSvgPathData,
    pathGeometryCommandsToSvgPathData,
} from "@reasontracker/components/src/path-geometry/pathGeometrySvg";

import { getPlannerClaimHeight } from "./renderClaim";
import { resolveTweenBoolean, resolveTweenNumber, resolveTweenPoint } from "./resolveTween";
import { svgElement } from "./renderTree";
import type { RenderElementNode, RenderStepProgress } from "./renderTypes";

type BandGeometry = {
    boundaryAPathData: string;
    boundaryBPathData: string;
    closedPathData: string;
};

type ConnectorPathDefinition = {
    fill: string;
    pathData: string;
    stroke: string;
    strokeLinecap?: "round";
    strokeLinejoin?: "round";
    strokeWidth?: number;
};

const CONNECTOR_OUTLINE_WIDTH_PX = 4;
const PIPE_INTERIOR_ALPHA = 0.18;
const CONNECTOR_STUB_SHARE_OF_HORIZONTAL_SPAN = 0.2;
const CONNECTOR_BEND_RADIUS_SHARE_OF_AVAILABLE_MAX = 1;
const MAX_STRAIGHT_CONNECTOR_VERTICAL_DELTA_PX = 1;
const MIN_CONNECTOR_STRAIGHT_PX = 34;
const MIN_CONNECTOR_DIAGONAL_PX = 36;
const MIN_CONNECTOR_BEND_RADIUS_PX = 12;
const MIN_CONNECTOR_INNER_BEND_RADIUS_RATIO = 0.3;
const MIN_RENDERABLE_ANGULAR_BEND_SAGITTA_PX = 0.1;

export function renderConnector(
    args: {
        item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
    } & RenderStepProgress,
): RenderElementNode[] {
    const connector = resolveConnectorFields(args);

    if (args.item.type === "confidenceConnector" && !connector.visible) {
        return [];
    }

    const pipeWidth = getPlannerPipeWidth(connector.scale);

    if (pipeWidth <= 0.5) {
        return [];
    }

    const centerlinePoints = buildAngularConnectorCenterlinePoints(connector.source, connector.target, pipeWidth);

    if (centerlinePoints.length < 2) {
        return [];
    }

    const pipeGeometry = buildBandGeometry(
        centerlinePoints,
        buildDefaultCenteredBandInstructions(pipeWidth),
    );
    const fluidGeometry = buildBandGeometry(
        centerlinePoints,
        buildDefaultFluidBandInstructions(
            pipeWidth,
            pipeWidthToFluidWidth(pipeWidth, connector.score),
            resolveDefaultConnectorBandPlacement(args.item.side),
        ),
    );

    return [svgElement("g", {
        attributes: {
            "data-connector-id": String(args.item.id),
        },
        children: renderConnectorPathNodes(buildConnectorPathDefinitions({
            fluidGeometry,
            pipeGeometry,
            side: args.item.side,
        })),
    })];
}

export function getConnectorBounds(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const connector = resolveConnectorFields(args);

    return {
        maxX: Math.max(connector.source.x, connector.target.x),
        maxY: Math.max(connector.source.y, connector.target.y),
    };
}

function buildConnectorPathDefinitions(args: {
    fluidGeometry: BandGeometry;
    pipeGeometry: BandGeometry;
    side: Side;
}): ConnectorPathDefinition[] {
    const sideStroke = resolveSideStroke(args.side);

    return [
        {
            fill: resolveSideFill(args.side, PIPE_INTERIOR_ALPHA),
            pathData: args.pipeGeometry.closedPathData,
            stroke: "none",
        },
        {
            fill: sideStroke,
            pathData: args.fluidGeometry.closedPathData,
            stroke: "none",
        },
        {
            fill: "none",
            pathData: args.pipeGeometry.boundaryAPathData,
            stroke: sideStroke,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: CONNECTOR_OUTLINE_WIDTH_PX,
        },
        {
            fill: "none",
            pathData: args.pipeGeometry.boundaryBPathData,
            stroke: sideStroke,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: CONNECTOR_OUTLINE_WIDTH_PX,
        },
    ];
}

function renderConnectorPathNodes(pathDefinitions: ConnectorPathDefinition[]): RenderElementNode[] {
    const children: RenderElementNode[] = [];

    for (const pathDefinition of pathDefinitions) {
        if (pathDefinition.pathData.length === 0) {
            continue;
        }

        const attributes: Record<string, number | string> = {
            d: pathDefinition.pathData,
            fill: pathDefinition.fill,
            stroke: pathDefinition.stroke,
        };

        if (pathDefinition.strokeLinecap) {
            attributes["stroke-linecap"] = pathDefinition.strokeLinecap;
        }

        if (pathDefinition.strokeLinejoin) {
            attributes["stroke-linejoin"] = pathDefinition.strokeLinejoin;
        }

        if (pathDefinition.strokeWidth !== undefined) {
            attributes["stroke-width"] = pathDefinition.strokeWidth;
        }

        children.push(svgElement("path", {
            attributes,
        }));
    }

    return children;
}

function buildBandGeometry(
    centerlinePoints: Waypoint[],
    instructions: PathGeometryInstruction[],
): BandGeometry {
    const geometry = buildPathGeometry({
        points: centerlinePoints,
        instructions,
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

function buildDefaultCenteredBandInstructions(width: number): PathGeometryInstruction[] {
    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        { type: "offsets", offsetA: -(width / 2), offsetB: width / 2 },
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function buildDefaultFluidBandInstructions(
    pipeWidth: number,
    fluidWidth: number,
    bandPlacement: "center" | "lowerSide" | "upperSide",
): PathGeometryInstruction[] {
    const bandEnvelope = resolveConnectorBandEnvelope(pipeWidth, fluidWidth, bandPlacement);

    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        {
            type: "offsets",
            offsetA: bandEnvelope.topOffset,
            offsetB: bandEnvelope.bottomOffset,
        },
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function resolveDefaultConnectorBandPlacement(side: Side): "center" | "lowerSide" | "upperSide" {
    return side === "conMain" ? "upperSide" : "lowerSide";
}

function resolveConnectorBandEnvelope(
    pipeWidth: number,
    bandWidth: number,
    bandPlacement: "center" | "lowerSide" | "upperSide",
): { bottomOffset: number; collapseOffset: number; topOffset: number } {
    const safePipeWidth = Math.max(0, Number.isFinite(pipeWidth) ? pipeWidth : 0);
    const safeBandWidth = Math.min(safePipeWidth, Math.max(0, Number.isFinite(bandWidth) ? bandWidth : 0));

    if (bandPlacement === "center") {
        return {
            bottomOffset: safeBandWidth / 2,
            collapseOffset: 0,
            topOffset: -(safeBandWidth / 2),
        };
    }

    if (bandPlacement === "upperSide") {
        const collapseOffset = safePipeWidth / 2;

        return {
            bottomOffset: collapseOffset,
            collapseOffset,
            topOffset: collapseOffset - safeBandWidth,
        };
    }

    const collapseOffset = -(safePipeWidth / 2);

    return {
        bottomOffset: collapseOffset + safeBandWidth,
        collapseOffset,
        topOffset: collapseOffset,
    };
}

function buildAngularConnectorCenterlinePoints(
    source: { x: number; y: number },
    target: { x: number; y: number },
    pipeWidth: number,
): Waypoint[] {
    if (shouldUseStraightAngularConnector(source, target)) {
        return [source, target];
    }

    const bendGeometry = resolveAngularConnectorBendGeometry(source, target, pipeWidth);

    if (!bendGeometry) {
        return [source, target];
    }

    if (!shouldRoundAngularConnectorBends(bendGeometry)) {
        return [
            source,
            bendGeometry.bendPoints.bendStart,
            bendGeometry.bendPoints.bendEnd,
            target,
        ];
    }

    return [
        source,
        { ...bendGeometry.bendPoints.bendStart, radius: bendGeometry.bendRadius },
        { ...bendGeometry.bendPoints.bendEnd, radius: bendGeometry.bendRadius },
        target,
    ];
}

function resolveAngularConnectorBendGeometry(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
): {
    bendPoints: {
        bendEnd: { x: number; y: number };
        bendStart: { x: number; y: number };
        endStraightLength: number;
        startStraightLength: number;
    };
    bendRadius: number;
    diagonalTurnAngleRadians: number;
} | undefined {
    const bendPoints = resolveAngularConnectorBendPoints(startPoint, endPoint, pipeWidth);

    if (!bendPoints) {
        return undefined;
    }

    const diagonalDeltaX = Math.abs(bendPoints.bendStart.x - bendPoints.bendEnd.x);
    const diagonalDeltaY = Math.abs(bendPoints.bendStart.y - bendPoints.bendEnd.y);
    const diagonalTurnAngleRadians = Math.atan2(diagonalDeltaY, diagonalDeltaX);

    return {
        bendPoints,
        bendRadius: resolveDiagonalConnectorBendRadius(
            bendPoints.startStraightLength,
            bendPoints.endStraightLength,
            Math.hypot(diagonalDeltaX, diagonalDeltaY),
            diagonalTurnAngleRadians,
            getMinimumCenterlineBendRadius(pipeWidth),
        ),
        diagonalTurnAngleRadians,
    };
}

function resolveAngularConnectorBendPoints(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    pipeWidth: number,
): {
    bendEnd: { x: number; y: number };
    bendStart: { x: number; y: number };
    endStraightLength: number;
    startStraightLength: number;
} | undefined {
    const straightSegmentLength = resolveConnectorStraightSegmentLength(
        Math.max(0, startPoint.x - endPoint.x),
        getMinimumCenterlineBendRadius(pipeWidth),
    );

    if (straightSegmentLength <= 1) {
        return undefined;
    }

    return {
        bendEnd: { x: endPoint.x + straightSegmentLength, y: endPoint.y },
        bendStart: { x: startPoint.x - straightSegmentLength, y: startPoint.y },
        endStraightLength: straightSegmentLength,
        startStraightLength: straightSegmentLength,
    };
}

function shouldUseStraightAngularConnector(startPoint: { x: number; y: number }, endPoint: { x: number; y: number }): boolean {
    return Math.abs(startPoint.y - endPoint.y) <= MAX_STRAIGHT_CONNECTOR_VERTICAL_DELTA_PX;
}

function shouldRoundAngularConnectorBends(args: {
    bendRadius: number;
    diagonalTurnAngleRadians: number;
}): boolean {
    if (!Number.isFinite(args.bendRadius) || args.bendRadius < 8) {
        return false;
    }

    const sagitta = args.bendRadius * (1 - Math.cos(args.diagonalTurnAngleRadians / 2));
    return sagitta >= MIN_RENDERABLE_ANGULAR_BEND_SAGITTA_PX;
}

function resolveConnectorStraightSegmentLength(
    horizontalSpan: number,
    minimumCenterlineBendRadius: number,
): number {
    const maximumStraightSegmentLength = Math.max(0, (horizontalSpan - MIN_CONNECTOR_DIAGONAL_PX) / 2);

    if (maximumStraightSegmentLength <= 0) {
        return 0;
    }

    const preferredStraightSegmentLength = Math.max(
        MIN_CONNECTOR_STRAIGHT_PX,
        minimumCenterlineBendRadius,
        horizontalSpan * CONNECTOR_STUB_SHARE_OF_HORIZONTAL_SPAN,
    );

    return Math.min(preferredStraightSegmentLength, maximumStraightSegmentLength);
}

function resolveDiagonalConnectorBendRadius(
    startStraightLength: number,
    endStraightLength: number,
    diagonalLength: number,
    diagonalTurnAngleRadians: number,
    minimumCenterlineBendRadius: number,
): number {
    const maximumBendRadius = getMaximumDiagonalCornerBendRadius(
        startStraightLength,
        endStraightLength,
        diagonalLength,
        diagonalTurnAngleRadians,
    );
    const defaultPreferredBendRadius = maximumBendRadius * CONNECTOR_BEND_RADIUS_SHARE_OF_AVAILABLE_MAX;

    return Math.min(
        Math.max(
            MIN_CONNECTOR_BEND_RADIUS_PX,
            minimumCenterlineBendRadius,
            defaultPreferredBendRadius,
        ),
        maximumBendRadius,
    );
}

function getMaximumDiagonalCornerBendRadius(
    startStraightLength: number,
    endStraightLength: number,
    diagonalLength: number,
    diagonalTurnAngleRadians: number,
): number {
    const tangentFactor = Math.tan(diagonalTurnAngleRadians / 2);

    if (tangentFactor <= 1e-6) {
        return 0;
    }

    return Math.min(startStraightLength, endStraightLength, diagonalLength / 2) / tangentFactor;
}

function getMinimumCenterlineBendRadius(pipeWidth: number): number {
    return (Math.max(0, pipeWidth) / 2)
        + (Math.max(0, pipeWidth) * MIN_CONNECTOR_INNER_BEND_RADIUS_RATIO);
}

function getPlannerPipeWidth(scale: number): number {
    return getPlannerClaimHeight(scale);
}

function pipeWidthToFluidWidth(pipeWidth: number, score: number): number {
    return pipeWidth * clamp01(score);
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(1, Math.max(0, value));
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

function resolveConnectorFields(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
} & RenderStepProgress): {
    scale: number;
    score: number;
    source: { x: number; y: number };
    target: { x: number; y: number };
    visible: boolean;
} {
    return {
        scale: resolveTweenNumber(args.item.scale, args.stepProgress),
        score: resolveTweenNumber(args.item.score, args.stepProgress),
        source: resolveTweenPoint(args.item.source, args.stepProgress),
        target: resolveTweenPoint(args.item.target, args.stepProgress),
        visible: args.item.type === "confidenceConnector"
            ? resolveTweenBoolean(args.item.visible, args.stepProgress)
            : true,
    };
}
