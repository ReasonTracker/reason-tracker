(() => {
  const root = document.querySelector("#software-architecture-map");
  if (!root) return;

  const element = (tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const areaLabels = new Map();
  const svgNamespace = "http://www.w3.org/2000/svg";

  fetch("/modules/software-architecture.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Map data request failed with HTTP ${response.status}.`);
      return response.json();
    })
    .then(renderMap)
    .catch((error) => {
      const message = element("p", "arch-error", `Unable to load the software architecture map: ${error.message}`);
      root.replaceChildren(message);
    });

  function renderMap(data) {
    for (const area of data.areas) areaLabels.set(area.id, area.label);
    root.replaceChildren();

    const status = element("p", `arch-status${hasFindings(data.report) ? " has-findings" : ""}`);
    status.textContent = hasFindings(data.report)
      ? "Boundary findings need review."
      : "No unexpected dependency or containment findings.";
    root.append(status);

    const toolbar = element("div", "arch-toolbar");
    const search = element("input");
    search.type = "search";
    search.placeholder = "Search areas and folders";
    search.setAttribute("aria-label", "Search areas and folders in the map");
    const expand = element("button", "", "Expand folders");
    expand.type = "button";
    expand.addEventListener("click", () => root.querySelectorAll(".arch-tree-folder").forEach((folder) => {
      folder.open = true;
    }));
    const collapse = element("button", "", "Collapse folders");
    collapse.type = "button";
    collapse.addEventListener("click", () => root.querySelectorAll(".arch-tree-folder").forEach((folder) => {
      folder.open = false;
    }));
    toolbar.append(search, expand, collapse);
    root.append(toolbar);

    const repositoryTree = element("ul", "arch-repository-tree");
    for (const child of data.repositoryTree.children) {
      repositoryTree.append(renderTreeNode(child, 0, data));
    }
    root.append(repositoryTree, renderReport(data));

    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      const edges = root.querySelector(".arch-edges");
      if (edges) edges.hidden = Boolean(query);
      for (const card of root.querySelectorAll(".arch-area-card")) {
        card.hidden = Boolean(query) && !card.dataset.search.includes(query);
      }
      for (const box of root.querySelectorAll(".arch-module-box")) {
        box.hidden = root.querySelector(`.arch-area-card[data-area-id="${box.dataset.areaId}"]`).hidden;
      }
      for (const item of root.querySelectorAll(".arch-tree-folder")) {
        const matches = !query || item.dataset.search.includes(query);
        item.hidden = !matches;
        if (query && matches && item.matches(".arch-tree-folder")) item.open = true;
      }
    });
  }

  function edgeKind(edge) {
    if (edge.count > 0 || edge.assetReferences.length > 0) return "runtime";
    return edge.typeCount > 0 ? "types" : "declared";
  }

  function renderLegend(data) {
    const legend = element("div", "arch-legend");
    const kinds = new Set(data.diagramEdges.map(edgeKind));
    legend.append(legendItem("arch-legend-line", "Arrow points from a module or package to one it depends on. Solid: runtime source import or published asset."));
    if (kinds.has("types")) {
      legend.append(legendItem("arch-legend-line arch-legend-dotted", "Dotted: type-only imports; no runtime code is used."));
    }
    if (kinds.has("declared")) {
      legend.append(legendItem("arch-legend-line arch-legend-dashed", "Dashed: package.json dependency only; no source import or published asset detected."));
    }
    legend.append(element("span", "arch-legend-note", "Boxes inside a package are modules: the first folders below its source root, with root files grouped as Entry. Select a package or module name to highlight its dependencies. Folder paths omit Documents/technical/."));
    return legend;
  }

  function legendItem(className, description) {
    const item = element("span", "arch-legend-item");
    item.append(element("span", className), element("span", "", description));
    return item;
  }

  // Straight line from the source card border to the target card border, along the center-to-center line.
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

  function renderEdges(data) {
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.classList.add("arch-edges");
    svg.setAttribute("width", String(data.layout.width));
    svg.setAttribute("height", String(data.layout.height));
    svg.setAttribute("viewBox", `0 0 ${data.layout.width} ${data.layout.height}`);
    svg.setAttribute("aria-hidden", "true");

    const defs = document.createElementNS(svgNamespace, "defs");
    const marker = document.createElementNS(svgNamespace, "marker");
    marker.setAttribute("id", "arch-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS(svgNamespace, "path");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrow.setAttribute("fill", "var(--con)");
    marker.append(arrow);
    defs.append(marker);
    svg.append(defs);

    const nodesById = new Map();
    for (const area of data.areas) {
      nodesById.set(area.id, area);
      for (const module of area.modules) nodesById.set(module.id, module);
    }
    for (const edge of data.diagramEdges) {
      const { start, end } = edgeEndpoints(nodesById.get(edge.from), nodesById.get(edge.to));
      const line = document.createElementNS(svgNamespace, "line");
      line.classList.add("arch-edge");
      line.dataset.from = edge.from;
      line.dataset.to = edge.to;
      line.dataset.fromArea = edge.fromArea;
      line.dataset.toArea = edge.toArea;
      const kind = edgeKind(edge);
      if (kind === "types") line.classList.add("arch-edge-types");
      if (kind === "declared") line.classList.add("arch-edge-declared");
      line.setAttribute("x1", String(start.x));
      line.setAttribute("y1", String(start.y));
      line.setAttribute("x2", String(end.x));
      line.setAttribute("y2", String(end.y));
      line.setAttribute("marker-end", "url(#arch-arrow)");
      svg.append(line);
    }
    return svg;
  }

  function placeNode(node, box) {
    node.style.left = `${box.x}px`;
    node.style.top = `${box.y}px`;
    node.style.width = `${box.width}px`;
    node.style.height = `${box.height}px`;
  }

  function selectButton(className, label, nodeId, select) {
    const button = element("button", className, label);
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.title = `Highlight dependencies of ${label}`;
    button.addEventListener("click", () => select(nodeId));
    return button;
  }

  function renderArea(area, select) {
    const card = element("article", `arch-area-card${area.modules.length > 0 ? " has-modules" : ""}`);
    card.dataset.search = area.searchText;
    card.dataset.nodeId = area.id;
    card.dataset.areaId = area.id;
    const heading = element("div", "arch-area-heading");
    const title = element("h2");
    title.append(selectButton("arch-node-select", area.label, area.id, select));
    const count = element("span", "arch-area-count", `${area.fileCount} files`);
    heading.append(title, count);
    const location = element("a", "arch-area-path", area.path);
    location.href = area.href;
    location.title = `Open ${area.path} on the website`;
    const description = element("p", "arch-area-description", area.description);
    card.append(heading, location, description);
    placeNode(card, area);
    return card;
  }

  function renderModule(module, area, select) {
    const box = element("div", "arch-module-box");
    box.dataset.nodeId = module.id;
    box.dataset.areaId = area.id;
    const heading = element("div", "arch-module-heading");
    heading.append(
      selectButton("arch-node-select", module.label, module.id, select),
      element("span", "arch-area-count", `${module.fileCount} files`),
    );
    const paths = element("div", "arch-module-paths");
    for (const [index, modulePath] of module.paths.entries()) {
      const link = element("a", "", modulePath.split("/").pop());
      link.href = module.hrefs[index];
      link.title = `Open ${modulePath} on the website`;
      paths.append(link);
    }
    box.append(heading, paths);
    placeNode(box, module);
    return box;
  }

  // Selecting a package or module highlights its arrows and the nodes at their other ends.
  function createSelection(canvas, data) {
    let selectedId = null;
    return (nodeId) => {
      selectedId = selectedId === nodeId ? null : nodeId;
      const related = new Set(selectedId ? [selectedId] : []);
      for (const line of canvas.querySelectorAll(".arch-edge")) {
        const touches = selectedId !== null && [line.dataset.from, line.dataset.to, line.dataset.fromArea, line.dataset.toArea]
          .includes(selectedId);
        line.classList.toggle("is-related", touches);
        if (touches) {
          related.add(line.dataset.from).add(line.dataset.to).add(line.dataset.fromArea).add(line.dataset.toArea);
        }
      }
      canvas.classList.toggle("has-selection", selectedId !== null);
      for (const node of canvas.querySelectorAll("[data-node-id]")) {
        node.classList.toggle("is-related", related.has(node.dataset.nodeId));
        node.classList.toggle("is-selected", node.dataset.nodeId === selectedId);
        const button = node.querySelector(":scope > .arch-module-heading > .arch-node-select, :scope > .arch-area-heading .arch-node-select");
        button?.setAttribute("aria-pressed", String(node.dataset.nodeId === selectedId));
      }
    };
  }

  function renderTreeNode(node, depth, data = null) {
    if (node.kind === "workspace") {
      const item = element("li");
      item.dataset.search = `${node.path} ${data.areas.map((area) => area.searchText).join(" ")}`.toLowerCase();
      const folder = element("details", "arch-tree-folder arch-workspace-folder");
      folder.dataset.search = item.dataset.search;
      folder.open = true;
      folder.append(element("summary", "", "Software workspace"));

      const workspace = element("div", "arch-workspace-content");
      workspace.append(element("p", "arch-workspace-path", node.path));
      const scroll = element("div", "arch-scroll");
      const canvas = element("div", "arch-canvas");
      canvas.style.width = `${data.layout.width}px`;
      canvas.style.height = `${data.layout.height}px`;
      const select = createSelection(canvas, data);
      for (const area of data.areas) canvas.append(renderArea(area, select));
      canvas.append(renderEdges(data));
      for (const area of data.areas) {
        for (const module of area.modules) canvas.append(renderModule(module, area, select));
      }
      scroll.append(canvas);
      workspace.append(scroll, renderLegend(data));
      folder.append(workspace);
      item.append(folder);
      return item;
    }

    if (node.kind === "directory") {
      const item = element("li");
      item.dataset.search = collectSearchText(node);
      const folder = element("details", "arch-tree-folder");
      folder.dataset.search = item.dataset.search;
      folder.open = depth <= 1;
      const summary = element("summary", "", `${node.name}/`);
      folder.append(summary);
      const children = element("ul");
      for (const child of node.children) children.append(renderTreeNode(child, depth + 1, data));
      folder.append(children);
      item.append(folder);
      return item;
    }

    return element("li");
  }

  function collectSearchText(node) {
    return `${node.path} ${node.name} ${node.children?.map(collectSearchText).join(" ") ?? ""}`.toLowerCase();
  }

  function renderReport(data) {
    const report = element("section", "arch-report");
    report.setAttribute("aria-label", "Dependency and containment report");
    report.append(
      reportSection("Allowed import directions", data.allowedPackageImports.map(({ from, to }) =>
        `${areaLabels.get(from)} may import from ${areaLabels.get(to)}.`,
      )),
      reportSection("Allowed shared-file imports", data.allowedRelativeImports.map(({ from, to, reason }) =>
        `${from} imports from ${to}. ${reason}`,
      )),
      reportSection("Observed package dependencies", data.edges.map((edge) => {
        const from = areaLabels.get(edge.from);
        const to = areaLabels.get(edge.to);
        const staticImports = edge.count > 0 ? `runtime imports: ${edge.count}` : "";
        const typeImports = edge.typeCount > 0 ? `type-only imports: ${edge.typeCount}` : "";
        const publishedAssets = edge.assetReferences.length > 0
          ? `published assets: ${edge.assetReferences.join(", ")}`
          : "";
        const observedUse = [staticImports, typeImports, publishedAssets].filter(Boolean).join("; ");

        return observedUse
          ? `${from} depends on ${to} (${observedUse}).`
          : `${from} declares a package dependency on ${to}, but no source import or published asset was detected.`;
      })),
      reportSection("Unexpected dependencies", data.report.unexpectedDependencies.map((entry) =>
        `${displayArea(entry.from)} imports from ${displayArea(entry.to)} (${entry.kind}; ${entry.file ?? "source import"}).`,
      )),
      reportSection("Boundary bypasses", data.report.boundaryBypasses.map((entry) =>
        `${entry.from} imports from ${entry.to}: ${entry.reason}`,
      )),
      reportSection("Unassigned Software files", data.report.unassignedFiles),
      reportSection("Approved runtime path exceptions", data.report.approvedExceptions.map((entry) =>
        `${entry.file}:${entry.line} ${entry.symbol} uses a path to ${entry.target} (path declaration at line ${entry.pathLine}). ${entry.reason}`,
      )),
      reportSection("Stale exception records", data.report.staleExceptions.map((entry) =>
        `${entry.file} ${entry.symbol}: ${entry.reason}`,
      )),
    );
    return report;
  }

  function reportSection(title, entries) {
    const section = element("section", "arch-report-section");
    section.append(element("h3", "", `${title} (${entries.length})`));
    if (entries.length === 0) {
      section.append(element("p", "arch-muted", "None."));
      return section;
    }
    const list = element("ul");
    for (const entry of entries) list.append(element("li", "", entry));
    section.append(list);
    return section;
  }

  function displayArea(value) {
    return areaLabels.get(value) ?? value;
  }

  function hasFindings(report) {
    return report.unexpectedDependencies.length > 0
      || report.boundaryBypasses.length > 0
      || report.unassignedFiles.length > 0
      || report.staleExceptions.length > 0;
  }
})();
