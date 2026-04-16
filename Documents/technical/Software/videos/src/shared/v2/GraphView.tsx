// See 📌README.md in this folder for local coding standards before editing this file.

import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Change, Claim, ClaimId, ClaimSide, Connector, ConnectorId, Debate, Intent, PropagationDirection, ScoreId } from "../../../../contracts/src/index.ts";
import { calculateLayoutPipeline, prepareAnimationSchedule, processDebateIntent, type DebateLayout, type DebateLayoutPipelineContext } from "../../../../engine/src/v2/index.ts";
import { cancelRender, continueRender, delayRender, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { getZoomMotionState } from "../zoomMotion.ts";

const DEFAULT_GRAPH_FROM = 0;
const DEFAULT_ZOOM_SCALE = 3.4;
const DEFAULT_ZOOM_DURATION_FRAMES = 78;
const DEFAULT_ZOOM_PADDING = 120;
const DEFAULT_VIEWPORT_PADDING = 100;
const DEFAULT_CLAIM_WIDTH = 320;
const DEFAULT_CLAIM_HEIGHT = 180;
const SOURCE_SIDE_STRAIGHT_SEGMENT_PERCENT = 0.5;
const TARGET_SIDE_STRAIGHT_SEGMENT_PERCENT = 0.3;
const CONNECTOR_TRANSITION_OVERLAP_PERCENT = 0.00;

const GRAPH_LAYOUT_OPTIONS = {
	scaleConnectionDistanceWithScore: true,
} satisfies Parameters<typeof calculateLayoutPipeline>[1];

type GraphTransitionDirection = PropagationDirection;

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
		effect: "grow" | "shrink" | "update";
		direction?: GraphTransitionDirection;
	};

type GraphZoomTarget =
	| { claimId: string | readonly string[] }
	| { x: number; y: number; width?: number; height?: number };

type GraphAction =
	| { kind: "claim.upsert"; claim: Claim }
	| { kind: "connector.upsert"; connector: Connector };

export type GraphActionEntry = {
	id: string;
	action: GraphAction;
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

type ClaimVisual = {
	scoreId: ScoreId;
	claimId: ClaimId;
	content: string;
	side: ClaimSide;
	confidence: number;
	relevance: number;
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
	insertScale: number;
};

type ConnectorPathBinding = {
	sourceClaimId: ClaimId;
	targetClaimId: ClaimId;
	sourceOffsetX: number;
	sourceOffsetY: number;
	targetOffsetX: number;
	targetOffsetY: number;
};

type ConnectorVisual = {
	connectorId: ConnectorId;
	sourceSide: ClaimSide;
	referenceAffects: Connector["affects"];
	actualAffects: Connector["affects"];
	referencePathBinding: ConnectorPathBinding;
	referenceLineProgress: number;
	referenceLineTravelOffset: number;
	referenceOpacity: number;
	actualPathBinding: ConnectorPathBinding;
	strokeWidth: number;
	referenceStrokeWidth: number;
	actualLineProgress: number;
	actualLineTravelOffset: number;
	actualOpacity: number;
	secondaryAffects?: Connector["affects"];
	secondaryPathBinding?: ConnectorPathBinding;
	secondaryStrokeWidth?: number;
	secondaryLineProgress: number;
	secondaryLineTravelOffset: number;
	secondaryOpacity: number;
};

type GraphRenderState = {
	width: number;
	height: number;
	claimRenderOrder: ClaimId[];
	connectorRenderOrder: ConnectorId[];
	claimByClaimId: Record<ClaimId, ClaimVisual>;
	connectorByConnectorId: Record<ConnectorId, ConnectorVisual>;
};

type GraphSnapshot = {
	pipeline: DebateLayoutPipelineContext;
	renderState: GraphRenderState;
};

type ConnectorStrokeVisual = {
	pathBinding: ConnectorPathBinding;
	affects: Connector["affects"];
	strokeWidth: number;
	lineProgress: number;
	lineTravelOffset: number;
	opacity: number;
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
	debate: Debate;
	fromDebate?: Debate;
	toDebate?: Debate;
	progress: number;
	directives: readonly GraphTransitionDirective[];
};

type AppliedGraphActionState = {
	debate: Debate;
	intent?: Intent;
	changes?: Change[];
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

type GraphViewContentProps = {
	prepared: PreparedGraphView;
	cameraMoves: ResolvedCameraMove[];
};

const V1_VIDEO_GRAPH_VIEW_CSS = `
	.rt-graph-view {
		--pro-h: 276.37;
		--pro-l: 65%;
		--pro: hsl(var(--pro-h), 100%, var(--pro-l));
		--con-h: 30.21;
		--con-l: 42%;
		--con: hsl(var(--con-h), 100%, var(--con-l));
		--rt-connector-opacity: 90%;
		--rt-connector-potential-opacity: 30%;
		position: relative;
	}

	.rt-graph-view__content {
		position: absolute;
		left: 50%;
		top: 50%;
		transform-origin: center center;
	}

	.rt-graph-view .rt-layout-canvas {
		position: relative;
		background: #000000;
	}

	.rt-graph-view .rt-connector-layer {
		position: absolute;
		inset: 0;
		overflow: visible;
		pointer-events: none;
	}

	.rt-graph-view .rt-connector {
		fill: none;
		stroke: #64748b;
		opacity: var(--rt-connector-opacity);
		stroke-linecap: butt;
	}

	.rt-graph-view .rt-connector.rt-connector-potential-confidence {
		opacity: var(--rt-connector-potential-opacity);
	}

	.rt-graph-view .rt-connector[data-connector-side='proMain'] {
		stroke: var(--pro);
	}

	.rt-graph-view .rt-connector[data-connector-side='conMain'] {
		stroke: var(--con);
	}

	.rt-graph-view .rt-connector[data-affects='relevance'] {
		stroke-dasharray: 6 5;
	}

	.rt-graph-view .rt-claim-shape {
		box-sizing: border-box;
		position: absolute;
		left: 50%;
		top: 50%;
		transform-origin: center center;
		transform: translate(-50%, -50%) scale(calc(var(--rt-claim-shape-scale, 1) * var(--rt-claim-insert-scale, 1)));
	}

	.rt-graph-view .rt-claim-shape-shell {
		position: absolute;
		overflow: visible;
	}

	.rt-graph-view .rt-claim-shape-body {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		background: #000000;
		color: #ffffff;
		border: 4px solid #cbd5e1;
		border-radius: 0;
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
		padding: 0.5rem 0.75rem;
		overflow: auto;
	}

	.rt-graph-view .rt-claim-shape-shell[data-claim-side='proMain'] .rt-claim-shape-body {
		border-color: var(--pro);
		background: hsl(var(--pro-h) 100% var(--pro-l) / var(--rt-connector-potential-opacity));
	}

	.rt-graph-view .rt-claim-shape-shell[data-claim-side='conMain'] .rt-claim-shape-body {
		border-color: var(--con);
		background: hsl(var(--con-h) 100% var(--con-l) / var(--rt-connector-potential-opacity));
	}

	.rt-graph-view .rt-score-card__content {
		margin: 0;
		font-size: 1rem;
		line-height: 1.05;
		font-weight: 600;
		color: #ffffff;
	}

	.rt-graph-view small {
		display: block;
		margin-top: 0.35rem;
		color: #d1d5db;
	}
`;

export const GraphView = ({
	debate,
	from = DEFAULT_GRAPH_FROM,
	durationInFrames,
	children,
	siblingOrderingMode,
	zoomClaimId,
	zoomTarget,
	zoomScale = DEFAULT_ZOOM_SCALE,
	zoomStartFrame,
	zoomDurationInFrames = DEFAULT_ZOOM_DURATION_FRAMES,
	zoomPadding = DEFAULT_ZOOM_PADDING,
	debugTimeline = false,
}: GraphViewProps) => {
	const [delayHandle] = useState(() => delayRender());
	const [prepared, setPrepared] = useState<PreparedGraphView | null>(null);
	const cameraMoves = useMemo(
		() => resolveCameraMoves(children, zoomClaimId, zoomTarget, zoomScale, zoomStartFrame, zoomDurationInFrames, zoomPadding),
		[children, zoomClaimId, zoomTarget, zoomScale, zoomStartFrame, zoomDurationInFrames, zoomPadding],
	);
	const graphEvents = useMemo(() => resolveGraphEvents(children), [children]);

	useEffect(() => {
		let isActive = true;

		buildPreparedGraphView(debate, graphEvents, siblingOrderingMode, debugTimeline)
			.then((nextPrepared) => {
				if (!isActive) {
					return;
				}

				if (debugTimeline) {
					logPreparedGraphViewTimeline(nextPrepared);
				}

				setPrepared(nextPrepared);
				continueRender(delayHandle);
			})
			.catch((error) => {
				const renderError = error instanceof Error ? error : new Error(String(error));
				if (!isActive) {
					return;
				}

				cancelRender(renderError);
			});

		return () => {
			isActive = false;
		};
	}, [debate, debugTimeline, delayHandle, graphEvents, siblingOrderingMode]);

	return (
		<>
			<Sequence from={from} durationInFrames={durationInFrames} name="Graph" layout="none">
				{prepared ? <GraphViewContent prepared={prepared} cameraMoves={cameraMoves} /> : null}
			</Sequence>
			{prepared ? renderPreparedTimelineMarkers(prepared, from) : null}
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

const GraphViewContent = ({ prepared, cameraMoves }: GraphViewContentProps) => {
	const frame = useCurrentFrame();
	const { width: frameWidth, height: frameHeight } = useVideoConfig();
	const activeGraphFrame = resolveActiveGraph(prepared, frame);
	const activeGraph = activeGraphFrame.renderState;
	const cameraState = resolveCameraState(frame, activeGraph, cameraMoves, frameWidth, frameHeight);
	const wrapperStyle = {
		width: activeGraph.width * cameraState.scale,
		height: activeGraph.height * cameraState.scale,
	} satisfies React.CSSProperties;
	const contentStyle = {
		width: activeGraph.width,
		height: activeGraph.height,
		transform: `translate(-50%, -50%) translate(${cameraState.translateX}px, ${cameraState.translateY}px) scale(${cameraState.scale})`,
	} satisfies React.CSSProperties;

	return (
		<>
			<style>{V1_VIDEO_GRAPH_VIEW_CSS}</style>
			<div className="rt-graph-view" style={wrapperStyle} aria-label="Reason Tracker graph">
				<div className="rt-graph-view__content" style={{ ...graphContentStyle, ...contentStyle }}>
					<div className="rt-layout-canvas" style={{ width: activeGraph.width, height: activeGraph.height }}>
						<svg className="rt-connector-layer" width={activeGraph.width} height={activeGraph.height} viewBox={`0 0 ${activeGraph.width} ${activeGraph.height}`} aria-hidden="true">
							{activeGraph.connectorRenderOrder.flatMap((connectorId) => {
								const connector = activeGraph.connectorByConnectorId[connectorId];
								return connector ? renderConnectorPaths(connector, activeGraph.claimByClaimId) : [];
							})}
						</svg>
						{activeGraph.claimRenderOrder.map((claimId) => {
							const claim = activeGraph.claimByClaimId[claimId];
							return claim ? renderClaim(claim) : null;
						})}
					</div>
				</div>
			</div>
		</>
	);
};

function renderPreparedTimelineMarkers(prepared: PreparedGraphView, graphFrom: number): ReactNode[] {
	return prepared.segments
		.filter((segment) => segment.directives.length > 0 && segment.name !== "Hold final state")
		.map((segment, index) => (
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

async function buildPreparedGraphView(
	debate: Debate,
	graphEvents: ResolvedGraphEvent[],
	_siblingOrderingMode: GraphViewProps["siblingOrderingMode"],
	debugTimeline: boolean,
): Promise<PreparedGraphView> {
	const initialSnapshot = await buildGraphSnapshot({ debate });
	const segments: GraphTransitionSegment[] = [];
	let currentState: AppliedGraphActionState = { debate };
	let currentSnapshot = initialSnapshot;

	for (const graphEvent of graphEvents) {
		const nextState = applyGraphActions(currentState.debate, graphEvent.actions);
		const schedule = await prepareAnimationSchedule({
			debate: currentState.debate,
			intent: nextState.intent,
			eventDurationInFrames: graphEvent.durationInFrames,
			layoutOptions: GRAPH_LAYOUT_OPTIONS,
		});
		const transitionSegments = buildChangeGroupSegments(currentSnapshot, schedule, graphEvent.from);
		const toSnapshot = buildGraphSnapshotFromPipeline(schedule.finalLayout);

		if (debugTimeline) {
			logGraphPipelineObjects({
				graphEvent,
				nextState,
				schedule,
			});
		}

		segments.push(...transitionSegments);
		currentState = nextState;
		currentSnapshot = toSnapshot;
	}

	return {
		initialSnapshot,
		segments,
		finalSnapshot: currentSnapshot,
	};
}

function buildGraphTransitionSegments(
	fromSnapshot: GraphSnapshot,
	schedule: Awaited<ReturnType<typeof prepareAnimationSchedule>>,
	timelineFrom: number,
): GraphTransitionSegment[] {
	return buildChangeGroupSegments(fromSnapshot, schedule, timelineFrom);
}

function buildChangeGroupSegments(
	fromSnapshot: GraphSnapshot,
	schedule: Awaited<ReturnType<typeof prepareAnimationSchedule>>,
	timelineFrom: number,
): GraphTransitionSegment[] {
	const transitionSegments: GraphTransitionSegment[] = [];
	let segmentTimelineFrom = timelineFrom;
	let currentSnapshot = fromSnapshot;
	for (const changeGroup of schedule.changeGroups) {
		const finalSnapshot = buildGraphSnapshotFromPipeline(changeGroup.finalLayout);
		const directives = buildTransitionDirectives(changeGroup.initialLayout.debate, changeGroup.changes);
		if (shouldKeepChangeGroupGrouped(changeGroup.changes) && directives.length > 0) {
			transitionSegments.push({
				timelineFrom: segmentTimelineFrom,
				name: changeGroup.name,
				fromSnapshot: currentSnapshot,
				toSnapshot: finalSnapshot,
				directives,
				durationInFrames: changeGroup.durationInFrames,
			});
			currentSnapshot = finalSnapshot;
			segmentTimelineFrom += changeGroup.durationInFrames;
			continue;
		}
		const scheduledDirectives = scheduleTransitionDirectives(directives, changeGroup.durationInFrames);

		if (scheduledDirectives.length === 0) {
			transitionSegments.push({
				timelineFrom: segmentTimelineFrom,
				name: changeGroup.name,
				fromSnapshot: currentSnapshot,
				toSnapshot: finalSnapshot,
				directives: [],
				durationInFrames: changeGroup.durationInFrames,
			});
			currentSnapshot = finalSnapshot;
			segmentTimelineFrom += changeGroup.durationInFrames;
			continue;
		}

		for (const scheduledDirective of scheduledDirectives) {
			const groupSnapshot = buildDirectivePhaseSnapshot(currentSnapshot, finalSnapshot, scheduledDirective.directives);
			transitionSegments.push({
				timelineFrom: segmentTimelineFrom,
				name: `${changeGroup.name} / ${formatTransitionDirectiveName(scheduledDirective.directives[0], changeGroup.finalLayout.debate)}`,
				fromSnapshot: currentSnapshot,
				toSnapshot: groupSnapshot,
				directives: scheduledDirective.directives,
				durationInFrames: scheduledDirective.durationInFrames,
			});
			currentSnapshot = groupSnapshot;
			segmentTimelineFrom += scheduledDirective.durationInFrames;
		}
	}

	return transitionSegments;
}

function shouldKeepChangeGroupGrouped(changes: readonly Change[]): boolean {
	return changes.some((change) => change.kind === "ScoreScaleOfSourcesBatchChanged");
}

function buildDirectivePhaseSnapshot(
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	directives: readonly GraphTransitionDirective[],
): GraphSnapshot {
	if (directives.length === 0) {
		return toSnapshot;
	}

	return {
		pipeline: toSnapshot.pipeline,
		renderState: resolveDirectiveTransition(fromSnapshot, toSnapshot, 1, directives),
	};
}

function buildGraphSnapshotFromPipeline(pipeline: DebateLayoutPipelineContext): GraphSnapshot {
	return {
		pipeline,
		renderState: buildRenderState(pipeline.debate, pipeline.layout),
	};
}

function logGraphPipelineObjects(input: {
	graphEvent: ResolvedGraphEvent;
	nextState: AppliedGraphActionState;
	schedule: Awaited<ReturnType<typeof prepareAnimationSchedule>>;
}): void {
	void input;
}

async function buildGraphSnapshot(state: AppliedGraphActionState): Promise<GraphSnapshot> {
	const pipeline = await calculateLayoutPipeline({
		debate: state.debate,
		intent: state.intent,
		changes: state.changes,
	}, GRAPH_LAYOUT_OPTIONS);

	return {
		pipeline,
		renderState: buildRenderState(pipeline.debate, pipeline.layout),
	};
}

function buildRenderState(debate: Debate, layout: DebateLayout): GraphRenderState {
	const claimByClaimId = {} as Record<ClaimId, ClaimVisual>;
	const connectorByConnectorId = {} as Record<ConnectorId, ConnectorVisual>;
	const claimRenderOrder = Object.values(layout.scoreLayouts)
		.slice()
		.sort((left, right) => left.x - right.x || left.y - right.y)
		.map((scoreLayout) => debate.scores[scoreLayout.scoreId])
		.filter((score): score is Debate["scores"][ScoreId] => !!score)
		.map((score) => score.claimId);

	for (const scoreLayout of Object.values(layout.scoreLayouts)) {
		const score = debate.scores[scoreLayout.scoreId];
		const claim = score ? debate.claims[score.claimId] : undefined;
		if (!score || !claim) {
			continue;
		}

		claimByClaimId[claim.id] = {
			scoreId: score.id,
			claimId: claim.id,
			content: claim.content,
			side: claim.side,
			confidence: score.claimConfidence,
			relevance: score.relevance,
			x: scoreLayout.x,
			y: scoreLayout.y,
			width: scoreLayout.width,
			height: scoreLayout.height,
			opacity: 1,
			insertScale: 1,
		};
	}

	const connectorRenderOrder = Object.values(layout.connectorRoutes)
		.slice()
		.sort((left, right) => left.strokeWidth - right.strokeWidth)
		.map((route) => route.connectorId);
	const sourceScoreByConnectorId = buildSourceScoreByConnectorId(debate);
	const referenceStrokeWidthByConnectorId = buildReferenceStrokeWidthByConnectorId(layout, sourceScoreByConnectorId);
	const targetAnchorYByConnectorId = buildTargetAnchorYByConnectorId(
		debate,
		layout,
		sourceScoreByConnectorId,
		referenceStrokeWidthByConnectorId,
	);

	for (const route of Object.values(layout.connectorRoutes)) {
		const connector = debate.connectors[route.connectorId];
		const sourceClaim = connector ? debate.claims[connector.source] : undefined;
		const targetClaim = connector ? debate.claims[connector.target] : undefined;
		const sourceScore = sourceScoreByConnectorId[route.connectorId];
		const sourceScoreLayout = sourceScore ? layout.scoreLayouts[sourceScore.id] : undefined;
		const sourceClaimVisual = connector ? claimByClaimId[connector.source] : undefined;
		const targetClaimVisual = connector ? claimByClaimId[connector.target] : undefined;
		if (!connector || !sourceClaim || !targetClaim || !sourceClaimVisual || !targetClaimVisual) {
			continue;
		}

		const sourcePoint = route.path[0];
		const targetPoint = route.path[route.path.length - 1];
		const targetAnchorY = targetAnchorYByConnectorId[route.connectorId] ?? targetPoint?.y ?? sourcePoint?.y ?? 0;
		const connectorPathBinding = buildConnectorPathBinding({
			sourceClaimId: sourceClaim.id,
			targetClaimId: targetClaim.id,
			sourceClaim: sourceClaimVisual,
			targetClaim: targetClaimVisual,
			sourceX: sourcePoint?.x ?? 0,
			sourceY: sourcePoint?.y ?? 0,
			targetX: targetPoint?.x ?? 0,
			targetY: targetAnchorY,
		});

		connectorByConnectorId[route.connectorId] = {
			connectorId: route.connectorId,
			sourceSide: sourceClaim.side,
			referenceAffects: connector.affects,
			actualAffects: connector.affects,
			referencePathBinding: connectorPathBinding,
			referenceLineProgress: 1,
			referenceLineTravelOffset: 0,
			referenceOpacity: 0.3,
			actualPathBinding: connectorPathBinding,
			strokeWidth: route.strokeWidth,
			referenceStrokeWidth: referenceStrokeWidthByConnectorId[route.connectorId] ?? Math.max(2, sourceScoreLayout?.height ?? route.strokeWidth),
			actualLineProgress: 1,
			actualLineTravelOffset: 0,
			actualOpacity: 1,
			secondaryLineProgress: 0,
			secondaryLineTravelOffset: 0,
			secondaryOpacity: 0,
		};
	}

	return {
		width: layout.bounds.width,
		height: layout.bounds.height,
		claimRenderOrder,
		connectorRenderOrder,
		claimByClaimId,
		connectorByConnectorId,
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

	const terminalSnapshot = prepared.segments.length === 0 ? prepared.finalSnapshot : currentSnapshot;
	return {
		renderState: terminalSnapshot.renderState,
		debate: terminalSnapshot.pipeline.debate,
		progress: 1,
		directives: [],
	};
}

function resolveTransitionSegment(
	segment: GraphTransitionSegment,
	localFrame: number,
): ActiveGraphFrame {
	if (localFrame <= 0) {
		return {
			renderState: segment.fromSnapshot.renderState,
			debate: segment.fromSnapshot.pipeline.debate,
			fromDebate: segment.fromSnapshot.pipeline.debate,
			toDebate: segment.toSnapshot.pipeline.debate,
			progress: 0,
			directives: segment.directives,
		};
	}

	const localProgress = localFrame / Math.max(1, segment.durationInFrames);
	if (localProgress < 1) {
		return {
			renderState: resolveDirectiveTransition(segment.fromSnapshot, segment.toSnapshot, localProgress, segment.directives),
			debate: segment.toSnapshot.pipeline.debate,
			fromDebate: segment.fromSnapshot.pipeline.debate,
			toDebate: segment.toSnapshot.pipeline.debate,
			progress: localProgress,
			directives: segment.directives,
		};
	}

	return {
		renderState: segment.toSnapshot.renderState,
		debate: segment.toSnapshot.pipeline.debate,
		progress: 1,
		directives: [],
	};
}

function resolveDirectiveTransition(
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	progress: number,
	directives: readonly GraphTransitionDirective[],
): GraphRenderState {
	const clamped = Math.max(0, Math.min(1, progress));
	if (directives.length === 0) {
		return toSnapshot.renderState;
	}

	const state = buildDirectiveBaseState(fromSnapshot.renderState, toSnapshot.renderState, clamped, directives);

	for (const directive of directives) {
		const stepProgress = clamped;
		if (stepProgress <= 0) {
			continue;
		}

		if (directive.kind === "claim") {
			applyClaimDirective(state, fromSnapshot, toSnapshot, directive, stepProgress);
			continue;
		}

		applyConnectorDirective(state, fromSnapshot, toSnapshot, directive, stepProgress);
	}

	return state;
}

function buildDirectiveBaseState(
	fromState: GraphRenderState,
	toState: GraphRenderState,
	progress: number,
	directives: readonly GraphTransitionDirective[],
): GraphRenderState {
	const freezeClaimGeometry = shouldFreezeClaimGeometryForDirectives(directives);
	const freezeGraphBounds = freezeClaimGeometry;
	const freezeConnectorPathBindings = freezeClaimGeometry;
	const claimRenderOrder = buildUnionOrder(toState.claimRenderOrder, fromState.claimRenderOrder);
	const connectorRenderOrder = buildUnionOrder(toState.connectorRenderOrder, fromState.connectorRenderOrder);
	const claimByClaimId = {} as GraphRenderState["claimByClaimId"];
	const connectorByConnectorId = {} as GraphRenderState["connectorByConnectorId"];

	for (const claimId of claimRenderOrder) {
		const fromClaim = fromState.claimByClaimId[claimId];
		const toClaim = toState.claimByClaimId[claimId];
		if (fromClaim && toClaim) {
			claimByClaimId[claimId] = {
				...fromClaim,
				x: freezeClaimGeometry ? fromClaim.x : lerp(fromClaim.x, toClaim.x, progress),
				y: freezeClaimGeometry ? fromClaim.y : lerp(fromClaim.y, toClaim.y, progress),
				width: freezeClaimGeometry ? fromClaim.width : lerp(fromClaim.width, toClaim.width, progress),
				height: freezeClaimGeometry ? fromClaim.height : lerp(fromClaim.height, toClaim.height, progress),
			};
			continue;
		}

		if (fromClaim) {
			claimByClaimId[claimId] = fromClaim;
			continue;
		}

		if (toClaim) {
			claimByClaimId[claimId] = {
				...toClaim,
				opacity: 0,
				insertScale: 0,
				confidence: 0,
			};
			continue;
		}
	}

	for (const connectorId of connectorRenderOrder) {
		const fromConnector = fromState.connectorByConnectorId[connectorId];
		const toConnector = toState.connectorByConnectorId[connectorId];
		const baseConnector = fromConnector ?? toConnector;
		if (!baseConnector) {
			continue;
		}

		if (fromConnector && toConnector) {
			const interpolatedPathBinding = freezeConnectorPathBindings
				? fromConnector.actualPathBinding
				: interpolateConnectorPathBinding(fromConnector.actualPathBinding, toConnector.actualPathBinding, progress);
			connectorByConnectorId[connectorId] = {
				...fromConnector,
				referencePathBinding: interpolatedPathBinding,
				actualPathBinding: interpolatedPathBinding,
				strokeWidth: lerp(fromConnector.strokeWidth, toConnector.strokeWidth, progress),
				referenceStrokeWidth: lerp(fromConnector.referenceStrokeWidth, toConnector.referenceStrokeWidth, progress),
			};
			continue;
		}

		if (fromConnector) {
			connectorByConnectorId[connectorId] = {
				...fromConnector,
			};
			continue;
		}

		if (toConnector) {
			connectorByConnectorId[connectorId] = {
				...toConnector,
				referenceLineProgress: 0,
				referenceLineTravelOffset: 0,
				referenceOpacity: 0.3,
				actualLineProgress: 0,
				actualLineTravelOffset: 0,
				actualOpacity: 1,
				secondaryLineProgress: 0,
				secondaryLineTravelOffset: 0,
				secondaryOpacity: 0,
			};
			continue;
		}

		connectorByConnectorId[connectorId] = {
			...baseConnector,
			referenceLineProgress: baseConnector.referenceLineProgress,
			referenceLineTravelOffset: baseConnector.referenceLineTravelOffset,
			referenceOpacity: baseConnector.referenceOpacity,
			actualLineProgress: 1,
			actualLineTravelOffset: 0,
			actualOpacity: 1,
			secondaryLineProgress: 0,
			secondaryLineTravelOffset: 0,
			secondaryOpacity: 0,
		};
	}

	return {
		width: freezeGraphBounds ? fromState.width : lerp(fromState.width, toState.width, progress),
		height: freezeGraphBounds ? fromState.height : lerp(fromState.height, toState.height, progress),
		claimRenderOrder,
		connectorRenderOrder,
		claimByClaimId,
		connectorByConnectorId,
	};
}

function shouldFreezeClaimGeometryForDirectives(
	directives: readonly GraphTransitionDirective[],
): boolean {
	return directives.length > 0 && directives.every(
		(directive) => directive.kind === "connector" && directive.effect === "update",
	);
}

function applyClaimDirective(
	state: GraphRenderState,
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	directive: Extract<GraphTransitionDirective, { kind: "claim" }>,
	progress: number,
): void {
	const fromScore = fromSnapshot.pipeline.debate.scores[directive.scoreId];
	const toScore = toSnapshot.pipeline.debate.scores[directive.scoreId];
	const claimId = toScore?.claimId ?? fromScore?.claimId;
	if (!claimId) {
		return;
	}

	const workingClaim = state.claimByClaimId[claimId];
	const fromClaim = fromSnapshot.renderState.claimByClaimId[claimId];
	const toClaim = toSnapshot.renderState.claimByClaimId[claimId];
	if (!workingClaim) {
		return;
	}

	if (progress >= 1) {
		if (directive.effect === "exit" && !toClaim && fromClaim) {
			state.claimByClaimId[claimId] = {
				...fromClaim,
				opacity: 0,
				insertScale: 0,
				confidence: 0,
			};
			return;
		}

		if (toClaim) {
			state.claimByClaimId[claimId] = {
				...toClaim,
				opacity: 1,
				insertScale: 1,
			};
		}
		return;
	}

	if (directive.effect === "enter" && toClaim) {
		state.claimByClaimId[claimId] = {
			...workingClaim,
			...toClaim,
			opacity: 1,
			insertScale: progress,
			confidence: toClaim.confidence * progress,
		};
		return;
	}

	if (directive.effect === "exit" && fromClaim) {
		state.claimByClaimId[claimId] = {
			...workingClaim,
			...fromClaim,
			opacity: 1 - progress,
			insertScale: 1 - progress,
			confidence: fromClaim.confidence * (1 - progress),
		};
		return;
	}

	if (directive.effect === "display" && fromClaim && toClaim) {
		state.claimByClaimId[claimId] = {
			...workingClaim,
			content: toClaim.content,
			side: toClaim.side,
			confidence: lerp(fromClaim.confidence, toClaim.confidence, progress),
			relevance: lerp(fromClaim.relevance, toClaim.relevance, progress),
			opacity: 1,
			insertScale: 1,
		};
		return;
	}

	if (directive.effect === "scale" && fromClaim && toClaim) {
		state.claimByClaimId[claimId] = {
			...workingClaim,
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
	const connectorId = directive.connectorId;
	const workingConnector = state.connectorByConnectorId[connectorId];
	const fromConnector = fromSnapshot.renderState.connectorByConnectorId[connectorId];
	const toConnector = toSnapshot.renderState.connectorByConnectorId[connectorId];
	if (!workingConnector) {
		return;
	}

	if (progress >= 1) {
		if (directive.effect === "shrink" && !toConnector && fromConnector) {
			state.connectorByConnectorId[connectorId] = {
				...fromConnector,
				referenceLineProgress: 1,
				referenceLineTravelOffset: 0,
				referenceOpacity: 0.3,
				actualLineProgress: 0,
				actualLineTravelOffset: 0,
				actualOpacity: 0,
				secondaryLineProgress: 0,
				secondaryLineTravelOffset: 0,
				secondaryOpacity: 0,
			};
			return;
		}

		if (toConnector) {
			state.connectorByConnectorId[connectorId] = {
				...toConnector,
				referenceLineProgress: 1,
				referenceLineTravelOffset: 0,
				referenceOpacity: 0.3,
				actualLineProgress: 1,
				actualLineTravelOffset: 0,
				actualOpacity: 1,
				secondaryLineProgress: 0,
				secondaryLineTravelOffset: 0,
				secondaryOpacity: 0,
			};
		}
		return;
	}

	if (directive.effect === "grow" && toConnector) {
		const dashoffset = resolveRevealDashoffset(directive.direction, progress);
		state.connectorByConnectorId[connectorId] = {
			...workingConnector,
			...toConnector,
			referenceLineProgress: progress,
			referenceLineTravelOffset: dashoffset,
			referenceOpacity: 0.3,
			actualLineProgress: progress,
			actualLineTravelOffset: dashoffset,
			actualOpacity: 1,
			secondaryLineProgress: 0,
			secondaryLineTravelOffset: 0,
			secondaryOpacity: 0,
		};
		return;
	}

	if (directive.effect === "update" && fromConnector && toConnector) {
		const outgoingDirection = invertAnimationDirection(directive.direction);
		state.connectorByConnectorId[connectorId] = {
			...workingConnector,
			sourceSide: toConnector.sourceSide,
			referenceAffects: fromConnector.referenceAffects,
			actualAffects: fromConnector.actualAffects,
			referencePathBinding: fromConnector.actualPathBinding,
			referenceLineProgress: 1,
			referenceLineTravelOffset: 0,
			referenceOpacity: 0.3,
			actualPathBinding: fromConnector.actualPathBinding,
			referenceStrokeWidth: fromConnector.referenceStrokeWidth,
			strokeWidth: fromConnector.strokeWidth,
			actualLineProgress: 1 - progress,
			actualLineTravelOffset: resolveRevealDashoffset(outgoingDirection, 1 - progress),
			actualOpacity: 1,
			secondaryAffects: toConnector.actualAffects,
			secondaryPathBinding: fromConnector.actualPathBinding,
			secondaryStrokeWidth: toConnector.strokeWidth,
			secondaryLineProgress: progress,
			secondaryLineTravelOffset: resolveRevealDashoffset(directive.direction, progress),
			secondaryOpacity: 1,
		};
		return;
	}

	if (directive.effect === "shrink" && fromConnector) {
		const dashoffset = resolveRevealDashoffset(directive.direction, 1 - progress);
		state.connectorByConnectorId[connectorId] = {
			...workingConnector,
			...fromConnector,
			referenceLineProgress: 1,
			referenceLineTravelOffset: 0,
			referenceOpacity: 0.3,
			actualLineProgress: 1 - progress,
			actualLineTravelOffset: dashoffset,
			actualOpacity: 1,
			secondaryLineProgress: 0,
			secondaryLineTravelOffset: 0,
			secondaryOpacity: 0,
		};
	}
}


function interpolateConnectorPathBinding(
	fromPathBinding: ConnectorPathBinding,
	toPathBinding: ConnectorPathBinding,
	progress: number,
): ConnectorPathBinding {
	if (
		fromPathBinding.sourceClaimId !== toPathBinding.sourceClaimId
		|| fromPathBinding.targetClaimId !== toPathBinding.targetClaimId
	) {
		return progress < 0.5 ? fromPathBinding : toPathBinding;
	}

	return {
		sourceClaimId: fromPathBinding.sourceClaimId,
		targetClaimId: fromPathBinding.targetClaimId,
		sourceOffsetX: lerp(fromPathBinding.sourceOffsetX, toPathBinding.sourceOffsetX, progress),
		sourceOffsetY: lerp(fromPathBinding.sourceOffsetY, toPathBinding.sourceOffsetY, progress),
		targetOffsetX: lerp(fromPathBinding.targetOffsetX, toPathBinding.targetOffsetX, progress),
		targetOffsetY: lerp(fromPathBinding.targetOffsetY, toPathBinding.targetOffsetY, progress),
	};
}

function resolveCameraState(
	frame: number,
	graph: GraphRenderState,
	cameraMoves: ResolvedCameraMove[],
	frameWidth: number,
	frameHeight: number,
): CameraState {
	const baseState = getCameraStateForTarget(
		{
			x: graph.width / 2,
			y: graph.height / 2,
			width: graph.width,
			height: graph.height,
		},
		frameWidth,
		frameHeight,
		DEFAULT_VIEWPORT_PADDING,
	);
	let currentState = baseState;

	for (const move of cameraMoves) {
		const nextTargetData = move.reset
			? { x: graph.width / 2, y: graph.height / 2, width: graph.width, height: graph.height }
			: resolveTargetData(graph, move.target) ?? { x: graph.width / 2, y: graph.height / 2 };
		const nextState = getCameraStateForTarget(nextTargetData, frameWidth, frameHeight, move.reset ? DEFAULT_VIEWPORT_PADDING : move.padding, move.scale);

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

function getClaimBoundsForTarget(
	graph: GraphRenderState,
	claimIds: string | readonly string[],
): { x: number; y: number; width: number; height: number } | undefined {
	const resolvedClaims = (typeof claimIds === "string" ? [claimIds] : [...claimIds])
		.map((claimId) => (graph.claimByClaimId as Record<string, ClaimVisual | undefined>)[claimId]);

	if (resolvedClaims.some((claim) => !claim)) {
		return undefined;
	}

	const claims = resolvedClaims as ClaimVisual[];
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const claim of claims) {
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
			name: child.props.name ?? (child.props.reset ? "CameraMove Reset" : child.props.claimId ? `CameraMove ${getCameraMoveLabel(child.props.claimId)}` : `CameraMove ${index + 1}`),
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

function applyGraphActions(debate: Debate, actions: readonly GraphActionEntry[]): AppliedGraphActionState {
	const claimUpserts = actions
		.map((entry) => entry.action)
		.filter((action): action is Extract<GraphAction, { kind: "claim.upsert" }> => action.kind === "claim.upsert");
	const connectorUpserts = actions
		.map((entry) => entry.action)
		.filter((action): action is Extract<GraphAction, { kind: "connector.upsert" }> => action.kind === "connector.upsert");

	if (claimUpserts.length === 1 && connectorUpserts.length === 1) {
		const claim = claimUpserts[0].claim;
		const connector = connectorUpserts[0].connector;
		if (connector.source !== claim.id) {
			throw new Error("GraphEvents add-leaf action pair must share the same source claim id.");
		}

		const targetScoreId = findTargetScoreId(debate, connector.target);
		const result = processDebateIntent({
			debate,
			intent: {
				id: `graph-event:${connector.id}` as never,
				kind: "AddClaim",
				claim,
				connector,
				targetScoreId,
			},
		});

		return {
			debate: result.finalDebate,
			intent: result.intent,
		};
	}

	if (claimUpserts.length === 0 && connectorUpserts.length === 1) {
		const connector = connectorUpserts[0].connector;
		const targetScoreId = findTargetScoreId(debate, connector.target);
		const result = processDebateIntent({
			debate,
			intent: {
				id: `graph-event:${connector.id}` as never,
				kind: "AddConnection",
				connector,
				targetScoreId,
			},
		});

		return {
			debate: result.finalDebate,
			intent: result.intent,
		};
	}

	throw new Error("GraphEvents currently supports add-leaf and add-connection action sets only.");
}

function findTargetScoreId(debate: Debate, targetClaimId: ClaimId): ScoreId {
	const score = Object.values(debate.scores).find((candidate) => candidate.claimId === targetClaimId);
	if (!score) {
		throw new Error(`Target score for claim ${targetClaimId} was not found.`);
	}

	return score.id;
}

function buildUnionOrder<T extends string>(preferred: readonly T[], fallback: readonly T[]): T[] {
	return Array.from(new Set([...preferred, ...fallback]));
}

function getConnectorPathStyle(strokeWidth: number): React.CSSProperties {
	return {
		strokeWidth,
		strokeLinecap: "butt",
		strokeLinejoin: "miter",
	};
}

function renderConnectorPath(
	key: string,
	connectorId: ConnectorId,
	affects: Connector["affects"],
	side: ClaimSide,
	pathD: string,
	strokeWidth: number,
	lineProgress: number,
	lineTravelOffset: number,
	useReferenceWidth: boolean,
): ReactNode {
	if (lineProgress <= 0 || pathD.length === 0) {
		return null;
	}

	const classes = ["rt-connector"];
	if (useReferenceWidth) {
		classes.push("rt-connector-potential-confidence");
	}

	return (
		<path
			key={key}
			className={classes.join(" ")}
			data-affects={affects}
			data-connector-side={side}
			data-connector-id={connectorId}
			d={pathD}
			strokeDasharray={resolveConnectorDasharray(lineProgress, affects)}
			strokeDashoffset={resolveConnectorDashoffset(lineProgress, lineTravelOffset)}
			pathLength={1}
			style={getConnectorPathStyle(strokeWidth)}
		/>
	);
}

function renderConnectorPaths(
	connector: ConnectorVisual,
	claimByClaimId: GraphRenderState["claimByClaimId"],
): ReactNode[] {
	const referencePathD = resolveConnectorPathD(connector.referencePathBinding, claimByClaimId);
	const actualPathD = resolveConnectorPathD(connector.actualPathBinding, claimByClaimId);
	const sharedPathD = actualPathD.length > 0 ? actualPathD : referencePathD;
	const layers: ReactNode[] = [];

	if (connector.referenceOpacity > 0) {
		layers.push(renderConnectorPath(
			`reference-${connector.connectorId}`,
			connector.connectorId,
			connector.referenceAffects,
			connector.sourceSide,
			sharedPathD,
			connector.referenceStrokeWidth,
			connector.referenceLineProgress,
			connector.referenceLineTravelOffset,
			true,
		));
	}

	if (connector.actualOpacity > 0) {
		layers.push(renderConnectorPath(
			`actual-${connector.connectorId}`,
			connector.connectorId,
			connector.actualAffects,
			connector.sourceSide,
			sharedPathD,
			connector.strokeWidth,
			resolveConnectorDisplayProgress(connector.actualLineProgress),
			resolveConnectorDisplayTravelOffset(connector.actualLineProgress, connector.actualLineTravelOffset),
			false,
		));
	}

	if (connector.secondaryOpacity > 0 && connector.secondaryPathBinding) {
		const secondaryPathD = resolveConnectorPathD(connector.secondaryPathBinding, claimByClaimId) || sharedPathD;
		layers.push(renderConnectorPath(
			`secondary-${connector.connectorId}`,
			connector.connectorId,
			connector.secondaryAffects ?? connector.actualAffects,
			connector.sourceSide,
			secondaryPathD,
			connector.secondaryStrokeWidth ?? connector.strokeWidth,
			resolveConnectorDisplayProgress(connector.secondaryLineProgress),
			resolveConnectorDisplayTravelOffset(connector.secondaryLineProgress, connector.secondaryLineTravelOffset),
			false,
		));
	}

	return layers.filter(Boolean);
}

function renderClaim(claim: ClaimVisual): ReactNode {
	const shellStyle = {
		left: claim.x,
		top: claim.y,
		width: claim.width,
		height: claim.height,
		opacity: claim.opacity,
	} satisfies React.CSSProperties;

	const claimShapeStyle = {
		width: DEFAULT_CLAIM_WIDTH,
		height: DEFAULT_CLAIM_HEIGHT,
		"--rt-claim-shape-scale": String(resolveClaimShapeScale(claim)),
		"--rt-claim-insert-scale": String(claim.insertScale),
	} as React.CSSProperties;

	return (
		<article
			key={claim.claimId}
			className="rt-claim-shape-shell"
			style={shellStyle}
			data-claim-id={claim.claimId}
			data-score-id={claim.scoreId}
			data-claim-side={claim.side}
		>
			<div className="rt-claim-shape" style={claimShapeStyle}>
				<article className="rt-claim-shape-body">
					<div className="rt-score-card__content">{claim.content}</div>
					<small data-score={claim.confidence} data-score-id={claim.scoreId}>
						{Math.round(claim.confidence * 100)}%
					</small>
				</article>
			</div>
		</article>
	);
}

function resolveClaimShapeScale(claim: ClaimVisual): number {
	return Math.min(
		claim.width / DEFAULT_CLAIM_WIDTH,
		claim.height / DEFAULT_CLAIM_HEIGHT,
	);
}

function diffIds<T extends string>(fromIds: readonly T[], toIds: readonly T[]): { inserted: T[]; removed: T[] } {
	const fromSet = new Set(fromIds);
	const toSet = new Set(toIds);

	return {
		inserted: toIds.filter((id) => !fromSet.has(id)),
		removed: fromIds.filter((id) => !toSet.has(id)),
	};
}

function buildConnectorPhaseByConnectorId(
	orderedConnectorSteps: ReadonlyArray<Extract<GraphTransitionDirective, { kind: "connector" }>>,
): Partial<Record<ConnectorId, { phase: Extract<GraphTransitionDirective, { kind: "connector" }>['effect']; direction: Extract<GraphTransitionDirective, { kind: "connector" }>['direction']; index: number }>> {
	const connectorPhaseByConnectorId: Partial<Record<ConnectorId, { phase: Extract<GraphTransitionDirective, { kind: "connector" }>['effect']; direction: Extract<GraphTransitionDirective, { kind: "connector" }>['direction']; index: number }>> = {};

	for (const [index, step] of orderedConnectorSteps.entries()) {
		connectorPhaseByConnectorId[step.connectorId] = {
			phase: step.effect,
			direction: step.direction,
			index,
		};
	}

	return connectorPhaseByConnectorId;
}

function resolveRevealDashoffset(
	direction: GraphTransitionDirection | undefined,
	lineProgress: number,
): number {
	if (direction === "targetToSource") {
		return -(1 - lineProgress);
	}

	return 0;
}


function invertAnimationDirection(
	direction: GraphTransitionDirection | undefined,
): GraphTransitionDirection | undefined {
	if (direction === "sourceToTarget") {
		return "targetToSource";
	}

	if (direction === "targetToSource") {
		return "sourceToTarget";
	}

	return direction;
}

function buildTransitionDirectives(
	debate: Debate,
	changes: readonly Change[],
): GraphTransitionDirective[] {
	if (changes.length < 1) {
		return [];
	}

	const directives: GraphTransitionDirective[] = [];
	const connectorAddedById = new Set(
		changes
			.filter((change): change is Extract<Change, { kind: "ConnectorAdded" }> => change.kind === "ConnectorAdded")
			.map((change) => change.connector.id),
	);
	const connectorRemovedById = new Set(
		changes
			.filter((change): change is Extract<Change, { kind: "ConnectorRemoved" }> => change.kind === "ConnectorRemoved")
			.map((change) => change.connector.id),
	);

	for (const change of changes) {
		if (change.kind === "ScoreAdded") {
			directives.push({
				kind: "claim",
				scoreId: change.score.id,
				effect: "enter",
			});

			const connectorId = change.score.connectorId;
			if (connectorId && connectorAddedById.has(connectorId)) {
				directives.push({
					kind: "connector",
					connectorId,
					effect: "grow",
					direction: "sourceToTarget",
				});
			}
			continue;
		}

		if (change.kind === "ScoreRemoved") {
			const connectorId = change.score.connectorId;
			if (connectorId && connectorRemovedById.has(connectorId)) {
				directives.push({
					kind: "connector",
					connectorId,
					effect: "shrink",
					direction: "targetToSource",
				});
			}

			directives.push({
				kind: "claim",
				scoreId: change.score.id,
				effect: "exit",
			});
			continue;
		}

		directives.push(...buildTransitionDirectivesFromChange(debate, change));
	}

	return directives;
}

function buildTransitionDirectivesFromChange(
	debate: Debate,
	change: Change,
): GraphTransitionDirective[] {
	switch (change.kind) {
		case "ScoreClaimConfidenceChanged":
			return [{
				kind: "claim",
				scoreId: change.scoreId,
				effect: "display",
				direction: change.direction,
			}];
		case "ScoreConnectorConfidenceChanged": {
			const score = debate.scores[change.scoreId];
			if (!score?.connectorId) {
				return [];
			}

			return [{
				kind: "connector",
				connectorId: score.connectorId,
				effect: "update",
				direction: change.direction,
			}];
		}
		case "ScoreRelevanceChanged": {
			const score = debate.scores[change.scoreId];
			const directives: GraphTransitionDirective[] = [{
				kind: "claim",
				scoreId: change.scoreId,
				effect: "display",
				direction: change.direction,
			}];

			if (score?.connectorId) {
				directives.push({
					kind: "connector",
					connectorId: score.connectorId,
					effect: "update",
					direction: change.direction,
				});
			}

			return directives;
		}
		case "ScoreScaleOfSourcesChanged":
			return buildScaleOfSourcesDirectives(debate, change.scoreId, change.direction);
		case "ScoreScaleOfSourcesBatchChanged":
			return change.changes.flatMap((entry) =>
				buildScaleOfSourcesDirectives(debate, entry.scoreId, entry.direction),
			);
		default:
			return [];
	}
}

function buildScaleOfSourcesDirectives(
	debate: Debate,
	scoreId: ScoreId,
	direction: GraphTransitionDirection | undefined,
): GraphTransitionDirective[] {
	const score = debate.scores[scoreId];
	if (!score) {
		throw new Error(`Score ${scoreId} was not found in the debate.`);
	}

	const directives: GraphTransitionDirective[] = [];
	if (score.claimId !== debate.mainClaimId) {
		directives.push({
			kind: "claim",
			scoreId,
			effect: "scale",
			direction,
		});
	}

	return directives;
}

function scheduleTransitionDirectives(
	directives: readonly GraphTransitionDirective[],
	totalFrames: number,
): Array<{ directives: readonly GraphTransitionDirective[]; durationInFrames: number }> {
	if (directives.length === 0) {
		return [];
	}

	const rawFramesPerDirective = totalFrames / Math.max(1, directives.length);
	const scheduledDirectives = directives.map((directive, index) => {
		const durationInFrames = Math.max(1, Math.floor(rawFramesPerDirective));
		return {
			index,
			directives: [directive] as const,
			durationInFrames,
			remainder: rawFramesPerDirective - durationInFrames,
		};
	});

	let remainingFrames = Math.max(0, totalFrames - scheduledDirectives.reduce((sum, entry) => sum + entry.durationInFrames, 0));
	return [...scheduledDirectives]
		.sort((left, right) => right.remainder - left.remainder)
		.map((entry) => {
			if (remainingFrames > 0) {
				remainingFrames -= 1;
				return {
					...entry,
					durationInFrames: entry.durationInFrames + 1,
				};
			}

			return entry;
		})
		.sort((left, right) => left.index - right.index)
		.map(({ index: _ignoredIndex, remainder: _ignoredRemainder, ...entry }) => entry);
}

function formatTransitionDirectiveName(
	directive: GraphTransitionDirective | undefined,
	debate: Debate,
): string {
	if (!directive) {
		return "No directive";
	}

	if (directive.kind === "claim") {
		const score = debate.scores[directive.scoreId];
		const claim = score ? debate.claims[score.claimId] : undefined;
		return `claim ${directive.effect} ${claim?.content ?? directive.scoreId}`;
	}

	const connector = debate.connectors[directive.connectorId];
	const sourceClaim = connector ? debate.claims[connector.source] : undefined;
	const targetClaim = connector ? debate.claims[connector.target] : undefined;
	return `connector ${directive.effect} ${sourceClaim?.content ?? connector?.source ?? directive.connectorId} -> ${targetClaim?.content ?? connector?.target ?? directive.connectorId}`;
}
function buildSourceScoreByConnectorId(debate: Debate): Partial<Record<ConnectorId, Debate["scores"][ScoreId]>> {
	const sourceScoreByConnectorId: Partial<Record<ConnectorId, Debate["scores"][ScoreId]>> = {};

	for (const score of Object.values(debate.scores)) {
		if (!score.connectorId) {
			continue;
		}

		sourceScoreByConnectorId[score.connectorId] = score;
	}

	return sourceScoreByConnectorId;
}

function buildReferenceStrokeWidthByConnectorId(
	layout: DebateLayout,
	sourceScoreByConnectorId: Partial<Record<ConnectorId, Debate["scores"][ScoreId]>>,
): Partial<Record<ConnectorId, number>> {
	const referenceStrokeWidthByConnectorId: Partial<Record<ConnectorId, number>> = {};

	for (const connectorId of Object.keys(layout.connectorRoutes) as ConnectorId[]) {
		const sourceScore = sourceScoreByConnectorId[connectorId];
		const sourceScoreLayout = sourceScore ? layout.scoreLayouts[sourceScore.id] : undefined;
		referenceStrokeWidthByConnectorId[connectorId] = Math.max(2, sourceScoreLayout?.height ?? layout.connectorRoutes[connectorId]?.strokeWidth ?? 2);
	}

	return referenceStrokeWidthByConnectorId;
}

function buildTargetAnchorYByConnectorId(
	debate: Debate,
	layout: DebateLayout,
	sourceScoreByConnectorId: Partial<Record<ConnectorId, Debate["scores"][ScoreId]>>,
	referenceStrokeWidthByConnectorId: Partial<Record<ConnectorId, number>>,
): Partial<Record<ConnectorId, number>> {
	const targetAnchorYByConnectorId: Partial<Record<ConnectorId, number>> = {};

	for (const targetScoreLayout of Object.values(layout.scoreLayouts)) {
		const targetScore = debate.scores[targetScoreLayout.scoreId];
		if (!targetScore || targetScore.incomingScoreIds.length === 0) {
			continue;
		}

		const orderedConnectorIds = targetScore.incomingScoreIds
			.map((incomingScoreId) => debate.scores[incomingScoreId])
			.filter((incomingScore): incomingScore is Debate["scores"][ScoreId] => !!incomingScore?.connectorId)
			.map((incomingScore) => incomingScore.connectorId)
			.filter((connectorId): connectorId is ConnectorId => !!connectorId && !!layout.connectorRoutes[connectorId]);

		if (orderedConnectorIds.length === 0) {
			continue;
		}

		const stableOrderedConnectorIds = [...orderedConnectorIds].sort((leftConnectorId, rightConnectorId) => {
			const leftScore = sourceScoreByConnectorId[leftConnectorId];
			const rightScore = sourceScoreByConnectorId[rightConnectorId];
			const leftLayout = leftScore ? layout.scoreLayouts[leftScore.id] : undefined;
			const rightLayout = rightScore ? layout.scoreLayouts[rightScore.id] : undefined;
			const leftCenterY = leftLayout ? leftLayout.y + leftLayout.height / 2 : 0;
			const rightCenterY = rightLayout ? rightLayout.y + rightLayout.height / 2 : 0;

			if (leftCenterY !== rightCenterY) {
				return leftCenterY - rightCenterY;
			}

			const leftTopY = leftLayout?.y ?? 0;
			const rightTopY = rightLayout?.y ?? 0;
			if (leftTopY !== rightTopY) {
				return leftTopY - rightTopY;
			}

			return leftConnectorId.localeCompare(rightConnectorId);
		});

		Object.assign(
			targetAnchorYByConnectorId,
			computeStackedAnchorYByConnectorId(
				stableOrderedConnectorIds,
				layout,
				referenceStrokeWidthByConnectorId,
				targetScoreLayout,
			),
		);
	}

	return targetAnchorYByConnectorId;
}

function computeStackedAnchorYByConnectorId(
	orderedConnectorIds: ConnectorId[],
	layout: DebateLayout,
	referenceStrokeWidthByConnectorId: Partial<Record<ConnectorId, number>>,
	targetScoreLayout: DebateLayout["scoreLayouts"][ScoreId],
): Partial<Record<ConnectorId, number>> {
	const connectorCount = orderedConnectorIds.length;
	if (connectorCount === 0) {
		return {};
	}

	const totalStrokeWidth = orderedConnectorIds.reduce((sum, connectorId) => {
		return sum + (layout.connectorRoutes[connectorId]?.strokeWidth ?? 0);
	}, 0);

	const firstConnectorId = orderedConnectorIds[0];
	const lastConnectorId = orderedConnectorIds[connectorCount - 1];
	const firstStrokeWidth = layout.connectorRoutes[firstConnectorId]?.strokeWidth ?? 0;
	const lastStrokeWidth = layout.connectorRoutes[lastConnectorId]?.strokeWidth ?? 0;
	const firstReferenceStrokeWidth = referenceStrokeWidthByConnectorId[firstConnectorId] ?? firstStrokeWidth;
	const lastReferenceStrokeWidth = referenceStrokeWidthByConnectorId[lastConnectorId] ?? lastStrokeWidth;
	const topBoundaryPadding = Math.max(0, (firstReferenceStrokeWidth - firstStrokeWidth) / 2);
	const bottomBoundaryPadding = Math.max(0, (lastReferenceStrokeWidth - lastStrokeWidth) / 2);
	const totalGapHeight = Math.max(
		0,
		targetScoreLayout.height - topBoundaryPadding - bottomBoundaryPadding - totalStrokeWidth,
	);
	const gap = connectorCount > 1 ? totalGapHeight / (connectorCount - 1) : 0;
	const totalStackHeight = topBoundaryPadding
		+ totalStrokeWidth
		+ bottomBoundaryPadding
		+ gap * Math.max(0, connectorCount - 1);
	const centerY = targetScoreLayout.y + targetScoreLayout.height / 2;
	const targetAnchorYByConnectorId: Partial<Record<ConnectorId, number>> = {};
	let cursorY = centerY - totalStackHeight / 2 + topBoundaryPadding;

	for (const connectorId of orderedConnectorIds) {
		const strokeWidth = layout.connectorRoutes[connectorId]?.strokeWidth ?? 0;
		targetAnchorYByConnectorId[connectorId] = cursorY + strokeWidth / 2;
		cursorY += strokeWidth + gap;
	}

	return targetAnchorYByConnectorId;
}

function buildConnectorPathBinding({
	sourceClaimId,
	targetClaimId,
	sourceClaim,
	targetClaim,
	sourceX,
	sourceY,
	targetX,
	targetY,
}: {
	sourceClaimId: ClaimId;
	targetClaimId: ClaimId;
	sourceClaim: ClaimVisual;
	targetClaim: ClaimVisual;
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
}): ConnectorPathBinding {
	return {
		sourceClaimId,
		targetClaimId,
		sourceOffsetX: sourceX - sourceClaim.x,
		sourceOffsetY: sourceY - sourceClaim.y,
		targetOffsetX: targetX - targetClaim.x,
		targetOffsetY: targetY - targetClaim.y,
	};
}

function resolveConnectorPathD(
	pathBinding: ConnectorPathBinding,
	claimByClaimId: GraphRenderState["claimByClaimId"],
): string {
	const sourceClaim = claimByClaimId[pathBinding.sourceClaimId];
	const targetClaim = claimByClaimId[pathBinding.targetClaimId];
	if (!sourceClaim || !targetClaim) {
		return "";
	}

	return buildConnectorPathDFromAnchors({
		sourceX: sourceClaim.x + pathBinding.sourceOffsetX,
		sourceY: sourceClaim.y + pathBinding.sourceOffsetY,
		targetX: targetClaim.x + pathBinding.targetOffsetX,
		targetY: targetClaim.y + pathBinding.targetOffsetY,
	});
}

function buildConnectorPathDFromAnchors({
	sourceX,
	sourceY,
	targetX,
	targetY,
}: {
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
}): string {
	const targetHorizontalGap = Math.max(0, sourceX - targetX);
	const sourceSideStraightSegment = targetHorizontalGap * SOURCE_SIDE_STRAIGHT_SEGMENT_PERCENT;
	const targetSideStraightSegment = targetHorizontalGap * TARGET_SIDE_STRAIGHT_SEGMENT_PERCENT;
	const sourceElbowX = targetX + targetHorizontalGap - sourceSideStraightSegment;

	return `M ${formatMetric(sourceX)} ${formatMetric(sourceY)} C ${formatMetric(sourceElbowX)} ${formatMetric(sourceY)}, ${formatMetric(targetX + targetSideStraightSegment)} ${formatMetric(targetY)}, ${formatMetric(targetX)} ${formatMetric(targetY)}`;
}

function lerp(from: number, to: number, progress: number): number {
	return from + (to - from) * progress;
}

function formatChangeLabel(change: Change): string {
	switch (change.kind) {
		case "ClaimAdded":
		case "ClaimRemoved":
			return `${change.kind} ${change.claim.id}`;
		case "ClaimContentChanged":
		case "ClaimSideChanged":
		case "ClaimForceConfidenceChanged":
			return `${change.kind} ${change.claimId}`;
		case "ConnectorAdded":
		case "ConnectorRemoved":
			return `${change.kind} ${change.connector.id}`;
		case "ConnectorSourceChanged":
		case "ConnectorTargetChanged":
		case "ConnectorAffectsChanged":
			return `${change.kind} ${change.connectorId}`;
		case "ScoreAdded":
		case "ScoreRemoved":
			return `${change.kind} ${change.score.id}`;
		case "IncomingSourceInserted":
		case "IncomingSourceRemoved":
			return `${change.kind} ${change.sourceScoreId}`;
		case "IncomingSourcesResorted":
			return `${change.kind} ${change.targetScoreId}`;
		case "ScoreClaimConfidenceChanged":
		case "ScoreConnectorConfidenceChanged":
		case "ScoreRelevanceChanged":
		case "ScoreScaleOfSourcesChanged":
			return `${change.kind} ${change.scoreId}`;
		case "ScoreScaleOfSourcesBatchChanged":
			return `${change.kind} ${change.changes.map((entry) => entry.scoreId).join(",")}`;
	}
}

function formatMetric(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function resolveConnectorDasharray(lineProgress: number, affects: Connector["affects"]): string | undefined {
	if (lineProgress < 1) {
		return `${Math.max(0.0001, lineProgress)} 1`;
	}

	return affects === "relevance" ? "10 8" : undefined;
}

function resolveConnectorDashoffset(lineProgress: number, lineTravelOffset: number): number | undefined {
	if (lineProgress < 1 || lineTravelOffset !== 0) {
		return lineTravelOffset;
	}

	return undefined;
}

function resolveConnectorDisplayProgress(lineProgress: number): number {
	if (lineProgress <= 0 || lineProgress >= 1) {
		return Math.max(0, Math.min(1, lineProgress));
	}

	return Math.min(1, lineProgress + CONNECTOR_TRANSITION_OVERLAP_PERCENT);
}

function resolveConnectorDisplayTravelOffset(lineProgress: number, lineTravelOffset: number): number {
	const displayProgress = resolveConnectorDisplayProgress(lineProgress);
	if (lineTravelOffset < 0) {
		return -(1 - displayProgress);
	}

	return 0;
}

const graphRootStyle = {
	position: "relative",
	background: "#000000",
	"--pro-h": "276.37",
	"--pro-l": "65%",
	"--pro": "hsl(var(--pro-h), 100%, var(--pro-l))",
	"--con-h": "30.21",
	"--con-l": "42%",
	"--con": "hsl(var(--con-h), 100%, var(--con-l))",
	"--rt-connector-opacity": "90%",
	"--rt-connector-potential-opacity": "30%",
} as React.CSSProperties;

const graphContentStyle = {
	position: "absolute",
	left: "50%",
	top: "50%",
	transformOrigin: "center center",
} satisfies React.CSSProperties;

const connectorLayerStyle = {
	position: "absolute",
	left: 0,
	top: 0,
	overflow: "visible",
} satisfies React.CSSProperties;

const graphCanvasStyle = {
	position: "relative",
	background: "#000000",
	boxSizing: "border-box",
} satisfies React.CSSProperties;

const claimShellStyle = {
	position: "absolute",
	boxSizing: "border-box",
	overflow: "visible",
} satisfies React.CSSProperties;

const claimCardStyle = {
	width: "100%",
	height: "100%",
	padding: "0.5rem 0.75rem",
	boxSizing: "border-box",
	border: "4px solid #cbd5e1",
	borderRadius: 0,
	boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
	color: "#ffffff",
	overflow: "hidden",
} satisfies React.CSSProperties;

const claimShapeStyle = {
	boxSizing: "border-box",
	position: "absolute",
	left: "50%",
	top: "50%",
	transformOrigin: "center center",
	transform: "translate(-50%, -50%) scale(calc(var(--rt-claim-shape-scale, 1) * var(--rt-claim-insert-scale, 1)))",
} satisfies React.CSSProperties;

const claimContentStyle = {
	margin: 0,
	fontSize: "1.9rem",
	lineHeight: 1.05,
	fontWeight: 600,
	overflow: "hidden",
	display: "-webkit-box",
	WebkitBoxOrient: "vertical",
	WebkitLineClamp: 4,
} satisfies React.CSSProperties;

const claimScoreStyle = {
	display: "block",
	marginTop: "0.35rem",
	fontSize: "0.875rem",
	color: "#cbd5e1",
} satisfies React.CSSProperties;