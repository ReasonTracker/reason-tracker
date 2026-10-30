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
  const moduleLabels = new Map();
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
    for (const area of data.areas) {
      for (const module of area.modules) moduleLabels.set(module.id, module.label);
    }
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
      const modulePanel = root.querySelector(".arch-module-panel");
      if (modulePanel) modulePanel.hidden = Boolean(query);
      for (const card of root.querySelectorAll(".arch-area-card")) {
        card.hidden = Boolean(query) && !card.dataset.search.includes(query);
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
    const kinds = new Set(data.edges.map(edgeKind));
    legend.append(legendItem("arch-legend-line", "Arrow points from a package to a package it depends on. Solid: runtime source import or published asset."));
    if (kinds.has("types")) {
      legend.append(legendItem("arch-legend-line arch-legend-dotted", "Dotted: type-only imports; no runtime code is used."));
    }
    if (kinds.has("declared")) {
      legend.append(legendItem("arch-legend-line arch-legend-dashed", "Dashed: package.json dependency only; no source import or published asset detected."));
    }
    legend.append(element("span", "arch-legend-note", "Select a package to show its module dependencies. Folder paths omit Documents/technical/."));
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

    const areasById = new Map(data.areas.map((area) => [area.id, area]));
    for (const edge of data.edges) {
      const { start, end } = edgeEndpoints(areasById.get(edge.from), areasById.get(edge.to));
      const line = document.createElementNS(svgNamespace, "line");
      line.classList.add("arch-edge");
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

  function renderArea(area, onModuleSelect) {
    const card = element("article", "arch-area-card");
    card.dataset.search = area.searchText;
    const heading = element("div", "arch-area-heading");
    const title = element("h2", "", area.label);
    const count = element("span", "arch-area-count", `${area.fileCount} files`);
    heading.append(title, count);
    const location = element("a", "arch-area-path", area.path);
    location.href = area.href;
    location.title = `Open ${area.path} on the website`;
    const description = element("p", "arch-area-description", area.description);
    card.append(heading, location, description);
    if (area.modules.length > 0) {
      const button = element("button", "arch-module-toggle", "Show modules");
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => onModuleSelect(area.id, button));
      card.append(button);
    }
    return card;
  }

  function renderModuleDetail(areaId, data) {
    const section = element("section", "arch-module-detail");
    const area = data.areas.find((candidate) => candidate.id === areaId);
    const edges = data.moduleEdges.filter((edge) => edge.fromArea === areaId || edge.toArea === areaId);
    const relatedAreaIds = new Set([areaId]);
    for (const edge of edges) {
      relatedAreaIds.add(edge.fromArea);
      relatedAreaIds.add(edge.toArea);
    }
    section.append(element("h3", "", `Module dependencies for ${area.label}`));
    section.append(element("p", "arch-muted", "Modules group source files by the first folder below the configured source root. Source-root files are grouped as Entry."));

    const groups = element("div", "arch-module-groups");
    for (const relatedAreaId of relatedAreaIds) {
      const relatedArea = data.areas.find((candidate) => candidate.id === relatedAreaId);
      if (!relatedArea?.modules.length) continue;
      const group = element("section", "arch-module-group");
      group.append(element("h4", "", relatedArea.label));
      const modules = element("ul", "arch-module-list");
      for (const module of relatedArea.modules) {
        const item = element("li", "arch-module-item");
        const heading = element("strong", "", module.label);
        item.append(heading, element("span", "arch-area-count", `${module.fileCount} files`));
        const paths = element("div", "arch-module-paths");
        for (const [index, modulePath] of module.paths.entries()) {
          const link = element("a", "", modulePath);
          link.href = module.hrefs[index];
          link.title = `Open ${modulePath} on the website`;
          paths.append(link);
        }
        item.append(paths);
        modules.append(item);
      }
      group.append(modules);
      groups.append(group);
    }
    section.append(groups);

    const dependencies = element("div", "arch-module-dependencies");
    dependencies.append(element("h4", "", `Dependencies (${edges.length})`));
    if (edges.length === 0) {
      dependencies.append(element("p", "arch-muted", "No cross-package source imports connect to this package's modules."));
    } else {
      const list = element("ul", "arch-module-edge-list");
      for (const edge of edges) {
        const item = element("li", "arch-module-edge-item");
        const from = element("span", "arch-module-endpoint", `${areaLabels.get(edge.fromArea)} / ${moduleLabels.get(edge.fromModule)}`);
        const arrow = element("span", `arch-module-edge${edge.count === 0 ? " arch-module-edge-types" : ""}`);
        arrow.append(element("span", "arch-module-edge-label", "depends on"), element("span", "arch-module-edge-line"));
        const to = element("span", "arch-module-endpoint", `${areaLabels.get(edge.toArea)} / ${moduleLabels.get(edge.toModule)}`);
        const imports = [
          edge.count > 0 ? `${edge.count} runtime` : "",
          edge.typeCount > 0 ? `${edge.typeCount} type-only` : "",
        ].filter(Boolean).join(", ");
        item.append(from, arrow, to, element("span", "arch-module-edge-count", imports));
        list.append(item);
      }
      dependencies.append(list);
    }
    section.append(dependencies);
    const close = element("button", "arch-module-close", "Close module view");
    close.type = "button";
    close.addEventListener("click", () => {
      section.dispatchEvent(new CustomEvent("close-module-view", { bubbles: true }));
    });
    section.append(close);
    return section;
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
      canvas.append(renderEdges(data));
      let selectedAreaId = null;
      const modulePanel = element("div", "arch-module-panel");
      modulePanel.hidden = true;
      modulePanel.addEventListener("close-module-view", () => {
        selectedAreaId = null;
        modulePanel.replaceChildren();
        for (const button of canvas.querySelectorAll(".arch-module-toggle")) {
          button.setAttribute("aria-pressed", "false");
          button.textContent = "Show modules";
        }
      });
      for (const area of data.areas) {
        const card = renderArea(area, (areaId) => {
          selectedAreaId = selectedAreaId === areaId ? null : areaId;
          modulePanel.replaceChildren();
          modulePanel.hidden = selectedAreaId === null;
          for (const button of canvas.querySelectorAll(".arch-module-toggle")) {
            const selected = button.closest(".arch-area-card").dataset.areaId === selectedAreaId;
            button.setAttribute("aria-pressed", String(selected));
            button.textContent = selected ? "Hide modules" : "Show modules";
          }
          if (selectedAreaId) modulePanel.append(renderModuleDetail(selectedAreaId, data));
        });
        card.dataset.areaId = area.id;
        card.style.left = `${area.x}px`;
        card.style.top = `${area.y}px`;
        card.style.width = `${area.width}px`;
        card.style.height = `${area.height}px`;
        canvas.append(card);
      }
      scroll.append(canvas);
      modulePanel.hidden = true;
      workspace.append(scroll, modulePanel, renderLegend(data));
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
