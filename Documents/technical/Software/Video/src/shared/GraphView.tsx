import { Children, isValidElement, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { ClaimId, Debate } from "@reasontracker/contracts";
import { runCli } from "@reasontracker/engine";
import {
  buildLayoutModel,
  computeContributorNodeSizing,
  placeLayoutWithElk,
  renderWebGraph,
  type WebGraph,
} from "@reasontracker/renderer";
import { cancelRender, continueRender, delayRender, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { getZoomMotionState } from "./zoomMotion.ts";

// AGENT NOTE: Keep GraphView tuning constants grouped here when adjusting layout or camera motion.
const DEFAULT_GRAPH_FROM = 0;
const DEFAULT_GRAPH_SCALE = 1.65;
const DEFAULT_ZOOM_SCALE = 3.4;
const DEFAULT_ZOOM_DURATION_FRAMES = 78;
const DEFAULT_ZOOM_PADDING = 120;

type GraphZoomTarget =
  | { claimId: ClaimId }
  | { x: number; y: number; width?: number; height?: number };

export type CameraMoveProps = {
  from: number;
  durationInFrames?: number;
  reset?: boolean;
  claimId?: ClaimId;
  target?: GraphZoomTarget;
  scale?: number;
  padding?: number;
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
  zoomClaimId?: ClaimId;
  zoomTarget?: GraphZoomTarget;
  zoomScale?: number;
  zoomStartFrame?: number;
  zoomDurationInFrames?: number;
  zoomPadding?: number;
};

export const CameraMove = (_props: CameraMoveProps) => null;

type GraphViewContentProps = Omit<GraphViewProps, "from" | "durationInFrames">;

function resolveCameraMoveTarget({ claimId, target }: CameraMoveProps): GraphZoomTarget | undefined {
  return target ?? (claimId ? { claimId } : undefined);
}

function getSequenceName(move: CameraMoveProps, index: number): string {
  if (move.name) {
    return move.name;
  }

  if (move.reset) {
    return "CameraMove Reset";
  }

  if (move.claimId) {
    return `CameraMove ${move.claimId}`;
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

function getZoomTargetData(
  graph: WebGraph,
  zoomClaimId: ClaimId | undefined,
  zoomTarget: GraphZoomTarget | undefined,
): { x: number; y: number; width?: number; height?: number } | undefined {
  const resolvedTarget = zoomTarget ?? (zoomClaimId ? { claimId: zoomClaimId } : undefined);

  if (!resolvedTarget) {
    return undefined;
  }

  if ("claimId" in resolvedTarget) {
    const focusBounds = graph.claimBoundsByClaimId[resolvedTarget.claimId];
    if (!focusBounds) {
      return undefined;
    }

    return {
      x: focusBounds.x + focusBounds.width / 2,
      y: focusBounds.y + focusBounds.height / 2,
      width: focusBounds.width,
      height: focusBounds.height,
    };
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

async function renderGraph(debate: Debate): Promise<WebGraph> {
  const calculation = runCli({
    command: "calculateDebate",
    debate,
    cycleHandling: "fail",
  });

  if (!calculation.ok) {
    throw new Error(`calculateDebate failed: ${calculation.error.code} ${calculation.error.message}`);
  }

  const built = buildLayoutModel({
    calculatedDebate: calculation.calculatedDebate,
    cycleMode: "preserve",
  });

  if (!built.ok) {
    throw new Error(`buildLayoutModel failed: ${built.error.code} ${built.error.message}`);
  }

  const contributorSizing = computeContributorNodeSizing(built.model, GRAPH_VIEW_CONFIG.sizing);
  const placed = await placeLayoutWithElk(built.model, {
    defaultClaimShapeSize: GRAPH_VIEW_CONFIG.sizing.defaultClaimShapeSize,
    claimShapeSizeByClaimShapeId: contributorSizing.claimShapeSizeByClaimShapeId,
    ...GRAPH_VIEW_CONFIG.elk,
    ...GRAPH_VIEW_CONFIG.connectorGeometry,
  });

  if (!placed.ok) {
    throw new Error(`placeLayoutWithElk failed: ${placed.error.code} ${placed.error.message}`);
  }

  return renderWebGraph(placed.model, {
    includeScore: true,
    useClaimShapeTransformScale: true,
    claimShapeScaleByClaimShapeId: contributorSizing.claimShapeScaleByClaimShapeId,
    claimShapeTransformBaseSize: GRAPH_VIEW_CONFIG.sizing.defaultClaimShapeSize,
  });
}

const GraphViewContent = ({
  debate,
  scale = DEFAULT_GRAPH_SCALE,
  children,
  zoomClaimId,
  zoomTarget,
  zoomScale = DEFAULT_ZOOM_SCALE,
  zoomStartFrame,
  zoomDurationInFrames = DEFAULT_ZOOM_DURATION_FRAMES,
  zoomPadding = DEFAULT_ZOOM_PADDING,
}: GraphViewContentProps) => {
  const frame = useCurrentFrame();
  const { width: frameWidth, height: frameHeight } = useVideoConfig();
  const [graph, setGraph] = useState<WebGraph | null>(null);
  const [renderHandle] = useState(() => delayRender("Build graph view"));
  const cameraMoves = useMemo(
    () => resolveCameraMoves(children, zoomClaimId, zoomTarget, zoomScale, zoomStartFrame, zoomDurationInFrames, zoomPadding),
    [children, zoomClaimId, zoomTarget, zoomScale, zoomStartFrame, zoomDurationInFrames, zoomPadding],
  );

  useEffect(() => {
    let isActive = true;

    renderGraph(debate)
      .then((nextGraph) => {
        if (!isActive) {
          return;
        }

        setGraph(nextGraph);
        continueRender(renderHandle);
      })
      .catch((error: unknown) => {
        cancelRender(error instanceof Error ? error : new Error(String(error)));
      });

    return () => {
      isActive = false;
    };
  }, [debate, renderHandle]);

  if (!graph) {
    return null;
  }

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
      const zoomTargetData = getZoomTargetData(graph, undefined, cameraMove.target);

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
      targetTranslateX = (graph.width / 2 - zoomTargetData.x) * resolvedZoomScale;
      targetTranslateY = (graph.height / 2 - zoomTargetData.y) * resolvedZoomScale;
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
    width: graph.width * animatedScale,
    height: graph.height * animatedScale,
  } satisfies CSSProperties;

  const contentStyle = {
    width: graph.width,
    height: graph.height,
    transform: `translate(-50%, -50%) translate(${contentTranslateX}px, ${contentTranslateY}px) scale(${animatedScale})`,
  } satisfies CSSProperties;

  return (
    <>
      <div className="rt-graph-view" style={wrapperStyle} aria-label="Reason Tracker graph">
        <div className="rt-graph-view__content" style={contentStyle} dangerouslySetInnerHTML={{ __html: graph.html }} />
      </div>
      {cameraMoves.map((cameraMove) => (
        <Sequence
          key={`${cameraMove.name}-${cameraMove.from}-${cameraMove.durationInFrames}`}
          from={cameraMove.from}
          durationInFrames={cameraMove.durationInFrames}
          name={cameraMove.name}
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
