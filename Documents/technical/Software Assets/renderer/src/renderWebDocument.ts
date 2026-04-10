import type {
    LayoutModel,
    PositionedLayoutModel,
    PositionedLayoutNode,
} from "./layout/types.ts";

export interface RenderWebDocumentOptions {
    title?: string;
    includeScore?: boolean;
    density?: "comfortable" | "compact";
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
    const css = renderWebCss({ density });

    const bodyContent = isPositionedLayoutModel(model)
        ? renderPositionedContent(model, includeScore)
        : renderListContent(model, includeScore);

    const html = [
        "<!doctype html>",
        "<html lang=\"en\">",
        "<head>",
        "<meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        `<title>${escapeHtml(title)}</title>`,
        "<style>",
        css,
        "</style>",
        "</head>",
        "<body>",
        `<main data-cycle-mode=\"${escapeHtml(model.cycleMode)}\">`,
        `<h1>${escapeHtml(title)}</h1>`,
        `<p>Root: ${escapeHtml(model.rootNodeId)}</p>`,
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
        "  --rt-bg: #f3f4f6;",
        "}",
        "body {",
        "  margin: 0;",
        "  min-height: 100vh;",
        "  font-family: var(--rt-font);",
        "  color: var(--rt-fg);",
        "  background: linear-gradient(160deg, #f8fafc 0%, var(--rt-bg) 100%);",
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
        "  background: #f8fafc;",
        "}",
        ".rt-layout-canvas {",
        "  position: relative;",
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
        "  stroke-width: 2;",
        "  stroke-linecap: round;",
        "}",
        ".rt-edge[data-pro-target='true'] {",
        "  stroke: #166534;",
        "}",
        ".rt-edge[data-pro-target='false'] {",
        "  stroke: #991b1b;",
        "}",
        ".rt-edge[data-affects='relevance'] {",
        "  stroke-dasharray: 6 5;",
        "}",
        ".rt-node {",
        "  position: absolute;",
        "  background: white;",
        "  border: 1px solid #cbd5e1;",
        "  border-radius: 0.5rem;",
        "  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);",
        "  padding: 0.5rem 0.75rem;",
        "  overflow: auto;",
        "}",
        ".rt-node h2 {",
        "  margin: 0;",
        "  font-size: 0.95rem;",
        "}",
        ".rt-node small {",
        "  display: block;",
        "  margin-top: 0.35rem;",
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

function isPositionedLayoutModel(model: LayoutModel | PositionedLayoutModel): model is PositionedLayoutModel {
    return "layoutEngine" in model;
}

function renderListContent(model: LayoutModel, includeScore: boolean): string {
    const nodes = Object.values(model.nodes).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

    const items = nodes
        .map((node) => {
            const scoreSnippet = includeScore && node.score
                ? ` <small data-score="${escapeHtml(String(node.score.confidence))}">c=${escapeHtml(node.score.confidence.toFixed(3))}</small>`
                : "";

            return `<li data-node-id="${escapeHtml(node.id)}" data-claim-id="${escapeHtml(node.claimId)}" data-depth="${node.depth}"><strong>${escapeHtml(node.claimId)}</strong>${scoreSnippet}</li>`;
        })
        .join("\n");

    return [
        "<ul>",
        items,
        "</ul>",
    ].join("\n");
}

function renderPositionedContent(model: PositionedLayoutModel, includeScore: boolean): string {
    const canvasWidth = Math.max(1, Math.ceil(model.layoutBounds.width));
    const canvasHeight = Math.max(1, Math.ceil(model.layoutBounds.height));

    const edgeLines = Object.values(model.edges)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((edge) => {
            const fromNode = model.nodes[edge.fromNodeId];
            const toNode = model.nodes[edge.toNodeId];
            if (!fromNode || !toNode) return "";

            const x1 = fromNode.x + fromNode.width;
            const y1 = fromNode.y + fromNode.height / 2;
            const x2 = toNode.x;
            const y2 = toNode.y + toNode.height / 2;
            const bend = Math.max(24, Math.abs(x2 - x1) * 0.35);
            const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;

            return `<path class="rt-edge" data-affects="${escapeHtml(String(edge.affects))}" data-pro-target="${edge.proTarget ? "true" : "false"}" d="${escapeHtml(d)}" />`;
        })
        .join("\n");

    const nodeBlocks = Object.values(model.nodes)
        .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
        .map((node) => renderPositionedNode(node, includeScore))
        .join("\n");

    return [
        `<section class="rt-layout-stage" aria-label="Graph layout canvas">`,
        `<div class="rt-layout-canvas" style="width:${canvasWidth}px;height:${canvasHeight}px;">`,
        `<svg class="rt-edge-layer" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" aria-hidden="true">`,
        edgeLines,
        "</svg>",
        nodeBlocks,
        "</div>",
        "</section>",
    ].join("\n");
}

function renderPositionedNode(node: PositionedLayoutNode, includeScore: boolean): string {
    const scoreSnippet = includeScore && node.score
        ? `<small data-score="${escapeHtml(String(node.score.confidence))}">c=${escapeHtml(node.score.confidence.toFixed(3))}</small>`
        : "";

    const style = [
        `left:${node.x}px`,
        `top:${node.y}px`,
        `width:${node.width}px`,
        `height:${node.height}px`,
    ].join(";");

    return `<article class="rt-node" style="${escapeHtml(style)}" data-node-id="${escapeHtml(node.id)}" data-claim-id="${escapeHtml(node.claimId)}" data-depth="${node.depth}"><h2>${escapeHtml(node.claimId)}</h2>${scoreSnippet}</article>`;
}