import { createArchitectureArrows, edgeKind, summaryUse } from "./architectureArrows.js";
import { ArchitectureVisibility } from "./architectureVisibility.js";

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function placeNode(node, box) {
  node.style.left = `${box.x}px`;
  node.style.top = `${box.y}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
}

function renderLegend(data) {
  const legend = element("div", "arch-legend");
  const kinds = new Set(data.diagramEdges.map(edgeKind));
  const addItem = (className, text) => {
    const item = element("span", "arch-legend-item");
    item.append(element("span", className), element("span", "", text));
    legend.append(item);
  };
  addItem("arch-legend-line", "Arrows point to dependencies. Solid: runtime source import or published asset.");
  if (kinds.has("types")) {
    addItem("arch-legend-line arch-legend-dotted", "Dotted: type-only imports; no runtime code is used.");
  }
  if (kinds.has("declared")) {
    addItem("arch-legend-line arch-legend-dashed", "Dashed: package.json dependency only; no source import or published asset detected.");
  }
  legend.append(element("span", "arch-legend-note", "Select a package arrow for details, or a package, folder, or file name for its direct relationships. Hover over a box or focus on its controls to preview. Internal arrows are off until enabled. Paths are relative to Documents/technical/Software/; . is the workspace root. Excluded sections and their dependencies are listed below."));
  return legend;
}

export function createArchitectureDiagram(data, workspacePath, onSearch) {
  const visibility = new ArchitectureVisibility(data, workspacePath);
  const state = {
    query: "",
    includeInternal: false,
    direction: "both",
    selection: null,
    showAll: false,
    hoveredId: null,
    focusedId: null,
    previewSource: null,
  };
  const nodes = new Map();

  const toolbar = element("div", "arch-toolbar");
  const search = element("input");
  search.type = "search";
  search.placeholder = "Search areas, folders, and files";
  search.setAttribute("aria-label", "Search areas, folders, and files in the map");
  const directionLabel = element("label", "arch-control", "Direction");
  const direction = element("select");
  direction.setAttribute("aria-label", "Dependency direction");
  for (const [value, label] of [["both", "Both"], ["outgoing", "Depends on"], ["incoming", "Used by"]]) {
    const option = element("option", "", label);
    option.value = value;
    direction.append(option);
  }
  direction.value = state.direction;
  directionLabel.append(direction);
  const internalLabel = element("label", "arch-internal-toggle");
  const internal = element("input");
  internal.type = "checkbox";
  internalLabel.append(internal, element("span", "", "Internal arrows"));
  const overview = element("button", "", "Overview");
  const showAll = element("button", "", "Show all");
  const reset = element("button", "", "Reset");
  for (const button of [overview, showAll, reset]) button.type = "button";
  overview.title = "Return to package arrows without changing the arrow options";
  showAll.title = "Show every relationship allowed by the internal-arrows setting";
  reset.title = "Restore the initial overview and arrow options";
  toolbar.append(search, directionLabel, internalLabel, overview, showAll, reset);

  const status = element("p", "arch-edge-status");
  status.setAttribute("role", "status");
  const scroll = element("div", "arch-scroll");
  const canvas = element("div", "arch-canvas");
  canvas.style.width = `${data.layout.width}px`;
  canvas.style.height = `${data.layout.height}px`;

  function areaLabel(id) {
    return visibility.nodes.get(id).label;
  }

  function clearPreview() {
    state.hoveredId = null;
    state.focusedId = null;
    state.previewSource = null;
  }

  const { svg, detailLines, summaryGroups } = createArchitectureArrows(data, visibility, (summary) => {
    state.selection = { kind: "pair", fromArea: summary.fromArea, toArea: summary.toArea };
    clearPreview();
    refresh();
    overview.focus({ preventScroll: true });
  });
  canvas.append(svg);

  function bindPreview(node, nodeId) {
    node.addEventListener("mouseenter", () => {
      state.hoveredId = nodeId;
      state.previewSource = "hover";
      refresh();
    });
    node.addEventListener("mouseleave", () => {
      if (state.hoveredId === nodeId) {
        state.hoveredId = null;
        refresh();
      }
    });
    node.addEventListener("focusin", () => {
      state.focusedId = nodeId;
      state.previewSource = "focus";
      refresh();
    });
    node.addEventListener("focusout", (event) => {
      if (!node.contains(event.relatedTarget) && state.focusedId === nodeId) {
        state.focusedId = null;
        refresh();
      }
    });
  }

  function selectButton(label, nodeId) {
    const button = element("button", "arch-node-select", label);
    button.type = "button";
    button.title = `Show direct dependencies of ${label}`;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state.selection = state.selection?.kind === "node" && state.selection.id === nodeId
        ? null
        : { kind: "node", id: nodeId };
      clearPreview();
      refresh();
    });
    return button;
  }

  function renderArea(area) {
    const card = element("article", `arch-area-card${area.modules.some((module) => module.inDiagram) ? " has-modules" : ""}`);
    bindPreview(card, area.id);
    card.dataset.nodeId = area.id;
    card.dataset.areaId = area.id;
    const heading = element("div", "arch-area-heading");
    const title = element("h2");
    const button = selectButton(area.label, area.id);
    title.append(button);
    heading.append(title, element("span", "arch-area-count", `${area.fileCount} files`));
    const location = element("a", "arch-area-path", area.path);
    location.href = area.href;
    location.title = `Open ${area.path} on the website`;
    card.append(heading, location, element("p", "arch-area-description", area.description));
    placeNode(card, area);
    nodes.set(area.id, { element: card, button });
    return card;
  }

  function renderModule(module, area) {
    const box = element("div", "arch-module-box");
    bindPreview(box, module.id);
    box.dataset.nodeId = module.id;
    box.dataset.areaId = area.id;
    const heading = element("div", "arch-module-heading");
    const button = selectButton(module.label, module.id);
    heading.append(button);
    if (module.kind !== "file") heading.append(element("span", "arch-area-count", `${module.fileCount} files`));
    const paths = element("div", "arch-module-paths");
    for (const [index, modulePath] of module.paths.entries()) {
      const link = element("a", "", module.kind === "file" ? "Open file" : modulePath.split("/").pop());
      link.href = module.hrefs[index];
      link.title = `Open ${modulePath} on the website`;
      paths.append(link);
    }
    box.append(heading, paths);
    placeNode(box, module);
    nodes.set(module.id, { element: box, button });
    return box;
  }

  for (const area of data.areas.filter((candidate) => candidate.inDiagram)) canvas.append(renderArea(area));
  for (const area of data.areas.filter((candidate) => candidate.inDiagram)) {
    for (const module of area.modules.filter((candidate) => candidate.inDiagram)) {
      canvas.append(renderModule(module, area));
    }
  }
  scroll.append(canvas);

  function describe(snapshot) {
    let prefix = "";
    if (snapshot.focus?.kind === "node") {
      const label = visibility.nodes.get(snapshot.focus.id).label;
      prefix = `${snapshot.focus.preview ? "Preview" : "Selected"}: ${label}. `;
    } else if (snapshot.focus?.kind === "pair") {
      const summary = visibility.summaries.find((candidate) =>
        candidate.fromArea === snapshot.focus.fromArea && candidate.toArea === snapshot.focus.toArea,
      );
      prefix = `${areaLabel(summary.fromArea)} to ${areaLabel(summary.toArea)} (${summaryUse(summary)}). `;
    }
    if (state.query) prefix += `${snapshot.matchCount} matching ${snapshot.matchCount === 1 ? "node" : "nodes"}. `;
    const count = snapshot.mode === "overview"
      ? `${snapshot.representedCount} of ${snapshot.totalCount} relationships represented by ${snapshot.summaries.length} package arrows${snapshot.edges.length ? ` and ${snapshot.edges.length} internal arrows` : ""}.`
      : `${snapshot.representedCount} of ${snapshot.totalCount} relationships shown.`;
    return `${prefix}${count} Internal arrows ${state.includeInternal ? "on" : "off"}.`;
  }

  function refresh() {
    const snapshot = visibility.resolve(state);
    const visibleEdges = new Set(snapshot.edges);
    const visibleSummaries = new Set(snapshot.summaries);
    for (const [edge, line] of detailLines) line.toggleAttribute("hidden", !visibleEdges.has(edge));
    for (const [summary, group] of summaryGroups) group.toggleAttribute("hidden", !visibleSummaries.has(summary));
    canvas.classList.toggle("has-selection", Boolean(state.query || snapshot.focus));
    for (const [id, node] of nodes) {
      const selected = state.selection?.kind === "node" && state.selection.id === id;
      node.element.toggleAttribute("hidden", Boolean(snapshot.searchNodes && !snapshot.searchNodes.has(id)));
      node.element.classList.toggle("is-related", snapshot.related.has(id));
      node.element.classList.toggle("is-selected", selected);
      node.button.setAttribute("aria-pressed", String(selected));
    }
    direction.disabled = !snapshot.directionEnabled;
    status.textContent = describe(snapshot);
    onSearch(state.query);
  }

  search.addEventListener("input", () => {
    state.query = search.value.trim().toLowerCase();
    state.selection = null;
    state.showAll = false;
    clearPreview();
    refresh();
  });
  direction.addEventListener("change", () => {
    state.direction = direction.value;
    refresh();
  });
  internal.addEventListener("change", () => {
    state.includeInternal = internal.checked;
    refresh();
  });
  overview.addEventListener("click", () => {
    state.query = "";
    state.selection = null;
    state.showAll = false;
    search.value = "";
    clearPreview();
    refresh();
  });
  showAll.addEventListener("click", () => {
    state.query = "";
    state.selection = null;
    state.showAll = true;
    search.value = "";
    clearPreview();
    refresh();
  });
  reset.addEventListener("click", () => {
    state.query = "";
    state.includeInternal = false;
    state.direction = "both";
    state.selection = null;
    state.showAll = false;
    search.value = "";
    internal.checked = false;
    direction.value = "both";
    clearPreview();
    refresh();
  });

  refresh();
  return { toolbar, status, scroll, legend: renderLegend(data), refresh };
}
