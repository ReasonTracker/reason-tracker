import { useEffect, useState, type CSSProperties } from "react";
import type { ClaimId, Debate } from "@reasontracker/contracts";
import { runCli } from "@reasontracker/engine";
import {
  buildLayoutModel,
  computeContributorNodeSizing,
  placeLayoutWithElk,
  renderWebGraph,
  type WebGraph,
} from "@reasontracker/renderer";
import { cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { getZoomMotionState } from "./zoomMotion.ts";

const DEFAULT_GRAPH_SCALE = 1.65;
const DEFAULT_ZOOM_SCALE = 3.4;
const DEFAULT_ZOOM_DURATION_FRAMES = 78;
const DEFAULT_ZOOM_PADDING = 120;

type GraphZoomTarget =
  | { claimId: ClaimId }
  | { x: number; y: number; width?: number; height?: number };

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
  scale?: number;
  zoomClaimId?: ClaimId;
  zoomTarget?: GraphZoomTarget;
  zoomScale?: number;
  zoomStartFrame?: number;
  zoomDurationInFrames?: number;
  zoomPadding?: number;
};

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

export const GraphView = ({
  debate,
  scale = DEFAULT_GRAPH_SCALE,
  zoomClaimId,
  zoomTarget,
  zoomScale = DEFAULT_ZOOM_SCALE,
  zoomStartFrame,
  zoomDurationInFrames = DEFAULT_ZOOM_DURATION_FRAMES,
  zoomPadding = DEFAULT_ZOOM_PADDING,
}: GraphViewProps) => {
  const frame = useCurrentFrame();
  const { width: frameWidth, height: frameHeight } = useVideoConfig();
  const [graph, setGraph] = useState<WebGraph | null>(null);
  const [renderHandle] = useState(() => delayRender("Build graph view"));

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

  const zoomTargetData = getZoomTargetData(graph, zoomClaimId, zoomTarget);
  const resolvedZoomScale = resolveZoomScale(zoomTargetData, frameWidth, frameHeight, zoomPadding, zoomScale);
  const zoomMotion = zoomTargetData != null && zoomStartFrame != null
    ? getZoomMotionState({
        frame,
        startFrame: zoomStartFrame,
        durationInFrames: zoomDurationInFrames,
        startScale: scale,
        endScale: resolvedZoomScale,
        targetOffsetX: graph.width / 2 - zoomTargetData.x,
        targetOffsetY: graph.height / 2 - zoomTargetData.y,
      })
    : undefined;
  const animatedScale = zoomMotion?.scale ?? scale;
  const contentTranslateX = zoomMotion?.translateX ?? 0;
  const contentTranslateY = zoomMotion?.translateY ?? 0;

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
    <div className="rt-graph-view" style={wrapperStyle} aria-label="Reason Tracker graph">
      <div className="rt-graph-view__content" style={contentStyle} dangerouslySetInnerHTML={{ __html: graph.html }} />
    </div>
  );
};