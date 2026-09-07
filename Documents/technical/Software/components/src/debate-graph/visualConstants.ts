// AGENT NOTE: Keep debate-graph outline thickness proportional to authored structural scale.
/** Outline width for a full-scale claim, connector, aggregator, or junction. */
export const DEBATE_GRAPH_BASE_OUTLINE_WIDTH = 4;

export function resolveDebateGraphOutlineWidth(scale: number): number {
	return DEBATE_GRAPH_BASE_OUTLINE_WIDTH * Math.max(0, scale);
}