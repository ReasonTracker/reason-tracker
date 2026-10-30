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

  const mapData = fetch("/modules/software-architecture.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Map data request failed with HTTP ${response.status}.`);
      return response.json();
    });
  Promise.all([mapData, import("/modules/architectureDiagram.js")])
    .then(([data, { createArchitectureDiagram }]) => renderMap(data, createArchitectureDiagram))
    .catch((error) => {
      const message = element("p", "arch-error", `Unable to load the software architecture map: ${error.message}`);
      root.replaceChildren(message);
    });

  function renderMap(data, createArchitectureDiagram) {
    for (const area of data.areas) areaLabels.set(area.id, area.label);
    root.replaceChildren();
    const workspaceNode = findWorkspace(data.repositoryTree);
    if (!workspaceNode) throw new Error("The architecture map has no Software workspace.");

    const status = element("p", `arch-status${hasFindings(data.report) ? " has-findings" : ""}`);
    status.textContent = hasFindings(data.report)
      ? "Boundary findings need review."
      : "No unexpected dependency or containment findings.";
    root.append(status);

    const diagram = createArchitectureDiagram(data, workspaceNode.path, searchFolders);
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
    diagram.toolbar.append(expand, collapse);
    root.append(diagram.toolbar, diagram.status);

    const repositoryTree = element("ul", "arch-repository-tree");
    for (const child of data.repositoryTree.children) {
      repositoryTree.append(renderTreeNode(child, 0, data, diagram));
    }
    root.append(repositoryTree, renderReport(data));
    diagram.refresh();
  }

  function findWorkspace(node) {
    if (node.kind === "workspace") return node;
    for (const child of node.children ?? []) {
      const workspace = findWorkspace(child);
      if (workspace) return workspace;
    }
    return null;
  }

  function searchFolders(query) {
    for (const folder of root.querySelectorAll(".arch-tree-folder")) {
      const matches = !query || folder.dataset.search.includes(query);
      folder.hidden = !matches;
      if (query && matches) folder.open = true;
    }
  }

  function renderTreeNode(node, depth, data, diagram) {
    if (node.kind === "workspace") {
      const item = element("li");
      item.dataset.search = collectSearchText(node, data);
      const folder = element("details", "arch-tree-folder arch-workspace-folder");
      folder.dataset.search = item.dataset.search;
      folder.open = true;
      folder.append(element("summary", "", "Software workspace"));

      const workspace = element("div", "arch-workspace-content");
      workspace.append(element("p", "arch-workspace-path", node.path));
      workspace.append(diagram.scroll, diagram.legend);
      folder.append(workspace);
      item.append(folder);
      return item;
    }

    if (node.kind === "directory") {
      const item = element("li");
      item.dataset.search = collectSearchText(node, data);
      const folder = element("details", "arch-tree-folder");
      folder.dataset.search = item.dataset.search;
      folder.open = depth <= 1;
      const summary = element("summary", "", `${node.name}/`);
      folder.append(summary);
      const children = element("ul");
      for (const child of node.children) children.append(renderTreeNode(child, depth + 1, data, diagram));
      folder.append(children);
      item.append(folder);
      return item;
    }

    return element("li");
  }

  function collectSearchText(node, data) {
    const descendants = node.kind === "workspace"
      ? data.areas.map((area) => area.searchText).join(" ")
      : (node.children ?? []).map((child) => collectSearchText(child, data)).join(" ");
    return `${node.path} ${node.name} ${descendants}`.toLowerCase();
  }

  function renderReport(data) {
    const report = element("section", "arch-report");
    report.setAttribute("aria-label", "Dependency and containment report");
    report.append(
      reportSection("Sections excluded from the diagram", excludedSections(data)),
      reportSection("Allowed import directions", data.allowedPackageImports.map(({ from, to }) =>
        `${areaLabels.get(from)} may import from ${areaLabels.get(to)}.`,
      )),
      reportSection("Allowed shared-file imports", data.allowedRelativeImports.map(({ from, to, reason }) =>
        `${from} imports from ${to}. ${reason}`,
      )),
      reportSection("Observed package dependencies", data.edges.map((edge) => {
        const from = areaLabels.get(edge.from);
        const to = areaLabels.get(edge.to);
        const observedUse = dependencyUse(edge);

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
    for (const entry of entries) {
      const item = element("li");
      if (typeof entry === "string") item.textContent = entry;
      else item.append(entry);
      list.append(item);
    }
    section.append(list);
    return section;
  }

  function dependencyUse(edge) {
    const staticImports = edge.count > 0 ? `runtime imports: ${edge.count}` : "";
    const typeImports = edge.typeCount > 0 ? `type-only imports: ${edge.typeCount}` : "";
    const publishedAssets = edge.assetReferences.length > 0
      ? `published assets: ${edge.assetReferences.join(", ")}`
      : "";
    const imports = edge.imports?.length > 0
      ? `imports: ${edge.imports.map(({ file, specifier, typeOnly }) =>
        `${specifier} in ${file}${typeOnly ? " (type-only)" : ""}`).join(", ")}`
      : "";
    return [staticImports, typeImports, publishedAssets, imports].filter(Boolean).join("; ");
  }

  function excludedSections(data) {
    const entries = [];
    for (const area of data.areas) {
      if (!area.inDiagram) {
        entries.push(excludedSection(data, area));
        continue;
      }
      for (const module of area.modules.filter((candidate) => !candidate.inDiagram)) {
        entries.push(excludedSection(data, area, module));
      }
    }
    return entries;
  }

  function excludedSection(data, area, module = null) {
    const label = module ? `${area.label} / ${module.label}` : area.label;
    const fileCount = module ? module.fileCount : area.fileCount;
    const paths = module ? module.paths : [area.path];
    const hrefs = module ? module.hrefs : [area.href];
    const content = element("span");
    content.append(
      element("strong", "", label),
      document.createTextNode(` (${fileCount} ${fileCount === 1 ? "file" : "files"}): `),
    );
    for (const [index, sectionPath] of paths.entries()) {
      if (index > 0) content.append(document.createTextNode(", "));
      const link = element("a", "", sectionPath);
      link.href = hrefs[index];
      link.title = `Open ${sectionPath} on the website`;
      content.append(link);
    }
    if (!module && area.description) content.append(document.createTextNode(` - ${area.description}`));

    const outgoing = data.excludedDiagramEdges.filter((edge) =>
      module ? edge.from === module.id : edge.fromArea === area.id,
    );
    const incoming = data.excludedDiagramEdges.filter((edge) =>
      module ? edge.to === module.id : edge.toArea === area.id && edge.fromArea !== area.id,
    );
    if (!module && area.diagramExclusion) {
      content.append(document.createTextNode(` Excluded: ${area.diagramExclusion.reason}`));
    } else if (outgoing.length === 0 && incoming.length === 0) {
      content.append(document.createTextNode(" No dependency arrows."));
    } else {
      content.append(document.createTextNode(" No remaining diagram arrows."));
    }
    if (outgoing.length > 0) {
      const dependencies = outgoing.map((edge) =>
        `${dependencyNodeLabel(data, edge.toArea, edge.to)} (${dependencyUse(edge) || "declared dependency only"})`,
      );
      content.append(document.createTextNode(` Workspace dependencies: ${dependencies.join("; ")}.`));
    }
    if (incoming.length > 0) {
      const users = incoming.map((edge) =>
        `${dependencyNodeLabel(data, edge.fromArea, edge.from)} (${dependencyUse(edge) || "declared dependency only"})`,
      );
      content.append(document.createTextNode(` Referenced by: ${users.join("; ")}.`));
    }
    if (!module && area.root !== ".") {
      const runtimePaths = data.report.approvedExceptions
        .filter((entry) => entry.file.startsWith(`${area.root}/`))
        .map((entry) => `${entry.target} (${entry.symbol})`);
      if (runtimePaths.length > 0) {
        content.append(document.createTextNode(` Approved runtime paths (not imports): ${runtimePaths.join("; ")}.`));
      }
    }
    return content;
  }

  function dependencyNodeLabel(data, areaId, nodeId) {
    const area = data.areas.find((candidate) => candidate.id === areaId);
    const module = area.modules.find((candidate) => candidate.id === nodeId);
    return module ? `${area.label} / ${module.label}` : area.label;
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
