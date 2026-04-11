import type {
    LayoutModel,
    PlacedClaimShape,
} from "./layout/types.ts";

export interface RenderWebDocumentOptions {
    // Separation of duties rule:
    // - renderWebDocument is presentational only (HTML/CSS serialization).
    // - connector and anchor geometry must come from layout data.
    // - do not add geometry behavior tests in renderWebDocument tests; test geometry logic in src/layout/*.test.ts.
    title?: string;
    includeScore?: boolean;
    brandCssHref?: string;
    useClaimShapeTransformScale?: boolean;
    claimShapeScaleByClaimShapeId?: Record<string, number>;
    claimShapeTransformBaseSize?: {
        width: number;
        height: number;
    };
}

export interface RenderWebGraphOptions {
    includeScore?: boolean;
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

export interface WebGraph {
    html: string;
    width: number;
    height: number;
    claimBoundsByClaimId: Record<string, {
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
}

export function renderWebDocument(
    model: LayoutModel,
    options: RenderWebDocumentOptions = {},
): WebDocument {
    const title = options.title ?? "Reason Tracker";
    const brandCssHref = options.brandCssHref?.trim();
    const css = renderWebCss();
    const graph = renderWebGraph(model, options);

    const html = [
        "<!doctype html>",
        "<html lang=\"en\">",
        "<head>",
        "<meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        `<title>${escapeHtml(title)}</title>`,
        ...(brandCssHref ? [`<link rel="stylesheet" href="${escapeHtml(brandCssHref)}">`] : []),
        "<style>",
        css,
        "</style>",
        "</head>",
        "<body>",
        `<main data-cycle-mode="${escapeHtml(model.cycleMode)}">`,
        `<h1>${escapeHtml(title)}</h1>`,
        `<p>Root: ${escapeHtml(model.rootClaimShapeId)}</p>`,
        `<section class="rt-layout-stage" aria-label="Graph layout canvas">`,
        graph.html,
        "</section>",
        "</main>",
        "</body>",
        "</html>",
    ].join("\n");

    return {
        html,
        css,
    };
}

export function renderWebGraph(
    model: LayoutModel,
    options: RenderWebGraphOptions = {},
): WebGraph {
    const includeScore = options.includeScore ?? true;
    const useClaimShapeTransformScale = options.useClaimShapeTransformScale ?? false;
    const claimShapeScaleByClaimShapeId = options.claimShapeScaleByClaimShapeId ?? {};
    const claimShapeTransformBaseSize = options.claimShapeTransformBaseSize;
    const canvasSize = getLayoutCanvasSize(model);
    const html = renderLayoutCanvas(model, canvasSize, includeScore, {
        useClaimShapeTransformScale,
        claimShapeScaleByClaimShapeId,
        claimShapeTransformBaseSize,
    });

    return {
        html,
        width: canvasSize.width,
        height: canvasSize.height,
        claimBoundsByClaimId: Object.fromEntries(
            Object.values(model.claimShapes).map((claimShape) => [
                claimShape.claimId,
                {
                    x: claimShape.x,
                    y: claimShape.y,
                    width: claimShape.width,
                    height: claimShape.height,
                },
            ]),
        ),
    };
}

export function renderWebCss(): string {
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
        ".rt-connector-layer {",
        "  position: absolute;",
        "  inset: 0;",
        "  overflow: visible;",
        "  pointer-events: none;",
        "}",
        ".rt-connector {",
        "  fill: none;",
        "  stroke: #64748b;",
        "  opacity: var(--rt-connector-opacity);",
        "  stroke-width: 2;",
        "  stroke-linecap: butt;",
        "}",
        ".rt-connector.rt-connector-potential-confidence {",
        "  opacity: var(--rt-connector-potential-opacity);",
        "}",
        ".rt-connector[data-connector-side='proMain'] {",
        "  stroke: var(--pro);",
        "}",
        ".rt-connector[data-connector-side='conMain'] {",
        "  stroke: var(--con);",
        "}",
        ".rt-connector[data-affects='relevance'] {",
        "  stroke-dasharray: 6 5;",
        "}",
        ".rt-claim-shape {",
        "  box-sizing: border-box;",
        "  position: absolute;",
        "  left: 50%;",
        "  top: 50%;",
        "  transform-origin: center center;",
        "  transform: translate(-50%, -50%) scale(var(--rt-claim-shape-scale, 1));",
        "}",
        ".rt-claim-shape-shell {",
        "  position: absolute;",
        "  overflow: visible;",
        "}",
        ".rt-claim-shape-body {",
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
        ".rt-claim-shape-shell[data-claim-side='proMain'] .rt-claim-shape-body {",
        "  border-color: var(--pro);",
        "  background: hsl(var(--pro-h) 100% var(--pro-l) / var(--rt-connector-potential-opacity));",
        "}",
        ".rt-claim-shape-shell[data-claim-side='conMain'] .rt-claim-shape-body {",
        "  border-color: var(--con);",
        "  background: hsl(var(--con-h) 100% var(--con-l) / var(--rt-connector-potential-opacity));",
        "}",
        ".rt-claim-shape h2 {",
        "  margin: 0;",
        "  font-size: 1.9rem;",
        "}",
        ".rt-claim-shape small {",
        "  display: block;",
        "  margin-top: 0.35rem;",
        "  color: #d1d5db;",
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

function formatConfidencePercent(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
}

interface RenderClaimShapeOptions {
    useClaimShapeTransformScale: boolean;
    claimShapeScaleByClaimShapeId: Record<string, number>;
    claimShapeTransformBaseSize?: {
        width: number;
        height: number;
    };
}

function renderLayoutContent(
    model: LayoutModel,
    includeScore: boolean,
    options: RenderClaimShapeOptions,
): string {
    const canvasSize = getLayoutCanvasSize(model);

    return [
        `<section class="rt-layout-stage" aria-label="Graph layout canvas">`,
        renderLayoutCanvas(model, canvasSize, includeScore, options),
        "</section>",
    ].join("\n");
}

function getLayoutCanvasSize(model: LayoutModel): { width: number; height: number } {
    return {
        width: Math.max(1, Math.ceil(model.layoutBounds.width)),
        height: Math.max(1, Math.ceil(model.layoutBounds.height)),
    };
}

function renderLayoutCanvas(
    model: LayoutModel,
    canvasSize: { width: number; height: number },
    includeScore: boolean,
    options: RenderClaimShapeOptions,
): string {
    const canvasWidth = canvasSize.width;
    const canvasHeight = canvasSize.height;

    const sortedConnectorShapes = model.connectorShapeRenderOrder
        .map((connectorShapeId) => model.connectorShapes[connectorShapeId])
        .filter((connectorShape): connectorShape is NonNullable<typeof connectorShape> => Boolean(connectorShape));

    const connectorShapeLines = sortedConnectorShapes
        .map((connectorShape) => {
            const sourceClaimShape = model.claimShapes[connectorShape.sourceClaimShapeId];
            if (!sourceClaimShape || !connectorShape.geometry) return "";
            const connectorMainSide = sourceClaimShape.claim.side;

            const strokeWidth = connectorShape.geometry.strokeWidth;
            const d = connectorShape.geometry.pathD;

            return [
                `<path class="rt-connector" data-affects="${escapeHtml(String(connectorShape.affects))}" data-target-relation="${escapeHtml(connectorShape.targetRelation)}" data-connector-side="${escapeHtml(connectorMainSide)}" data-connector-json="${encodeDataJson(connectorShape.connector)}" style="stroke-width:${strokeWidth}" d="${escapeHtml(d)}" />`,
            ].join("\n");
        })
        .join("\n");

    const potentialConfidenceConnectorShapeLines = sortedConnectorShapes
        .map((connectorShape) => {
            const sourceClaimShape = model.claimShapes[connectorShape.sourceClaimShapeId];
            if (!sourceClaimShape) return "";
            const connectorMainSide = sourceClaimShape.claim.side;
            const d = connectorShape.geometry?.pathD;
            if (!d) return "";

            const referenceStrokeWidth = connectorShape.geometry?.referenceStrokeWidth ?? 2;

            return `<path class="rt-connector rt-connector-potential-confidence" data-affects="${escapeHtml(String(connectorShape.affects))}" data-target-relation="${escapeHtml(connectorShape.targetRelation)}" data-connector-side="${escapeHtml(connectorMainSide)}" data-connector-json="${encodeDataJson(connectorShape.connector)}" style="stroke-width:${referenceStrokeWidth}" d="${escapeHtml(d)}" />`;
        })
        .join("\n");

    const claimShapeBlocks = model.claimShapeRenderOrder
        .map((claimShapeId) => model.claimShapes[claimShapeId])
        .filter((claimShape): claimShape is NonNullable<typeof claimShape> => Boolean(claimShape))
        .map((claimShape) => renderClaimShape(claimShape, includeScore, options))
        .join("\n");

    return [
        `<div class="rt-layout-canvas" style="width:${canvasWidth}px;height:${canvasHeight}px;">`,
        `<svg class="rt-connector-layer" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" aria-hidden="true">`,
        potentialConfidenceConnectorShapeLines,
        connectorShapeLines,
        "</svg>",
        claimShapeBlocks,
        "</div>",
    ].join("\n");
}

function renderClaimShape(
    claimShape: PlacedClaimShape,
    includeScore: boolean,
    options: RenderClaimShapeOptions,
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
        `--rt-claim-shape-scale:${scale}`,
    ].join(";");

    const scoreDataJson = claimShape.score ? encodeDataJson(claimShape.score) : "";

    return `<article class="rt-claim-shape-shell" style="${escapeHtml(shellStyle)}" data-claim-shape-id="${escapeHtml(claimShape.id)}" data-claim-id="${escapeHtml(claimShape.claimId)}" data-depth="${claimShape.depth}" data-claim-side="${escapeHtml(claimShape.claim.side)}" data-claim-json="${encodeDataJson(claimShape.claim)}" data-score-json="${scoreDataJson}"><div class="rt-claim-shape" style="${escapeHtml(transformedStyle)}"><article class="rt-claim-shape-body"><h2>${escapeHtml(claimShape.claimId)}</h2>${scoreSnippet}</article></div></article>`;
}

