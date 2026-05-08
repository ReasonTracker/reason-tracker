import type {
    ConnectorVizDirection,
    Snapshot,
    ConfidenceConnectorViz,
    DeliveryConnectorViz,
    RelevanceConnectorViz,
    Side,
    VizItem,
} from "@planner/Snapshot.ts";
import type { PlannerOptions } from "@planner/contracts.ts";
import {
    buildPathGeometry,
    fitPathGeometryCorners,
    type PathGeometryCornerFitIssue,
    type PathGeometryInstruction,
    type Waypoint,
} from "@reasontracker/components/src/path-geometry/buildPathGeometry";
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

type ConnectorRouteKind = "confidenceConnector" | "deliveryConnector" | "relevanceConnector";

type ConnectorRouteIssueCode =
    | "connector-route-missing-source-direction"
    | "connector-route-missing-target-approach"
    | "connector-route-missing-target-tangent"
    | "connector-route-no-forward-intersection"
    | "connector-route-parallel-tangents";

type ConnectorRouteIssue = {
    code: ConnectorRouteIssueCode;
    message: string;
};

type ConnectorAttachment = {
    departureUnit?: UnitVector;
    point: { x: number; y: number };
};

type ConnectorRouteResolution = {
    cornerFitIssues: PathGeometryCornerFitIssue[];
    layoutIssueCodes: string[];
    points: Waypoint[];
    routeIssues: ConnectorRouteIssue[];
};

// AGENT NOTE: Keep tunable numeric rendering constants grouped here.
const CONNECTOR_OUTLINE_WIDTH_PX = 4;
const OUTLINE_WIDTH_SHARE_OF_BASE_CLAIM_HEIGHT = CONNECTOR_OUTLINE_WIDTH_PX / 176;
const PIPE_INTERIOR_ALPHA = 0.2;
const CONNECTOR_GEOMETRY_TRANSITION_LENGTH_MULTIPLIER = 1;
const ROUTE_GEOMETRY_EPSILON = 1e-6;

export function renderConnector(
    args: {
        item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
        plannerOptions: PlannerOptions;
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
        from: getPlannerPipeWidth(scaleEndpoints.from, args.plannerOptions),
        to: getPlannerPipeWidth(scaleEndpoints.to, args.plannerOptions),
    };
    const currentPipeWidth = getPlannerPipeWidth(connector.scale, args.plannerOptions);
    const fluidWidthEndpoints = {
        from: pipeWidthToFluidWidth(pipeWidthEndpoints.from, scoreEndpoints.from),
        to: pipeWidthToFluidWidth(pipeWidthEndpoints.to, scoreEndpoints.to),
    };
    const currentFluidWidth = pipeWidthToFluidWidth(currentPipeWidth, connector.score);
    const currentOutlineWidth = getPlannerOutlineWidth(connector.scale, args.plannerOptions);
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

    const centerlineRoute = resolvePlannerOwnedConnectorRoute({
        item: args.item,
        pipeWidth: maxRenderablePipeWidth,
        stepProgress: args.stepProgress,
    }) ?? buildAngularConnectorCenterlinePoints({
        kind: args.item.type,
        pipeWidth: maxRenderablePipeWidth,
        source: connector.source,
        sourceDepartureUnit: connector.sourceDepartureUnit,
        target: connector.target,
        targetApproachUnit: connector.targetApproachUnit,
        targetTangentUnit: connector.targetTangentUnit,
    });

    if (
        centerlineRoute.routeIssues.length > 0
        || centerlineRoute.cornerFitIssues.length > 0
        || centerlineRoute.layoutIssueCodes.length > 0
    ) {
        console.warn("Connector geometry issues", {
            connectorId: String(args.item.id),
            cornerFitIssues: centerlineRoute.cornerFitIssues,
            layoutIssueCodes: centerlineRoute.layoutIssueCodes,
            routeIssues: centerlineRoute.routeIssues,
            source: connector.source,
            sourceDepartureUnit: connector.sourceDepartureUnit,
            target: connector.target,
            targetApproachUnit: connector.targetApproachUnit,
            targetTangentUnit: connector.targetTangentUnit,
        });
    }

    if (centerlineRoute.points.length < 2) {
        if (centerlineRoute.routeIssues.length === 0 && centerlineRoute.cornerFitIssues.length === 0) {
            return [];
        }

        return [svgElement("g", {
            attributes: buildConnectorGroupAttributes(String(args.item.id), centerlineRoute),
            children: [],
        })];
    }

    const centerlinePoints = centerlineRoute.points;

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
        attributes: buildConnectorGroupAttributes(String(args.item.id), centerlineRoute),
        children: renderConnectorPathNodes(buildConnectorPathDefinitions({
            fluidGeometry,
            outlineWidth: currentOutlineWidth,
            pipeGeometry,
            side: args.item.side,
        })),
    })];
}

export function getConnectorBounds(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
    plannerOptions: PlannerOptions;
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
    outlineWidth: number;
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
                strokeWidth: args.outlineWidth,
            },
            {
                fill: "none",
                pathData: args.pipeGeometry.boundaryBPathData,
                stroke: sideStroke,
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: args.outlineWidth,
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

function buildConnectorGroupAttributes(
    connectorId: string,
    centerlineRoute: ConnectorRouteResolution,
): Record<string, string> {
    const attributes: Record<string, string> = {
        "data-connector-id": connectorId,
    };

    if (centerlineRoute.routeIssues.length > 0) {
        attributes["data-route-issues"] = centerlineRoute.routeIssues.map((issue) => issue.code).join(" ");
    }

    if (centerlineRoute.cornerFitIssues.length > 0) {
        attributes["data-corner-fit-issues"] = centerlineRoute.cornerFitIssues.map((issue) => issue.code).join(" ");
    }

    if (centerlineRoute.layoutIssueCodes.length > 0) {
        attributes["data-layout-issues"] = centerlineRoute.layoutIssueCodes.join(" ");
    }

    return attributes;
}

function resolvePlannerOwnedConnectorRoute(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
    pipeWidth: number;
    stepProgress: number;
}): ConnectorRouteResolution | undefined {
    if (args.item.type !== "deliveryConnector" || !args.item.centerlineWaypoints || args.item.centerlineWaypoints.length < 2) {
        return undefined;
    }

    const routedPoints = args.item.centerlineWaypoints.map((point) => resolveTweenPoint(point, args.stepProgress));
    const fittedCorners = fitPathGeometryCorners({
        offsetEnvelope: {
            maxOffset: Math.max(0, args.pipeWidth) / 2,
            minOffset: -(Math.max(0, args.pipeWidth) / 2),
        },
        points: routedPoints,
    });

    return {
        cornerFitIssues: fittedCorners.issues,
        layoutIssueCodes: args.item.layoutIssueCodes ?? [],
        points: fittedCorners.points,
        routeIssues: [],
    };
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
    args: {
        kind: ConnectorRouteKind;
        pipeWidth: number;
        source: { x: number; y: number };
        sourceDepartureUnit?: UnitVector;
        target: { x: number; y: number };
        targetApproachUnit?: UnitVector;
        targetTangentUnit?: UnitVector;
    },
): ConnectorRouteResolution {
    if (args.kind === "confidenceConnector") {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [args.source, args.target],
            routeIssues: [],
        };
    }

    const targetApproachUnit = tryNormalizeUnitVector(args.targetApproachUnit);

    if (!targetApproachUnit) {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [],
            routeIssues: [{
                code: "connector-route-missing-target-approach",
                message: "The connector route could not resolve a target approach direction from the target attachment geometry.",
            }],
        };
    }

    const sourceDepartureUnit = tryNormalizeUnitVector(args.sourceDepartureUnit);

    if (!sourceDepartureUnit) {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [],
            routeIssues: [{
                code: "connector-route-missing-source-direction",
                message: "The connector route could not resolve a source departure direction from the source attachment geometry.",
            }],
        };
    }

    const reverseTargetApproachUnit = {
        x: -targetApproachUnit.x,
        y: -targetApproachUnit.y,
    };

    if (args.kind === "deliveryConnector" && areParallelDirections(sourceDepartureUnit, reverseTargetApproachUnit)) {
        return buildParallelEndpointConnectorRoute({
            pipeWidth: args.pipeWidth,
            source: args.source,
            sourceDepartureUnit,
            target: args.target,
            targetTangentUnit: args.targetTangentUnit,
        });
    }

    const rayIntersection = resolveForwardRayIntersection(
        args.source,
        sourceDepartureUnit,
        args.target,
        reverseTargetApproachUnit,
    );

    if (!rayIntersection) {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [],
            routeIssues: [{
                code: areParallelDirections(sourceDepartureUnit, reverseTargetApproachUnit)
                    ? "connector-route-parallel-tangents"
                    : "connector-route-no-forward-intersection",
                message: areParallelDirections(sourceDepartureUnit, reverseTargetApproachUnit)
                    ? "The connector source tangent ray and reverse target-approach ray are parallel or nearly parallel."
                    : "The connector source tangent ray and reverse target-approach ray do not intersect in the forward direction for both endpoints.",
            }],
        };
    }

    if (pointsAlmostEqual(args.source, rayIntersection.point) || pointsAlmostEqual(args.target, rayIntersection.point)) {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [args.source, args.target],
            routeIssues: [],
        };
    }

    const fittedCorners = fitPathGeometryCorners({
        offsetEnvelope: {
            maxOffset: Math.max(0, args.pipeWidth) / 2,
            minOffset: -(Math.max(0, args.pipeWidth) / 2),
        },
        points: [
            args.source,
            rayIntersection.point,
            args.target,
        ],
    });

    return {
        cornerFitIssues: fittedCorners.issues,
        layoutIssueCodes: [],
        points: fittedCorners.points,
        routeIssues: [],
    };
}

function buildParallelEndpointConnectorRoute(
    args: {
        pipeWidth: number;
        source: { x: number; y: number };
        sourceDepartureUnit: UnitVector;
        target: { x: number; y: number };
        targetTangentUnit?: UnitVector;
    },
): ConnectorRouteResolution {
    const routeNormalUnit = tryNormalizeUnitVector(args.targetTangentUnit);

    if (!routeNormalUnit) {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [],
            routeIssues: [{
                code: "connector-route-missing-target-tangent",
                message: "The delivery connector route could not resolve a target tangent direction from the target attachment geometry.",
            }],
        };
    }

    const sourceToTarget = subtractPoint(args.target, args.source);
    const forwardDistancePx = dotProduct(sourceToTarget, args.sourceDepartureUnit);
    const crossDistancePx = dotProduct(sourceToTarget, routeNormalUnit);

    if (forwardDistancePx <= ROUTE_GEOMETRY_EPSILON) {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [],
            routeIssues: [{
                code: "connector-route-no-forward-intersection",
                message: "The delivery connector target is not forward along the source departure direction, so no endpoint-derived routed path could be resolved.",
            }],
        };
    }

    if (Math.abs(crossDistancePx) <= ROUTE_GEOMETRY_EPSILON) {
        return {
            cornerFitIssues: [],
            layoutIssueCodes: [],
            points: [args.source, args.target],
            routeIssues: [],
        };
    }

    const tangentDistancePx = resolveParallelEndpointCornerTangentDistance(forwardDistancePx, crossDistancePx);
    const bendStart = addPoint(args.source, scaleUnitVector(args.sourceDepartureUnit, tangentDistancePx));
    const bendEnd = addPoint(args.target, scaleUnitVector(args.sourceDepartureUnit, -tangentDistancePx));
    const fittedCorners = fitPathGeometryCorners({
        offsetEnvelope: {
            maxOffset: Math.max(0, args.pipeWidth) / 2,
            minOffset: -(Math.max(0, args.pipeWidth) / 2),
        },
        points: [
            args.source,
            bendStart,
            bendEnd,
            args.target,
        ],
    });

    return {
        cornerFitIssues: fittedCorners.issues,
        layoutIssueCodes: [],
        points: fittedCorners.points,
        routeIssues: [],
    };
}

function resolveParallelEndpointCornerTangentDistance(
    forwardDistancePx: number,
    crossDistancePx: number,
): number {
    const safeForwardDistancePx = Math.max(0, forwardDistancePx);
    const safeCrossDistancePx = Math.abs(crossDistancePx);

    if (safeForwardDistancePx <= ROUTE_GEOMETRY_EPSILON) {
        return 0;
    }

    const zeroRemainderTangentDistancePx = (
        (safeForwardDistancePx * safeForwardDistancePx)
        + (safeCrossDistancePx * safeCrossDistancePx)
    ) / (4 * safeForwardDistancePx);

    return Math.min(safeForwardDistancePx / 2, zeroRemainderTangentDistancePx);
}

function getPlannerPipeWidth(scale: number, plannerOptions: PlannerOptions): number {
    return getPlannerClaimHeight(scale, plannerOptions);
}

function getPlannerOutlineWidth(scale: number, plannerOptions: PlannerOptions): number {
    return getPlannerPipeWidth(scale, plannerOptions) * OUTLINE_WIDTH_SHARE_OF_BASE_CLAIM_HEIGHT;
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
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
} & RenderStepProgress): {
    scale: number;
    score: number;
    source: { x: number; y: number };
    sourceDepartureUnit?: UnitVector;
    target: { x: number; y: number };
    targetApproachUnit?: UnitVector;
    targetTangentUnit?: UnitVector;
    visible: boolean;
} {
    const sourceAttachment = resolveConnectorSourceAttachment({
        item: args.item,
        plannerOptions: args.plannerOptions,
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    });
    const targetAttachment = resolveConnectorTargetAttachment({
        item: args.item,
        plannerOptions: args.plannerOptions,
        snapshot: args.snapshot,
        sourcePoint: sourceAttachment.point,
        stepProgress: args.stepProgress,
    });
    let targetSideOffset = 0;

    if (args.item.type !== "confidenceConnector" && args.item.targetSideOffset !== undefined) {
        targetSideOffset = resolveTweenNumber(args.item.targetSideOffset, args.stepProgress);
    }

    return {
        scale: resolveTweenNumber(args.item.scale, args.stepProgress),
        score: resolveTweenNumber(args.item.score, args.stepProgress),
        source: sourceAttachment.point,
        sourceDepartureUnit: sourceAttachment.departureUnit,
        target: {
            x: targetAttachment.point.x + ((targetAttachment.tangent?.x ?? 0) * targetSideOffset),
            y: targetAttachment.point.y + ((targetAttachment.tangent?.y ?? 1) * targetSideOffset),
        },
        targetApproachUnit: targetAttachment.approachUnit,
        targetTangentUnit: targetAttachment.tangent,
        visible: args.item.type === "confidenceConnector"
            ? resolveTweenBoolean(args.item.visible, args.stepProgress)
            : true,
    };
}

function resolveConnectorSourceAttachment(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
    stepProgress: number;
}): ConnectorAttachment {
    if (args.item.type === "deliveryConnector") {
        return resolveDeliveryConnectorSourceAttachment({
            item: args.item,
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        });
    }

    const sourceClaimPosition = resolveClaimPositionPoint(args.snapshot, String(args.item.sourceClaimVizId), args.stepProgress);
    const oppositePoint = args.item.type === "confidenceConnector"
        ? resolveJunctionAttachment(
            args.snapshot,
            String(args.item.targetJunctionVizId),
            args.stepProgress,
            sourceClaimPosition,
        ).point
        : resolveRelevanceAggregatorAttachment({
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            relevanceAggregatorVizId: String(args.item.targetRelevanceAggregatorVizId),
            stepProgress: args.stepProgress,
            oppositePoint: sourceClaimPosition,
            side: args.item.side,
        }).point;

    return resolveClaimAttachment({
        claimVizId: String(args.item.sourceClaimVizId),
        oppositePoint,
        plannerOptions: args.plannerOptions,
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    });
}

function resolveConnectorTargetAttachment(args: {
    item: ConfidenceConnectorViz | DeliveryConnectorViz | RelevanceConnectorViz;
    plannerOptions: PlannerOptions;
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
            plannerOptions: args.plannerOptions,
            snapshot: args.snapshot,
            stepProgress: args.stepProgress,
        });
    }

    const targetId = args.item.type === "confidenceConnector"
        ? String(args.item.targetJunctionVizId)
        : String(args.item.targetRelevanceAggregatorVizId);

    if (args.item.type === "confidenceConnector") {
        return {
            point: resolveJunctionAttachment(
                args.snapshot,
                targetId,
                args.stepProgress,
                args.sourcePoint,
            ).point,
        };
    }

    if (args.item.type === "relevanceConnector") {
        return resolveRelevanceAggregatorAttachment({
            plannerOptions: args.plannerOptions,
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

function resolveClaimAttachment(args: {
    claimVizId: string;
    oppositePoint: { x: number; y: number };
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
    stepProgress: number;
}): ConnectorAttachment {
    const item = getSnapshotItem(args.snapshot, args.claimVizId);

    if (!item || item.type !== "claim") {
        return { point: args.oppositePoint };
    }

    const position = resolveTweenPoint(item.position, args.stepProgress);
    const scale = resolveTweenNumber(item.scale, args.stepProgress);
    const halfWidth = getPlannerClaimWidth(scale, args.plannerOptions) / 2;
    const attachOnLeft = args.oppositePoint.x <= position.x;

    return {
        departureUnit: attachOnLeft ? { x: -1, y: 0 } : { x: 1, y: 0 },
        point: {
            x: attachOnLeft ? position.x - halfWidth : position.x + halfWidth,
            y: position.y,
        },
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

function resolveJunctionAttachment(
    snapshot: Snapshot,
    itemId: string,
    stepProgress: number,
    oppositePoint: { x: number; y: number },
): ConnectorAttachment {
    const item = getSnapshotItem(snapshot, itemId);

    if (!item || item.type !== "junction") {
        return { point: resolveSnapshotPositionPoint(snapshot, itemId, stepProgress, oppositePoint) };
    }

    if (!resolveTweenBoolean(item.visible, stepProgress)) {
        return { point: resolveTweenPoint(item.position, stepProgress) };
    }

    const position = resolveTweenPoint(item.position, stepProgress);
    const span = resolveNonNegativeDimension(resolveTweenNumber(item.incomingRelevanceScale, stepProgress));
    const halfSpan = span / 2;
    const attachOnLeft = oppositePoint.x <= position.x;

    return {
        departureUnit: attachOnLeft ? { x: -1, y: 0 } : { x: 1, y: 0 },
        point: {
            x: attachOnLeft ? position.x - halfSpan : position.x + halfSpan,
            y: position.y,
        },
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
    const span = resolveNonNegativeDimension(resolveTweenNumber(junctionItem.incomingRelevanceScale, args.stepProgress));
    const incomingConfidenceHeight = resolveNonNegativeDimension(resolveTweenNumber(junctionItem.incomingConfidenceScale, args.stepProgress));
    const outgoingDeliveryHeight = resolveNonNegativeDimension(resolveTweenNumber(junctionItem.outgoingDeliveryScale, args.stepProgress));
    const leftHeight = args.side === "proMain"
        ? incomingConfidenceHeight
        : outgoingDeliveryHeight;
    const rightHeight = args.side === "proMain"
        ? outgoingDeliveryHeight
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
    plannerOptions: PlannerOptions;
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
                plannerOptions: args.plannerOptions,
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
    plannerOptions: PlannerOptions;
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
                plannerOptions: args.plannerOptions,
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

function resolveDeliveryConnectorSourceAttachment(args: {
    item: DeliveryConnectorViz;
    plannerOptions: PlannerOptions;
    snapshot: Snapshot;
    stepProgress: number;
}): ConnectorAttachment {
    const targetAttachment = resolveDeliveryAggregatorAttachment({
        deliveryConnectorVizId: String(args.item.id),
        plannerOptions: args.plannerOptions,
        snapshot: args.snapshot,
        stepProgress: args.stepProgress,
    });
    const junctionItem = getSnapshotItem(args.snapshot, String(args.item.sourceJunctionVizId));

    if (junctionItem?.type === "junction" && resolveTweenBoolean(junctionItem.visible, args.stepProgress)) {
        return resolveJunctionAttachment(
            args.snapshot,
            String(args.item.sourceJunctionVizId),
            args.stepProgress,
            targetAttachment.point,
        );
    }

    const sourceClaimVizId = getSourceClaimVizIdForConfidenceConnector(args.snapshot, args.item.confidenceConnectorId);

    if (!sourceClaimVizId) {
        return {
            point: resolveSnapshotPositionPoint(
                args.snapshot,
                String(args.item.sourceJunctionVizId),
                args.stepProgress,
                targetAttachment.point,
            ),
        };
    }

    return resolveClaimAttachment({
        claimVizId: sourceClaimVizId,
        oppositePoint: targetAttachment.point,
        plannerOptions: args.plannerOptions,
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

function tryNormalizeUnitVector(vector: UnitVector | undefined): UnitVector | undefined {
    if (!vector) {
        return undefined;
    }

    const length = Math.hypot(vector.x, vector.y);

    if (length <= ROUTE_GEOMETRY_EPSILON) {
        return undefined;
    }

    return {
        x: vector.x / length,
        y: vector.y / length,
    };
}

function resolveForwardRayIntersection(
    source: { x: number; y: number },
    sourceDirection: UnitVector,
    target: { x: number; y: number },
    targetDirection: UnitVector,
): { point: { x: number; y: number } } | undefined {
    const denominator = crossProduct(sourceDirection, targetDirection);

    if (Math.abs(denominator) <= ROUTE_GEOMETRY_EPSILON) {
        return undefined;
    }

    const sourceToTarget = subtractPoint(target, source);
    const sourceDistancePx = crossProduct(sourceToTarget, targetDirection) / denominator;
    const targetDistancePx = crossProduct(sourceToTarget, sourceDirection) / denominator;

    if (sourceDistancePx < -ROUTE_GEOMETRY_EPSILON || targetDistancePx < -ROUTE_GEOMETRY_EPSILON) {
        return undefined;
    }

    return {
        point: addPoint(source, scaleUnitVector(sourceDirection, sourceDistancePx)),
    };
}

function areParallelDirections(a: UnitVector, b: UnitVector): boolean {
    return Math.abs(crossProduct(a, b)) <= ROUTE_GEOMETRY_EPSILON;
}

function pointsAlmostEqual(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) <= ROUTE_GEOMETRY_EPSILON;
}

function addPoint(point: { x: number; y: number }, offset: { x: number; y: number }): { x: number; y: number } {
    return {
        x: point.x + offset.x,
        y: point.y + offset.y,
    };
}

function subtractPoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
    };
}

function scaleUnitVector(vector: UnitVector, distance: number): UnitVector {
    return {
        x: vector.x * distance,
        y: vector.y * distance,
    };
}

function dotProduct(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return (a.x * b.x) + (a.y * b.y);
}

function crossProduct(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return (a.x * b.y) - (a.y * b.x);
}

function resolveNonNegativeDimension(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, value);
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
