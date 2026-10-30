const svgNamespace = "http://www.w3.org/2000/svg";

function svgElement(tagName, className) {
  const node = document.createElementNS(svgNamespace, tagName);
  if (className) node.classList.add(className);
  return node;
}

export function edgeKind(edge) {
  if (edge.count > 0 || edge.assetReferences.length > 0) return "runtime";
  return edge.typeCount > 0 ? "types" : "declared";
}

export function summaryUse(summary) {
  const parts = [];
  if (summary.count > 0) parts.push(`runtime imports: ${summary.count}`);
  if (summary.typeCount > 0) parts.push(`type-only imports: ${summary.typeCount}`);
  if (summary.assetReferences.length > 0) parts.push(`published assets: ${summary.assetReferences.length}`);
  const declared = summary.edges.filter((edge) => edgeKind(edge) === "declared").length;
  if (declared > 0) parts.push(`declared-only relationships: ${declared}`);
  return parts.join("; ");
}

function edgeEndpoints(from, to) {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const exitScale = (card) => {
    const scaleX = dx === 0 ? Infinity : (card.width / 2) / Math.abs(dx);
    const scaleY = dy === 0 ? Infinity : (card.height / 2) / Math.abs(dy);
    return Math.min(scaleX, scaleY);
  };
  const startScale = exitScale(from);
  const endScale = 1 - exitScale(to);
  return {
    start: { x: fromCenter.x + dx * startScale, y: fromCenter.y + dy * startScale },
    end: { x: fromCenter.x + dx * endScale, y: fromCenter.y + dy * endScale },
  };
}

export function createArchitectureArrows(data, visibility, onSelectPair) {
  const detailLines = new Map();
  const summaryGroups = new Map();
  const svg = svgElement("svg", "arch-edges");
  svg.setAttribute("width", String(data.layout.width));
  svg.setAttribute("height", String(data.layout.height));
  svg.setAttribute("viewBox", `0 0 ${data.layout.width} ${data.layout.height}`);
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Package dependency arrows");
  const defs = svgElement("defs");
  const marker = svgElement("marker");
  marker.setAttribute("id", "arch-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const arrow = svgElement("path");
  arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  arrow.setAttribute("fill", "var(--con)");
  marker.append(arrow);
  defs.append(marker);
  svg.append(defs);

  function lineBetween(fromId, toId, className, kind) {
    const from = visibility.nodes.get(fromId);
    const to = visibility.nodes.get(toId);
    if (!from || !to) throw new Error(`Unknown architecture relationship: ${fromId} to ${toId}`);
    const { start, end } = edgeEndpoints(from.box, to.box);
    const line = svgElement("line");
    for (const name of className.split(" ")) line.classList.add(name);
    if (kind === "types") line.classList.add("arch-edge-types");
    if (kind === "declared") line.classList.add("arch-edge-declared");
    line.setAttribute("x1", String(start.x));
    line.setAttribute("y1", String(start.y));
    line.setAttribute("x2", String(end.x));
    line.setAttribute("y2", String(end.y));
    line.setAttribute("aria-hidden", "true");
    return line;
  }

  for (const summary of visibility.summaries) {
    const group = svgElement("g", "arch-summary-edge");
    group.dataset.fromArea = summary.fromArea;
    group.dataset.toArea = summary.toArea;
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    const from = visibility.nodes.get(summary.fromArea).label;
    const to = visibility.nodes.get(summary.toArea).label;
    const description = `${from} depends on ${to}: ${summary.edges.length} detailed relationships (${summaryUse(summary)}). Activate to show details.`;
    group.setAttribute("aria-label", description);
    const title = svgElement("title");
    title.textContent = description;
    const line = lineBetween(summary.fromArea, summary.toArea, "arch-edge arch-summary-line", edgeKind(summary));
    line.setAttribute("marker-end", "url(#arch-arrow)");
    const hit = lineBetween(summary.fromArea, summary.toArea, "arch-summary-hit");
    group.append(title, line, hit);
    group.addEventListener("click", () => onSelectPair(summary));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectPair(summary);
      }
    });
    summaryGroups.set(summary, group);
    svg.append(group);
  }

  for (const edge of data.diagramEdges) {
    const line = lineBetween(edge.from, edge.to, "arch-edge arch-detail-line", edgeKind(edge));
    line.dataset.from = edge.from;
    line.dataset.to = edge.to;
    line.dataset.fromArea = edge.fromArea;
    line.dataset.toArea = edge.toArea;
    line.setAttribute("marker-end", "url(#arch-arrow)");
    detailLines.set(edge, line);
    svg.append(line);
  }
  return { svg, detailLines, summaryGroups };
}
