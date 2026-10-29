/** Outline width for a full-scale claim, connector, or delivery aggregator. */
export const DEBATE_GRAPH_BASE_OUTLINE_WIDTH = 4;

export function resolveDebateGraphOutlineWidth(scale: number): number {
	return DEBATE_GRAPH_BASE_OUTLINE_WIDTH * Math.max(0, scale);
}
