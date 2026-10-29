export const DEBATE_GRAPH_COLORS = {
	border: "#000000",
	con: "var(--con)",
	pro: "var(--pro)",
	shell: "#151b24",
	text: "#f8fafc",
};

export function debateGraphSideColor(side: "proMain" | "conMain"): string {
	return side === "proMain" ? DEBATE_GRAPH_COLORS.pro : DEBATE_GRAPH_COLORS.con;
}