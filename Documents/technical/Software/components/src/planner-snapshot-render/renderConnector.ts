import type {
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    RelevanceConnectorViz,
    Side,
} from "../../../app/src/app.js";
import type { ResolvedSnapshotConnectorGeometry } from "../../../app/src/planner/resolveSnapshotConnectorGeometry.ts";
import { getPlannerPipeWidth } from "../../../app/src/planner/plannerVisualGeometry.ts";

import {
    buildPathGeometry,
    type PathGeometryInstruction,
    type Waypoint,
} from "../path-geometry";
import {
    pathGeometryBoundariesToClosedSvgPathData,
    pathGeometryCommandsToSvgPathData,
} from "../path-geometry/pathGeometrySvg";
import { boundsFromPoints } from "./bounds";
import {
    BASE_NODE_HEIGHT_PX,
    CONNECTOR_GEOMETRY_TRANSITION_LENGTH_MULTIPLIER,
    CONNECTOR_OUTLINE_WIDTH_PX,
    PIPE_INTERIOR_ALPHA,
    resolveSideFill,
    resolveSideStroke,
} from "./sceneConstants";
import {
    clamp01,
    getTweenNumberEndpoints,
    resolveTweenBooleanOpacity,
    resolveTweenNumber,
} from "./resolveTween";
import { renderPlannerSnapshotScene } from "./renderPlannerSnapshotScene";
import type {
    Bounds,
    PlannerSnapshotRenderMode,
    PlannerSnapshotRenderResult,
    RenderElementNode,
    SnapshotRenderInput,
} from "./renderTypes";
import { svgElement } from "./renderTree";

type SnapshotConnectorViz = ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
type DebateConnectorLayer = "pipeWalls" | "pipeInterior" | "fluid";
type ConnectorSweepDirection = SnapshotConnectorViz["direction"];
type ConnectorAnimationMode = "firstFill" | "sprout" | "static" | "updateSweep";

export type ConnectorRenderModel = {
    bounds: Bounds | undefined;
    centerlinePoints: Waypoint[];
    direction: ConnectorSweepDirection;
    fluidProgress: number;
    fluidWidth: number;
    id: string;
    opacity: number;
    pipeProgress: number;
    pipeWidth: number;
    side: Side;
    updateTransition?: {
        direction: ConnectorSweepDirection;
        fromFluidWidth: number;
        fromPipeWidth: number;
        progress: number;
        toFluidWidth: number;
        toPipeWidth: number;
    };
};

export function buildConnectorRenderModel(args: {
    geometry: ResolvedSnapshotConnectorGeometry | undefined;
    visual: SnapshotConnectorViz;
    percent: number;
    mode: PlannerSnapshotRenderMode;
}): ConnectorRenderModel | undefined {
    const scaleEndpoints = getTweenNumberEndpoints(args.visual.scale);
    const scoreEndpoints = getTweenNumberEndpoints(args.visual.score);
    const currentScale = Math.max(0, resolveTweenNumber(args.visual.scale, args.percent));
    const currentScore = resolveTweenNumber(args.visual.score, args.percent);
    const currentCenterlinePoints = args.geometry?.centerlinePoints ?? [];
    const currentPipeWidth = scaleToPipeWidth(currentScale);
    const currentFluidWidth = pipeWidthToFluidWidth(currentPipeWidth, currentScore);
    const fromPipeWidth = scaleToPipeWidth(scaleEndpoints.from);
    const toPipeWidth = scaleToPipeWidth(scaleEndpoints.to);
    const fromFluidWidth = pipeWidthToFluidWidth(fromPipeWidth, scoreEndpoints.from);
    const toFluidWidth = pipeWidthToFluidWidth(toPipeWidth, scoreEndpoints.to);
    const visibilityOpacity = args.visual.type === "confidenceConnector"
        ? resolveTweenBooleanOpacity(args.visual.visible, args.percent)
        : 1;
    const progress = clamp01(args.percent);

    if (Math.max(currentPipeWidth, fromPipeWidth, toPipeWidth) <= 0 || visibilityOpacity <= 0 || currentCenterlinePoints.length < 2) {
        return undefined;
    }

    const animationMode = resolveConnectorAnimationMode({
        argsMode: args.mode,
        animationType: args.visual.animationType,
        fromFluidWidth,
        fromPipeWidth,
        toFluidWidth,
        toPipeWidth,
    });
    const extentBounds = boundsFromPoints(
        currentCenterlinePoints,
        Math.max(currentPipeWidth, fromPipeWidth, toPipeWidth) / 2 + CONNECTOR_OUTLINE_WIDTH_PX,
    );

    switch (animationMode) {
        case "sprout":
            return {
                bounds: extentBounds,
                centerlinePoints: currentCenterlinePoints,
                direction: args.visual.direction,
                fluidProgress: 0,
                fluidWidth: toFluidWidth,
                id: args.visual.id,
                opacity: visibilityOpacity,
                pipeProgress: progress,
                pipeWidth: toPipeWidth,
                side: args.visual.side,
            };

        case "firstFill":
            return {
                bounds: extentBounds,
                centerlinePoints: currentCenterlinePoints,
                direction: args.visual.direction,
                fluidProgress: progress,
                fluidWidth: toFluidWidth,
                id: args.visual.id,
                opacity: visibilityOpacity,
                pipeProgress: 1,
                pipeWidth: toPipeWidth,
                side: args.visual.side,
            };

        case "updateSweep":
            return {
                bounds: extentBounds,
                centerlinePoints: currentCenterlinePoints,
                direction: args.visual.direction,
                fluidProgress: 1,
                fluidWidth: toFluidWidth,
                id: args.visual.id,
                opacity: visibilityOpacity,
                pipeProgress: 1,
                pipeWidth: toPipeWidth,
                side: args.visual.side,
                updateTransition: {
                    direction: args.visual.direction,
                    fromFluidWidth,
                    fromPipeWidth,
                    progress,
                    toFluidWidth,
                    toPipeWidth,
                },
            };

        default:
            return {
                bounds: extentBounds,
                centerlinePoints: currentCenterlinePoints,
                direction: args.visual.direction,
                fluidProgress: 1,
                fluidWidth: currentFluidWidth,
                id: args.visual.id,
                opacity: visibilityOpacity,
                pipeProgress: 1,
                pipeWidth: currentPipeWidth,
                side: args.visual.side,
            };
    }
}

export function renderConnector(model: ConnectorRenderModel, offset: { x: number; y: number }): RenderElementNode[] {
    return (["pipeWalls", "pipeInterior", "fluid"] satisfies DebateConnectorLayer[])
        .flatMap((layer) => renderConnectorSpan(model, layer, offset));
}

export function renderRelevanceConnectorAdjustSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "relevanceConnectorAdjust",
    });
}

export function renderConfidenceConnectorAdjustSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "confidenceConnectorAdjust",
    });
}

export function renderDeliveryConnectorAdjustSnapshot(input: SnapshotRenderInput): PlannerSnapshotRenderResult {
    return renderPlannerSnapshotScene({
        snapshot: input.snapshot,
        percent: input.percent,
        mode: "deliveryConnectorAdjust",
    });
}

function renderConnectorSpan(
    model: ConnectorRenderModel,
    layer: DebateConnectorLayer,
    offset: { x: number; y: number },
): RenderElementNode[] {
    if (model.updateTransition) {
        return renderConnectorUpdateTransition(model, layer, offset);
    }

    const layerProgress = layer === "fluid" ? model.fluidProgress : model.pipeProgress;
    const activeWidth = layer === "fluid" ? model.fluidWidth : model.pipeWidth;

    if (model.opacity <= 0 || layerProgress <= 0 || activeWidth <= 0.5) {
        return [];
    }

    const geometryInstructions = buildConnectorRevealInstructions(model, layer, layerProgress);
    const children = renderConnectorLayerNodes(model, layer, offset, geometryInstructions);

    return children.length > 0
        ? [
            svgElement("g", {
                attributes: {
                    "data-connector-id": model.id,
                    "data-connector-layer": layer,
                    opacity: model.opacity,
                },
                children,
            }),
        ]
        : [];
}

function renderConnectorUpdateTransition(
    model: ConnectorRenderModel,
    layer: DebateConnectorLayer,
    offset: { x: number; y: number },
): RenderElementNode[] {
    const updateTransition = model.updateTransition;

    if (!updateTransition || model.opacity <= 0) {
        return [];
    }

    const clampedProgress = clamp01(updateTransition.progress);
    const fromConnector: ConnectorRenderModel = {
        ...model,
        fluidWidth: updateTransition.fromFluidWidth,
        pipeWidth: updateTransition.fromPipeWidth,
        updateTransition: undefined,
    };
    const toConnector: ConnectorRenderModel = {
        ...model,
        fluidWidth: updateTransition.toFluidWidth,
        pipeWidth: updateTransition.toPipeWidth,
        updateTransition: undefined,
    };

    if (clampedProgress <= 0.0001) {
        return renderConnectorSpan(fromConnector, layer, offset);
    }

    if (clampedProgress >= 0.9999) {
        return renderConnectorSpan(toConnector, layer, offset);
    }

    const geometryInstructions = buildConnectorUpdateInstructions(model, layer);
    const children = renderConnectorLayerNodes(
        geometryInstructions ? model : toConnector,
        layer,
        offset,
        geometryInstructions,
    );

    return children.length > 0
        ? [
            svgElement("g", {
                attributes: {
                    "data-connector-id": model.id,
                    "data-connector-layer": layer,
                    opacity: model.opacity,
                },
                children,
            }),
        ]
        : [];
}

function renderConnectorLayerNodes(
    model: ConnectorRenderModel,
    layer: DebateConnectorLayer,
    offset: { x: number; y: number },
    geometryInstructions?: PathGeometryInstruction[],
): RenderElementNode[] {
    const translatedCenterlinePoints = model.centerlinePoints.map((point) => ({
        ...point,
        x: point.x + offset.x,
        y: point.y + offset.y,
    }));

    if (layer === "fluid" && !geometryInstructions && model.fluidWidth <= 0.5) {
        return [];
    }

    const bandInstructions = geometryInstructions ?? (layer === "fluid"
        ? buildDefaultFluidBandInstructions(model.pipeWidth, model.fluidWidth)
        : buildDefaultCenteredBandInstructions(model.pipeWidth));

    if (layer === "fluid") {
        const fluidGeometry = buildBandGeometry(translatedCenterlinePoints, bandInstructions);

        return fluidGeometry.closedPathData.length > 0
            ? [
                svgElement("path", {
                    attributes: {
                        d: fluidGeometry.closedPathData,
                        fill: resolveSideStroke(model.side),
                        stroke: "none",
                    },
                }),
            ]
            : [];
    }

    const pipeGeometry = buildBandGeometry(translatedCenterlinePoints, bandInstructions);

    if (layer === "pipeInterior") {
        return pipeGeometry.closedPathData.length > 0
            ? [
                svgElement("path", {
                    attributes: {
                        d: pipeGeometry.closedPathData,
                        fill: resolveSideFill(model.side, PIPE_INTERIOR_ALPHA),
                        stroke: "none",
                    },
                }),
            ]
            : [];
    }

    const children: RenderElementNode[] = [];

    if (pipeGeometry.boundaryAPathData.length > 0) {
        children.push(svgElement("path", {
            attributes: {
                d: pipeGeometry.boundaryAPathData,
                fill: "none",
                stroke: resolveSideStroke(model.side),
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                "stroke-width": CONNECTOR_OUTLINE_WIDTH_PX,
            },
        }));
    }

    if (pipeGeometry.boundaryBPathData.length > 0) {
        children.push(svgElement("path", {
            attributes: {
                d: pipeGeometry.boundaryBPathData,
                fill: "none",
                stroke: resolveSideStroke(model.side),
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                "stroke-width": CONNECTOR_OUTLINE_WIDTH_PX,
            },
        }));
    }

    return children;
}

function buildBandGeometry(
    centerlinePoints: Waypoint[],
    instructions: PathGeometryInstruction[],
): {
    boundaryAPathData: string;
    boundaryBPathData: string;
    closedPathData: string;
} {
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

function resolveConnectorAnimationMode(args: {
    argsMode: PlannerSnapshotRenderMode;
    animationType: SnapshotConnectorViz["animationType"];
    fromFluidWidth: number;
    fromPipeWidth: number;
    toFluidWidth: number;
    toPipeWidth: number;
}): ConnectorAnimationMode {
    const widthChanged = Math.abs(args.fromPipeWidth - args.toPipeWidth) > 1e-6
        || Math.abs(args.fromFluidWidth - args.toFluidWidth) > 1e-6;

    if (args.argsMode === "sprout" && args.animationType === "progressive") {
        return "sprout";
    }

    if (args.argsMode === "firstFill" && widthChanged) {
        return "firstFill";
    }

    if (
        (args.argsMode === "relevanceConnectorAdjust"
            || args.argsMode === "confidenceConnectorAdjust"
            || args.argsMode === "deliveryConnectorAdjust")
        && args.animationType === "progressive"
        && widthChanged
    ) {
        return "updateSweep";
    }

    return "static";
}

function scaleToPipeWidth(scale: number): number {
    return getPlannerPipeWidth(scale);
}

function pipeWidthToFluidWidth(pipeWidth: number, score: number): number {
    return pipeWidth * clamp01(score);
}

function buildConnectorRevealInstructions(
    connector: ConnectorRenderModel,
    layer: DebateConnectorLayer,
    progress: number,
): PathGeometryInstruction[] | undefined {
    const activeWidth = layer === "fluid" ? connector.fluidWidth : connector.pipeWidth;

    if (layer !== "fluid") {
        return buildConnectorOpenRevealInstructions(activeWidth, progress, connector.direction);
    }

    if (progress >= 1) {
        return undefined;
    }

    const fluidSection = buildFluidOffsetsInstruction(connector.pipeWidth, connector.fluidWidth);
    const transitionLengthPx = getConnectorGeometryTransitionLengthPx(activeWidth);
    const transitionPercent = lengthPxToApproximatePathPercent(connector.centerlinePoints, transitionLengthPx);
    const collapseOffset = getFluidBottomOffset(connector.pipeWidth);
    const progressPercent = clamp01(progress) * 100;

    if (connector.direction === "targetToSource") {
        return [
            {
                type: "extremity",
                kind: "curved",
                startPositionPercent: 100 - progressPercent,
                lengthPx: transitionLengthPx,
                collapseOffset,
            },
            fluidSection,
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ];
    }

    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        fluidSection,
        {
            type: "extremity",
            kind: "curved",
            startPositionPercent: Math.max(0, progressPercent - transitionPercent),
            lengthPx: transitionLengthPx,
            collapseOffset,
        },
    ];
}

function buildConnectorOpenRevealInstructions(
    width: number,
    progress: number,
    direction: ConnectorSweepDirection,
): PathGeometryInstruction[] | undefined {
    if (progress >= 1) {
        return undefined;
    }

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

function buildConnectorUpdateInstructions(
    connector: ConnectorRenderModel,
    layer: DebateConnectorLayer,
): PathGeometryInstruction[] | undefined {
    const updateTransition = connector.updateTransition;

    if (!updateTransition) {
        return undefined;
    }

    const fromWidth = layer === "fluid"
        ? updateTransition.fromFluidWidth
        : updateTransition.fromPipeWidth;
    const toWidth = layer === "fluid"
        ? updateTransition.toFluidWidth
        : updateTransition.toPipeWidth;

    if (Math.abs(fromWidth - toWidth) <= 1e-6) {
        return undefined;
    }

    const fromSection = layer === "fluid"
        ? buildFluidOffsetsInstruction(updateTransition.fromPipeWidth, updateTransition.fromFluidWidth)
        : buildCenteredOffsetsInstruction(updateTransition.fromPipeWidth);
    const toSection = layer === "fluid"
        ? buildFluidOffsetsInstruction(updateTransition.toPipeWidth, updateTransition.toFluidWidth)
        : buildCenteredOffsetsInstruction(updateTransition.toPipeWidth);
    const transitionLengthPx = getConnectorGeometryTransitionLengthPx(Math.max(fromWidth, toWidth));
    const transitionPercent = lengthPxToApproximatePathPercent(connector.centerlinePoints, transitionLengthPx);
    const progressPercent = clamp01(updateTransition.progress) * 100;

    if (updateTransition.direction === "targetToSource") {
        return [
            { type: "extremity", kind: "open", startPositionPercent: 0 },
            fromSection,
            {
                type: "transition",
                kind: "curved",
                startPositionPercent: progressPercent,
                lengthPx: transitionLengthPx,
            },
            toSection,
            { type: "extremity", kind: "open", startPositionPercent: 100 },
        ];
    }

    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        toSection,
        {
            type: "transition",
            kind: "curved",
            startPositionPercent: Math.max(0, progressPercent - transitionPercent),
            lengthPx: transitionLengthPx,
        },
        fromSection,
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function buildDefaultCenteredBandInstructions(width: number): PathGeometryInstruction[] {
    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        buildCenteredOffsetsInstruction(width),
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function buildDefaultFluidBandInstructions(pipeWidth: number, fluidWidth: number): PathGeometryInstruction[] {
    return [
        { type: "extremity", kind: "open", startPositionPercent: 0 },
        buildFluidOffsetsInstruction(pipeWidth, fluidWidth),
        { type: "extremity", kind: "open", startPositionPercent: 100 },
    ];
}

function buildCenteredOffsetsInstruction(width: number): PathGeometryInstruction {
    return { type: "offsets", offsetA: -(width / 2), offsetB: width / 2 };
}

function buildFluidOffsetsInstruction(pipeWidth: number, fluidWidth: number): PathGeometryInstruction {
    const bottomOffset = getFluidBottomOffset(pipeWidth);

    return {
        type: "offsets",
        offsetA: bottomOffset,
        offsetB: bottomOffset + fluidWidth,
    };
}

function getFluidBottomOffset(pipeWidth: number): number {
    return -(pipeWidth / 2);
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

