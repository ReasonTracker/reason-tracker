import type { Side } from "../../../app/src/app.js";

// AGENT NOTE: Keep renderer sizing and visual constants grouped here so the
// ported HTML and SVG shape can be tuned without spreading magic numbers.
/** Base claim card width used by the existing shared renderer. */
export const BASE_NODE_WIDTH_PX = 360;
/** Base claim card height used by the existing shared renderer. */
export const BASE_NODE_HEIGHT_PX = 176;
/** Padding retained around the rendered scene bounds. */
export const GRAPH_PADDING_PX = 96;
/** Outline width shared by connector walls and junction frames. */
export const CONNECTOR_OUTLINE_WIDTH_PX = 4;
/** Alpha used for the empty pipe interior behind the fluid layer. */
export const PIPE_INTERIOR_ALPHA = 0.18;
/** Multiplier applied to connector width when building a swept transition span. */
export const CONNECTOR_GEOMETRY_TRANSITION_LENGTH_MULTIPLIER = 1;
/** Font size for the large numeric score shown in each claim card footer. */
export const CLAIM_SCORE_VALUE_FONT_SIZE_PX = 32;
/** Font size for the small score caption shown beneath the numeric value. */
export const CLAIM_SCORE_CAPTION_FONT_SIZE_PX = 11;
/** Vertical gap between the numeric score value and its caption. */
export const CLAIM_SCORE_CAPTION_GAP_PX = 2;
/** Width of the current minimal junction shell. */
export const JUNCTION_BASE_WIDTH_PX = 28;
/** Height of the current minimal junction shell. */
export const JUNCTION_BASE_HEIGHT_PX = 18;
/** Narrow side multiplier for the temporary junction shape. */
export const JUNCTION_NARROW_SIDE_RATIO = 0.82;
/** Wide side multiplier for the temporary junction shape. */
export const JUNCTION_WIDE_SIDE_RATIO = 1.18;
/** Size of the current minimal aggregator visual. */
export const AGGREGATOR_BASE_SIZE_PX = 2;
/** Radius applied to the temporary relevance elbow point. */
export const RELEVANCE_CONNECTOR_CORNER_RADIUS_PX = 24;

export const GRAPH_ROOT_STYLES = {
    background: "#000000",
    color: "#ffffff",
    overflow: "hidden",
    "--pro-h": "276.37",
    "--pro-l": "65%",
    "--pro": "hsl(var(--pro-h), 100%, var(--pro-l))",
    "--con-h": "30.21",
    "--con-l": "42%",
    "--con": "hsl(var(--con-h), 100%, var(--con-l))",
} satisfies Record<string, string | number>;

export const CONNECTOR_LAYER_STYLES = {
    inset: 0,
    overflow: "visible",
    position: "absolute",
} satisfies Record<string, string | number>;

export const CLAIM_CONTENT_STYLES = {
    display: "-webkit-box",
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.08,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
} satisfies Record<string, string | number>;

export const CLAIM_SCORE_CONTAINER_STYLES = {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    marginTop: 8,
} satisfies Record<string, string | number>;

export const CLAIM_SCORE_VALUE_STYLES = {
    color: "#f3f4f6",
    fontSize: CLAIM_SCORE_VALUE_FONT_SIZE_PX,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 0.92,
    whiteSpace: "nowrap",
} satisfies Record<string, string | number>;

export const CLAIM_SCORE_CAPTION_STYLES = {
    color: "#d1d5db",
    fontSize: CLAIM_SCORE_CAPTION_FONT_SIZE_PX,
    fontWeight: 600,
    letterSpacing: "0.06em",
    lineHeight: 1,
    marginTop: CLAIM_SCORE_CAPTION_GAP_PX,
} satisfies Record<string, string | number>;

export function resolveSideStroke(side: Side): string {
    return side === "proMain" ? "var(--pro)" : "var(--con)";
}

export function resolveSideFill(side: Side, alpha: number): string {
    if (side === "proMain") {
        return `hsl(var(--pro-h) 100% var(--pro-l) / ${alpha})`;
    }

    return `hsl(var(--con-h) 100% var(--con-l) / ${alpha})`;
}

export function formatScoreValue(score: number): string {
    return `${Math.round(score * 100)}%`;
}