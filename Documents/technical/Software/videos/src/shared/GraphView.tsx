import {
    Children,
    isValidElement,
    useMemo,
    type CSSProperties,
    type ReactNode,
} from "react";
import {
    AbsoluteFill,
    Sequence,
    useCurrentFrame,
    useVideoConfig,
} from "remotion";
import {
    DebateConnector,
    type DebateConnectorLayer,
    type PathGeometryInstruction,
    type Waypoint,
} from "@reasontracker/components";

import {
    BASE_NODE_HEIGHT_PX,
    BASE_NODE_WIDTH_PX,
    layoutDebate,
    Planner,
    Reducer,
    type ClaimId,
    type ConnectorId,
    type Debate,
    type DebateLayout,
    type DebateLayoutConnectorJunction,
    type DebateLayoutConnectorSpan,
    type DebateLayoutNode,
    type EngineCommand,
    type Operation,
    type Score,
    type ScoreId,
} from "../../../engine/src/index.ts";
import { getZoomMotionState } from "./zoomMotion";

// AGENT NOTE: Keep graph animation tunables grouped here so motion and sizing can be tuned in one pass.
/** Default graph sequence start when the host does not provide one. */
const DEFAULT_GRAPH_FROM = 0;
/** Default camera scale when a target does not provide a measurable bounding box. */
const DEFAULT_ZOOM_SCALE = 3.4;
/** Default camera move duration, in frames, matching the old video motion helper. */
const DEFAULT_ZOOM_DURATION_FRAMES = 78;
/** Default padding retained around a focused camera target. */
const DEFAULT_ZOOM_PADDING = 120;
/** Padding retained when the camera resets to the whole graph. */
const DEFAULT_VIEWPORT_PADDING = 100;
/** World-space padding around layout bounds before camera transforms are applied. */
const GRAPH_PADDING_PX = 96;
/** Outline width shared by connector walls and connector junction frames. */
const CONNECTOR_OUTLINE_WIDTH_PX = 4;
/** Multiplier applied to connector width when deriving the span of a path-geometry transition front. */
const CONNECTOR_GEOMETRY_TRANSITION_LENGTH_MULTIPLIER = 1;

const planner = new Planner();
const reducer = new Reducer();

type GraphTransitionDirection = "sourceToTarget" | "targetToSource";

type GraphTransitionDirective =
    | {
        kind: "claim";
        scoreId: ScoreId;
        effect: "enter" | "exit" | "display" | "scale";
        direction?: GraphTransitionDirection;
    }
    | {
        kind: "connector";
        connectorId: ConnectorId;
        effect: "fluidGrow" | "pipeGrow" | "shrink" | "update";
        direction?: GraphTransitionDirection;
    };

type GraphZoomTarget =
    | { claimId: string | readonly string[] }
    | { x: number; y: number; width?: number; height?: number };

export type GraphActionEntry = {
    id: string;
    command: EngineCommand;
};

export type CameraMoveProps = {
    from: number;
    durationInFrames?: number;
    reset?: boolean;
    claimId?: string | readonly string[];
    target?: GraphZoomTarget;
    scale?: number;
    padding?: number;
    name?: string;
};

export type GraphEventsProps = {
    from: number;
    durationInFrames?: number;
    actions: readonly GraphActionEntry[];
    applyMode?: "per-action" | "all-at-once";
    id?: string;
    name?: string;
};

type ResolvedCameraMove = {
    from: number;
    durationInFrames: number;
    reset: boolean;
    target?: GraphZoomTarget;
    scale: number;
    padding: number;
    name: string;
};

type ResolvedGraphEvent = {
    from: number;
    durationInFrames: number;
    actions: readonly GraphActionEntry[];
    applyMode: "per-action" | "all-at-once";
    id?: string;
    name: string;
};

type GraphNodeVisual = {
    scoreId: ScoreId;
    claimId: ClaimId;
    content: string;
    side: Score["claimSide"];
    confidence: number;
    relevance: number;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    insertScale: number;
};

type GraphConnectorSpanVisual = {
    visualId: string;
    connectorId: ConnectorId;
    centerlinePoints: Waypoint[];
    fluidWidth: number;
    pipeWidth: number;
    side: Score["connectorSide"];
    opacity: number;
    fluidProgress: number;
    pipeProgress: number;
    direction: GraphTransitionDirection;
    updateTransition?: {
        fromFluidWidth: number;
        fromPipeWidth: number;
        toFluidWidth: number;
        toPipeWidth: number;
        progress: number;
        direction: GraphTransitionDirection;
    };
};

type GraphConnectorJunctionVisual = {
    visualId: string;
    targetConfidenceConnectorId: ConnectorId;
    centerX: number;
    centerY: number;
    leftHeight: number;
    rightHeight: number;
    side: Score["connectorSide"];
    width: number;
    opacity: number;
};

type GraphRenderState = {
    width: number;
    height: number;
    nodeRenderOrder: ScoreId[];
    connectorSpanRenderOrder: string[];
    connectorJunctionRenderOrder: string[];
    nodeByScoreId: Record<ScoreId, GraphNodeVisual>;
    connectorSpanByVisualId: Record<string, GraphConnectorSpanVisual>;
    connectorJunctionByVisualId: Record<string, GraphConnectorJunctionVisual>;
};

type GraphSnapshot = {
    debate: Debate;
    layout: DebateLayout;
    renderState: GraphRenderState;
};

type GraphTransitionSegment = {
    timelineFrom: number;
    name: string;
    fromSnapshot: GraphSnapshot;
    toSnapshot: GraphSnapshot;
    directives: readonly GraphTransitionDirective[];
    durationInFrames: number;
};

type PreparedGraphView = {
    initialSnapshot: GraphSnapshot;
    segments: GraphTransitionSegment[];
    finalSnapshot: GraphSnapshot;
};

type ActiveGraphFrame = {
    renderState: GraphRenderState;
};

type CameraState = {
    scale: number;
    translateX: number;
    translateY: number;
};

type CameraFocusState = CameraState & {
    targetX: number;
    targetY: number;
    targetScreenX: number;
    targetScreenY: number;
};

type OperationGroup = {
    name: string;
    operations: readonly Operation[];
};

type TransitionSegmentInput = {
    durationInFrames: number;
    fromSnapshot: GraphSnapshot;
    name: string;
    operations: readonly Operation[];
    timelineFrom: number;
    toSnapshotOverride?: GraphSnapshot;
};

type OperationGroupPlan = {
    group: OperationGroup;
    toSnapshot: GraphSnapshot;
};

type GraphViewProps = {
    debate: Debate;
    from?: number;
    durationInFrames?: number;
    children?: ReactNode;
    siblingOrderingMode?: "preserve-input" | "sort";
    zoomClaimId?: ClaimId;
    zoomTarget?: GraphZoomTarget;
    zoomScale?: number;
    zoomStartFrame?: number;
    zoomDurationInFrames?: number;
    zoomPadding?: number;
    debugTimeline?: boolean;
};

export const CameraMove = (_props: CameraMoveProps) => null;
export const GraphEvents = (_props: GraphEventsProps) => null;

export function getGraphViewportTarget(debate: Debate): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    return getWholeGraphTarget(buildGraphSnapshot(debate).renderState);
}

export function countGraphEventTransitionSegments(args: {
    debate: Debate;
    actions: readonly GraphActionEntry[];
    applyMode?: "per-action" | "all-at-once";
}): { nextDebate: Debate; transitionSegmentCount: number } {
    const applyMode = args.applyMode ?? "per-action";

    if (applyMode === "all-at-once") {
        const operations = planOperations(
            args.debate,
            args.actions.map((action) => action.command),
        );

        return {
            nextDebate: applyOperations(args.debate, operations),
            transitionSegmentCount: countTransitionSegmentsForOperations(operations),
        };
    }

    let workingDebate = args.debate;
    let transitionSegmentCount = 0;

    for (const action of args.actions) {
        const operations = planOperations(workingDebate, [action.command]);
        transitionSegmentCount += countTransitionSegmentsForOperations(operations);
        workingDebate = applyOperations(workingDebate, operations);
    }

    return {
        nextDebate: workingDebate,
        transitionSegmentCount,
    };
}

type GraphViewContentProps = {
    prepared: PreparedGraphView;
    cameraMoves: ResolvedCameraMove[];
};

export const GraphView = ({
    debate,
    from = DEFAULT_GRAPH_FROM,
    durationInFrames,
    children,
    siblingOrderingMode: _siblingOrderingMode,
    zoomClaimId,
    zoomTarget,
    zoomScale = DEFAULT_ZOOM_SCALE,
    zoomStartFrame,
    zoomDurationInFrames = DEFAULT_ZOOM_DURATION_FRAMES,
    zoomPadding = DEFAULT_ZOOM_PADDING,
    debugTimeline = false,
}: GraphViewProps) => {
    const cameraMoves = useMemo(
        () => resolveCameraMoves(
            children,
            zoomClaimId,
            zoomTarget,
            zoomScale,
            zoomStartFrame,
            zoomDurationInFrames,
            zoomPadding,
        ),
        [children, zoomClaimId, zoomTarget, zoomScale, zoomStartFrame, zoomDurationInFrames, zoomPadding],
    );
    const graphEvents = useMemo(() => resolveGraphEvents(children), [children]);
    const prepared = useMemo(() => {
        const nextPrepared = buildPreparedGraphView(debate, graphEvents);
        if (debugTimeline) {
            logPreparedGraphViewTimeline(nextPrepared);
        }

        return nextPrepared;
    }, [debate, debugTimeline, graphEvents]);

    return (
        <>
            <Sequence from={from} durationInFrames={durationInFrames} name="Graph" layout="none">
                <GraphViewContent prepared={prepared} cameraMoves={cameraMoves} />
            </Sequence>
            {renderPreparedTimelineMarkers(prepared, from)}
            {cameraMoves.map((cameraMove) => (
                <Sequence
                    key={`camera:${cameraMove.name}:${cameraMove.from}`}
                    from={from + cameraMove.from}
                    durationInFrames={cameraMove.durationInFrames}
                    name={cameraMove.name}
                    layout="none"
                >
                    <span style={{ display: "none" }} />
                </Sequence>
            ))}
        </>
    );
};

const GraphViewContent = ({
    prepared,
    cameraMoves,
}: GraphViewContentProps) => {
    const frame = useCurrentFrame();
    const { width: frameWidth, height: frameHeight } = useVideoConfig();
    const activeGraphFrame = resolveActiveGraph(prepared, frame);
    const activeGraph = activeGraphFrame.renderState;
    const cameraState = resolveCameraState(
        frame,
        prepared.initialSnapshot.renderState,
        activeGraph,
        cameraMoves,
        frameWidth,
        frameHeight,
    );

    return (
        <AbsoluteFill style={graphRootStyle} aria-label="Reason Tracker graph">
            <div
                style={{
                    height: activeGraph.height,
                    left: 0,
                    position: "absolute",
                    top: 0,
                    transform: `translate(${cameraState.translateX}px, ${cameraState.translateY}px) scale(${cameraState.scale})`,
                    transformOrigin: "top left",
                    width: activeGraph.width,
                }}
            >
                <svg
                    aria-hidden="true"
                    height={activeGraph.height}
                    style={connectorLayerStyle}
                    viewBox={`0 0 ${activeGraph.width} ${activeGraph.height}`}
                    width={activeGraph.width}
                >
                    {renderConnectorLayers(activeGraph)}
                    {activeGraph.connectorJunctionRenderOrder.map((visualId) => {
                        const junction = activeGraph.connectorJunctionByVisualId[visualId];
                        return junction ? renderConnectorJunction(junction) : null;
                    })}
                </svg>
                {activeGraph.nodeRenderOrder.map((scoreId) => {
                    const node = activeGraph.nodeByScoreId[scoreId];
                    return node ? renderClaim(node) : null;
                })}
            </div>
        </AbsoluteFill>
    );
};

function renderPreparedTimelineMarkers(prepared: PreparedGraphView, graphFrom: number): ReactNode[] {
    return prepared.segments.map((segment, index) => (
        <Sequence
            key={`graph-segment:${index}:${segment.timelineFrom}`}
            from={graphFrom + segment.timelineFrom}
            durationInFrames={segment.durationInFrames}
            name={segment.name}
            layout="none"
        >
            <span style={{ display: "none" }} />
        </Sequence>
    ));
}

function buildPreparedGraphView(
    debate: Debate,
    graphEvents: ResolvedGraphEvent[],
): PreparedGraphView {
    const initialSnapshot = buildGraphSnapshot(debate);
    const segments: GraphTransitionSegment[] = [];
    let currentDebate = debate;
    let currentSnapshot = initialSnapshot;
    let lastGraphSegmentEnd = 0;

    for (const graphEvent of graphEvents) {
        if (graphEvent.from < lastGraphSegmentEnd) {
            throw new Error(
                `GraphEvents cannot overlap. ${graphEvent.name} starts at frame ${graphEvent.from}, before the previous graph event ends at frame ${lastGraphSegmentEnd}.`,
            );
        }

        const eventSegments = buildGraphEventSegments(currentDebate, currentSnapshot, graphEvent);
        segments.push(...eventSegments);

        if (eventSegments.length > 0) {
            const finalSegment = eventSegments[eventSegments.length - 1];
            currentDebate = finalSegment.toSnapshot.debate;
            currentSnapshot = finalSegment.toSnapshot;
            lastGraphSegmentEnd = finalSegment.timelineFrom + finalSegment.durationInFrames;
        } else {
            lastGraphSegmentEnd = Math.max(
                lastGraphSegmentEnd,
                graphEvent.from + graphEvent.durationInFrames,
            );
        }
    }

    return {
        initialSnapshot,
        segments,
        finalSnapshot: currentSnapshot,
    };
}

function buildGraphEventSegments(
    startDebate: Debate,
    startSnapshot: GraphSnapshot,
    graphEvent: ResolvedGraphEvent,
): GraphTransitionSegment[] {
    if (graphEvent.applyMode === "all-at-once") {
        const operations = planOperations(startDebate, graphEvent.actions.map((entry) => entry.command));
        if (operations.length < 1) {
            return [];
        }

        const operationGroups = buildOperationGroups(operations);
        const groupPlans = buildOperationGroupPlans(startSnapshot, operationGroups);
        const groupDurations = distributeFrames(graphEvent.durationInFrames, operationGroups.length);
        const segments: GraphTransitionSegment[] = [];
        let currentSnapshot = startSnapshot;
        let cursorFrames = 0;

        for (let groupIndex = 0; groupIndex < operationGroups.length; groupIndex += 1) {
            const groupPlan = groupPlans[groupIndex];
            const operationGroup = groupPlan?.group ?? operationGroups[groupIndex];
            const nextSegments = buildTransitionSegments({
                durationInFrames: groupDurations[groupIndex] ?? 1,
                fromSnapshot: currentSnapshot,
                name: `${graphEvent.name} / ${operationGroup.name}`,
                operations: operationGroup.operations,
                timelineFrom: graphEvent.from + cursorFrames,
                toSnapshotOverride: groupPlan?.toSnapshot,
            });
            segments.push(...nextSegments);

            const finalSegment = nextSegments[nextSegments.length - 1];
            if (finalSegment) {
                currentSnapshot = finalSegment.toSnapshot;
            }
            cursorFrames += groupDurations[groupIndex] ?? 1;
        }

        return segments;
    }

    const actionDurations = distributeFrames(graphEvent.durationInFrames, graphEvent.actions.length);
    const segments: GraphTransitionSegment[] = [];
    let currentDebate = startDebate;
    let currentSnapshot = startSnapshot;
    let eventCursor = 0;

    for (let actionIndex = 0; actionIndex < graphEvent.actions.length; actionIndex += 1) {
        const action = graphEvent.actions[actionIndex];
        const actionDuration = actionDurations[actionIndex] ?? 1;
        const operations = planOperations(currentDebate, [action.command]);
        const operationGroups = buildOperationGroups(operations);
        const groupPlans = buildOperationGroupPlans(currentSnapshot, operationGroups);
        const groupDurations = distributeFrames(actionDuration, operationGroups.length);
        let actionCursor = 0;

        for (let groupIndex = 0; groupIndex < operationGroups.length; groupIndex += 1) {
            const groupPlan = groupPlans[groupIndex];
            const operationGroup = groupPlan?.group ?? operationGroups[groupIndex];
            const durationInFrames = groupDurations[groupIndex] ?? actionDuration;
            const nextSegments = buildTransitionSegments({
                durationInFrames,
                fromSnapshot: currentSnapshot,
                name: `${graphEvent.name} / ${action.id} / ${operationGroup.name}`,
                operations: operationGroup.operations,
                timelineFrom: graphEvent.from + eventCursor + actionCursor,
                toSnapshotOverride: groupPlan?.toSnapshot,
            });

            segments.push(...nextSegments);
            const finalSegment = nextSegments[nextSegments.length - 1];
            if (finalSegment) {
                currentDebate = finalSegment.toSnapshot.debate;
                currentSnapshot = finalSegment.toSnapshot;
            }
            actionCursor += durationInFrames;
        }

        eventCursor += actionDuration;
    }

    return segments;
}

function buildTransitionSegments(args: TransitionSegmentInput): GraphTransitionSegment[] {
    assertAnimationOperationScope(args.operations);

    const nextDebate = applyOperations(args.fromSnapshot.debate, args.operations);
    const toSnapshot = args.toSnapshotOverride ?? buildGraphSnapshot(nextDebate);

    if (shouldUseAddClaimVisualPhases(args.operations)) {
        return buildAddClaimTransitionSegments(args, toSnapshot);
    }

    return [buildTransitionSegment(args, toSnapshot, buildTransitionDirectives(
        args.fromSnapshot.debate,
        nextDebate,
        args.operations,
    ))];
}

function buildAddClaimTransitionSegments(
    args: TransitionSegmentInput,
    finalSnapshot: GraphSnapshot,
): GraphTransitionSegment[] {
    const addedConnectorIds = getAddedConnectorIds(args.operations);
    const newJunctionVisualIds = getNewConnectorJunctionVisualIds(
        args.fromSnapshot.renderState,
        finalSnapshot.renderState,
    );
    const phaseDurations = distributeFrames(args.durationInFrames, 3);
    const baseDirectives = buildTransitionDirectives(
        args.fromSnapshot.debate,
        finalSnapshot.debate,
        args.operations,
    );
    const layoutDirectives = baseDirectives.filter((directive) => (
        directive.kind === "claim"
        || (directive.kind === "connector"
            && directive.effect === "update"
            && !addedConnectorIds.has(directive.connectorId))
    ));
    const layoutSnapshot = withoutAddedConnectorVisuals(
        finalSnapshot,
        addedConnectorIds,
        newJunctionVisualIds,
    );
    const pipeSnapshot = withConnectorPhaseVisibility(
        finalSnapshot,
        addedConnectorIds,
        newJunctionVisualIds,
        1,
        0,
        1,
    );
    let timelineFrom = args.timelineFrom;
    const segments: GraphTransitionSegment[] = [
        buildTransitionSegment(
            {
                ...args,
                durationInFrames: phaseDurations[0] ?? 1,
                name: `${args.name} / layout and claim`,
                timelineFrom,
            },
            layoutSnapshot,
            layoutDirectives,
        ),
    ];

    timelineFrom += phaseDurations[0] ?? 1;
    segments.push(buildTransitionSegment(
        {
            ...args,
            durationInFrames: phaseDurations[1] ?? 1,
            fromSnapshot: layoutSnapshot,
            name: `${args.name} / empty pipe`,
            timelineFrom,
        },
        pipeSnapshot,
        [...addedConnectorIds].map((connectorId) => ({
            kind: "connector",
            connectorId,
            effect: "pipeGrow",
            direction: "sourceToTarget",
        })),
    ));

    timelineFrom += phaseDurations[1] ?? 1;
    segments.push(buildTransitionSegment(
        {
            ...args,
            durationInFrames: phaseDurations[2] ?? 1,
            fromSnapshot: pipeSnapshot,
            name: `${args.name} / confidence fluid`,
            timelineFrom,
        },
        finalSnapshot,
        [...addedConnectorIds].map((connectorId) => ({
            kind: "connector",
            connectorId,
            effect: "fluidGrow",
            direction: "sourceToTarget",
        })),
    ));

    return segments;
}

function shouldUseAddClaimVisualPhases(operations: readonly Operation[]): boolean {
    return operations.some((operation) => operation.type === "ClaimAdded")
        && operations.some((operation) => operation.type === "ConnectorAdded")
        && operations.some((operation) => operation.type === "ScoreAdded");
}

function getAddedConnectorIds(operations: readonly Operation[]): ReadonlySet<ConnectorId> {
    return new Set(
        operations
            .filter((operation): operation is Extract<Operation, { type: "ConnectorAdded" }> => operation.type === "ConnectorAdded")
            .map((operation) => operation.connector.id),
    );
}

function getNewConnectorJunctionVisualIds(
    fromState: GraphRenderState,
    toState: GraphRenderState,
): ReadonlySet<string> {
    const fromVisualIds = new Set(fromState.connectorJunctionRenderOrder);

    return new Set(
        toState.connectorJunctionRenderOrder.filter((visualId) => !fromVisualIds.has(visualId)),
    );
}

function withoutAddedConnectorVisuals(
    snapshot: GraphSnapshot,
    connectorIds: ReadonlySet<ConnectorId>,
    junctionVisualIds: ReadonlySet<string>,
): GraphSnapshot {
    const connectorSpanRenderOrder = snapshot.renderState.connectorSpanRenderOrder.filter((visualId) => {
        const connector = snapshot.renderState.connectorSpanByVisualId[visualId];
        return !connector || !connectorIds.has(connector.connectorId);
    });
    const connectorJunctionRenderOrder = snapshot.renderState.connectorJunctionRenderOrder.filter((visualId) => (
        !junctionVisualIds.has(visualId)
    ));
    const connectorSpanByVisualId: Record<string, GraphConnectorSpanVisual> = {};
    const connectorJunctionByVisualId: Record<string, GraphConnectorJunctionVisual> = {};

    for (const visualId of connectorSpanRenderOrder) {
        const connector = snapshot.renderState.connectorSpanByVisualId[visualId];
        if (connector) {
            connectorSpanByVisualId[visualId] = connector;
        }
    }

    for (const visualId of connectorJunctionRenderOrder) {
        const junction = snapshot.renderState.connectorJunctionByVisualId[visualId];
        if (junction) {
            connectorJunctionByVisualId[visualId] = junction;
        }
    }

    return {
        ...snapshot,
        renderState: {
            ...snapshot.renderState,
            connectorSpanRenderOrder,
            connectorJunctionRenderOrder,
            connectorSpanByVisualId,
            connectorJunctionByVisualId,
        },
    };
}

function withConnectorPhaseVisibility(
    snapshot: GraphSnapshot,
    connectorIds: ReadonlySet<ConnectorId>,
    junctionVisualIds: ReadonlySet<string>,
    pipeProgress: number,
    fluidProgress: number,
    junctionOpacity: number,
): GraphSnapshot {
    const connectorSpanByVisualId: Record<string, GraphConnectorSpanVisual> = {};
    const connectorJunctionByVisualId: Record<string, GraphConnectorJunctionVisual> = {};

    for (const [visualId, connector] of Object.entries(snapshot.renderState.connectorSpanByVisualId)) {
        connectorSpanByVisualId[visualId] = connectorIds.has(connector.connectorId)
            ? {
                ...connector,
                fluidProgress,
                pipeProgress,
            }
            : connector;
    }

    for (const [visualId, junction] of Object.entries(snapshot.renderState.connectorJunctionByVisualId)) {
        connectorJunctionByVisualId[visualId] = junctionVisualIds.has(visualId)
            ? {
                ...junction,
                opacity: junctionOpacity,
            }
            : junction;
    }

    return {
        ...snapshot,
        renderState: {
            ...snapshot.renderState,
            connectorSpanByVisualId,
            connectorJunctionByVisualId,
        },
    };
}

function buildTransitionSegment(
    args: TransitionSegmentInput,
    toSnapshot: GraphSnapshot,
    directives: readonly GraphTransitionDirective[],
): GraphTransitionSegment {
    return {
        timelineFrom: args.timelineFrom,
        name: args.name,
        fromSnapshot: args.fromSnapshot,
        toSnapshot,
        directives,
        durationInFrames: Math.max(1, args.durationInFrames),
    };
}

function buildOperationGroupPlans(
    startSnapshot: GraphSnapshot,
    operationGroups: readonly OperationGroup[],
): OperationGroupPlan[] {
    const plans: OperationGroupPlan[] = [];
    let workingSnapshot = startSnapshot;

    for (const group of operationGroups) {
        const nextDebate = applyOperations(workingSnapshot.debate, group.operations);
        const toSnapshot = buildGraphSnapshot(nextDebate);
        plans.push({
            group,
            toSnapshot,
        });
        workingSnapshot = toSnapshot;
    }

    const structuralAddGroupIndex = plans.findIndex((plan) => shouldUseAddClaimVisualPhases(plan.group.operations));
    const scaleGroupIndex = plans.findIndex((plan, index) => (
        index > structuralAddGroupIndex
        && plan.group.operations.some((operation) => operation.type === "scaleOfSources")
    ));
    if (structuralAddGroupIndex < 0 || scaleGroupIndex < 0) {
        return plans;
    }

    const scaleOperations = plans[scaleGroupIndex]?.group.operations.filter(
        (operation): operation is Extract<Operation, { type: "scaleOfSources" }> => operation.type === "scaleOfSources",
    ) ?? [];
    if (scaleOperations.length < 1) {
        return plans;
    }

    return plans.map((plan, index) => (
        index >= structuralAddGroupIndex && index < scaleGroupIndex
            ? {
                ...plan,
                toSnapshot: withRenderState(
                    plan.toSnapshot,
                    buildGraphSnapshot(applyOperations(plan.toSnapshot.debate, scaleOperations)).renderState,
                ),
            }
            : plan
    ));
}

function withRenderState(snapshot: GraphSnapshot, renderState: GraphRenderState): GraphSnapshot {
    return {
        ...snapshot,
        renderState,
    };
}

function planOperations(debate: Debate, commands: readonly EngineCommand[]): Operation[] {
    return planner
        .plan(commands, debate)
        .flatMap((result) => result.operations);
}

function applyOperations(debate: Debate, operations: readonly Operation[]): Debate {
    let workingDebate = debate;

    for (const operation of operations) {
        workingDebate = reducer.apply(workingDebate, operation);
    }

    return workingDebate;
}

function buildOperationGroups(operations: readonly Operation[]): OperationGroup[] {
    const groups: OperationGroup[] = [];
    let pendingStructuralOperations: Operation[] = [];

    for (const operation of operations) {
        if (isStructuralMembershipOperation(operation)) {
            pendingStructuralOperations.push(operation);
            if (operation.type === "incomingScoresChanged") {
                groups.push({
                    name: "Structural graph change",
                    operations: pendingStructuralOperations,
                });
                pendingStructuralOperations = [];
            }
            continue;
        }

        if (pendingStructuralOperations.length > 0) {
            groups.push({
                name: "Structural graph change",
                operations: pendingStructuralOperations,
            });
            pendingStructuralOperations = [];
        }

        groups.push({
            name: formatOperationGroupName(operation),
            operations: [operation],
        });
    }

    if (pendingStructuralOperations.length > 0) {
        groups.push({
            name: "Structural graph change",
            operations: pendingStructuralOperations,
        });
    }

    return groups;
}

function countTransitionSegmentsForOperations(operations: readonly Operation[]): number {
    return Math.max(
        1,
        buildOperationGroups(operations).reduce(
            (total, group) => total + (shouldUseAddClaimVisualPhases(group.operations) ? 3 : 1),
            0,
        ),
    );
}

function assertAnimationOperationScope(operations: readonly Operation[]): void {
    if (operations.length <= 1 || operations.every(isStructuralMembershipOperation)) {
        return;
    }

    throw new Error(
        `Graph animation segments must receive one engine operation at a time outside the structural membership envelope. Received ${operations.length}.`,
    );
}

function isStructuralMembershipOperation(operation: Operation): boolean {
    return operation.type === "ClaimAdded"
        || operation.type === "ClaimDeleted"
        || operation.type === "ConnectorAdded"
        || operation.type === "ConnectorDeleted"
        || operation.type === "ScoreAdded"
        || operation.type === "ScoreDeleted"
        || operation.type === "incomingScoresChanged";
}

function formatOperationGroupName(operation: Operation): string {
    switch (operation.type) {
        case "ClaimUpdated":
            return "Claim update";
        case "ScoreUpdated":
            return "Score propagation";
        case "incomingScoresSorted":
            return "Incoming score sort";
        case "scaleOfSources":
            return "Source scale update";
        case "DebateCreated":
        case "DebateUpdated":
        case "ClaimAdded":
        case "ClaimDeleted":
        case "ConnectorAdded":
        case "ConnectorDeleted":
        case "ScoreAdded":
        case "ScoreDeleted":
        case "incomingScoresChanged":
            return "Structural graph change";
    }
}

function distributeFrames(totalFrames: number, slotCount: number): number[] {
    if (slotCount < 1) {
        return [];
    }

    const safeTotalFrames = Math.max(1, totalFrames);
    const rawFramesPerSlot = safeTotalFrames / slotCount;
    const slots = Array.from({ length: slotCount }, (_value, index) => {
        const durationInFrames = Math.max(1, Math.floor(rawFramesPerSlot));
        return {
            index,
            durationInFrames,
            remainder: rawFramesPerSlot - durationInFrames,
        };
    });
    let remainingFrames = Math.max(
        0,
        safeTotalFrames - slots.reduce((total, slot) => total + slot.durationInFrames, 0),
    );

    return [...slots]
        .sort((left, right) => right.remainder - left.remainder)
        .map((slot) => {
            if (remainingFrames > 0) {
                remainingFrames -= 1;
                return {
                    ...slot,
                    durationInFrames: slot.durationInFrames + 1,
                };
            }

            return slot;
        })
        .sort((left, right) => left.index - right.index)
        .map((slot) => slot.durationInFrames);
}

function buildGraphSnapshot(debate: Debate): GraphSnapshot {
    const layout = layoutDebate(debate);

    return {
        debate,
        layout,
        renderState: buildRenderState(debate, layout),
    };
}

function buildRenderState(debate: Debate, layout: DebateLayout): GraphRenderState {
    const graphWidth = Math.max(1, Math.ceil(layout.bounds.width + GRAPH_PADDING_PX * 2));
    const graphHeight = Math.max(1, Math.ceil(layout.bounds.height + GRAPH_PADDING_PX * 2));
    const nodeByScoreId = {} as Record<ScoreId, GraphNodeVisual>;
    const connectorSpanByVisualId: Record<string, GraphConnectorSpanVisual> = {};
    const connectorJunctionByVisualId: Record<string, GraphConnectorJunctionVisual> = {};

    for (const node of layout.nodesInOrder) {
        nodeByScoreId[node.scoreId] = buildNodeVisual(debate, layout, node);
    }

    for (const span of layout.connectorSpansInOrder) {
        connectorSpanByVisualId[span.visualId] = buildConnectorSpanVisual(layout, span);
    }

    for (const junction of layout.connectorJunctionsInOrder) {
        connectorJunctionByVisualId[junction.visualId] = buildConnectorJunctionVisual(layout, junction);
    }

    return {
        width: graphWidth,
        height: graphHeight,
        nodeRenderOrder: layout.nodesInOrder.map((node) => node.scoreId),
        connectorSpanRenderOrder: layout.connectorSpansInOrder.map((span) => span.visualId),
        connectorJunctionRenderOrder: layout.connectorJunctionsInOrder.map((junction) => junction.visualId),
        nodeByScoreId,
        connectorSpanByVisualId,
        connectorJunctionByVisualId,
    };
}

function buildNodeVisual(
    debate: Debate,
    layout: DebateLayout,
    node: DebateLayoutNode,
): GraphNodeVisual {
    const score = debate.scores[node.scoreId];
    if (!score) {
        throw new Error(`Score ${node.scoreId} was not found while building graph render state.`);
    }

    return {
        scoreId: node.scoreId,
        claimId: node.claimId,
        content: node.claimContent,
        side: score.claimSide,
        confidence: score.claimConfidence,
        relevance: score.relevance,
        x: mapLayoutX(layout, node.x),
        y: mapLayoutY(layout, node.y),
        width: node.width,
        height: node.height,
        opacity: 1,
        insertScale: 1,
    };
}

function buildConnectorSpanVisual(
    layout: DebateLayout,
    span: DebateLayoutConnectorSpan,
): GraphConnectorSpanVisual {
    return {
        visualId: span.visualId,
        connectorId: span.connectorId,
        centerlinePoints: span.centerlinePoints.map((point) => ({
            ...point,
            x: mapLayoutX(layout, point.x),
            y: mapLayoutY(layout, point.y),
        })),
        fluidWidth: span.fluidWidth,
        pipeWidth: span.pipeWidth,
        side: span.side,
        opacity: 1,
        fluidProgress: 1,
        pipeProgress: 1,
        direction: "sourceToTarget",
    };
}

function buildConnectorJunctionVisual(
    layout: DebateLayout,
    junction: DebateLayoutConnectorJunction,
): GraphConnectorJunctionVisual {
    return {
        visualId: junction.visualId,
        targetConfidenceConnectorId: junction.targetConfidenceConnectorId,
        centerX: mapLayoutX(layout, junction.centerX),
        centerY: mapLayoutY(layout, junction.centerY),
        leftHeight: junction.leftHeight,
        rightHeight: junction.rightHeight,
        side: junction.side,
        width: junction.width,
        opacity: 1,
    };
}

function resolveActiveGraph(
    prepared: PreparedGraphView,
    frame: number,
): ActiveGraphFrame {
    let currentSnapshot = prepared.initialSnapshot;

    for (const segment of prepared.segments) {
        if (frame < segment.timelineFrom) {
            break;
        }

        const segmentEnd = segment.timelineFrom + Math.max(1, segment.durationInFrames);
        if (frame >= segmentEnd) {
            currentSnapshot = segment.toSnapshot;
            continue;
        }

        return resolveTransitionSegment(segment, frame - segment.timelineFrom);
    }

    const terminalSnapshot = prepared.segments.length === 0
        ? prepared.finalSnapshot
        : currentSnapshot;

    return {
        renderState: terminalSnapshot.renderState,
    };
}

function resolveTransitionSegment(
    segment: GraphTransitionSegment,
    localFrame: number,
): ActiveGraphFrame {
    if (localFrame <= 0) {
        return {
            renderState: segment.fromSnapshot.renderState,
        };
    }

    const localProgress = localFrame / Math.max(1, segment.durationInFrames);
    if (localProgress < 1) {
        return {
            renderState: resolveDirectiveTransition(
                segment.fromSnapshot,
                segment.toSnapshot,
                localProgress,
                segment.directives,
            ),
        };
    }

    return {
        renderState: segment.toSnapshot.renderState,
    };
}

function resolveDirectiveTransition(
    fromSnapshot: GraphSnapshot,
    toSnapshot: GraphSnapshot,
    progress: number,
    directives: readonly GraphTransitionDirective[],
): GraphRenderState {
    const clamped = clamp01(progress);
    const state = buildDirectiveBaseState(fromSnapshot.renderState, toSnapshot.renderState, clamped);

    for (const directive of directives) {
        if (directive.kind === "claim") {
            applyClaimDirective(state, fromSnapshot, toSnapshot, directive, clamped);
            continue;
        }

        applyConnectorDirective(state, fromSnapshot, toSnapshot, directive, clamped);
    }

    return state;
}

function buildDirectiveBaseState(
    fromState: GraphRenderState,
    toState: GraphRenderState,
    progress: number,
): GraphRenderState {
    const nodeRenderOrder = buildUnionOrder(toState.nodeRenderOrder, fromState.nodeRenderOrder);
    const connectorSpanRenderOrder = buildUnionOrder(
        toState.connectorSpanRenderOrder,
        fromState.connectorSpanRenderOrder,
    );
    const connectorJunctionRenderOrder = buildUnionOrder(
        toState.connectorJunctionRenderOrder,
        fromState.connectorJunctionRenderOrder,
    );
    const nodeByScoreId = {} as Record<ScoreId, GraphNodeVisual>;
    const connectorSpanByVisualId: Record<string, GraphConnectorSpanVisual> = {};
    const connectorJunctionByVisualId: Record<string, GraphConnectorJunctionVisual> = {};

    for (const scoreId of nodeRenderOrder) {
        const fromNode = fromState.nodeByScoreId[scoreId];
        const toNode = toState.nodeByScoreId[scoreId];

        if (fromNode && toNode) {
            nodeByScoreId[scoreId] = interpolateNodeVisual(fromNode, toNode, progress);
            continue;
        }

        if (fromNode) {
            nodeByScoreId[scoreId] = fromNode;
            continue;
        }

        if (toNode) {
            nodeByScoreId[scoreId] = {
                ...toNode,
                confidence: 0,
                opacity: 0,
                insertScale: 0,
            };
        }
    }

    for (const visualId of connectorSpanRenderOrder) {
        const fromSpan = fromState.connectorSpanByVisualId[visualId];
        const toSpan = toState.connectorSpanByVisualId[visualId];

        if (fromSpan && toSpan) {
            connectorSpanByVisualId[visualId] = interpolateConnectorSpanVisual(fromSpan, toSpan, progress);
            continue;
        }

        if (fromSpan) {
            connectorSpanByVisualId[visualId] = fromSpan;
            continue;
        }

        if (toSpan) {
            connectorSpanByVisualId[visualId] = {
                ...toSpan,
                fluidProgress: 0,
                pipeProgress: 0,
            };
        }
    }

    for (const visualId of connectorJunctionRenderOrder) {
        const fromJunction = fromState.connectorJunctionByVisualId[visualId];
        const toJunction = toState.connectorJunctionByVisualId[visualId];

        if (fromJunction && toJunction) {
            connectorJunctionByVisualId[visualId] = interpolateConnectorJunctionVisual(
                fromJunction,
                toJunction,
                progress,
            );
            continue;
        }

        if (fromJunction) {
            connectorJunctionByVisualId[visualId] = fromJunction;
            continue;
        }

        if (toJunction) {
            connectorJunctionByVisualId[visualId] = {
                ...toJunction,
                opacity: 0,
            };
        }
    }

    return {
        width: lerp(fromState.width, toState.width, progress),
        height: lerp(fromState.height, toState.height, progress),
        nodeRenderOrder,
        connectorSpanRenderOrder,
        connectorJunctionRenderOrder,
        nodeByScoreId,
        connectorSpanByVisualId,
        connectorJunctionByVisualId,
    };
}

function interpolateNodeVisual(
    fromNode: GraphNodeVisual,
    toNode: GraphNodeVisual,
    progress: number,
): GraphNodeVisual {
    return {
        ...fromNode,
        content: toNode.content,
        side: toNode.side,
        confidence: lerp(fromNode.confidence, toNode.confidence, progress),
        relevance: lerp(fromNode.relevance, toNode.relevance, progress),
        x: lerp(fromNode.x, toNode.x, progress),
        y: lerp(fromNode.y, toNode.y, progress),
        width: lerp(fromNode.width, toNode.width, progress),
        height: lerp(fromNode.height, toNode.height, progress),
    };
}

function interpolateConnectorSpanVisual(
    fromSpan: GraphConnectorSpanVisual,
    toSpan: GraphConnectorSpanVisual,
    progress: number,
): GraphConnectorSpanVisual {
    return {
        ...fromSpan,
        side: toSpan.side,
        centerlinePoints: interpolateWaypoints(fromSpan.centerlinePoints, toSpan.centerlinePoints, progress),
        fluidWidth: lerp(fromSpan.fluidWidth, toSpan.fluidWidth, progress),
        pipeWidth: lerp(fromSpan.pipeWidth, toSpan.pipeWidth, progress),
    };
}

function interpolateConnectorJunctionVisual(
    fromJunction: GraphConnectorJunctionVisual,
    toJunction: GraphConnectorJunctionVisual,
    progress: number,
): GraphConnectorJunctionVisual {
    return {
        ...fromJunction,
        side: toJunction.side,
        centerX: lerp(fromJunction.centerX, toJunction.centerX, progress),
        centerY: lerp(fromJunction.centerY, toJunction.centerY, progress),
        leftHeight: lerp(fromJunction.leftHeight, toJunction.leftHeight, progress),
        rightHeight: lerp(fromJunction.rightHeight, toJunction.rightHeight, progress),
        width: lerp(fromJunction.width, toJunction.width, progress),
    };
}

function interpolateWaypoints(
    fromPoints: Waypoint[],
    toPoints: Waypoint[],
    progress: number,
): Waypoint[] {
    if (fromPoints.length !== toPoints.length) {
        return progress < 0.5 ? fromPoints : toPoints;
    }

    return fromPoints.map((fromPoint, index) => {
        const toPoint = toPoints[index];
        const radius = fromPoint.radius !== undefined || toPoint.radius !== undefined
            ? { radius: lerp(fromPoint.radius ?? 0, toPoint.radius ?? 0, progress) }
            : {};

        return {
            x: lerp(fromPoint.x, toPoint.x, progress),
            y: lerp(fromPoint.y, toPoint.y, progress),
            ...radius,
        };
    });
}

function applyClaimDirective(
    state: GraphRenderState,
    fromSnapshot: GraphSnapshot,
    toSnapshot: GraphSnapshot,
    directive: Extract<GraphTransitionDirective, { kind: "claim" }>,
    progress: number,
): void {
    const workingNode = state.nodeByScoreId[directive.scoreId];
    const fromNode = fromSnapshot.renderState.nodeByScoreId[directive.scoreId];
    const toNode = toSnapshot.renderState.nodeByScoreId[directive.scoreId];

    if (!workingNode) {
        return;
    }

    if (directive.effect === "enter" && toNode) {
        state.nodeByScoreId[directive.scoreId] = {
            ...workingNode,
            ...toNode,
            confidence: toNode.confidence * progress,
            opacity: progress,
            insertScale: progress,
        };
        return;
    }

    if (directive.effect === "exit" && fromNode) {
        state.nodeByScoreId[directive.scoreId] = {
            ...workingNode,
            ...fromNode,
            confidence: fromNode.confidence * (1 - progress),
            opacity: 1 - progress,
            insertScale: 1 - progress,
        };
        return;
    }

    if (directive.effect === "display" && fromNode && toNode) {
        state.nodeByScoreId[directive.scoreId] = {
            ...workingNode,
            content: toNode.content,
            side: toNode.side,
            confidence: lerp(fromNode.confidence, toNode.confidence, progress),
            relevance: lerp(fromNode.relevance, toNode.relevance, progress),
            opacity: 1,
            insertScale: 1,
        };
        return;
    }

    if (directive.effect === "scale" && fromNode && toNode) {
        state.nodeByScoreId[directive.scoreId] = {
            ...workingNode,
            opacity: 1,
            insertScale: 1,
        };
    }
}

function applyConnectorDirective(
    state: GraphRenderState,
    fromSnapshot: GraphSnapshot,
    toSnapshot: GraphSnapshot,
    directive: Extract<GraphTransitionDirective, { kind: "connector" }>,
    progress: number,
): void {
    for (const visualId of state.connectorSpanRenderOrder) {
        const workingSpan = state.connectorSpanByVisualId[visualId];
        if (!workingSpan || workingSpan.connectorId !== directive.connectorId) {
            continue;
        }

        const fromSpan = fromSnapshot.renderState.connectorSpanByVisualId[visualId];
        const toSpan = toSnapshot.renderState.connectorSpanByVisualId[visualId];

        if (directive.effect === "pipeGrow" && toSpan) {
            state.connectorSpanByVisualId[visualId] = {
                ...workingSpan,
                ...toSpan,
                direction: directive.direction ?? "sourceToTarget",
                fluidProgress: 0,
                pipeProgress: progress,
                opacity: 1,
            };
            continue;
        }

        if (directive.effect === "fluidGrow" && toSpan) {
            state.connectorSpanByVisualId[visualId] = {
                ...workingSpan,
                ...toSpan,
                direction: directive.direction ?? "sourceToTarget",
                fluidProgress: progress,
                pipeProgress: 1,
                opacity: 1,
            };
            continue;
        }

        if (directive.effect === "shrink" && fromSpan) {
            state.connectorSpanByVisualId[visualId] = {
                ...workingSpan,
                ...fromSpan,
                direction: directive.direction ?? "targetToSource",
                fluidProgress: 1 - progress,
                pipeProgress: 1 - progress,
                opacity: 1,
            };
            continue;
        }

        if (directive.effect === "update") {
            applyConnectorUpdateDirective(
                state,
                visualId,
                workingSpan,
                fromSpan,
                toSpan,
                directive.direction ?? "sourceToTarget",
                progress,
            );
        }
    }

    for (const visualId of state.connectorJunctionRenderOrder) {
        const workingJunction = state.connectorJunctionByVisualId[visualId];
        if (!workingJunction || workingJunction.targetConfidenceConnectorId !== directive.connectorId) {
            continue;
        }

        const fromJunction = fromSnapshot.renderState.connectorJunctionByVisualId[visualId];
        const toJunction = toSnapshot.renderState.connectorJunctionByVisualId[visualId];

        if ((directive.effect === "pipeGrow" || directive.effect === "fluidGrow") && toJunction) {
            state.connectorJunctionByVisualId[visualId] = {
                ...workingJunction,
                ...toJunction,
                opacity: directive.effect === "pipeGrow" ? progress : 1,
            };
            continue;
        }

        if (directive.effect === "shrink" && fromJunction) {
            state.connectorJunctionByVisualId[visualId] = {
                ...workingJunction,
                ...fromJunction,
                opacity: 1 - progress,
            };
            continue;
        }

        if (directive.effect === "update") {
            if (fromJunction && toJunction) {
                state.connectorJunctionByVisualId[visualId] = {
                    ...interpolateConnectorJunctionVisual(fromJunction, toJunction, progress),
                    opacity: lerp(fromJunction.opacity, toJunction.opacity, progress),
                };
                continue;
            }

            if (toJunction) {
                state.connectorJunctionByVisualId[visualId] = {
                    ...toJunction,
                    opacity: toJunction.opacity * progress,
                };
                continue;
            }

            if (fromJunction) {
                state.connectorJunctionByVisualId[visualId] = {
                    ...fromJunction,
                    opacity: fromJunction.opacity * (1 - progress),
                };
            }
        }
    }
}

function applyConnectorUpdateDirective(
    state: GraphRenderState,
    visualId: string,
    workingSpan: GraphConnectorSpanVisual,
    fromSpan: GraphConnectorSpanVisual | undefined,
    toSpan: GraphConnectorSpanVisual | undefined,
    direction: GraphTransitionDirection,
    progress: number,
): void {
    if (fromSpan && toSpan) {
        const widthChanged = Math.abs(fromSpan.fluidWidth - toSpan.fluidWidth) > 1e-6
            || Math.abs(fromSpan.pipeWidth - toSpan.pipeWidth) > 1e-6;
        state.connectorSpanByVisualId[visualId] = {
            ...workingSpan,
            side: toSpan.side,
            fluidProgress: 1,
            pipeProgress: 1,
            opacity: 1,
            direction,
            updateTransition: widthChanged
                ? {
                    fromFluidWidth: fromSpan.fluidWidth,
                    fromPipeWidth: fromSpan.pipeWidth,
                    toFluidWidth: toSpan.fluidWidth,
                    toPipeWidth: toSpan.pipeWidth,
                    progress,
                    direction,
                }
                : undefined,
        };
        return;
    }

    if (toSpan) {
        state.connectorSpanByVisualId[visualId] = {
            ...toSpan,
            direction,
            fluidProgress: progress,
            pipeProgress: progress,
            opacity: 1,
        };
        return;
    }

    if (fromSpan) {
        state.connectorSpanByVisualId[visualId] = {
            ...fromSpan,
            direction: invertAnimationDirection(direction),
            fluidProgress: 1 - progress,
            pipeProgress: 1 - progress,
            opacity: 1,
        };
    }
}

function buildTransitionDirectives(
    fromDebate: Debate,
    toDebate: Debate,
    operations: readonly Operation[],
): GraphTransitionDirective[] {
    const directives: GraphTransitionDirective[] = [];
    const connectorAddedById = new Set<ConnectorId>(
        operations
            .filter((operation): operation is Extract<Operation, { type: "ConnectorAdded" }> => operation.type === "ConnectorAdded")
            .map((operation) => operation.connector.id),
    );
    const connectorDeletedById = new Set<ConnectorId>(
        operations
            .filter((operation): operation is Extract<Operation, { type: "ConnectorDeleted" }> => operation.type === "ConnectorDeleted")
            .map((operation) => operation.connectorId),
    );

    for (const operation of operations) {
        switch (operation.type) {
            case "ClaimAdded":
            case "DebateCreated":
            case "DebateUpdated":
            case "incomingScoresChanged":
            case "incomingScoresSorted":
                break;
            case "ClaimUpdated":
                addClaimUpdateDirectives(directives, toDebate, operation.patch.id);
                break;
            case "ClaimDeleted":
                break;
            case "ConnectorAdded":
                if (operation.connector.type === "relevance") {
                    addDirective(directives, {
                        kind: "connector",
                        connectorId: operation.connector.targetConfidenceConnectorId,
                        effect: "update",
                        direction: "sourceToTarget",
                    });
                }
                break;
            case "ConnectorDeleted": {
                const connector = fromDebate.connectors[operation.connectorId];
                if (connector?.type === "relevance") {
                    addDirective(directives, {
                        kind: "connector",
                        connectorId: connector.targetConfidenceConnectorId,
                        effect: "update",
                        direction: "targetToSource",
                    });
                }
                break;
            }
            case "ScoreAdded":
                addDirective(directives, {
                    kind: "claim",
                    scoreId: operation.score.id,
                    effect: "enter",
                });
                if (operation.score.connectorId && connectorAddedById.has(operation.score.connectorId)) {
                    addDirective(directives, {
                        kind: "connector",
                        connectorId: operation.score.connectorId,
                        effect: "fluidGrow",
                        direction: "sourceToTarget",
                    });
                }
                break;
            case "ScoreDeleted": {
                const score = fromDebate.scores[operation.scoreId];
                if (score?.connectorId && connectorDeletedById.has(score.connectorId)) {
                    addDirective(directives, {
                        kind: "connector",
                        connectorId: score.connectorId,
                        effect: "shrink",
                        direction: "targetToSource",
                    });
                }
                addDirective(directives, {
                    kind: "claim",
                    scoreId: operation.scoreId,
                    effect: "exit",
                });
                break;
            }
            case "ScoreUpdated":
                for (const patch of operation.patches) {
                    addDirective(directives, {
                        kind: "claim",
                        scoreId: patch.id,
                        effect: "display",
                    });
                    addConnectorUpdateDirectiveForScore(directives, toDebate, patch.id, "sourceToTarget");
                }
                break;
            case "scaleOfSources":
                for (const patch of operation.patches) {
                    addDirective(directives, {
                        kind: "claim",
                        scoreId: patch.id,
                        effect: "scale",
                    });
                    addConnectorUpdateDirectiveForScore(directives, toDebate, patch.id, "sourceToTarget");
                }
                break;
        }
    }

    return directives;
}

function addClaimUpdateDirectives(
    directives: GraphTransitionDirective[],
    debate: Debate,
    claimId: ClaimId,
): void {
    for (const score of Object.values(debate.scores)) {
        if (score.claimId === claimId) {
            addDirective(directives, {
                kind: "claim",
                scoreId: score.id,
                effect: "display",
            });
        }
    }
}

function addConnectorUpdateDirectiveForScore(
    directives: GraphTransitionDirective[],
    debate: Debate,
    scoreId: ScoreId,
    direction: GraphTransitionDirection,
): void {
    const score = debate.scores[scoreId];
    if (!score?.connectorId) {
        return;
    }

    addDirective(directives, {
        kind: "connector",
        connectorId: score.connectorId,
        effect: "update",
        direction,
    });

    const connector = debate.connectors[score.connectorId];
    if (connector?.type === "relevance") {
        addDirective(directives, {
            kind: "connector",
            connectorId: connector.targetConfidenceConnectorId,
            effect: "update",
            direction,
        });
    }
}

function addDirective(
    directives: GraphTransitionDirective[],
    directive: GraphTransitionDirective,
): void {
    const directiveKey = directive.kind === "claim"
        ? `${directive.kind}:${directive.scoreId}:${directive.effect}`
        : `${directive.kind}:${directive.connectorId}:${directive.effect}`;

    if (directives.some((existingDirective) => {
        const existingDirectiveKey = existingDirective.kind === "claim"
            ? `${existingDirective.kind}:${existingDirective.scoreId}:${existingDirective.effect}`
            : `${existingDirective.kind}:${existingDirective.connectorId}:${existingDirective.effect}`;
        return existingDirectiveKey === directiveKey;
    })) {
        return;
    }

    directives.push(directive);
}

function renderConnectorLayers(activeGraph: GraphRenderState): ReactNode[] {
    return (["pipeWalls", "pipeInterior", "fluid"] satisfies DebateConnectorLayer[]).flatMap((layer) => (
        activeGraph.connectorSpanRenderOrder.map((visualId) => {
            const connector = activeGraph.connectorSpanByVisualId[visualId];
            return connector ? renderConnectorSpan(connector, layer) : null;
        })
    ));
}

function renderConnectorSpan(
    connector: GraphConnectorSpanVisual,
    layer: DebateConnectorLayer,
): ReactNode {
    if (connector.updateTransition) {
        return renderConnectorUpdateTransition(connector, layer);
    }

    const layerProgress = layer === "fluid" ? connector.fluidProgress : connector.pipeProgress;
    if (connector.opacity <= 0 || layerProgress <= 0) {
        return null;
    }
    const geometryInstructions = buildConnectorRevealInstructions(
        connector,
        layer,
        layerProgress,
    );

    return (
        <g key={`${layer}:${connector.visualId}`} opacity={connector.opacity}>
            {renderConnectorLayer(connector, layer, geometryInstructions)}
        </g>
    );
}

function renderConnectorUpdateTransition(
    connector: GraphConnectorSpanVisual,
    layer: DebateConnectorLayer,
): ReactNode {
    const updateTransition = connector.updateTransition;
    if (!updateTransition || connector.opacity <= 0) {
        return null;
    }
    const clampedProgress = clamp01(updateTransition.progress);
    const fromConnector: GraphConnectorSpanVisual = {
        ...connector,
        fluidWidth: updateTransition.fromFluidWidth,
        pipeWidth: updateTransition.fromPipeWidth,
        updateTransition: undefined,
    };
    const toConnector: GraphConnectorSpanVisual = {
        ...connector,
        fluidWidth: updateTransition.toFluidWidth,
        pipeWidth: updateTransition.toPipeWidth,
        updateTransition: undefined,
    };

    if (clampedProgress <= 0.0001) {
        return (
            <g key={`${layer}:${connector.visualId}`} opacity={connector.opacity}>
                {renderConnectorLayer(fromConnector, layer)}
            </g>
        );
    }

    if (clampedProgress >= 0.9999) {
        return (
            <g key={`${layer}:${connector.visualId}`} opacity={connector.opacity}>
                {renderConnectorLayer(toConnector, layer)}
            </g>
        );
    }

    const geometryInstructions = buildConnectorUpdateInstructions(connector, layer);

    return (
        <g key={`${layer}:${connector.visualId}`} opacity={connector.opacity}>
            {renderConnectorLayer(
                geometryInstructions ? connector : toConnector,
                layer,
                geometryInstructions,
            )}
        </g>
    );
}

function renderConnectorLayer(
    connector: GraphConnectorSpanVisual,
    layer: DebateConnectorLayer,
    geometryInstructions?: PathGeometryInstruction[],
): ReactNode {
    return (
        <DebateConnector
            centerlinePoints={connector.centerlinePoints}
            fluidWidth={connector.fluidWidth}
            geometryInstructions={geometryInstructions}
            layer={layer}
            outlineWidth={getConnectorOutlineWidth()}
            pipeWidth={connector.pipeWidth}
            side={connector.side}
        />
    );
}

function buildConnectorUpdateInstructions(
    connector: GraphConnectorSpanVisual,
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

function renderConnectorJunction(visual: GraphConnectorJunctionVisual): ReactNode {
    if (visual.opacity <= 0) {
        return null;
    }

    const leftX = visual.centerX - visual.width / 2;
    const rightX = visual.centerX + visual.width / 2;
    const leftTopY = visual.centerY - visual.leftHeight / 2;
    const rightTopY = visual.centerY - visual.rightHeight / 2;
    const rightBottomY = visual.centerY + visual.rightHeight / 2;
    const leftBottomY = visual.centerY + visual.leftHeight / 2;
    const pathData = [
        `M ${leftX} ${leftTopY}`,
        `L ${rightX} ${rightTopY}`,
        `L ${rightX} ${rightBottomY}`,
        `L ${leftX} ${leftBottomY}`,
        "Z",
    ].join(" ");

    return (
        <path
            key={visual.visualId}
            d={pathData}
            fill="none"
            opacity={visual.opacity}
            pointerEvents="none"
            stroke={resolveSideStroke(visual.side)}
            strokeLinejoin="round"
            strokeWidth={getConnectorOutlineWidth()}
        />
    );
}

function renderClaim(claim: GraphNodeVisual): ReactNode {
    const layoutCardScale = Math.min(
        claim.width / BASE_NODE_WIDTH_PX,
        claim.height / BASE_NODE_HEIGHT_PX,
    );
    const cardScale = layoutCardScale * claim.insertScale;
    const claimShapeStyle = {
        height: BASE_NODE_HEIGHT_PX,
        left: "50%",
        position: "absolute",
        top: "50%",
        transform: `translate(-50%, -50%) scale(${cardScale})`,
        transformOrigin: "center center",
        width: BASE_NODE_WIDTH_PX,
    } satisfies CSSProperties;

    return (
        <article
            key={claim.scoreId}
            style={{
                boxSizing: "border-box",
                height: claim.height,
                left: claim.x,
                opacity: claim.opacity,
                overflow: "visible",
                position: "absolute",
                top: claim.y,
                width: claim.width,
            }}
            data-claim-id={claim.claimId}
            data-score-id={claim.scoreId}
            data-claim-side={claim.side}
        >
            <div style={claimShapeStyle}>
                <div
                    style={{
                        background: resolveSideFill(claim.side, 0.3),
                        border: `4px solid ${resolveSideStroke(claim.side)}`,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        justifyContent: "space-between",
                        overflow: "hidden",
                        padding: "16px 20px 14px",
                        width: "100%",
                    }}
                >
                    <div style={claimContentStyle}>{claim.content}</div>
                    <small style={claimScoreStyle}>
                        {formatConfidenceLabel(claim.confidence)}
                    </small>
                </div>
            </div>
        </article>
    );
}

function buildConnectorRevealInstructions(
    connector: GraphConnectorSpanVisual,
    layer: DebateConnectorLayer,
    progress: number,
): PathGeometryInstruction[] | undefined {
    const direction = connector.direction;
    const activeWidth = layer === "fluid" ? connector.fluidWidth : connector.pipeWidth;

    if (layer !== "fluid") {
        return buildConnectorOpenRevealInstructions(activeWidth, progress, direction);
    }

    const fluidSection = buildFluidOffsetsInstruction(connector.pipeWidth, connector.fluidWidth);
    const transitionLengthPx = getConnectorGeometryTransitionLengthPx(activeWidth);
    const transitionPercent = lengthPxToApproximatePathPercent(connector.centerlinePoints, transitionLengthPx);
    const collapseOffset = getFluidBottomOffset(connector.pipeWidth);

    if (progress >= 1) {
        return undefined;
    }

    const progressPercent = clamp01(progress) * 100;

    if (direction === "targetToSource") {
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
    direction: GraphTransitionDirection,
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

function resolveCameraState(
    frame: number,
    initialGraph: GraphRenderState,
    graph: GraphRenderState,
    cameraMoves: ResolvedCameraMove[],
    frameWidth: number,
    frameHeight: number,
): CameraState {
    const baseState = getCameraStateForTarget(
        getWholeGraphTarget(initialGraph),
        frameWidth,
        frameHeight,
        DEFAULT_VIEWPORT_PADDING,
    );
    let currentState = baseState;

    for (const move of cameraMoves) {
        const nextTargetData = move.reset
            ? { x: graph.width / 2, y: graph.height / 2, width: graph.width, height: graph.height }
            : resolveTargetData(graph, move.target) ?? { x: graph.width / 2, y: graph.height / 2 };
        const nextState = getCameraStateForTarget(
            nextTargetData,
            frameWidth,
            frameHeight,
            move.reset ? DEFAULT_VIEWPORT_PADDING : move.padding,
            move.scale,
        );

        if (frame < move.from) {
            return currentState;
        }

        const endFrame = move.from + move.durationInFrames;
        if (frame >= endFrame) {
            currentState = nextState;
            continue;
        }

        return getZoomMotionState({
            frame,
            startFrame: move.from,
            durationInFrames: move.durationInFrames,
            startScale: currentState.scale,
            endScale: nextState.scale,
            targetX: nextState.targetX,
            targetY: nextState.targetY,
            startScreenX: currentState.translateX + nextState.targetX * currentState.scale,
            endScreenX: nextState.targetScreenX,
            startScreenY: currentState.translateY + nextState.targetY * currentState.scale,
            endScreenY: nextState.targetScreenY,
        });
    }

    return currentState;
}

function getCameraStateForTarget(
    targetData: { x: number; y: number; width?: number; height?: number },
    frameWidth: number,
    frameHeight: number,
    padding: number,
    fallbackScale = DEFAULT_ZOOM_SCALE,
): CameraFocusState {
    const scale = resolveZoomScale(targetData, frameWidth, frameHeight, padding, fallbackScale);

    return {
        targetX: targetData.x,
        targetY: targetData.y,
        targetScreenX: frameWidth / 2,
        targetScreenY: frameHeight / 2,
        scale,
        translateX: frameWidth / 2 - targetData.x * scale,
        translateY: frameHeight / 2 - targetData.y * scale,
    };
}

function resolveTargetData(
    graph: GraphRenderState,
    target: GraphZoomTarget | undefined,
): { x: number; y: number; width?: number; height?: number } | undefined {
    if (!target) {
        return undefined;
    }

    if ("claimId" in target) {
        return getClaimBoundsForTarget(graph, target.claimId);
    }

    return target;
}

function resolveZoomScale(
    zoomTargetData: { width?: number; height?: number } | undefined,
    frameWidth: number,
    frameHeight: number,
    padding: number,
    fallbackScale: number,
): number {
    if (!zoomTargetData?.width || !zoomTargetData?.height) {
        return fallbackScale;
    }

    const availableWidth = Math.max(1, frameWidth - padding * 2);
    const availableHeight = Math.max(1, frameHeight - padding * 2);
    return Math.min(availableWidth / zoomTargetData.width, availableHeight / zoomTargetData.height);
}

function getWholeGraphTarget(graph: GraphRenderState): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    return {
        x: graph.width / 2,
        y: graph.height / 2,
        width: graph.width,
        height: graph.height,
    };
}

function getClaimBoundsForTarget(
    graph: GraphRenderState,
    claimIds: string | readonly string[],
): { x: number; y: number; width: number; height: number } | undefined {
    const targetClaimIds = typeof claimIds === "string" ? [claimIds] : [...claimIds];
    const resolvedClaims = Object.values(graph.nodeByScoreId).filter((claim) => (
        targetClaimIds.includes(claim.claimId)
    ));

    if (resolvedClaims.length < targetClaimIds.length) {
        return undefined;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const claim of resolvedClaims) {
        minX = Math.min(minX, claim.x);
        minY = Math.min(minY, claim.y);
        maxX = Math.max(maxX, claim.x + claim.width);
        maxY = Math.max(maxY, claim.y + claim.height);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    return {
        x: minX + width / 2,
        y: minY + height / 2,
        width,
        height,
    };
}

function resolveCameraMoves(
    children: ReactNode,
    zoomClaimId: ClaimId | undefined,
    zoomTarget: GraphZoomTarget | undefined,
    zoomScale: number,
    zoomStartFrame: number | undefined,
    zoomDurationInFrames: number,
    zoomPadding: number,
): ResolvedCameraMove[] {
    const cameraMoves: ResolvedCameraMove[] = [];

    if (zoomStartFrame != null) {
        const legacyTarget = zoomTarget ?? (zoomClaimId ? { claimId: zoomClaimId } : undefined);
        if (legacyTarget) {
            cameraMoves.push({
                from: zoomStartFrame,
                durationInFrames: zoomDurationInFrames,
                reset: false,
                target: legacyTarget,
                scale: zoomScale,
                padding: zoomPadding,
                name: zoomClaimId ? `CameraMove ${zoomClaimId}` : "CameraMove 1",
            });
        }
    }

    for (const [index, child] of Children.toArray(children).entries()) {
        if (!isValidElement<CameraMoveProps>(child) || child.type !== CameraMove) {
            continue;
        }

        const target = child.props.target ?? (child.props.claimId ? { claimId: child.props.claimId } : undefined);
        if (!child.props.reset && !target) {
            throw new Error("CameraMove requires either claimId or target.");
        }

        cameraMoves.push({
            from: child.props.from,
            durationInFrames: child.props.durationInFrames ?? DEFAULT_ZOOM_DURATION_FRAMES,
            reset: child.props.reset ?? false,
            target,
            scale: child.props.scale ?? DEFAULT_ZOOM_SCALE,
            padding: child.props.padding ?? DEFAULT_ZOOM_PADDING,
            name: child.props.name ?? (
                child.props.reset
                    ? "CameraMove Reset"
                    : child.props.claimId
                        ? `CameraMove ${getCameraMoveLabel(child.props.claimId)}`
                        : `CameraMove ${index + 1}`
            ),
        });
    }

    return [...cameraMoves].sort((left, right) => left.from - right.from);
}

function getCameraMoveLabel(claimId: string | readonly string[]): string {
    return (typeof claimId === "string" ? [claimId] : [...claimId]).join(", ");
}

function resolveGraphEvents(children: ReactNode): ResolvedGraphEvent[] {
    const graphEvents: ResolvedGraphEvent[] = [];

    for (const [index, child] of Children.toArray(children).entries()) {
        if (!isValidElement<GraphEventsProps>(child) || child.type !== GraphEvents) {
            continue;
        }

        if (child.props.actions.length < 1) {
            throw new Error("GraphEvents requires at least one action.");
        }

        graphEvents.push({
            from: child.props.from,
            durationInFrames: child.props.durationInFrames ?? 1,
            actions: child.props.actions,
            applyMode: child.props.applyMode ?? "per-action",
            id: child.props.id,
            name: child.props.name ?? child.props.id ?? `GraphEvents ${index + 1}`,
        });
    }

    return [...graphEvents].sort((left, right) => left.from - right.from);
}

function logPreparedGraphViewTimeline(prepared: PreparedGraphView): void {
    void prepared;
}

function mapLayoutX(layout: DebateLayout, x: number): number {
    return Math.round(x - layout.bounds.left + GRAPH_PADDING_PX);
}

function mapLayoutY(layout: DebateLayout, y: number): number {
    return Math.round(y - layout.bounds.top + GRAPH_PADDING_PX);
}

function buildUnionOrder<T extends string>(preferred: readonly T[], fallback: readonly T[]): T[] {
    return Array.from(new Set([...preferred, ...fallback]));
}

function getConnectorOutlineWidth(): number {
    return CONNECTOR_OUTLINE_WIDTH_PX;
}

function resolveSideStroke(side: Score["claimSide"]): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}

function resolveSideFill(side: Score["claimSide"], alpha: number): string {
    if (side === "proMain") {
        return `hsl(var(--pro-h) 100% var(--pro-l) / ${alpha})`;
    }

    return `hsl(var(--con-h) 100% var(--con-l) / ${alpha})`;
}

function formatConfidenceLabel(confidence: number): string {
    return `${Math.round(confidence * 100)}% confidence`;
}

function invertAnimationDirection(
    direction: GraphTransitionDirection,
): GraphTransitionDirection {
    return direction === "sourceToTarget" ? "targetToSource" : "sourceToTarget";
}

function lerp(from: number, to: number, progress: number): number {
    return from + (to - from) * progress;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

const graphRootStyle = {
    background: "#000000",
    color: "#ffffff",
    overflow: "hidden",
    "--pro-h": "276.37",
    "--pro-l": "65%",
    "--pro": "hsl(var(--pro-h), 100%, var(--pro-l))",
    "--con-h": "30.21",
    "--con-l": "42%",
    "--con": "hsl(var(--con-h), 100%, var(--con-l))",
} as CSSProperties;

const connectorLayerStyle = {
    inset: 0,
    overflow: "visible",
    position: "absolute",
} satisfies CSSProperties;

const claimContentStyle = {
    display: "-webkit-box",
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.08,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
} satisfies CSSProperties;

const claimScoreStyle = {
    color: "#d1d5db",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "0.03em",
    marginTop: 10,
} satisfies CSSProperties;
