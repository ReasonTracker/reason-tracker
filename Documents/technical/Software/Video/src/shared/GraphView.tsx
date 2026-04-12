import { Children, isValidElement, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type {
  CalculatedDebate,
  ClaimId,
  ConnectorId,
  Debate,
  GraphAction,
  PropagationAnimationDirective,
  PropagationAnimationKeyState,
  StageMode,
} from "@reasontracker/contracts";
import { buildPropagationAnimation } from "@reasontracker/engine";
import {
  buildGraphAnimationSnapshot,
  layoutDebate,
  type GraphAnimationSnapshot,
  type GraphClaimVisualState,
  type GraphConnectorVisualState,
  type SiblingOrderingMode,
} from "@reasontracker/renderer";
import { cancelRender, continueRender, delayRender, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { getZoomMotionState } from "./zoomMotion.ts";

const DEFAULT_GRAPH_FROM = 0;
const DEFAULT_GRAPH_SCALE = 1.65;
const DEFAULT_ZOOM_SCALE = 3.4;
const DEFAULT_ZOOM_DURATION_FRAMES = 78;
const DEFAULT_ZOOM_PADDING = 120;
const CLAIM_TRANSITION_FRAMES = 18;
const CONNECTOR_TRANSITION_FRAMES = 18;

type GraphZoomTarget =
  | { claimId: string | readonly string[] }
  | { x: number; y: number; width?: number; height?: number };

export type CameraMoveProps = {
  from: number;
  durationInFrames?: number;
  reset?: boolean;
  // Design choice exception: CameraMove is authored manually in episode files, so it accepts plain strings instead of branded ClaimId values.
  claimId?: string | readonly string[];
  target?: GraphZoomTarget;
  scale?: number;
  padding?: number;
  name?: string;
};

export type GraphEventsProps = {
  from: number;
  durationInFrames?: number;
  actions: readonly GraphAction[];
  applyMode?: StageMode;
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
  actions: readonly GraphAction[];
  applyMode: StageMode;
  id?: string;
  name: string;
};

type SnapshotFrame = {
  frame: number;
  snapshot: GraphAnimationSnapshot;
};

type PresentationSnapshot = {
  visualSnapshot: GraphAnimationSnapshot;
  layoutSnapshot: GraphAnimationSnapshot;
};

type GraphPresentationStage = {
  kind: "claims" | "connectors";
  startFrame: number;
  endFrame: number;
  fromState: PresentationSnapshot;
  toState: PresentationSnapshot;
  insertedClaimIds: ClaimId[];
  removedClaimIds: ClaimId[];
};

type ActiveClaimRender = GraphClaimVisualState & {
  displayedConfidence: number;
  opacity: number;
  insertScale: number;
};

type ActiveConnectorRender = GraphConnectorVisualState;

type ActiveGraphRenderState = {
  width: number;
  height: number;
  claimRenderOrder: ClaimId[];
  connectorRenderOrder: ConnectorId[];
  claimByClaimId: Record<ClaimId, ActiveClaimRender>;
  connectorByConnectorId: Record<ConnectorId, ActiveConnectorRender>;
};

function buildGraphEventDirectives(
  graphEvents: ResolvedGraphEvent[],
  fps: number,
): PropagationAnimationDirective[] {
  const directives: PropagationAnimationDirective[] = [];

  for (const [index, graphEvent] of graphEvents.entries()) {
    const graphEventId = graphEvent.id ?? `graph-event-${index + 1}`;

    if (graphEvent.applyMode === "all-at-once" || graphEvent.actions.length < 2) {
      directives.push({
        id: graphEventId,
        name: graphEvent.name,
        startAtSeconds: graphEvent.from / fps,
        durationSeconds: graphEvent.durationInFrames / fps,
        actions: graphEvent.actions.map((entry) => entry.action),
      });
      continue;
    }

    for (const [actionIndex, entry] of graphEvent.actions.entries()) {
      const startFrame = graphEvent.from
        + Math.round((actionIndex * graphEvent.durationInFrames) / (graphEvent.actions.length - 1));

      directives.push({
        id: `${graphEventId}:${entry.id}`,
        name: `${graphEvent.name} ${actionIndex + 1}`,
        startAtSeconds: startFrame / fps,
        durationSeconds: 1 / fps,
        actions: [entry.action],
      });
    }
  }

  return directives;
}

const GRAPH_VIEW_CONFIG = {
  sizing: {
    applyConfidenceScale: true,
    applyRelevanceScale: true,
    defaultClaimShapeSize: {
      width: 320,
      height: 190,
    },
  },
  elk: {
    peerGap: 20,
    layerGap: 180,
    connectorClaimShapeGap: 32,
    favorStraightEdges: true,
    bkFixedAlignment: "LEFTUP" as const,
  },
  connectorGeometry: {
    connectorPathShape: "curved" as const,
    sourceSideStraightSegmentPercent: 0.5,
    targetSideStraightSegmentPercent: 0.3,
    spreadTargetAnchorY: true,
  },
} as const;

type GraphViewProps = {
  debate: Debate;
  from?: number;
  durationInFrames?: number;
  scale?: number;
  children?: ReactNode;
  propagationKeyStates?: PropagationAnimationKeyState[];
  siblingOrderingMode?: SiblingOrderingMode;
  zoomClaimId?: ClaimId;
  zoomTarget?: GraphZoomTarget;
  zoomScale?: number;
  zoomStartFrame?: number;
  zoomDurationInFrames?: number;
  zoomPadding?: number;
};

export const CameraMove = (_props: CameraMoveProps) => null;
export const GraphEvents = (_props: GraphEventsProps) => null;

type GraphViewContentProps = Omit<GraphViewProps, "from" | "durationInFrames">;

function getCameraMoveClaimIds(claimId: string | readonly string[]): string[] {
  if (typeof claimId === "string") {
    return [claimId];
  }

  return [...claimId];
}

function getCameraMoveClaimLabel(claimId: string | readonly string[]): string {
  return getCameraMoveClaimIds(claimId).join(", ");
}

function hasCameraMoveClaimTarget(claimId: string | readonly string[]): boolean {
  return getCameraMoveClaimIds(claimId).length > 0;
}

function getLooseClaimRender(graph: ActiveGraphRenderState, claimId: string): ActiveClaimRender | undefined {
  return (graph.claimByClaimId as Record<string, ActiveClaimRender | undefined>)[claimId];
}

function getClaimBoundsForTarget(
  graph: ActiveGraphRenderState,
  claimIds: string | readonly string[],
): { x: number; y: number; width: number; height: number } | undefined {
  const resolvedClaims = getCameraMoveClaimIds(claimIds)
    .map((claimId) => getLooseClaimRender(graph, claimId));

  if (resolvedClaims.some((claim) => !claim)) {
    return undefined;
  }

  const claims = resolvedClaims as ActiveClaimRender[];
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

function resolveCameraMoveTarget({ claimId, target }: CameraMoveProps): GraphZoomTarget | undefined {
  return target ?? (claimId && hasCameraMoveClaimTarget(claimId) ? { claimId } : undefined);
}

function getSequenceName(move: CameraMoveProps, index: number): string {
  if (move.name) {
    return move.name;
  }

  if (move.reset) {
    return "CameraMove Reset";
  }

  if (move.claimId) {
    return `CameraMove ${getCameraMoveClaimLabel(move.claimId)}`;
  }

  return `CameraMove ${index + 1}`;
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
    if (!isValidElement<CameraMoveProps>(child)) {
      continue;
    }

    if (child.type !== CameraMove) {
      continue;
    }

    const target = resolveCameraMoveTarget(child.props);
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
      name: getSequenceName(child.props, index),
    });
  }

  return [...cameraMoves].sort((left, right) => left.from - right.from);
}

function getGraphEventName(graphEvent: GraphEventsProps, index: number): string {
  if (graphEvent.name) {
    return graphEvent.name;
  }

  if (graphEvent.id) {
    return graphEvent.id;
  }

  return `GraphEvents ${index + 1}`;
}

function resolveGraphEvents(children: ReactNode): ResolvedGraphEvent[] {
  const graphEvents: ResolvedGraphEvent[] = [];

  for (const [index, child] of Children.toArray(children).entries()) {
    if (!isValidElement<GraphEventsProps>(child)) {
      continue;
    }

    if (child.type !== GraphEvents) {
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
      name: getGraphEventName(child.props, index),
    });
  }

  return [...graphEvents].sort((left, right) => left.from - right.from);
}

function getZoomTargetData(
  graph: ActiveGraphRenderState,
  zoomClaimId: ClaimId | undefined,
  zoomTarget: GraphZoomTarget | undefined,
): { x: number; y: number; width?: number; height?: number } | undefined {
  const resolvedTarget = zoomTarget ?? (zoomClaimId ? { claimId: zoomClaimId } : undefined);
  if (!resolvedTarget) {
    return undefined;
  }

  if ("claimId" in resolvedTarget) {
    return getClaimBoundsForTarget(graph, resolvedTarget.claimId);
  }

  return resolvedTarget;
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

async function buildGraphSnapshot(
  debate: CalculatedDebate,
  siblingOrderingMode: SiblingOrderingMode,
): Promise<GraphAnimationSnapshot> {
  const laidOut = await layoutDebate(debate, {
    siblingOrderingMode,
    defaultClaimShapeSize: GRAPH_VIEW_CONFIG.sizing.defaultClaimShapeSize,
    applyConfidenceScale: GRAPH_VIEW_CONFIG.sizing.applyConfidenceScale,
    applyRelevanceScale: GRAPH_VIEW_CONFIG.sizing.applyRelevanceScale,
    peerGap: GRAPH_VIEW_CONFIG.elk.peerGap,
    layerGap: GRAPH_VIEW_CONFIG.elk.layerGap,
    connectorClaimShapeGap: GRAPH_VIEW_CONFIG.elk.connectorClaimShapeGap,
    favorStraightEdges: GRAPH_VIEW_CONFIG.elk.favorStraightEdges,
    bkFixedAlignment: GRAPH_VIEW_CONFIG.elk.bkFixedAlignment,
    connectorPathShape: GRAPH_VIEW_CONFIG.connectorGeometry.connectorPathShape,
    sourceSideStraightSegmentPercent: GRAPH_VIEW_CONFIG.connectorGeometry.sourceSideStraightSegmentPercent,
    targetSideStraightSegmentPercent: GRAPH_VIEW_CONFIG.connectorGeometry.targetSideStraightSegmentPercent,
    spreadTargetAnchorY: GRAPH_VIEW_CONFIG.connectorGeometry.spreadTargetAnchorY,
  });

  if (!laidOut.ok) {
    throw new Error(laidOut.message);
  }

  return buildGraphAnimationSnapshot(laidOut.layout, {
    claimShapeScaleByClaimShapeId: laidOut.render.claimShapeScaleByClaimShapeId,
  });
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function isNumericSvgToken(token: string): boolean {
  return /^-?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(token);
}

function formatSvgNumber(value: number): string {
  const rounded = Number(value.toFixed(3));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function interpolatePathData(fromD: string | null, toD: string | null, progress: number): string | undefined {
  if (!fromD || !toD) {
    return undefined;
  }

  const tokenPattern = /[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  const fromTokens = fromD.match(tokenPattern);
  const toTokens = toD.match(tokenPattern);

  if (!fromTokens || !toTokens || fromTokens.length !== toTokens.length) {
    return undefined;
  }

  const out: string[] = [];
  for (let index = 0; index < fromTokens.length; index += 1) {
    const fromToken = fromTokens[index];
    const toToken = toTokens[index];
    const fromIsNumber = isNumericSvgToken(fromToken);
    const toIsNumber = isNumericSvgToken(toToken);

    if (fromIsNumber !== toIsNumber) {
      return undefined;
    }

    if (!fromIsNumber) {
      if (fromToken !== toToken) {
        return undefined;
      }

      out.push(fromToken);
      continue;
    }

    out.push(formatSvgNumber(lerp(Number(fromToken), Number(toToken), progress)));
  }

  return out.join(" ");
}

function formatScorePercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function buildUnionOrder<T extends string>(preferred: readonly T[], fallback: readonly T[]): T[] {
  return Array.from(new Set([...preferred, ...fallback]));
}

function diffIds<T extends string>(fromIds: readonly T[], toIds: readonly T[]): { inserted: T[]; removed: T[] } {
  const fromSet = new Set(fromIds);
  const toSet = new Set(toIds);

  return {
    inserted: toIds.filter((id) => !fromSet.has(id)),
    removed: fromIds.filter((id) => !toSet.has(id)),
  };
}

function createPresentationSnapshot(
  visualSnapshot: GraphAnimationSnapshot,
  layoutSnapshot: GraphAnimationSnapshot = visualSnapshot,
): PresentationSnapshot {
  return {
    visualSnapshot,
    layoutSnapshot,
  };
}

function mergeClaimVisualWithLayout(
  visualClaim: GraphClaimVisualState | undefined,
  layoutClaim: GraphClaimVisualState | undefined,
): GraphClaimVisualState | undefined {
  if (!visualClaim) {
    return undefined;
  }

  if (!layoutClaim) {
    return visualClaim;
  }

  return {
    ...visualClaim,
    x: layoutClaim.x,
    y: layoutClaim.y,
    width: layoutClaim.width,
    height: layoutClaim.height,
    scale: layoutClaim.scale,
  };
}

function mergeConnectorVisualWithLayout(
  visualConnector: GraphConnectorVisualState | undefined,
  layoutConnector: GraphConnectorVisualState | undefined,
): GraphConnectorVisualState | undefined {
  if (!visualConnector) {
    return undefined;
  }

  if (!layoutConnector) {
    return visualConnector;
  }

  return {
    ...visualConnector,
    pathD: layoutConnector.pathD,
    sourceSideY: layoutConnector.sourceSideY,
    targetSideY: layoutConnector.targetSideY,
  };
}

function buildPresentationStages(
  initialSnapshot: GraphAnimationSnapshot,
  stateFrames: SnapshotFrame[],
): GraphPresentationStage[] {
  const stages: GraphPresentationStage[] = [];
  let previousState = createPresentationSnapshot(initialSnapshot);

  for (let index = 0; index < stateFrames.length; index += 1) {
    const stateFrame = stateFrames[index];
    const nextStartFrame = stateFrames[index + 1]?.frame;
    const claimDiff = diffIds(previousState.visualSnapshot.claimRenderOrder, stateFrame.snapshot.claimRenderOrder);
    const connectorDiff = diffIds(previousState.visualSnapshot.connectorRenderOrder, stateFrame.snapshot.connectorRenderOrder);
    const nextStateFrame = stateFrames[index + 1];
    const nextClaimDiff = nextStateFrame
      ? diffIds(stateFrame.snapshot.claimRenderOrder, nextStateFrame.snapshot.claimRenderOrder)
      : { inserted: [], removed: [] };
    const nextConnectorDiff = nextStateFrame
      ? diffIds(stateFrame.snapshot.connectorRenderOrder, nextStateFrame.snapshot.connectorRenderOrder)
      : { inserted: [], removed: [] };
    const shouldAnchorClaimStageToNextLayout =
      claimDiff.inserted.length > 0
      && claimDiff.removed.length < 1
      && !!nextStateFrame
      && nextClaimDiff.inserted.length < 1
      && nextClaimDiff.removed.length < 1
      && (nextConnectorDiff.inserted.length > 0 || nextConnectorDiff.removed.length > 0);
    const nextState = createPresentationSnapshot(
      stateFrame.snapshot,
      shouldAnchorClaimStageToNextLayout && nextStateFrame
        ? nextStateFrame.snapshot
        : stateFrame.snapshot,
    );
    const kind = claimDiff.inserted.length > 0 || claimDiff.removed.length > 0
      ? "claims"
      : "connectors";
    const defaultDuration = kind === "claims" ? CLAIM_TRANSITION_FRAMES : CONNECTOR_TRANSITION_FRAMES;
    const unclampedEndFrame = stateFrame.frame + defaultDuration;
    const endFrame = nextStartFrame == null
      ? unclampedEndFrame
      : Math.max(stateFrame.frame + 1, Math.min(unclampedEndFrame, nextStartFrame));

    stages.push({
      kind,
      startFrame: stateFrame.frame,
      endFrame,
      fromState: previousState,
      toState: nextState,
      insertedClaimIds: claimDiff.inserted,
      removedClaimIds: claimDiff.removed,
    });

    previousState = nextState;
  }

  return stages;
}

function createHoldRenderState(snapshot: PresentationSnapshot): ActiveGraphRenderState {
  const claimByClaimId = {} as ActiveGraphRenderState["claimByClaimId"];
  const connectorByConnectorId = {} as ActiveGraphRenderState["connectorByConnectorId"];

  for (const claimId of snapshot.visualSnapshot.claimRenderOrder) {
    const claim = mergeClaimVisualWithLayout(
      snapshot.visualSnapshot.claimVisualByClaimId[claimId],
      snapshot.layoutSnapshot.claimVisualByClaimId[claimId],
    );
    if (!claim) continue;

    claimByClaimId[claimId] = {
      ...claim,
      displayedConfidence: claim.confidence,
      opacity: 1,
      insertScale: 1,
    };
  }

  for (const connectorId of snapshot.visualSnapshot.connectorRenderOrder) {
    const connector = mergeConnectorVisualWithLayout(
      snapshot.visualSnapshot.connectorVisualByConnectorId[connectorId],
      snapshot.layoutSnapshot.connectorVisualByConnectorId[connectorId],
    );
    if (!connector) continue;

    connectorByConnectorId[connectorId] = {
      ...connector,
    };
  }

  return {
    width: snapshot.layoutSnapshot.width,
    height: snapshot.layoutSnapshot.height,
    claimRenderOrder: [...snapshot.visualSnapshot.claimRenderOrder],
    connectorRenderOrder: [...snapshot.visualSnapshot.connectorRenderOrder],
    claimByClaimId,
    connectorByConnectorId,
  };
}

function resolveClaimsStage(stage: GraphPresentationStage, progress: number): ActiveGraphRenderState {
  const clamped = Math.max(0, Math.min(1, progress));
  const claimRenderOrder = buildUnionOrder(
    stage.toState.visualSnapshot.claimRenderOrder,
    stage.fromState.visualSnapshot.claimRenderOrder,
  );
  const connectorRenderOrder = buildUnionOrder(
    stage.toState.visualSnapshot.connectorRenderOrder,
    stage.fromState.visualSnapshot.connectorRenderOrder,
  );
  const claimByClaimId = {} as ActiveGraphRenderState["claimByClaimId"];
  const connectorByConnectorId = {} as ActiveGraphRenderState["connectorByConnectorId"];

  for (const claimId of claimRenderOrder) {
    const fromClaim = mergeClaimVisualWithLayout(
      stage.fromState.visualSnapshot.claimVisualByClaimId[claimId],
      stage.fromState.layoutSnapshot.claimVisualByClaimId[claimId],
    );
    const toClaim = mergeClaimVisualWithLayout(
      stage.toState.visualSnapshot.claimVisualByClaimId[claimId],
      stage.toState.layoutSnapshot.claimVisualByClaimId[claimId],
    );

    if (fromClaim && toClaim) {
      claimByClaimId[claimId] = {
        ...toClaim,
        x: lerp(fromClaim.x, toClaim.x, clamped),
        y: lerp(fromClaim.y, toClaim.y, clamped),
        width: lerp(fromClaim.width, toClaim.width, clamped),
        height: lerp(fromClaim.height, toClaim.height, clamped),
        scale: lerp(fromClaim.scale, toClaim.scale, clamped),
        displayedConfidence: lerp(fromClaim.confidence, toClaim.confidence, clamped),
        opacity: 1,
        insertScale: 1,
      };
      continue;
    }

    if (toClaim) {
      claimByClaimId[claimId] = {
        ...toClaim,
        displayedConfidence: toClaim.confidence * clamped,
        opacity: 1,
        insertScale: clamped,
      };
      continue;
    }

    if (fromClaim) {
      claimByClaimId[claimId] = {
        ...fromClaim,
        displayedConfidence: fromClaim.confidence * (1 - clamped),
        opacity: 1 - clamped,
        insertScale: 1 - clamped,
      };
    }
  }

  for (const connectorId of connectorRenderOrder) {
    const fromConnector = mergeConnectorVisualWithLayout(
      stage.fromState.visualSnapshot.connectorVisualByConnectorId[connectorId],
      stage.fromState.layoutSnapshot.connectorVisualByConnectorId[connectorId],
    );
    const toConnector = mergeConnectorVisualWithLayout(
      stage.toState.visualSnapshot.connectorVisualByConnectorId[connectorId],
      stage.toState.layoutSnapshot.connectorVisualByConnectorId[connectorId],
    );

    if (fromConnector && toConnector) {
      connectorByConnectorId[connectorId] = {
        ...toConnector,
        pathD: interpolatePathData(fromConnector.pathD, toConnector.pathD, clamped) ?? (clamped < 0.5 ? fromConnector.pathD : toConnector.pathD),
        strokeWidth: lerp(fromConnector.strokeWidth, toConnector.strokeWidth, clamped),
        referenceStrokeWidth: lerp(fromConnector.referenceStrokeWidth, toConnector.referenceStrokeWidth, clamped),
      };
      continue;
    }

    if (fromConnector) {
      connectorByConnectorId[connectorId] = {
        ...fromConnector,
      };
    }
  }

  return {
    width: lerp(stage.fromState.layoutSnapshot.width, stage.toState.layoutSnapshot.width, clamped),
    height: lerp(stage.fromState.layoutSnapshot.height, stage.toState.layoutSnapshot.height, clamped),
    claimRenderOrder,
    connectorRenderOrder,
    claimByClaimId,
    connectorByConnectorId,
  };
}

function resolveConnectorsStage(stage: GraphPresentationStage, progress: number): ActiveGraphRenderState {
  const clamped = Math.max(0, Math.min(1, progress));
  const propagationProgress = clamped;
  const claimRenderOrder = [...stage.toState.visualSnapshot.claimRenderOrder];
  const connectorRenderOrder = buildUnionOrder(
    stage.toState.visualSnapshot.connectorRenderOrder,
    stage.fromState.visualSnapshot.connectorRenderOrder,
  );
  const claimByClaimId = {} as ActiveGraphRenderState["claimByClaimId"];
  const connectorByConnectorId = {} as ActiveGraphRenderState["connectorByConnectorId"];

  for (const claimId of claimRenderOrder) {
    const fromClaim = mergeClaimVisualWithLayout(
      stage.fromState.visualSnapshot.claimVisualByClaimId[claimId],
      stage.fromState.layoutSnapshot.claimVisualByClaimId[claimId],
    );
    const toClaim = mergeClaimVisualWithLayout(
      stage.toState.visualSnapshot.claimVisualByClaimId[claimId],
      stage.toState.layoutSnapshot.claimVisualByClaimId[claimId],
    );
    if (fromClaim && toClaim) {
      claimByClaimId[claimId] = {
        ...toClaim,
        x: lerp(fromClaim.x, toClaim.x, propagationProgress),
        y: lerp(fromClaim.y, toClaim.y, propagationProgress),
        width: lerp(fromClaim.width, toClaim.width, propagationProgress),
        height: lerp(fromClaim.height, toClaim.height, propagationProgress),
        scale: lerp(fromClaim.scale, toClaim.scale, propagationProgress),
        displayedConfidence: lerp(fromClaim.confidence, toClaim.confidence, propagationProgress),
        opacity: 1,
        insertScale: 1,
      };
      continue;
    }

    const claim = toClaim ?? fromClaim;
    if (!claim) continue;

    claimByClaimId[claimId] = {
      ...claim,
      displayedConfidence: lerp(
        fromClaim?.confidence ?? claim.confidence,
        toClaim?.confidence ?? claim.confidence,
        propagationProgress,
      ),
      opacity: 1,
      insertScale: 1,
    };
  }

  for (const connectorId of connectorRenderOrder) {
    const fromConnector = mergeConnectorVisualWithLayout(
      stage.fromState.visualSnapshot.connectorVisualByConnectorId[connectorId],
      stage.fromState.layoutSnapshot.connectorVisualByConnectorId[connectorId],
    );
    const toConnector = mergeConnectorVisualWithLayout(
      stage.toState.visualSnapshot.connectorVisualByConnectorId[connectorId],
      stage.toState.layoutSnapshot.connectorVisualByConnectorId[connectorId],
    );

    const connector = toConnector ?? fromConnector;
    if (!connector) continue;

    connectorByConnectorId[connectorId] = {
      ...connector,
      pathD: interpolatePathData(fromConnector?.pathD ?? null, toConnector?.pathD ?? null, propagationProgress) ?? connector.pathD,
      strokeWidth: lerp(
        fromConnector?.strokeWidth ?? connector.strokeWidth,
        toConnector?.strokeWidth ?? connector.strokeWidth,
        propagationProgress,
      ),
      referenceStrokeWidth: lerp(
        fromConnector?.referenceStrokeWidth ?? connector.referenceStrokeWidth,
        toConnector?.referenceStrokeWidth ?? connector.referenceStrokeWidth,
        propagationProgress,
      ),
    };
  }

  return {
    width: stage.toState.layoutSnapshot.width,
    height: stage.toState.layoutSnapshot.height,
    claimRenderOrder,
    connectorRenderOrder,
    claimByClaimId,
    connectorByConnectorId,
  };
}

function resolveActiveGraphRenderState(
  initialSnapshot: GraphAnimationSnapshot,
  stages: GraphPresentationStage[],
  frame: number,
): ActiveGraphRenderState {
  let settledSnapshot = createPresentationSnapshot(initialSnapshot);

  for (const stage of stages) {
    if (frame < stage.startFrame) {
      return createHoldRenderState(settledSnapshot);
    }

    if (frame < stage.endFrame) {
      const progress = (frame - stage.startFrame) / Math.max(1, stage.endFrame - stage.startFrame);
      return stage.kind === "claims"
        ? resolveClaimsStage(stage, progress)
        : resolveConnectorsStage(stage, progress);
    }

    settledSnapshot = stage.toState;
  }

  return createHoldRenderState(settledSnapshot);
}

function getConnectorPathStyle(strokeWidth: number): CSSProperties {
  return {
    strokeWidth,
    strokeLinecap: "butt",
    strokeLinejoin: "miter",
  };
}

function renderConnectorPath(
  connector: ActiveConnectorRender,
  useReferenceWidth: boolean,
): ReactNode {
  const classes = ["rt-connector"];
  if (useReferenceWidth) {
    classes.push("rt-connector-potential-confidence");
  }

  return (
    <path
      key={`${useReferenceWidth ? "reference" : "actual"}-${connector.connectorId}`}
      className={classes.join(" ")}
      data-affects={connector.affects}
      data-connector-side={connector.side}
      data-connector-id={connector.connectorId}
      d={connector.pathD}
      pathLength={1}
      style={getConnectorPathStyle(useReferenceWidth ? connector.referenceStrokeWidth : connector.strokeWidth)}
    />
  );
}

function renderClaim(claim: ActiveClaimRender): ReactNode {
  const shellStyle = {
    left: claim.x,
    top: claim.y,
    width: claim.width,
    height: claim.height,
    opacity: claim.opacity,
  } satisfies CSSProperties;

  const claimShapeStyle = {
    width: GRAPH_VIEW_CONFIG.sizing.defaultClaimShapeSize.width,
    height: GRAPH_VIEW_CONFIG.sizing.defaultClaimShapeSize.height,
    "--rt-claim-shape-scale": String(claim.scale),
    "--rt-claim-insert-scale": String(claim.insertScale),
  } as CSSProperties;

  return (
    <article
      key={claim.claimId}
      className="rt-claim-shape-shell"
      style={shellStyle}
      data-claim-id={claim.claimId}
      data-score-id={claim.scoreId ?? undefined}
      data-claim-side={claim.side}
    >
      <div className="rt-claim-shape" style={claimShapeStyle}>
        <article className="rt-claim-shape-body">
          <h2>{claim.label}</h2>
          <small data-score={claim.displayedConfidence} data-score-id={claim.scoreId ?? undefined}>
            {formatScorePercent(claim.displayedConfidence)}
          </small>
        </article>
      </div>
    </article>
  );
}

const GraphViewContent = ({
  debate,
  scale = DEFAULT_GRAPH_SCALE,
  children,
  propagationKeyStates = [],
  siblingOrderingMode = "auto-reorder",
  zoomClaimId,
  zoomTarget,
  zoomScale = DEFAULT_ZOOM_SCALE,
  zoomStartFrame,
  zoomDurationInFrames = DEFAULT_ZOOM_DURATION_FRAMES,
  zoomPadding = DEFAULT_ZOOM_PADDING,
}: GraphViewContentProps) => {
  const frame = useCurrentFrame();
  const { width: frameWidth, height: frameHeight, fps } = useVideoConfig();
  const [snapshotTimeline, setSnapshotTimeline] = useState<SnapshotFrame[] | null>(null);
  const [renderHandle] = useState(() => delayRender("Build graph view"));
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
  const graphEventDirectives = useMemo(
    () => buildGraphEventDirectives(graphEvents, fps),
    [fps, graphEvents],
  );
  const plannedGraphAnimation = useMemo(
    () => buildPropagationAnimation({
      debate,
      directives: graphEventDirectives,
      fps,
      cycleHandling: "fail",
    }),
    [debate, fps, graphEventDirectives],
  );
  if (!plannedGraphAnimation.ok) {
    throw new Error(plannedGraphAnimation.message);
  }
  const initialCalculatedDebate = useMemo<CalculatedDebate>(
    () => ({
      ...debate,
      scores: plannedGraphAnimation.initialScores,
    }),
    [debate, plannedGraphAnimation],
  );
  const resolvedPropagationKeyStates = useMemo(
    () => [...propagationKeyStates, ...plannedGraphAnimation.keyStates].sort((left, right) => left.frame - right.frame),
    [plannedGraphAnimation, propagationKeyStates],
  );
  const propagationSequences = useMemo(() => {
    if (resolvedPropagationKeyStates.length < 1) {
      return [];
    }

    const sorted = [...resolvedPropagationKeyStates];
    return sorted.map((state, index) => ({
      from: state.frame,
      durationInFrames: Math.max(1, (sorted[index + 1]?.frame ?? state.frame + 1) - state.frame),
      name: `${state.directiveName ?? state.directiveId} Step ${state.actionIndex + 1}`,
    }));
  }, [resolvedPropagationKeyStates]);

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      const initialSnapshot = await buildGraphSnapshot(initialCalculatedDebate, siblingOrderingMode);
      const sortedKeyStates = [...resolvedPropagationKeyStates];
      const frames: SnapshotFrame[] = [];

      for (const keyState of sortedKeyStates) {
        frames.push({
          frame: keyState.frame,
          snapshot: await buildGraphSnapshot({
            ...keyState.debate,
            scores: keyState.scores,
          }, siblingOrderingMode),
        });
      }

      if (!isActive) {
        return;
      }

      setSnapshotTimeline([{ frame: 0, snapshot: initialSnapshot }, ...frames]);
      continueRender(renderHandle);
    };

    run().catch((error: unknown) => {
      cancelRender(error instanceof Error ? error : new Error(String(error)));
    });

    return () => {
      isActive = false;
    };
  }, [initialCalculatedDebate, renderHandle, resolvedPropagationKeyStates, siblingOrderingMode]);

  const presentationStages = useMemo(() => {
    if (!snapshotTimeline || snapshotTimeline.length < 2) {
      return [];
    }

    return buildPresentationStages(
      snapshotTimeline[0].snapshot,
      snapshotTimeline.slice(1),
    );
  }, [snapshotTimeline]);

  if (!snapshotTimeline || snapshotTimeline.length < 1) {
    return null;
  }

  const activeGraph = resolveActiveGraphRenderState(
    snapshotTimeline[0].snapshot,
    presentationStages,
    frame,
  );

  let animatedScale = scale;
  let contentTranslateX = 0;
  let contentTranslateY = 0;

  for (const cameraMove of cameraMoves) {
    if (frame < cameraMove.from) {
      break;
    }

    let resolvedZoomScale = cameraMove.reset ? scale : cameraMove.scale;
    let targetTranslateX = 0;
    let targetTranslateY = 0;

    if (!cameraMove.reset) {
      const zoomTargetData = getZoomTargetData(activeGraph, undefined, cameraMove.target);
      if (!zoomTargetData) {
        continue;
      }

      resolvedZoomScale = resolveZoomScale(
        zoomTargetData,
        frameWidth,
        frameHeight,
        cameraMove.padding,
        cameraMove.scale,
      );
      targetTranslateX = (activeGraph.width / 2 - zoomTargetData.x) * resolvedZoomScale;
      targetTranslateY = (activeGraph.height / 2 - zoomTargetData.y) * resolvedZoomScale;
    }

    const moveEndFrame = cameraMove.from + cameraMove.durationInFrames;
    if (frame >= moveEndFrame) {
      animatedScale = resolvedZoomScale;
      contentTranslateX = targetTranslateX;
      contentTranslateY = targetTranslateY;
      continue;
    }

    const zoomMotion = getZoomMotionState({
      frame,
      startFrame: cameraMove.from,
      durationInFrames: cameraMove.durationInFrames,
      startScale: animatedScale,
      endScale: resolvedZoomScale,
      startTranslateX: contentTranslateX,
      endTranslateX: targetTranslateX,
      startTranslateY: contentTranslateY,
      endTranslateY: targetTranslateY,
    });

    animatedScale = zoomMotion.scale;
    contentTranslateX = zoomMotion.translateX;
    contentTranslateY = zoomMotion.translateY;
    break;
  }

  const wrapperStyle = {
    width: activeGraph.width * animatedScale,
    height: activeGraph.height * animatedScale,
  } satisfies CSSProperties;

  const contentStyle = {
    width: activeGraph.width,
    height: activeGraph.height,
    transform: `translate(-50%, -50%) translate(${contentTranslateX}px, ${contentTranslateY}px) scale(${animatedScale})`,
  } satisfies CSSProperties;

  return (
    <>
      <div className="rt-graph-view" style={wrapperStyle} aria-label="Reason Tracker graph">
        <div className="rt-graph-view__content" style={contentStyle}>
          <div className="rt-layout-canvas" style={{ width: activeGraph.width, height: activeGraph.height }}>
            <svg className="rt-connector-layer" width={activeGraph.width} height={activeGraph.height} viewBox={`0 0 ${activeGraph.width} ${activeGraph.height}`} aria-hidden="true">
              {activeGraph.connectorRenderOrder.flatMap((connectorId) => {
                const connector = activeGraph.connectorByConnectorId[connectorId];
                return connector
                  ? [renderConnectorPath(connector, true), renderConnectorPath(connector, false)]
                  : [];
              })}
            </svg>
            {activeGraph.claimRenderOrder.map((claimId) => {
              const claim = activeGraph.claimByClaimId[claimId];
              return claim ? renderClaim(claim) : null;
            })}
          </div>
        </div>
      </div>
      {cameraMoves.map((cameraMove) => (
        <Sequence
          key={`${cameraMove.name}-${cameraMove.from}-${cameraMove.durationInFrames}`}
          from={cameraMove.from}
          durationInFrames={cameraMove.durationInFrames}
          name={cameraMove.name}
          layout="none"
        >
          <span style={{ display: "none" }} />
        </Sequence>
      ))}
      {propagationSequences.map((sequence) => (
        <Sequence
          key={`${sequence.name}-${sequence.from}-${sequence.durationInFrames}`}
          from={sequence.from}
          durationInFrames={sequence.durationInFrames}
          name={`Propagation ${sequence.name}`}
          layout="none"
        >
          <span style={{ display: "none" }} />
        </Sequence>
      ))}
    </>
  );
};

export const GraphView = ({
  from = DEFAULT_GRAPH_FROM,
  durationInFrames,
  ...contentProps
}: GraphViewProps) => {
  return (
    <Sequence from={from} durationInFrames={durationInFrames} name="GraphView" layout="none">
      <GraphViewContent {...contentProps} />
    </Sequence>
  );
};
