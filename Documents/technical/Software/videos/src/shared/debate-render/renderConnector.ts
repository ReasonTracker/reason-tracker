import type {
    ConnectorVizDirection,
    Snapshot,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    RelevanceConnectorViz,
    Side,
    VizItem,
} from "../../../../app/src/planner/Snapshot.ts";
import { buildPathGeometry, type PathGeometryInstruction, type Waypoint } from "@reasontracker/components/src/path-geometry/buildPathGeometry";
import {
    pathGeometryBoundariesToClosedSvgPathData,
    pathGeometryCommandsToSvgPathData,
} from "@reasontracker/components/src/path-geometry/pathGeometrySvg";

import {
    resolveAggregatorOuterEdgeAttachment,
    resolveDeliveryAggregatorGeometry,
    resolveRelevanceAggregatorGeometry,
} from "./renderAggregator";
import { getPlannerClaimHeight, getPlannerClaimWidth } from "./renderClaim";
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

type ConnectorLayerAnimationMode = "openReveal" | "static" | "widthTransition";

type WidthEndpoints = {
    from: number;
    to: number;
};

type WidthTransitionState = {
    progress: number;
    transitionLengthPx: number;
};

type UnitVector = {
    x: number;
    y: number;
};

const CONNECTOR_OUTLINE_WIDTH_PX = 4;
const PIPE_INTERIOR_ALPHA = 0.2;
const CONNECTOR_GEOMETRY_TRANSITION_LENGTH_MULTIPLIER = 1;
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
        snapshot: Snapshot;
    } & RenderStepProgress,
): RenderElementNode[] {
    const connector = resolveConnectorFields(args);
    const scaleEndpoints = getTweenNumberEndpoints(args.item.scale);
    const scoreEndpoints = getTweenNumberEndpoints(args.item.score);

    if (args.item.type === "confidenceConnector" && !connector.visible) {
        return [];
    }

    const pipeWidthEndpoints = {
        from: getPlannerPipeWidth(scaleEndpoints.from),
        to: getPlannerPipeWidth(scaleEndpoints.to),
    };
    const currentPipeWidth = getPlannerPipeWidth(connector.scale);
    const fluidWidthEndpoints = {
        from: pipeWidthToFluidWidth(pipeWidthEndpoints.from, scoreEndpoints.from),
        to: pipeWidthToFluidWidth(pipeWidthEndpoints.to, scoreEndpoints.to),
    };
    const currentFluidWidth = pipeWidthToFluidWidth(currentPipeWidth, connector.score);
    const pipeMode = resolveConnectorLayerAnimationMode(args.item.animationType, pipeWidthEndpoints);
    const fluidMode = resolveConnectorLayerAnimationMode(args.item.animationType, fluidWidthEndpoints);
    const pipeWidthTransition = pipeMode === "widthTransition"
        ? buildWidthTransitionState(currentPipeWidth, pipeWidthEndpoints)
        : undefined;
    const fluidWidthTransition = fluidMode === "widthTransition"
        ? pipeWidthTransition ?? buildWidthTransitionState(currentFluidWidth, fluidWidthEndpoints)
        : undefined;
    const maxRenderablePipeWidth = args.item.animationType === "progressive"
        ? Math.max(currentPipeWidth, pipeWidthEndpoints.from, pipeWidthEndpoints.to)
        : currentPipeWidth;

    const centerlinePoints = buildAngularConnectorCenterlinePoints(
        connector.source,
        connector.target,
        maxRenderablePipeWidth,
        connector.targetApproachUnit,
    );

    if (centerlinePoints.length < 2) {
        return [];
    }

    const pipeGeometry = buildBandGeometryOrUndefined(
        centerlinePoints,
        buildPipeBandInstructions({
            centerlinePoints,
            currentWidth: currentPipeWidth,
            direction: args.item.direction,
            mode: pipeMode,
            widthTransition: pipeWidthTransition,
            widthEndpoints: pipeWidthEndpoints,
        }),
    );
    const fluidGeometry = buildBandGeometryOrUndefined(
        centerlinePoints,
        buildFluidBandInstructions({
            bandPlacement: resolveDefaultConnectorBandPlacement(args.item.side),
            centerlinePoints,
            currentFluidWidth,
            currentPipeWidth,
            direction: args.item.direction,
            fluidWidthEndpoints,
            mode: fluidMode,
            pipeWidthEndpoints,
            widthTransition: fluidWidthTransition,
        }),
    );

    if (!pipeGeometry && !fluidGeometry) {
        return [];
    }

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
    snapshot: Snapshot;
} & RenderStepProgress): { maxX: number; maxY: number } {
    const connector = resolveConnectorFields(args);

    return {
        maxX: Math.max(connector.source.x, connector.target.x),
        maxY: Math.max(connector.source.y, connector.target.y),
    };
}

function buildConnectorPathDefinitions(args: {
    fluidGeometry: BandGeometry | undefined;
    pipeGeometry: BandGeometry | undefined;
    side: Side;
}): ConnectorPathDefinition[] {
    const sideStroke = resolveSideStroke(args.side);
    const pathDefinitions: ConnectorPathDefinition[] = [];

    if (args.pipeGeometry) {
        pathDefinitions.push(
            {
                fill: resolveSideFill(args.side, PIPE_INTERIOR_ALPHA),
                pathData: args.pipeGeometry.closedPathData,
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
        );
    }

    if (args.fluidGeometry) {
        pathDefinitions.splice(args.pipeGeometry ? 1 : 0, 0, {
            fill: sideStroke,
            pathData: args.fluidGeometry.closedPathData,
            stroke: "none",
        });
    }

    return pathDefinitions;
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

function buildBandGeometryOrUndefined(
    centerlinePoints: Waypoint[],
    instructions: PathGeometryInstruction[] | undefined,
): BandGeometry | undefined {
    if (!instructions || instructions.length === 0) {
        return undefined;
    }

    const geometry = buildBandGeometry(centerlinePoints, instructions);

    if (
        geometry.boundaryAPathData.length === 0
        && geometry.boundaryBPathData.length === 0
        && geometry.closedPathData.length === 0
    ) {
        return undefined;
    }

    return geometry;
}

function buildDefaultCenteredBandInstructions(width: number): PathGeometryInstruction[] {
    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        buildCenteredOffsetsInstruction(width),
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function buildDefaultFluidBandInstructions(
    pipeWidth: number,
    fluidWidth: number,
    bandPlacement: "center" | "lowerSide" | "upperSide",
): PathGeometryInstruction[] {
    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        buildFluidBandProfile(pipeWidth, fluidWidth, bandPlacement).section,
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function buildPipeBandInstructions(args: {
    centerlinePoints: Waypoint[];
    currentWidth: number;
    direction: ConnectorVizDirection;
    mode: ConnectorLayerAnimationMode;
    widthEndpoints: WidthEndpoints;
    widthTransition?: WidthTransitionState;
}): PathGeometryInstruction[] | undefined {
    if (args.mode === "widthTransition") {
        const widthTransition = args.widthTransition ?? buildWidthTransitionState(args.currentWidth, args.widthEndpoints);

        return buildConnectorWidthUpdateInstructions({
            centerlinePoints: args.centerlinePoints,
            direction: args.direction,
            fromSection: buildCenteredOffsetsInstruction(args.widthEndpoints.from),
            fromWidth: args.widthEndpoints.from,
            progress: widthTransition.progress,
            toSection: buildCenteredOffsetsInstruction(args.widthEndpoints.to),
            toWidth: args.widthEndpoints.to,
            transitionLengthPx: widthTransition.transitionLengthPx,
        });
    }

    const pipeRevealProgress = args.mode === "openReveal"
        ? resolveConnectorRevealProgress(args.currentWidth, args.widthEndpoints)
        : 1;
    const pipeRevealWidth = args.mode === "openReveal"
        ? getRenderableTweenEndpoint(args.widthEndpoints)
        : args.currentWidth;

    if (pipeRevealWidth <= 0.5 || pipeRevealProgress <= 0) {
        return undefined;
    }

    if (pipeRevealProgress >= 1) {
        return buildDefaultCenteredBandInstructions(pipeRevealWidth);
    }

    return buildConnectorOpenRevealInstructions(pipeRevealWidth, pipeRevealProgress, args.direction);
}

function buildFluidBandInstructions(args: {
    bandPlacement: "center" | "lowerSide" | "upperSide";
    centerlinePoints: Waypoint[];
    currentFluidWidth: number;
    currentPipeWidth: number;
    direction: ConnectorVizDirection;
    fluidWidthEndpoints: WidthEndpoints;
    mode: ConnectorLayerAnimationMode;
    pipeWidthEndpoints: WidthEndpoints;
    widthTransition?: WidthTransitionState;
}): PathGeometryInstruction[] | undefined {
    if (args.mode === "widthTransition") {
        const widthTransition = args.widthTransition ?? buildWidthTransitionState(
            args.currentFluidWidth,
            args.fluidWidthEndpoints,
        );

        return buildConnectorWidthUpdateInstructions({
            centerlinePoints: args.centerlinePoints,
            direction: args.direction,
            fromSection: buildFluidBandProfile(
                args.pipeWidthEndpoints.from,
                args.fluidWidthEndpoints.from,
                args.bandPlacement,
            ).section,
            fromWidth: args.fluidWidthEndpoints.from,
            progress: widthTransition.progress,
            toSection: buildFluidBandProfile(
                args.pipeWidthEndpoints.to,
                args.fluidWidthEndpoints.to,
                args.bandPlacement,
            ).section,
            toWidth: args.fluidWidthEndpoints.to,
            transitionLengthPx: widthTransition.transitionLengthPx,
        });
    }

    const fluidRevealProgress = args.mode === "openReveal"
        ? resolveConnectorRevealProgress(args.currentFluidWidth, args.fluidWidthEndpoints)
        : 1;
    const fluidRevealWidth = args.mode === "openReveal"
        ? getRenderableTweenEndpoint(args.fluidWidthEndpoints)
        : args.currentFluidWidth;
    const fluidRevealPipeWidth = args.mode === "openReveal"
        ? getRenderableTweenEndpoint(args.pipeWidthEndpoints)
        : args.currentPipeWidth;

    if (fluidRevealWidth <= 0.5 || fluidRevealProgress <= 0) {
        return undefined;
    }

    if (fluidRevealProgress >= 1) {
        return buildDefaultFluidBandInstructions(fluidRevealPipeWidth, fluidRevealWidth, args.bandPlacement);
    }

    return buildConnectorFluidRevealInstructions({
        bandPlacement: args.bandPlacement,
        centerlinePoints: args.centerlinePoints,
        direction: args.direction,
        fluidWidth: fluidRevealWidth,
        pipeWidth: fluidRevealPipeWidth,
        progress: fluidRevealProgress,
    });
}

function buildConnectorFluidRevealInstructions(args: {
    bandPlacement: "center" | "lowerSide" | "upperSide";
    centerlinePoints: Waypoint[];
    direction: ConnectorVizDirection;
    fluidWidth: number;
    pipeWidth: number;
    progress: number;
}): PathGeometryInstruction[] {
    const fluidBandProfile = buildFluidBandProfile(args.pipeWidth, args.fluidWidth, args.bandPlacement);
    const transitionLengthPx = getConnectorGeometryTransitionLengthPx(args.fluidWidth);
    const transitionPercent = lengthPxToApproximatePathPercent(args.centerlinePoints, transitionLengthPx);
    const progressPercent = clamp01(args.progress) * 100;

    if (args.direction === "targetToSource") {
        return [
            {
                type: "extremity",
                kind: "curved",
                startPositionPercent: 100 - progressPercent,
                lengthPx: transitionLengthPx,
                collapseOffset: fluidBandProfile.collapseOffset,
            },
            fluidBandProfile.section,
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ];
    }

    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        fluidBandProfile.section,
        {
            type: "extremity",
            kind: "curved",
            startPositionPercent: Math.max(0, progressPercent - transitionPercent),
            lengthPx: transitionLengthPx,
            collapseOffset: fluidBandProfile.collapseOffset,
        },
    ];
}

function buildConnectorOpenRevealInstructions(
    width: number,
    progress: number,
    direction: ConnectorVizDirection,
): PathGeometryInstruction[] {
    const safeWidth = Math.max(0, width);
    const progressPercent = clamp01(progress) * 100;

    if (direction === "targetToSource") {
        return [
            { type: "extremity", kind: "open", startPositionPercent: 100 - progressPercent },
            buildCenteredOffsetsInstruction(safeWidth),
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ];
    }

    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        buildCenteredOffsetsInstruction(safeWidth),
        { type: "extremity", kind: "open", startPositionPercent: progressPercent },
    ];
}

function buildCenteredOffsetsInstruction(width: number): PathGeometryInstruction {
    return { type: "offsets", offsetA: -(width / 2), offsetB: width / 2 };
}

function buildConnectorWidthUpdateInstructions(args: {
    centerlinePoints: Waypoint[];
    direction: ConnectorVizDirection;
    fromSection: PathGeometryInstruction;
    fromWidth: number;
    progress: number;
    toSection: PathGeometryInstruction;
    toWidth: number;
    transitionLengthPx: number;
}): PathGeometryInstruction[] | undefined {
    const widestWidth = Math.max(args.fromWidth, args.toWidth);

    if (widestWidth <= 0.5) {
        return undefined;
    }

    const clampedProgress = clamp01(args.progress);

    if (clampedProgress <= 1e-6) {
        return [
            { type: "extremity", kind: "open", startPositionPercent: 0 },
            args.fromSection,
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ];
    }

    if (clampedProgress >= 1 - 1e-6) {
        return [
            { type: "extremity", kind: "open", startPositionPercent: 0 },
            args.toSection,
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ];
    }

    const transitionPercent = lengthPxToApproximatePathPercent(args.centerlinePoints, args.transitionLengthPx);
    const progressPercent = clampedProgress * 100;

    if (args.direction === "targetToSource") {
        return [
            { type: "extremity", kind: "open", startPositionPercent: 0 },
            args.fromSection,
            {
                type: "transition",
                kind: "curved",
                startPositionPercent: Math.max(0, (100 - progressPercent) - transitionPercent),
                lengthPx: args.transitionLengthPx,
            },
            args.toSection,
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ];
    }

    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        args.toSection,
        {
            type: "transition",
            kind: "curved",
            startPositionPercent: Math.max(0, progressPercent - transitionPercent),
            lengthPx: args.transitionLengthPx,
        },
        args.fromSection,
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function buildFluidBandProfile(
    pipeWidth: number,
    fluidWidth: number,
    bandPlacement: "center" | "lowerSide" | "upperSide",
): {
    collapseOffset: number;
    section: PathGeometryInstruction;
} {
    const bandEnvelope = resolveConnectorBandEnvelope(pipeWidth, fluidWidth, bandPlacement);

    return {
        collapseOffset: bandEnvelope.collapseOffset,
        section: {
            type: "offsets",
            offsetA: bandEnvelope.topOffset,
            offsetB: bandEnvelope.bottomOffset,
        },
    };
}

function lengthPxToApproximatePathPercent(points: Waypoint[], lengthPx: number): number {
    const pathLengthPx = estimateCenterlinePathLength(points);

    if (pathLengthPx <= 0.0001) {
        return 0;
    }

    return (Math.max(0, lengthPx) / pathLengthPx) * 100;
}

function estimateCenterlinePathLength(points: Waypoint[]): number {
    let totalLength = 0;

    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
        const previousPoint = points[pointIndex - 1];
        const point = points[pointIndex];

        totalLength += Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
    }

    return totalLength;
}

function getConnectorGeometryTransitionLengthPx(width: number): number {
    return Math.max(1, Math.round(Math.max(0, width) * CONNECTOR_GEOMETRY_TRANSITION_LENGTH_MULTIPLIER));
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
    targetApproachUnit?: UnitVector,
): Waypoint[] {
    if (shouldUseStraightAngularConnector(source, target)) {
        return [source, target];
    }

    const bendGeometry = resolveAngularConnectorBendGeometry(source, target, pipeWidth, targetApproachUnit);

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
    targetApproachUnit?: UnitVector,
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
    const bendPoints = resolveAngularConnectorBendPoints(startPoint, endPoint, pipeWidth, targetApproachUnit);

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
    targetApproachUnit?: UnitVector,
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

    const normalizedTargetApproachUnit = normalizeUnitVector(targetApproachUnit, { x: -1, y: 0 });

    return {
        bendEnd: {
            x: endPoint.x - (normalizedTargetApproachUnit.x * straightSegmentLength),
            y: endPoint.y - (normalizedTargetApproachUnit.y * straightSegmentLength),
        },
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
    snapshot: Snapshot;
} & RenderStepProgress): {
    scale: number;
    score: number;
    source: { x: number; y: number };
    target: { x: number; y: number };
    targetApproachUnit?: UnitVector;
    visible: boolean;
} {
    const source = resolveConnectorSourcePoint({
        item: args.item,
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    });
    const targetAttachment = resolveConnectorTargetAttachment({
        item: args.item,
        snapshot: args.snapshot,
        sourcePoint: source,
        stepProgress: args.stepProgress,
    });
    let targetSideOffset = 0;

    if (args.item.type !== "confidenceConnector" && args.item.targetSideOffset !== undefined) {
        targetSideOffset = resolveTweenNumber(args.item.targetSideOffset, args.stepProgress);
    }

    return {
        scale: resolveTweenNumber(args.item.scale, args.stepProgress),
        score: resolveTweenNumber(args.item.score, args.stepProgress),
        source,
        target: {
            x: targetAttachment.point.x + ((targetAttachment.tangent?.x ?? 0) * targetSideOffset),
            y: targetAttachment.point.y + ((targetAttachment.tangent?.y ?? 1) * targetSideOffset),
        },
        targetApproachUnit: targetAttachment.approachUnit,
        visible: args.item.type === "confidenceConnector"
            ? resolveTweenBoolean(args.item.visible, args.stepProgress)
            : true,
    };
}

function resolveConnectorSourcePoint(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
    snapshot: Snapshot;
    stepProgress: number;
}): { x: number; y: number } {
    if (args.item.type === "deliveryConnector") {
        return resolveDeliveryConnectorSourcePoint({
            item: args.item,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        });
    }

    const sourceClaimPosition = resolveClaimPositionPoint(args.snapshot, String(args.item.sourceClaimVizId), args.stepProgress);
    const oppositePoint = args.item.type === "confidenceConnector"
        ? resolveJunctionAttachmentPoint(
            args.snapshot,
            String(args.item.targetJunctionVizId),
            args.stepProgress,
            sourceClaimPosition,
        )
        : resolveRelevanceAggregatorAttachment({
            snapshot: args.snapshot,
            relevanceAggregatorVizId: String(args.item.targetRelevanceAggregatorVizId),
            stepProgress: args.stepProgress,
            oppositePoint: sourceClaimPosition,
            side: args.item.side,
        }).point;

    return resolveClaimAttachmentPoint({
        claimVizId: String(args.item.sourceClaimVizId),
        oppositePoint,
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    });
}

function resolveConnectorTargetAttachment(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
    snapshot: Snapshot;
    sourcePoint: { x: number; y: number };
    stepProgress: number;
}): {
    point: { x: number; y: number };
    approachUnit?: UnitVector;
    tangent?: UnitVector;
} {
    if (args.item.type === "deliveryConnector") {
        return resolveDeliveryAggregatorAttachment({
            deliveryConnectorVizId: String(args.item.id),
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        });
    }

    const targetId = args.item.type === "confidenceConnector"
        ? String(args.item.targetJunctionVizId)
        : String(args.item.targetRelevanceAggregatorVizId);

    if (args.item.type === "confidenceConnector") {
        return {
            point: resolveJunctionAttachmentPoint(
                args.snapshot,
                targetId,
                args.stepProgress,
                args.sourcePoint,
            ),
        };
    }

    if (args.item.type === "relevanceConnector") {
        return resolveRelevanceAggregatorAttachment({
            snapshot: args.snapshot,
            relevanceAggregatorVizId: targetId,
            stepProgress: args.stepProgress,
            oppositePoint: args.sourcePoint,
            side: args.item.side,
        });
    }

    return {
        point: resolveSnapshotPositionPoint(args.snapshot, targetId, args.stepProgress, args.sourcePoint),
    };
}

function resolveClaimAttachmentPoint(args: {
    claimVizId: string;
    oppositePoint: { x: number; y: number };
    snapshot: Snapshot;
    stepProgress: number;
}): { x: number; y: number } {
    const item = getSnapshotItem(args.snapshot, args.claimVizId);

    if (!item || item.type !== "claim") {
        return args.oppositePoint;
    }

    const position = resolveTweenPoint(item.position, args.stepProgress);
    const scale = resolveTweenNumber(item.scale, args.stepProgress);
    const halfWidth = getPlannerClaimWidth(scale) / 2;

    return {
        x: args.oppositePoint.x <= position.x ? position.x - halfWidth : position.x + halfWidth,
        y: position.y,
    };
}

function resolveClaimPositionPoint(
    snapshot: Snapshot,
    claimVizId: string,
    stepProgress: number,
): { x: number; y: number } {
    return resolveSnapshotPositionPoint(snapshot, claimVizId, stepProgress, { x: 0, y: 0 });
}

function resolveSnapshotPositionPoint(
    snapshot: Snapshot,
    itemId: string,
    stepProgress: number,
    fallbackPoint: { x: number; y: number },
): { x: number; y: number } {
    const item = getSnapshotItem(snapshot, itemId);

    if (!item || !hasPosition(item)) {
        return fallbackPoint;
    }

    return resolveTweenPoint(item.position, stepProgress);
}

function resolveJunctionAttachmentPoint(
    snapshot: Snapshot,
    itemId: string,
    stepProgress: number,
    oppositePoint: { x: number; y: number },
): { x: number; y: number } {
    const item = getSnapshotItem(snapshot, itemId);

    if (!item || item.type !== "junction") {
        return resolveSnapshotPositionPoint(snapshot, itemId, stepProgress, oppositePoint);
    }

    if (!resolveTweenBoolean(item.visible, stepProgress)) {
        return resolveTweenPoint(item.position, stepProgress);
    }

    const position = resolveTweenPoint(item.position, stepProgress);
    const span = Math.max(1, Math.round(resolveTweenNumber(item.incomingRelevanceScale, stepProgress)));
    const halfSpan = span / 2;

    return {
        x: oppositePoint.x <= position.x ? position.x - halfSpan : position.x + halfSpan,
        y: position.y,
    };
}

function resolveRelevanceJunctionAttachment(args: {
    snapshot: Snapshot;
    relevanceAggregatorVizId: string;
    stepProgress: number;
    oppositePoint: { x: number; y: number };
    side: Side;
}): {
    point: { x: number; y: number };
    approachUnit?: UnitVector;
    tangent: UnitVector;
} {
    const junctionItem = getJunctionForAggregator(args.snapshot, args.relevanceAggregatorVizId);

    if (!junctionItem) {
        return {
            point: resolveSnapshotPositionPoint(args.snapshot, args.relevanceAggregatorVizId, args.stepProgress, args.oppositePoint),
            tangent: { x: 1, y: 0 },
        };
    }

    const position = resolveTweenPoint(junctionItem.position, args.stepProgress);
    const span = Math.max(1, Math.round(resolveTweenNumber(junctionItem.incomingRelevanceScale, args.stepProgress)));
    const incomingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(junctionItem.incomingConfidenceScale, args.stepProgress)));
    const outgoingConfidenceHeight = Math.max(1, Math.round(resolveTweenNumber(junctionItem.outgoingConfidenceScale, args.stepProgress)));
    const leftHeight = args.side === "proMain"
        ? incomingConfidenceHeight
        : outgoingConfidenceHeight;
    const rightHeight = args.side === "proMain"
        ? outgoingConfidenceHeight
        : incomingConfidenceHeight;
    const leftX = position.x - (span / 2);
    const rightX = position.x + (span / 2);
    const attachToTop = args.oppositePoint.y <= position.y;
    const edgeStart = attachToTop
        ? { x: leftX, y: position.y - (leftHeight / 2) }
        : { x: leftX, y: position.y + (leftHeight / 2) };
    const edgeEnd = attachToTop
        ? { x: rightX, y: position.y - (rightHeight / 2) }
        : { x: rightX, y: position.y + (rightHeight / 2) };
    const edgeDirectionLeftToRight = normalizeUnitVector({
        x: edgeEnd.x - edgeStart.x,
        y: edgeEnd.y - edgeStart.y,
    }, { x: 1, y: 0 });
    const approachUnit = attachToTop
        ? normalizeUnitVector({
            x: -edgeDirectionLeftToRight.y,
            y: edgeDirectionLeftToRight.x,
        }, { x: 0, y: 1 })
        : normalizeUnitVector({
            x: edgeDirectionLeftToRight.y,
            y: -edgeDirectionLeftToRight.x,
        }, { x: 0, y: -1 });

    return {
        point: {
            x: (edgeStart.x + edgeEnd.x) / 2,
            y: (edgeStart.y + edgeEnd.y) / 2,
        },
        approachUnit,
        tangent: edgeDirectionLeftToRight,
    };
}

function resolveDeliveryAggregatorAttachment(args: {
    deliveryConnectorVizId: string;
    snapshot: Snapshot;
    stepProgress: number;
}): {
    point: { x: number; y: number };
    approachUnit?: UnitVector;
    tangent: UnitVector;
} {
    const aggregatorItem = getDeliveryAggregatorForConnector(args.snapshot, args.deliveryConnectorVizId);
    const attachment = resolveAggregatorOuterEdgeAttachment(
        aggregatorItem
            ? resolveDeliveryAggregatorGeometry({
                item: aggregatorItem,
                snapshot: args.snapshot,
                stepProgress: args.stepProgress,
            })
            : undefined,
    );

    if (attachment) {
        return attachment;
    }

    return {
        approachUnit: { x: -1, y: 0 },
        point: resolveSnapshotPositionPoint(args.snapshot, args.deliveryConnectorVizId, args.stepProgress, { x: 0, y: 0 }),
        tangent: { x: 0, y: 1 },
    };
}

function resolveRelevanceAggregatorAttachment(args: {
    snapshot: Snapshot;
    relevanceAggregatorVizId: string;
    stepProgress: number;
    oppositePoint: { x: number; y: number };
    side: Side;
}): {
    point: { x: number; y: number };
    approachUnit?: UnitVector;
    tangent: UnitVector;
} {
    const aggregatorItem = getSnapshotItem(args.snapshot, args.relevanceAggregatorVizId);
    const attachment = resolveAggregatorOuterEdgeAttachment(
        aggregatorItem?.type === "relevanceAggregator"
            ? resolveRelevanceAggregatorGeometry({
                item: aggregatorItem,
                snapshot: args.snapshot,
                stepProgress: args.stepProgress,
            })
            : undefined,
    );

    if (attachment) {
        return attachment;
    }

    return resolveRelevanceJunctionAttachment(args);
}

function resolveDeliveryConnectorSourcePoint(args: {
    item: DeliveryConnectorViz;
    snapshot: Snapshot;
    stepProgress: number;
}): { x: number; y: number } {
    const targetAttachment = resolveDeliveryAggregatorAttachment({
        deliveryConnectorVizId: String(args.item.id),
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    });
    const junctionItem = getSnapshotItem(args.snapshot, String(args.item.sourceJunctionVizId));

    if (junctionItem?.type === "junction" && resolveTweenBoolean(junctionItem.visible, args.stepProgress)) {
        return resolveJunctionAttachmentPoint(
            args.snapshot,
            String(args.item.sourceJunctionVizId),
            args.stepProgress,
            targetAttachment.point,
        );
    }

    const sourceClaimVizId = getSourceClaimVizIdForConfidenceConnector(args.snapshot, args.item.confidenceConnectorId);

    if (!sourceClaimVizId) {
        return resolveSnapshotPositionPoint(
            args.snapshot,
            String(args.item.sourceJunctionVizId),
            args.stepProgress,
            targetAttachment.point,
        );
    }

    return resolveClaimAttachmentPoint({
        claimVizId: sourceClaimVizId,
        oppositePoint: targetAttachment.point,
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    });
}

function getSourceClaimVizIdForConfidenceConnector(
    snapshot: Snapshot,
    confidenceConnectorId: DeliveryConnectorViz["confidenceConnectorId"],
): string | undefined {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "confidenceConnector" && item.confidenceConnectorId === confidenceConnectorId) {
            return String(item.sourceClaimVizId);
        }
    }

    return undefined;
}

function getDeliveryAggregatorForConnector(
    snapshot: Snapshot,
    deliveryConnectorVizId: string,
): Extract<VizItem, { type: "deliveryAggregator" }> | undefined {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (
            item?.type === "deliveryAggregator"
            && item.deliveryConnectorVizIds.some((connectorVizId) => String(connectorVizId) === deliveryConnectorVizId)
        ) {
            return item;
        }
    }

    return undefined;
}

function getJunctionForAggregator(snapshot: Snapshot, relevanceAggregatorVizId: string): Extract<VizItem, { type: "junction" }> | undefined {
    for (const item of Object.values(snapshot as Partial<Record<string, VizItem>>)) {
        if (item?.type === "junction" && String(item.relevanceAggregatorVizId) === relevanceAggregatorVizId) {
            return item;
        }
    }

    return undefined;
}

function getSnapshotItem(snapshot: Snapshot, itemId: string): VizItem | undefined {
    return (snapshot as Partial<Record<string, VizItem>>)[itemId];
}

function hasPosition(item: VizItem): item is Extract<VizItem, { position: unknown }> {
    return "position" in item;
}

function normalizeUnitVector(vector: UnitVector | undefined, fallback: UnitVector): UnitVector {
    if (!vector) {
        return fallback;
    }

    const length = Math.hypot(vector.x, vector.y);

    if (length <= 1e-6) {
        return fallback;
    }

    return {
        x: vector.x / length,
        y: vector.y / length,
    };
}

function getTweenNumberEndpoints(value: number | { type: "tween/number"; from: number; to: number }): { from: number; to: number } {
    if (typeof value === "number") {
        return {
            from: value,
            to: value,
        };
    }

    return {
        from: value.from,
        to: value.to,
    };
}

function getRenderableTweenEndpoint(endpoints: { from: number; to: number }): number {
    return Math.max(0, endpoints.from, endpoints.to);
}

function resolveConnectorLayerAnimationMode(
    animationType: "uniform" | "progressive",
    endpoints: { from: number; to: number },
): ConnectorLayerAnimationMode {
    if (animationType !== "progressive") {
        return "static";
    }

    const clampedFrom = Math.max(0, endpoints.from);
    const clampedTo = Math.max(0, endpoints.to);

    if (Math.abs(clampedFrom - clampedTo) <= 1e-6) {
        return "static";
    }

    if (clampedFrom <= 1e-6 || clampedTo <= 1e-6) {
        return "openReveal";
    }

    return "widthTransition";
}

function resolveConnectorRevealProgress(
    currentValue: number,
    endpoints: { from: number; to: number },
): number {
    const endpoint = getRenderableTweenEndpoint(endpoints);

    if (endpoint <= 1e-6) {
        return 0;
    }

    return clamp01(currentValue / endpoint);
}

function resolveWidthTransitionProgress(
    currentValue: number,
    endpoints: { from: number; to: number },
): number {
    const delta = endpoints.to - endpoints.from;

    if (Math.abs(delta) <= 1e-6) {
        return currentValue >= endpoints.to ? 1 : 0;
    }

    return clamp01((currentValue - endpoints.from) / delta);
}

function buildWidthTransitionState(
    currentWidth: number,
    widthEndpoints: WidthEndpoints,
): WidthTransitionState {
    return {
        progress: resolveWidthTransitionProgress(currentWidth, widthEndpoints),
        transitionLengthPx: getConnectorGeometryTransitionLengthPx(
            Math.max(widthEndpoints.from, widthEndpoints.to),
        ),
    };
}
