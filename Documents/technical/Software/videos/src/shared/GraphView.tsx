// See 📌README.md in this folder for local coding standards before editing this file.

import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Claim, ClaimId, ClaimSide } from "../../../contracts/src/Claim.ts";
import type { Connector, ConnectorId } from "../../../contracts/src/Connector.ts";
import type { Debate } from "../../../contracts/src/Debate.ts";
import type { AnimationStep, Change, IntentSequence, RecordId } from "../../../contracts/src/IntentSequence.ts";
import type { ScoreId } from "../../../contracts/src/Score.ts";
import { calculateLayoutPipeline, prepareAnimationSchedule, processDebateIntent, type DebateLayout, type DebateLayoutPipelineContext } from "../../../engine/src/index.ts";
import { cancelRender, continueRender, delayRender, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { getZoomMotionState } from "./zoomMotion.ts";

const DEFAULT_GRAPH_FROM = 0;
const DEFAULT_ZOOM_SCALE = 3.4;
const DEFAULT_ZOOM_DURATION_FRAMES = 78;
const DEFAULT_ZOOM_PADDING = 120;
const DEFAULT_VIEWPORT_PADDING = 100;
const DEFAULT_CLAIM_WIDTH = 320;
const DEFAULT_CLAIM_HEIGHT = 180;
const SOURCE_SIDE_STRAIGHT_SEGMENT_PERCENT = 0.5;
const TARGET_SIDE_STRAIGHT_SEGMENT_PERCENT = 0.3;
const CONNECTOR_TRANSITION_OVERLAP_PERCENT = 0.01;

const GRAPH_LAYOUT_OPTIONS = {
	scaleConnectionDistanceWithScore: true,
} satisfies Parameters<typeof calculateLayoutPipeline>[1];

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
	scale: number;
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
	animationSteps: readonly AnimationStep[];
	durationWeight: number;
	durationInFrames: number;
};

type PreparedGraphView = {
	initialSnapshot: GraphSnapshot;
	segments: GraphTransitionSegment[];
	finalSnapshot: GraphSnapshot;
};

type AppliedGraphActionState = {
	debate: Debate;
	intentSequence?: IntentSequence;
	stepId?: RecordId;
	changes?: Change[];
};

type CameraState = {
	scale: number;
	translateX: number;
	translateY: number;
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
	const activeGraph = resolveActiveGraph(prepared, frame);
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
		<div style={{ ...graphRootStyle, ...wrapperStyle }}>
			<div style={{ ...graphContentStyle, ...contentStyle }}>
				<div style={{ ...graphCanvasStyle, width: activeGraph.width, height: activeGraph.height }}>
					<svg width={activeGraph.width} height={activeGraph.height} style={connectorLayerStyle}>
						{activeGraph.connectorRenderOrder.map((connectorId) => {
							const connector = activeGraph.connectorByConnectorId[connectorId];
							if (!connector) {
								return null;
							}

							return <ConnectorTransitionPaths key={connectorId} connector={connector} claimByClaimId={activeGraph.claimByClaimId} />;
						})}
					</svg>
					{activeGraph.claimRenderOrder.map((claimId) => {
						const claim = activeGraph.claimByClaimId[claimId];
						if (!claim) {
							return null;
						}

						return (
							<article
								key={claimId}
								style={{
									...claimShellStyle,
									left: claim.x,
									top: claim.y,
									width: claim.width,
									height: claim.height,
									opacity: claim.opacity,
								}}
							>
								<div
									style={{
										...claimShapeStyle,
										width: DEFAULT_CLAIM_WIDTH,
										height: DEFAULT_CLAIM_HEIGHT,
										"--rt-claim-shape-scale": String(claim.scale),
										"--rt-claim-insert-scale": String(claim.insertScale),
									} as React.CSSProperties}
								>
									<article
										style={{
											...claimCardStyle,
											borderColor: claim.side === "proMain" ? "hsl(276.37 100% 65%)" : "hsl(30.21 100% 42%)",
											background: claim.side === "proMain"
												? "hsla(276.37, 100%, 65%, 0.26)"
												: "hsla(30.21, 100%, 42%, 0.26)",
										}}
									>
										<h2 style={claimContentStyle}>{claim.content}</h2>
										<small style={claimScoreStyle}>{Math.round(claim.confidence * 100)}%</small>
									</article>
								</div>
							</article>
						);
					})}
				</div>
			</div>
		</div>
	);
};

function renderPreparedTimelineMarkers(prepared: PreparedGraphView, graphFrom: number): ReactNode[] {
	return prepared.segments
		.filter((segment) => segment.animationSteps.length > 0 && segment.name !== "Hold final state")
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
			intentSequence: nextState.intentSequence,
			eventDurationInFrames: graphEvent.durationInFrames,
			layoutOptions: GRAPH_LAYOUT_OPTIONS,
		});
		const transitionSegments = buildGraphTransitionSegments(currentSnapshot, schedule, graphEvent.from);
		const toSnapshot = buildGraphSnapshotFromPipeline(schedule.finalPipeline);

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
	const transitionSegments: GraphTransitionSegment[] = [];
	let segmentTimelineFrom = timelineFrom;
	let currentSnapshot = fromSnapshot;
	for (const unit of schedule.transitionUnits) {
		const actualUnitToSnapshot = buildGraphSnapshotFromPipeline(unit.to);
		const unitToSnapshot = buildAnimationStepPhaseSnapshot(currentSnapshot, actualUnitToSnapshot, unit.animationSteps);
		transitionSegments.push({
			timelineFrom: segmentTimelineFrom,
			name: unit.name,
			fromSnapshot: currentSnapshot,
			toSnapshot: unitToSnapshot,
			animationSteps: unit.animationSteps,
			durationWeight: 1,
			durationInFrames: unit.durationInFrames,
		});
		currentSnapshot = unitToSnapshot;
		segmentTimelineFrom += unit.durationInFrames;
	}

	return transitionSegments;
}

function buildAnimationStepPhaseSnapshot(
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	animationSteps: readonly AnimationStep[],
): GraphSnapshot {
	const scoreStep = animationSteps.find((animationStep): animationStep is Extract<AnimationStep, { type: "ScoreAnimationStep" }> => animationStep.type === "ScoreAnimationStep");
	const connectorStep = animationSteps.find((animationStep): animationStep is Extract<AnimationStep, { type: "ConnectorAnimationStep" }> => animationStep.type === "ConnectorAnimationStep");
	if (!scoreStep) {
		if (connectorStep?.phase === "update") {
			return {
				pipeline: toSnapshot.pipeline,
				renderState: buildConnectorUpdatePhaseRenderState(fromSnapshot.renderState, toSnapshot.renderState),
			};
		}

		return toSnapshot;
	}

	if (scoreStep.phase === "enter") {
		return {
			pipeline: toSnapshot.pipeline,
			renderState: buildEnterPhaseRenderState(fromSnapshot.renderState, toSnapshot.renderState),
		};
	}

	if (scoreStep.phase === "display") {
		return {
			pipeline: toSnapshot.pipeline,
			renderState: buildDisplayPhaseRenderState(fromSnapshot.renderState, toSnapshot.renderState),
		};
	}

	if (scoreStep.phase === "scale") {
		return {
			pipeline: toSnapshot.pipeline,
			renderState: buildScalePhaseRenderState(fromSnapshot.renderState, toSnapshot.renderState),
		};
	}

	return toSnapshot;
}

function buildEnterPhaseRenderState(
	fromState: GraphRenderState,
	toState: GraphRenderState,
): GraphRenderState {
	const claimRenderOrder = buildUnionOrder(toState.claimRenderOrder, fromState.claimRenderOrder);
	const connectorRenderOrder = buildUnionOrder(fromState.connectorRenderOrder, toState.connectorRenderOrder);
	const claimByClaimId = {} as GraphRenderState["claimByClaimId"];
	const connectorByConnectorId = {} as GraphRenderState["connectorByConnectorId"];

	for (const claimId of claimRenderOrder) {
		const fromClaim = fromState.claimByClaimId[claimId];
		const toClaim = toState.claimByClaimId[claimId];
		if (fromClaim && toClaim) {
			claimByClaimId[claimId] = {
				...toClaim,
				opacity: fromClaim.opacity,
				insertScale: fromClaim.insertScale,
			};
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

		if (fromClaim) {
			claimByClaimId[claimId] = { ...fromClaim };
		}
	}

	for (const connectorId of connectorRenderOrder) {
		const fromConnector = fromState.connectorByConnectorId[connectorId];
		const toConnector = toState.connectorByConnectorId[connectorId];
		if (fromConnector && toConnector) {
			connectorByConnectorId[connectorId] = {
				...toConnector,
				referenceLineProgress: fromConnector.referenceLineProgress,
				referenceLineTravelOffset: fromConnector.referenceLineTravelOffset,
				referenceOpacity: fromConnector.referenceOpacity,
				actualLineProgress: fromConnector.actualLineProgress,
				actualLineTravelOffset: fromConnector.actualLineTravelOffset,
				actualOpacity: fromConnector.actualOpacity,
				secondaryLineProgress: fromConnector.secondaryLineProgress,
				secondaryLineTravelOffset: fromConnector.secondaryLineTravelOffset,
				secondaryOpacity: fromConnector.secondaryOpacity,
			};
			continue;
		}

		if (fromConnector) {
			connectorByConnectorId[connectorId] = { ...fromConnector };
		}
	}

	return {
		width: fromState.width,
		height: fromState.height,
		claimRenderOrder,
		connectorRenderOrder,
		claimByClaimId,
		connectorByConnectorId,
	};
}

function buildDisplayPhaseRenderState(
	fromState: GraphRenderState,
	toState: GraphRenderState,
): GraphRenderState {
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
				content: toClaim.content,
				side: toClaim.side,
				confidence: toClaim.confidence,
				relevance: toClaim.relevance,
			};
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

		if (fromClaim) {
			claimByClaimId[claimId] = {
				...fromClaim,
			};
		}
	}

	for (const connectorId of connectorRenderOrder) {
		const fromConnector = fromState.connectorByConnectorId[connectorId];
		const toConnector = toState.connectorByConnectorId[connectorId];
		if (fromConnector) {
			connectorByConnectorId[connectorId] = {
				...fromConnector,
				referenceAffects: toConnector?.referenceAffects ?? fromConnector.referenceAffects,
				actualAffects: toConnector?.actualAffects ?? fromConnector.actualAffects,
			};
			continue;
		}

		if (toConnector) {
			connectorByConnectorId[connectorId] = {
				...toConnector,
				actualLineProgress: 0,
				actualLineTravelOffset: 0,
				actualOpacity: 1,
				secondaryLineProgress: 0,
				secondaryLineTravelOffset: 0,
				secondaryOpacity: 0,
			};
		}
	}

	return {
		width: fromState.width,
		height: fromState.height,
		claimRenderOrder,
		connectorRenderOrder,
		claimByClaimId,
		connectorByConnectorId,
	};
}

function buildScalePhaseRenderState(
	fromState: GraphRenderState,
	toState: GraphRenderState,
): GraphRenderState {
	const claimRenderOrder = buildUnionOrder(toState.claimRenderOrder, fromState.claimRenderOrder);
	const connectorRenderOrder = buildUnionOrder(toState.connectorRenderOrder, fromState.connectorRenderOrder);
	const claimByClaimId = {} as GraphRenderState["claimByClaimId"];
	const connectorByConnectorId = {} as GraphRenderState["connectorByConnectorId"];

	for (const claimId of claimRenderOrder) {
		const fromClaim = fromState.claimByClaimId[claimId];
		const toClaim = toState.claimByClaimId[claimId];
		if (fromClaim && toClaim) {
			claimByClaimId[claimId] = {
				...toClaim,
				opacity: fromClaim.opacity,
				insertScale: fromClaim.insertScale,
			};
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

		if (fromClaim) {
			claimByClaimId[claimId] = {
				...fromClaim,
			};
		}
	}

	for (const connectorId of connectorRenderOrder) {
		const fromConnector = fromState.connectorByConnectorId[connectorId];
		const toConnector = toState.connectorByConnectorId[connectorId];
		if (fromConnector) {
			connectorByConnectorId[connectorId] = {
				...fromConnector,
				referenceAffects: toConnector?.referenceAffects ?? fromConnector.referenceAffects,
				actualAffects: toConnector?.actualAffects ?? fromConnector.actualAffects,
				referencePathBinding: toConnector?.referencePathBinding ?? fromConnector.referencePathBinding,
				actualPathBinding: toConnector?.actualPathBinding ?? fromConnector.actualPathBinding,
			};
			continue;
		}

		if (toConnector) {
			connectorByConnectorId[connectorId] = {
				...toConnector,
				actualLineProgress: 0,
				actualLineTravelOffset: 0,
				actualOpacity: 1,
				secondaryLineProgress: 0,
				secondaryLineTravelOffset: 0,
				secondaryOpacity: 0,
			};
			continue;
		}

		if (fromConnector) {
			connectorByConnectorId[connectorId] = fromConnector;
		}
	}

	return {
		width: fromState.width,
		height: fromState.height,
		claimRenderOrder,
		connectorRenderOrder,
		claimByClaimId,
		connectorByConnectorId,
	};
}

function buildConnectorUpdatePhaseRenderState(
	fromState: GraphRenderState,
	toState: GraphRenderState,
): GraphRenderState {
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
				content: toClaim.content,
				side: toClaim.side,
				confidence: toClaim.confidence,
				relevance: toClaim.relevance,
				scale: toClaim.scale,
			};
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

		if (fromClaim) {
			claimByClaimId[claimId] = { ...fromClaim };
		}
	}

	for (const connectorId of connectorRenderOrder) {
		const fromConnector = fromState.connectorByConnectorId[connectorId];
		const toConnector = toState.connectorByConnectorId[connectorId];
		if (fromConnector && toConnector) {
			connectorByConnectorId[connectorId] = {
				...fromConnector,
				referenceAffects: toConnector.referenceAffects,
				actualAffects: toConnector.actualAffects,
				referencePathBinding: toConnector.referencePathBinding,
				actualPathBinding: toConnector.actualPathBinding,
				strokeWidth: toConnector.strokeWidth,
				referenceStrokeWidth: toConnector.referenceStrokeWidth,
			};
			continue;
		}

		if (toConnector) {
			connectorByConnectorId[connectorId] = {
				...toConnector,
				actualLineProgress: 0,
				actualLineTravelOffset: 0,
				actualOpacity: 1,
				secondaryLineProgress: 0,
				secondaryLineTravelOffset: 0,
				secondaryOpacity: 0,
			};
			continue;
		}

		if (fromConnector) {
			connectorByConnectorId[connectorId] = { ...fromConnector };
		}
	}

	return {
		width: fromState.width,
		height: fromState.height,
		claimRenderOrder,
		connectorRenderOrder,
		claimByClaimId,
		connectorByConnectorId,
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
	console.groupCollapsed(`[GraphView] pipeline objects ${input.graphEvent.name}`);
	console.log("GraphEvent", input.graphEvent);
	console.log("AppliedGraphActionState", input.nextState);
	console.log("PreparedAnimationSchedule", input.schedule);
	console.groupEnd();
}

async function buildGraphSnapshot(state: AppliedGraphActionState): Promise<GraphSnapshot> {
	const pipeline = await calculateLayoutPipeline({
		debate: state.debate,
		intentSequence: state.intentSequence,
		stepId: state.stepId,
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
	const rootScores = Object.values(debate.scores).filter((score) => score.claimId === debate.mainClaimId);
	const rootScoreId = rootScores.length === 1 ? rootScores[0].id : undefined;
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
			confidence: score.confidence,
			relevance: score.relevance,
			x: scoreLayout.x,
			y: scoreLayout.y,
			width: scoreLayout.width,
			height: scoreLayout.height,
			scale: score.id === rootScoreId ? 1 : score.scaleOfSources,
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
): GraphRenderState {
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

	return prepared.segments.length === 0 ? prepared.finalSnapshot.renderState : currentSnapshot.renderState;
}

function resolveTransitionSegment(
	segment: GraphTransitionSegment,
	localFrame: number,
): GraphRenderState {
	if (localFrame <= 0) {
		return resolveAnimationStepTransition(
			segment.fromSnapshot,
			segment.toSnapshot,
			0,
			segment.animationSteps,
		);
	}

	const localProgress = localFrame / Math.max(1, segment.durationInFrames);
	if (localProgress < 1) {
		return resolveAnimationStepTransition(segment.fromSnapshot, segment.toSnapshot, localProgress, segment.animationSteps);
	}

	return segment.toSnapshot.renderState;
}

function resolveAnimationStepTransition(
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	progress: number,
	animationSteps: readonly AnimationStep[],
): GraphRenderState {
	const clamped = Math.max(0, Math.min(1, progress));
	if (animationSteps.length === 0) {
		return toSnapshot.renderState;
	}

	const state = buildAnimationStepBaseState(fromSnapshot.renderState, toSnapshot.renderState, clamped);

	for (const animationStep of animationSteps) {
		const stepProgress = clamped;
		if (stepProgress <= 0) {
			continue;
		}

		if (animationStep.type === "ScoreAnimationStep") {
			if (animationStep.phase === "scale") {
				applyRenderedScalePhase(state, fromSnapshot, toSnapshot, stepProgress);
			}
			applyScoreAnimationStep(state, fromSnapshot, toSnapshot, animationStep, stepProgress);
			continue;
		}

		applyConnectorAnimationStep(state, fromSnapshot, toSnapshot, animationStep, stepProgress);
	}

	return state;
}

function applyRenderedScalePhase(
	state: GraphRenderState,
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	progress: number,
): void {
	for (const claimId of state.claimRenderOrder) {
		const workingClaim = state.claimByClaimId[claimId];
		const fromClaim = fromSnapshot.renderState.claimByClaimId[claimId];
		const toClaim = toSnapshot.renderState.claimByClaimId[claimId];
		if (!workingClaim || !fromClaim || !toClaim) {
			continue;
		}

		state.claimByClaimId[claimId] = {
			...workingClaim,
			scale: lerp(fromClaim.scale, toClaim.scale, progress),
		};
	}
}

function buildAnimationStepBaseState(
	fromState: GraphRenderState,
	toState: GraphRenderState,
	progress: number,
): GraphRenderState {
	const claimRenderOrder = buildUnionOrder(toState.claimRenderOrder, fromState.claimRenderOrder);
	const connectorRenderOrder = buildUnionOrder(toState.connectorRenderOrder, fromState.connectorRenderOrder);
	const claimByClaimId = {} as GraphRenderState["claimByClaimId"];
	const connectorByConnectorId = {} as GraphRenderState["connectorByConnectorId"];

	for (const claimId of claimRenderOrder) {
		const fromClaim = fromState.claimByClaimId[claimId];
		const toClaim = toState.claimByClaimId[claimId];
		if (fromClaim && toClaim) {
			claimByClaimId[claimId] = {
				...toClaim,
				x: lerp(fromClaim.x, toClaim.x, progress),
				y: lerp(fromClaim.y, toClaim.y, progress),
				width: lerp(fromClaim.width, toClaim.width, progress),
				height: lerp(fromClaim.height, toClaim.height, progress),
				scale: fromClaim.scale,
				confidence: fromClaim.confidence,
				relevance: fromClaim.relevance,
				opacity: 1,
				insertScale: 1,
			};
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

		if (fromClaim) {
			claimByClaimId[claimId] = {
				...fromClaim,
				opacity: 1,
				insertScale: 1,
			};
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
			const interpolatedPathBinding = interpolateConnectorPathBinding(fromConnector.actualPathBinding, toConnector.actualPathBinding, progress);
			connectorByConnectorId[connectorId] = {
				...toConnector,
				referenceAffects: toConnector.referenceAffects,
				actualAffects: toConnector.actualAffects,
				referencePathBinding: interpolatedPathBinding,
				referenceLineProgress: lerp(fromConnector.referenceLineProgress, toConnector.referenceLineProgress, progress),
				referenceLineTravelOffset: lerp(fromConnector.referenceLineTravelOffset, toConnector.referenceLineTravelOffset, progress),
				referenceOpacity: lerp(fromConnector.referenceOpacity, toConnector.referenceOpacity, progress),
				actualPathBinding: interpolatedPathBinding,
				strokeWidth: lerp(fromConnector.strokeWidth, toConnector.strokeWidth, progress),
				referenceStrokeWidth: lerp(fromConnector.referenceStrokeWidth, toConnector.referenceStrokeWidth, progress),
				actualLineProgress: 1,
				actualLineTravelOffset: 0,
				actualOpacity: 1,
				secondaryLineProgress: 0,
				secondaryLineTravelOffset: 0,
				secondaryOpacity: 0,
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
		width: lerp(fromState.width, toState.width, progress),
		height: lerp(fromState.height, toState.height, progress),
		claimRenderOrder,
		connectorRenderOrder,
		claimByClaimId,
		connectorByConnectorId,
	};
}

function applyScoreAnimationStep(
	state: GraphRenderState,
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	animationStep: Extract<AnimationStep, { type: "ScoreAnimationStep" }>,
	progress: number,
): void {
	const fromScore = fromSnapshot.pipeline.debate.scores[animationStep.scoreId];
	const toScore = toSnapshot.pipeline.debate.scores[animationStep.scoreId];
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
		if (animationStep.phase === "exit" && !toClaim && fromClaim) {
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

	if (animationStep.phase === "enter" && toClaim) {
		state.claimByClaimId[claimId] = {
			...workingClaim,
			...toClaim,
			opacity: 1,
			insertScale: progress,
			confidence: toClaim.confidence * progress,
		};
		return;
	}

	if (animationStep.phase === "exit" && fromClaim) {
		state.claimByClaimId[claimId] = {
			...workingClaim,
			...fromClaim,
			opacity: 1 - progress,
			insertScale: 1 - progress,
			confidence: fromClaim.confidence * (1 - progress),
		};
		return;
	}

	if (fromClaim && toClaim) {
		state.claimByClaimId[claimId] = {
			...workingClaim,
			...toClaim,
			scale: lerp(fromClaim.scale, toClaim.scale, progress),
			confidence: lerp(fromClaim.confidence, toClaim.confidence, progress),
			relevance: lerp(fromClaim.relevance, toClaim.relevance, progress),
			opacity: 1,
			insertScale: 1,
		};
	}
}

function applyConnectorAnimationStep(
	state: GraphRenderState,
	fromSnapshot: GraphSnapshot,
	toSnapshot: GraphSnapshot,
	animationStep: Extract<AnimationStep, { type: "ConnectorAnimationStep" }>,
	progress: number,
): void {
	const connectorId = animationStep.connectorId;
	const workingConnector = state.connectorByConnectorId[connectorId];
	const fromConnector = fromSnapshot.renderState.connectorByConnectorId[connectorId];
	const toConnector = toSnapshot.renderState.connectorByConnectorId[connectorId];
	if (!workingConnector) {
		return;
	}

	if (progress >= 1) {
		if ((animationStep.phase === "shrink" || animationStep.phase === "exit") && !toConnector && fromConnector) {
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

	if ((animationStep.phase === "grow" || animationStep.phase === "enter") && toConnector) {
		const dashoffset = resolveRevealDashoffset(animationStep.direction, progress);
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

	if ((animationStep.phase === "update" || animationStep.phase === "reroute") && fromConnector && toConnector) {
		const outgoingDirection = invertAnimationDirection(animationStep.direction);
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
			secondaryPathBinding: toConnector.actualPathBinding,
			secondaryStrokeWidth: toConnector.strokeWidth,
			secondaryLineProgress: progress,
			secondaryLineTravelOffset: resolveRevealDashoffset(animationStep.direction, progress),
			secondaryOpacity: 1,
		};
		return;
	}

	if ((animationStep.phase === "shrink" || animationStep.phase === "exit") && fromConnector) {
		const dashoffset = resolveRevealDashoffset(animationStep.direction, 1 - progress);
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
		const nextState = move.reset
			? baseState
			: getCameraStateForTarget(resolveTargetData(graph, move.target) ?? { x: graph.width / 2, y: graph.height / 2 }, frameWidth, frameHeight, move.padding, move.scale);

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
			startTranslateX: currentState.translateX,
			endTranslateX: nextState.translateX,
			startTranslateY: currentState.translateY,
			endTranslateY: nextState.translateY,
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
): CameraState {
	const scale = resolveZoomScale(targetData, frameWidth, frameHeight, padding, fallbackScale);
	return {
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
	console.groupCollapsed("[GraphView] Prepared timeline");
	for (const [segmentIndex, segment] of prepared.segments.entries()) {
		const pipeline = segment.toSnapshot.pipeline;
		const intentName = pipeline.intentSequence?.intent.type ?? "NoIntent";
		const stepLabel = pipeline.stepId
			? (pipeline.intentSequence?.steps.find((step: IntentSequence["steps"][number]) => step.id === pipeline.stepId)?.type ?? String(pipeline.stepId))
			: "no-step";
		const changeLabels = (pipeline.changes ?? []).map((change: Change) => `${change.type} ${change.scoreId}`).join(", ");
		console.groupCollapsed(
			`segment ${segmentIndex + 1} ${segment.name} @${segment.timelineFrom}f +${segment.durationInFrames}f intent=${intentName}${stepLabel !== "no-step" ? ` step=${String(stepLabel)}` : ""}${changeLabels ? ` changes=[${changeLabels}]` : ""}`,
		);

		if (segment.animationSteps.length === 0) {
			console.log("Hold");
		}
		for (const animationStep of segment.animationSteps) {
			if (animationStep.type === "ScoreAnimationStep") {
				console.log(`ScoreAnimationStep ${animationStep.phase} ${animationStep.scoreId}${animationStep.direction ? ` ${animationStep.direction}` : ""}`);
				continue;
			}

			console.log(`ConnectorAnimationStep ${animationStep.phase} ${animationStep.connectorId}${animationStep.direction ? ` ${animationStep.direction}` : ""}`);
		}
		console.groupEnd();
	}
	console.groupEnd();
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
				type: "ReceivedAddLeafClaimIntent",
				claim,
				connector,
				targetScoreId,
			},
		});

		return {
			debate: result.finalDebate,
			intentSequence: result.intentSequence,
		};
	}

	if (claimUpserts.length === 0 && connectorUpserts.length === 1) {
		const connector = connectorUpserts[0].connector;
		const targetScoreId = findTargetScoreId(debate, connector.target);
		const result = processDebateIntent({
			debate,
			intent: {
				id: `graph-event:${connector.id}` as never,
				type: "ReceivedAddConnectionIntent",
				connector,
				targetScoreId,
			},
		});

		return {
			debate: result.finalDebate,
			intentSequence: result.intentSequence,
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

function ConnectorTransitionPaths({
	connector,
	claimByClaimId,
}: {
	connector: ConnectorVisual;
	claimByClaimId: GraphRenderState["claimByClaimId"];
}): ReactNode {
	const stroke = connector.sourceSide === "proMain" ? "hsl(276.37 100% 65%)" : "hsl(30.21 100% 42%)";
	const secondaryAffects = connector.secondaryAffects ?? connector.actualAffects;

	return (
		<>
			{renderConnectorStrokePair(
				"primary",
				stroke,
				claimByClaimId,
				{
					pathBinding: connector.referencePathBinding,
					affects: connector.referenceAffects,
					strokeWidth: Math.max(2, connector.referenceStrokeWidth),
					lineProgress: connector.referenceLineProgress,
					lineTravelOffset: connector.referenceLineTravelOffset,
					opacity: connector.referenceOpacity,
				},
				{
					pathBinding: connector.actualPathBinding,
					affects: connector.actualAffects,
					strokeWidth: Math.max(2, connector.strokeWidth),
					lineProgress: connector.actualLineProgress,
					lineTravelOffset: connector.actualLineTravelOffset,
					opacity: connector.actualOpacity,
				},
				true,
			)}
			{connector.secondaryOpacity > 0 && connector.secondaryPathBinding
				? renderConnectorStrokePair(
					"secondary",
					stroke,
					claimByClaimId,
					{
						pathBinding: connector.secondaryPathBinding,
						affects: secondaryAffects,
						strokeWidth: Math.max(2, connector.referenceStrokeWidth),
						lineProgress: connector.secondaryLineProgress,
						lineTravelOffset: connector.secondaryLineTravelOffset,
						opacity: 0.3 * connector.secondaryOpacity,
					},
					{
						pathBinding: connector.secondaryPathBinding,
						affects: secondaryAffects,
						strokeWidth: Math.max(2, connector.secondaryStrokeWidth ?? connector.strokeWidth),
						lineProgress: connector.secondaryLineProgress,
						lineTravelOffset: connector.secondaryLineTravelOffset,
						opacity: connector.secondaryOpacity,
					},
					false,
				)
				: null}
		</>
	);
}

function renderConnectorStrokePair(
	pairKey: string,
	stroke: string,
	claimByClaimId: GraphRenderState["claimByClaimId"],
	reference: ConnectorStrokeVisual,
	actual: ConnectorStrokeVisual,
	renderReference: boolean,
): ReactNode {
	const actualPathD = resolveConnectorPathD(actual.pathBinding, claimByClaimId);
	const referencePathD = resolveConnectorPathD(reference.pathBinding, claimByClaimId);
	const sharedPathD = actualPathD.length > 0 ? actualPathD : referencePathD;

	return (
		<>
			{renderReference
				? renderConnectorStrokeLayer(`${pairKey}:reference`, stroke, {
					...reference,
					pathBinding: reference.pathBinding,
				}, sharedPathD)
				: null}
			{renderConnectorStrokeLayer(`${pairKey}:actual`, stroke, {
				...actual,
				pathBinding: actual.pathBinding,
				lineProgress: resolveConnectorDisplayProgress(actual.lineProgress),
				lineTravelOffset: resolveConnectorDisplayTravelOffset(actual.lineProgress, actual.lineTravelOffset),
			}, sharedPathD)}
		</>
	);
}

function renderConnectorStrokeLayer(
	key: string,
	stroke: string,
	strokeVisual: ConnectorStrokeVisual,
	pathD: string,
): ReactNode {
	if (strokeVisual.opacity <= 0 || strokeVisual.lineProgress <= 0 || pathD.length === 0) {
		return null;
	}

	return (
		<path
			key={key}
			d={pathD}
			fill="none"
			stroke={stroke}
			strokeWidth={strokeVisual.strokeWidth}
			strokeDasharray={resolveConnectorDasharray(strokeVisual.lineProgress, strokeVisual.affects)}
			strokeDashoffset={resolveConnectorDashoffset(strokeVisual.lineProgress, strokeVisual.lineTravelOffset)}
			pathLength={1}
			style={{ opacity: strokeVisual.opacity, filter: "drop-shadow(0 0 8px rgba(148,163,184,0.2))", strokeLinecap: "butt", strokeLinejoin: "miter" }}
		/>
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
	orderedConnectorSteps: ReadonlyArray<Extract<AnimationStep, { type: "ConnectorAnimationStep" }>>,
): Partial<Record<ConnectorId, { phase: Extract<AnimationStep, { type: "ConnectorAnimationStep" }>["phase"]; direction: Extract<AnimationStep, { type: "ConnectorAnimationStep" }>["direction"]; index: number }>> {
	const connectorPhaseByConnectorId: Partial<Record<ConnectorId, { phase: Extract<AnimationStep, { type: "ConnectorAnimationStep" }>["phase"]; direction: Extract<AnimationStep, { type: "ConnectorAnimationStep" }>["direction"]; index: number }>> = {};

	for (const [index, step] of orderedConnectorSteps.entries()) {
		connectorPhaseByConnectorId[step.connectorId] = {
			phase: step.phase,
			direction: step.direction,
			index,
		};
	}

	return connectorPhaseByConnectorId;
}

function resolveRevealDashoffset(
	direction: AnimationStep["direction"] | undefined,
	lineProgress: number,
): number {
	if (direction === "targetToSource") {
		return -(1 - lineProgress);
	}

	return 0;
}


function invertAnimationDirection(
	direction: AnimationStep["direction"] | undefined,
): AnimationStep["direction"] | undefined {
	if (direction === "sourceToTarget") {
		return "targetToSource";
	}

	if (direction === "targetToSource") {
		return "sourceToTarget";
	}

	return direction;
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
} satisfies React.CSSProperties;

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