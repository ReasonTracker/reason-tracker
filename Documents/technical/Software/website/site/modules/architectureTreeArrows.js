import { edgeKind, summaryUse } from "./architectureArrows.js";

export const TREE_ROW_HEIGHT = 40;
export const TREE_LABEL_WIDTH = 560;
const MIN_GUTTER_WIDTH = 120;
const LANE_WIDTH = 25;
const LANE_GAP = 8;
const EDGE_INSET = 6;
const SELF_LOOP_OFFSET = 7;
const svgNamespace = "http://www.w3.org/2000/svg";
const byName = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function svgElement(tag, className) {
  const node = document.createElementNS(svgNamespace, tag);
  if (className) node.classList.add(className);
  return node;
}

function layoutGroups(groups, rows) {
  const rowIndex = new Map(rows.map(({ node }, index) => [node.id, index]));
  const ordered = groups.map((group) => {
    const from = rowIndex.get(group.from);
    const to = rowIndex.get(group.to);
    if (from === undefined || to === undefined) throw new Error(`Tree arrow has a hidden endpoint: ${group.id}`);
    const start = Math.min(from, to) * TREE_ROW_HEIGHT;
    const end = (Math.max(from, to) + 1) * TREE_ROW_HEIGHT;
    return { group, from, to, start, end };
  }).sort((left, right) =>
    left.start - right.start || right.end - left.end || byName(left.group.id, right.group.id),
  );
  const lanes = [];
  for (const edge of ordered) {
    let lane = lanes.findIndex((entries) => entries.every((entry) =>
      edge.end + LANE_GAP < entry.start || edge.start - LANE_GAP > entry.end,
    ));
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push(edge);
    edge.lane = lane;
  }
  return { edges: ordered, width: Math.max(MIN_GUTTER_WIDTH, (lanes.length + 2) * LANE_WIDTH) };
}

export function createTreeArrows(model, snapshot, onSelect) {
  const layout = layoutGroups(snapshot.groups, snapshot.rows);
  const height = snapshot.rows.length * TREE_ROW_HEIGHT;
  const svg = svgElement("svg", "arch-tree-arrows");
  svg.setAttribute("width", String(layout.width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${height}`);
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Dependency arrows");

  const defs = svgElement("defs");
  const marker = svgElement("marker");
  marker.setAttribute("id", "arch-tree-arrowhead");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto");
  const tip = svgElement("path");
  tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  tip.setAttribute("fill", "var(--con)");
  marker.append(tip);
  defs.append(marker);
  svg.append(defs);

  for (const edge of layout.edges) {
    const fromY = (edge.from + 0.5) * TREE_ROW_HEIGHT;
    const toY = (edge.to + 0.5) * TREE_ROW_HEIGHT;
    const laneX = (edge.lane + 2) * LANE_WIDTH;
    const d = edge.from === edge.to
      ? `M ${EDGE_INSET} ${fromY - SELF_LOOP_OFFSET} C ${laneX} ${fromY - 20}, ${laneX} ${toY + 20}, ${EDGE_INSET} ${toY + SELF_LOOP_OFFSET}`
      : `M ${EDGE_INSET} ${fromY} C ${laneX} ${fromY}, ${laneX} ${toY}, ${EDGE_INSET} ${toY}`;
    const group = svgElement("g", "arch-tree-arrow-group");
    group.dataset.from = edge.group.from;
    group.dataset.to = edge.group.to;
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    const fromNode = model.nodes.get(edge.group.from);
    const toNode = model.nodes.get(edge.group.to);
    const from = `${fromNode.name} (${fromNode.path ?? fromNode.paths.join(", ")})`;
    const to = `${toNode.name} (${toNode.path ?? toNode.paths.join(", ")})`;
    const relationship = edge.group.from === edge.group.to ? `${from} has internal dependencies` : `${from} depends on ${to}`;
    const action = fromNode.children?.length || toNode.children?.length
      ? "Activate to expand the related folders."
      : "Activate to focus this relationship.";
    const label = `${relationship}: ${edge.group.edges.length} detailed relationships (${summaryUse(edge.group)}). ${action}`;
    group.setAttribute("aria-label", label);
    const title = svgElement("title");
    title.textContent = label;
    const curve = svgElement("path", "arch-tree-arrow");
    if (edgeKind(edge.group) === "types") curve.classList.add("arch-tree-arrow-types");
    if (edgeKind(edge.group) === "declared") curve.classList.add("arch-tree-arrow-declared");
    curve.setAttribute("d", d);
    curve.setAttribute("marker-end", "url(#arch-tree-arrowhead)");
    curve.setAttribute("aria-hidden", "true");
    const hit = svgElement("path", "arch-tree-arrow-hit");
    hit.setAttribute("d", d);
    hit.setAttribute("aria-hidden", "true");
    group.append(title, curve, hit);
    group.addEventListener("click", () => onSelect(edge.group));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(edge.group);
      }
    });
    svg.append(group);
  }
  return { svg, width: layout.width };
}
