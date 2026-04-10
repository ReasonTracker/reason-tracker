import type {
    LayoutModel,
    PositionedLayoutModel,
    PositionedLayoutNode as PositionedLayoutClaimShape,
} from "./layout/types.ts";
import { orderConnectorShapeIdsForTarget } from "./layout/orderConnectorShapesForTarget.ts";

// Connector line-shape profile (hardcoded during design iteration).
// Percentages are applied to a per-target baseline horizontal gap.
const SOURCE_SIDE_STRAIGHT_SEGMENT_PERCENT = 0.5;
const TARGET_SIDE_STRAIGHT_SEGMENT_MIN_PERCENT = 0.1;
const TARGET_SIDE_STRAIGHT_SEGMENT_MAX_PERCENT = 0.5;

export interface RenderWebDocumentOptions {
    title?: string;
    includeScore?: boolean;
    density?: "comfortable" | "compact";
    brandCssHref?: string;
    useClaimShapeTransformScale?: boolean;
    claimShapeScaleByClaimShapeId?: Record<string, number>;
    claimShapeTransformBaseSize?: {
        width: number;
        height: number;
    };
}

export interface WebDocument {
    html: string;
    css: string;
}

export function renderWebDocument(
    model: LayoutModel | PositionedLayoutModel,
    options: RenderWebDocumentOptions = {},
): WebDocument {
    const title = options.title ?? "Reason Tracker";
    const includeScore = options.includeScore ?? true;
    const density = options.density ?? "comfortable";
    const brandCssHref = options.brandCssHref?.trim();
    const useClaimShapeTransformScale = options.useClaimShapeTransformScale ?? false;
    const claimShapeScaleByClaimShapeId = options.claimShapeScaleByClaimShapeId ?? {};
    const claimShapeTransformBaseSize = options.claimShapeTransformBaseSize;
    const css = renderWebCss({ density });

    const bodyContent = isPositionedLayoutModel(model)
        ? renderPositionedContent(model, includeScore, {
              useClaimShapeTransformScale,
              claimShapeScaleByClaimShapeId,
              claimShapeTransformBaseSize,
          })
        : renderListContent(model, includeScore);

    const html = [
        "<!doctype html>",
        "<html lang=\"en\">",
        "<head>",
        "<meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        `<title>${escapeHtml(title)}</title>`,
        ...(brandCssHref ? [`<link rel=\"stylesheet\" href=\"${escapeHtml(brandCssHref)}\">`] : []),
        "<style>",
        css,
        "</style>",
        "</head>",
        "<body>",
        `<main data-cycle-mode="${escapeHtml(model.cycleMode)}">`,
        `<h1>${escapeHtml(title)}</h1>`,
        `<p>Root: ${escapeHtml(model.rootClaimShapeId)}</p>`,
        bodyContent,
        "</main>",
        "</body>",
        "</html>",
    ].join("\n");

    return {
        html,
        css,
    };
}

export interface RenderWebCssOptions {
    density?: "comfortable" | "compact";
}

export function renderWebCss(options: RenderWebCssOptions = {}): string {
    const density = options.density ?? "comfortable";
    const rowGap = density === "compact" ? "0.25rem" : "0.5rem";

    return [
        ":root {",
        "  --rt-font: 'IBM Plex Sans', 'Segoe UI', sans-serif;",
        "  --rt-fg: #1f2937;",
        "  --rt-muted: #6b7280;",
        "  --rt-bg: #000000;",
        "  --rt-connector-opacity: 90%;",
        "  --rt-connector-potential-opacity: 30%;",
        "}",
        "body {",
        "  margin: 0;",
        "  min-height: 100vh;",
        "  font-family: var(--rt-font);",
        "  color: var(--rt-fg);",
        "  background: var(--rt-bg);",
        "}",
        "main {",
        "  height: 100vh;",
        "  padding: 0.35rem 0.5rem 0.5rem;",
        "  display: flex;",
        "  flex-direction: column;",
        "  gap: 0.2rem;",
        "}",
        "h1 {",
        "  margin: 0;",
        "  font-size: 0.95rem;",
        "  line-height: 1.05;",
        "  white-space: nowrap;",
        "  overflow: hidden;",
        "  text-overflow: ellipsis;",
        "}",
        "p {",
        "  margin: 0;",
        "  font-size: 0.72rem;",
        "  color: var(--rt-muted);",
        "}",
        ".rt-layout-stage {",
        "  flex: 1 1 auto;",
        "  min-height: 0;",
        "  overflow: auto;",
        "  border: 1px solid #d1d5db;",
        "  border-radius: 0.75rem;",
        "  background: #000000;",
        "}",
        ".rt-layout-canvas {",
        "  position: relative;",
        "  background: #000000;",
        "}",
        ".rt-edge-layer {",
        "  position: absolute;",
        "  inset: 0;",
        "  overflow: visible;",
        "  pointer-events: none;",
        "}",
        ".rt-edge {",
        "  fill: none;",
        "  stroke: #64748b;",
        "  opacity: var(--rt-connector-opacity);",
        "  stroke-width: 2;",
        "  stroke-linecap: butt;",
        "}",
        ".rt-edge.rt-edge-potential-confidence {",
        "  opacity: var(--rt-connector-potential-opacity);",
        "}",
        ".rt-edge[data-connector-side='proMain'] {",
        "  stroke: var(--pro);",
        "}",
        ".rt-edge[data-connector-side='conMain'] {",
        "  stroke: var(--con);",
        "}",
        ".rt-edge[data-affects='relevance'] {",
        "  stroke-dasharray: 6 5;",
        "}",
        ".rt-node {",
        "  box-sizing: border-box;",
        "  position: absolute;",
        "  left: 50%;",
        "  top: 50%;",
        "  transform-origin: center center;",
        "  transform: translate(-50%, -50%) scale(var(--rt-node-scale, 1));",
        "}",
        ".rt-node-shell {",
        "  position: absolute;",
        "  overflow: visible;",
        "}",
        ".rt-node-body {",
        "  box-sizing: border-box;",
        "  width: 100%;",
        "  height: 100%;",
        "  background: #000000;",
        "  color: #ffffff;",
        "  border: 4px solid #cbd5e1;",
        "  border-radius: 0;",
        "  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);",
        "  padding: 0.5rem 0.75rem;",
        "  overflow: auto;",
        "}",
        ".rt-node-shell[data-claim-side='proMain'] .rt-node-body {",
        "  border-color: var(--pro);",
        "  background: hsl(var(--pro-h) 100% var(--pro-l) / var(--rt-connector-potential-opacity));",
        "}",
        ".rt-node-shell[data-claim-side='conMain'] .rt-node-body {",
        "  border-color: var(--con);",
        "  background: hsl(var(--con-h) 100% var(--con-l) / var(--rt-connector-potential-opacity));",
        "}",
        ".rt-node h2 {",
        "  margin: 0;",
        "  font-size: 1.9rem;",
        "}",
        ".rt-node small {",
        "  display: block;",
        "  margin-top: 0.35rem;",
        "  color: #d1d5db;",
        "}",
        "ul {",
        "  list-style: none;",
        "  padding: 0;",
        "  display: grid;",
        `  gap: ${rowGap};`,
        "}",
        "li {",
        "  background: white;",
        "  border: 1px solid #e5e7eb;",
        "  border-radius: 0.5rem;",
        "  padding: 0.5rem 0.75rem;",
        "}",
        "small {",
        "  color: var(--rt-muted);",
        "}",
    ].join("\n");
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function encodeDataJson(value: unknown): string {
    return escapeHtml(JSON.stringify(value));
}

function isPositionedLayoutModel(model: LayoutModel | PositionedLayoutModel): model is PositionedLayoutModel {
    return "layoutEngine" in model;
}

function formatConfidencePercent(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
}

function renderListContent(model: LayoutModel, includeScore: boolean): string {
    const claimShapes = Object.values(model.claimShapes).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

    const items = claimShapes
        .map((claimShape) => {
            const scoreSnippet = includeScore && claimShape.score
                ? ` <small data-score="${escapeHtml(String(claimShape.score.confidence))}">${escapeHtml(formatConfidencePercent(claimShape.score.confidence))}</small>`
                : "";

            return `<li data-claim-shape-id="${escapeHtml(claimShape.id)}" data-claim-id="${escapeHtml(claimShape.claimId)}" data-depth="${claimShape.depth}"><strong>${escapeHtml(claimShape.claimId)}</strong>${scoreSnippet}</li>`;
        })
        .join("\n");

    return [
        "<ul>",
        items,
        "</ul>",
    ].join("\n");
}

interface RenderPositionedClaimShapeOptions {
    useClaimShapeTransformScale: boolean;
    claimShapeScaleByClaimShapeId: Record<string, number>;
    claimShapeTransformBaseSize?: {
        width: number;
        height: number;
    };
}

function renderPositionedContent(
    model: PositionedLayoutModel,
    includeScore: boolean,
    options: RenderPositionedClaimShapeOptions,
): string {
    const canvasWidth = Math.max(1, Math.ceil(model.layoutBounds.width));
    const canvasHeight = Math.max(1, Math.ceil(model.layoutBounds.height));

    const sortedConnectorShapes = Object.values(model.connectorShapes)
        .sort((a, b) => a.id.localeCompare(b.id));

    const connectorShapeStrokeWidthByConnectorShapeId: Record<string, number> = {};
    const connectorShapeReferenceStrokeWidthByConnectorShapeId: Record<string, number> = {};
    const connectorShapeIdsByTargetClaimShapeId: Record<string, string[]> = {};

    for (const connectorShape of sortedConnectorShapes) {
        const sourceClaimShape = model.claimShapes[connectorShape.sourceClaimShapeId];
        if (!sourceClaimShape) continue;

        const sourceConfidence = sourceClaimShape.score?.confidence ?? 1;
        const sourceRenderedHeight = getRenderedClaimShapeHeight(sourceClaimShape, options);
        connectorShapeStrokeWidthByConnectorShapeId[connectorShape.id] = sourceRenderedHeight * sourceConfidence;
        connectorShapeReferenceStrokeWidthByConnectorShapeId[connectorShape.id] = sourceRenderedHeight;
        (connectorShapeIdsByTargetClaimShapeId[connectorShape.targetClaimShapeId] ??= []).push(connectorShape.id);
    }

    const connectorShapeStartYByConnectorShapeId: Record<string, number> = {};
    const connectorShapeTargetApproachFactorByConnectorShapeId: Record<string, number> = {};
    const horizontalGapByTargetClaimShapeId: Record<string, number> = {};
    for (const [targetClaimShapeId, connectorShapeIds] of Object.entries(connectorShapeIdsByTargetClaimShapeId)) {
        const targetClaimShape = model.claimShapes[targetClaimShapeId];
        if (!targetClaimShape) continue;

        const targetSideX = targetClaimShape.x + targetClaimShape.width;
        let nearestSourceSideX = Number.POSITIVE_INFINITY;
        for (const connectorShapeId of connectorShapeIds) {
            const connectorShape = model.connectorShapes[connectorShapeId];
            if (!connectorShape) continue;

            const sourceClaimShape = model.claimShapes[connectorShape.sourceClaimShapeId];
            if (!sourceClaimShape) continue;

            nearestSourceSideX = Math.min(nearestSourceSideX, sourceClaimShape.x);
        }
        horizontalGapByTargetClaimShapeId[targetClaimShapeId] =
            Number.isFinite(nearestSourceSideX)
                ? (nearestSourceSideX - targetSideX)
                : 0;

        const orderedConnectorShapeIds = orderConnectorShapeIdsForTarget(model, connectorShapeIds);

        const yByConnectorShapeId = computeStackedAnchorYByConnectorShapeId(
            orderedConnectorShapeIds,
            connectorShapeStrokeWidthByConnectorShapeId,
            targetClaimShape,
        );
        Object.assign(connectorShapeStartYByConnectorShapeId, yByConnectorShapeId);

        const centerY = targetClaimShape.y + targetClaimShape.height / 2;
        let maxDistanceFromCenter = 0;
        for (const connectorShapeId of orderedConnectorShapeIds) {
            const y = yByConnectorShapeId[connectorShapeId];
            if (y === undefined) continue;
            maxDistanceFromCenter = Math.max(maxDistanceFromCenter, Math.abs(y - centerY));
        }

        for (const connectorShapeId of orderedConnectorShapeIds) {
            const y = yByConnectorShapeId[connectorShapeId];
            if (y === undefined || maxDistanceFromCenter === 0) {
                connectorShapeTargetApproachFactorByConnectorShapeId[connectorShapeId] = 1;
                continue;
            }

            const distanceFromCenter = Math.abs(y - centerY);
            const centeredness = 1 - Math.min(1, distanceFromCenter / maxDistanceFromCenter);
            connectorShapeTargetApproachFactorByConnectorShapeId[connectorShapeId] = centeredness;
        }
    }

    const connectorShapeCurveByConnectorShapeId: Record<string, string> = {};

    const connectorShapeLines = sortedConnectorShapes
        .map((connectorShape) => {
            const targetClaimShape = model.claimShapes[connectorShape.targetClaimShapeId];
            const sourceClaimShape = model.claimShapes[connectorShape.sourceClaimShapeId];
            if (!targetClaimShape || !sourceClaimShape) return "";
            const connectorMainSide = sourceClaimShape.claim.side;

            const strokeWidth = connectorShapeStrokeWidthByConnectorShapeId[connectorShape.id] ?? 2;

            const targetSideX = targetClaimShape.x + targetClaimShape.width;
            const targetSideY = connectorShapeStartYByConnectorShapeId[connectorShape.id] ?? (targetClaimShape.y + targetClaimShape.height / 2);
            const sourceSideX = sourceClaimShape.x;
            const sourceSideY = sourceClaimShape.y + sourceClaimShape.height / 2;
            const targetHorizontalGap = horizontalGapByTargetClaimShapeId[connectorShape.targetClaimShapeId] ?? 0;
            const sourceSideStraightSegment = targetHorizontalGap * SOURCE_SIDE_STRAIGHT_SEGMENT_PERCENT;
            const targetApproachFactor = connectorShapeTargetApproachFactorByConnectorShapeId[connectorShape.id] ?? 1;
            const targetSideStraightSegment = targetHorizontalGap * (
                TARGET_SIDE_STRAIGHT_SEGMENT_MIN_PERCENT
                + targetApproachFactor * (TARGET_SIDE_STRAIGHT_SEGMENT_MAX_PERCENT - TARGET_SIDE_STRAIGHT_SEGMENT_MIN_PERCENT)
            );
            const sourceElbowX = targetSideX + targetHorizontalGap - sourceSideStraightSegment;
            const d = `M ${targetSideX} ${targetSideY} C ${targetSideX + targetSideStraightSegment} ${targetSideY}, ${sourceElbowX} ${sourceSideY}, ${sourceSideX} ${sourceSideY}`;
            connectorShapeCurveByConnectorShapeId[connectorShape.id] = d;

            return [
                `<path class="rt-edge" data-affects="${escapeHtml(String(connectorShape.affects))}" data-target-relation="${escapeHtml(connectorShape.targetRelation)}" data-connector-side="${escapeHtml(connectorMainSide)}" data-connector-json="${encodeDataJson(connectorShape.connector)}" style="stroke-width:${strokeWidth}" d="${escapeHtml(d)}" />`,
            ].join("\n");
        })
        .join("\n");

    const potentialConfidenceConnectorShapeLines = sortedConnectorShapes
        .map((connectorShape) => {
            const sourceClaimShape = model.claimShapes[connectorShape.sourceClaimShapeId];
            if (!sourceClaimShape) return "";
            const connectorMainSide = sourceClaimShape.claim.side;
            const d = connectorShapeCurveByConnectorShapeId[connectorShape.id];
            if (!d) return "";

            const referenceStrokeWidth = connectorShapeReferenceStrokeWidthByConnectorShapeId[connectorShape.id] ?? 2;

            return `<path class="rt-edge rt-edge-potential-confidence" data-affects="${escapeHtml(String(connectorShape.affects))}" data-target-relation="${escapeHtml(connectorShape.targetRelation)}" data-connector-side="${escapeHtml(connectorMainSide)}" data-connector-json="${encodeDataJson(connectorShape.connector)}" style="stroke-width:${referenceStrokeWidth}" d="${escapeHtml(d)}" />`;
        })
        .join("\n");

    const claimShapeBlocks = Object.values(model.claimShapes)
        .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
        .map((claimShape) => renderPositionedClaimShape(claimShape, includeScore, options))
        .join("\n");

    return [
        `<section class="rt-layout-stage" aria-label="Graph layout canvas">`,
        `<div class="rt-layout-canvas" style="width:${canvasWidth}px;height:${canvasHeight}px;">`,
        `<svg class="rt-edge-layer" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" aria-hidden="true">`,
        potentialConfidenceConnectorShapeLines,
        connectorShapeLines,
        "</svg>",
        claimShapeBlocks,
        "</div>",
        "</section>",
    ].join("\n");
}

function renderPositionedClaimShape(
    claimShape: PositionedLayoutClaimShape,
    includeScore: boolean,
    options: RenderPositionedClaimShapeOptions,
): string {
    const scoreSnippet = includeScore && claimShape.score
        ? `<small data-score="${escapeHtml(String(claimShape.score.confidence))}">${escapeHtml(formatConfidencePercent(claimShape.score.confidence))}</small>`
        : "";

    const scale = options.useClaimShapeTransformScale
        ? (options.claimShapeScaleByClaimShapeId[claimShape.id] ?? 1)
        : 1;
    const baseWidth = options.useClaimShapeTransformScale
        ? (options.claimShapeTransformBaseSize?.width ?? claimShape.width)
        : claimShape.width;
    const baseHeight = options.useClaimShapeTransformScale
        ? (options.claimShapeTransformBaseSize?.height ?? claimShape.height)
        : claimShape.height;

    const shellStyle = [
        `left:${claimShape.x}px`,
        `top:${claimShape.y}px`,
        `width:${claimShape.width}px`,
        `height:${claimShape.height}px`,
    ].join(";");

    const transformedStyle = [
        `width:${baseWidth}px`,
        `height:${baseHeight}px`,
        `--rt-node-scale:${scale}`,
    ].join(";");

    const scoreDataJson = claimShape.score ? encodeDataJson(claimShape.score) : "";

    return `<article class="rt-node-shell" style="${escapeHtml(shellStyle)}" data-claim-shape-id="${escapeHtml(claimShape.id)}" data-claim-id="${escapeHtml(claimShape.claimId)}" data-depth="${claimShape.depth}" data-claim-side="${escapeHtml(claimShape.claim.side)}" data-claim-json="${encodeDataJson(claimShape.claim)}" data-score-json="${scoreDataJson}"><div class="rt-node" style="${escapeHtml(transformedStyle)}"><article class="rt-node-body"><h2>${escapeHtml(claimShape.claimId)}</h2>${scoreSnippet}</article></div></article>`;
}

function getRenderedClaimShapeHeight(
    claimShape: PositionedLayoutClaimShape,
    options: RenderPositionedClaimShapeOptions,
): number {
    if (!options.useClaimShapeTransformScale) {
        return claimShape.height;
    }

    const baseHeight = options.claimShapeTransformBaseSize?.height ?? claimShape.height;
    const scale = options.claimShapeScaleByClaimShapeId[claimShape.id] ?? 1;

    return baseHeight * scale;
}

function computeStackedAnchorYByConnectorShapeId(
    connectorShapeIds: string[],
    connectorShapeStrokeWidthByConnectorShapeId: Record<string, number>,
    targetClaimShape: PositionedLayoutClaimShape,
): Record<string, number> {
    const gap = 2;
    const centerY = targetClaimShape.y + targetClaimShape.height / 2;
    const totalStackHeight = connectorShapeIds.reduce((sum, connectorShapeId, index) => {
        const strokeWidth = connectorShapeStrokeWidthByConnectorShapeId[connectorShapeId] ?? 0;
        return sum + strokeWidth + (index === 0 ? 0 : gap);
    }, 0);

    const yByConnectorShapeId: Record<string, number> = {};
    let cursorY = centerY - totalStackHeight / 2;

    for (const connectorShapeId of connectorShapeIds) {
        const strokeWidth = connectorShapeStrokeWidthByConnectorShapeId[connectorShapeId] ?? 0;
        yByConnectorShapeId[connectorShapeId] = cursorY + strokeWidth / 2;
        cursorY += strokeWidth + gap;
    }

    return yByConnectorShapeId;
}