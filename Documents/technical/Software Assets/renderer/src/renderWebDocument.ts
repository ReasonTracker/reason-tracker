import type { LayoutModel } from "./layout/types.ts";

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
    model: LayoutModel,
    options: RenderWebDocumentOptions = {},
): WebDocument {
    const title = options.title ?? "Reason Tracker";
    const includeScore = options.includeScore ?? true;
    const density = options.density ?? "comfortable";
    const css = renderWebCss({ density });

    const nodes = Object.values(model.nodes).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

    const items = nodes
        .map((node) => {
            const scoreSnippet = includeScore && node.score
                ? ` <small data-score="${escapeHtml(String(node.score.confidence))}">c=${escapeHtml(node.score.confidence.toFixed(3))}</small>`
                : "";

            return `<li data-node-id="${escapeHtml(node.id)}" data-claim-id="${escapeHtml(node.claimId)}" data-depth="${node.depth}"><strong>${escapeHtml(node.claimId)}</strong>${scoreSnippet}</li>`;
        })
        .join("\n");

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
        "<ul>",
        items,
        "</ul>",
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
        "  font-family: var(--rt-font);",
        "  color: var(--rt-fg);",
        "  background: linear-gradient(160deg, #f8fafc 0%, var(--rt-bg) 100%);",
        "}",
        "main {",
        "  max-width: 60rem;",
        "  margin: 0 auto;",
        "  padding: 1rem;",
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