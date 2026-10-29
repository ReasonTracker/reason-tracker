// AGENT NOTE: Keep debate-graph outline thickness proportional to authored structural scale.
/** Outline width for a full-scale claim, connector, or delivery aggregator. */
export const DEBATE_GRAPH_BASE_OUTLINE_WIDTH = 4;

export const DEBATE_GRAPH_COLORS = {
	border: "#000000",
	con: "var(--con)",
	pro: "var(--pro)",
	shell: "#151b24",
	text: "#f8fafc",
};

export function resolveDebateGraphOutlineWidth(scale: number): number {
	return DEBATE_GRAPH_BASE_OUTLINE_WIDTH * Math.max(0, scale);
}

export function debateGraphSideColor(side: "proMain" | "conMain"): string {
	return side === "proMain" ? DEBATE_GRAPH_COLORS.pro : DEBATE_GRAPH_COLORS.con;
}