(() => {
  const root = document.querySelector("#software-architecture-tree");
  if (!root) return;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const mapData = fetch("/modules/software-architecture.json").then((response) => {
    if (!response.ok) throw new Error(`Map data request failed with HTTP ${response.status}.`);
    return response.json();
  });
  Promise.all([mapData, import("/modules/architectureTree.js")])
    .then(([data, { createArchitectureTree }]) => render(data, createArchitectureTree))
    .catch((error) => {
      const message = element("p", "arch-tree-error", `Unable to load the architecture tree: ${error.message}`);
      message.setAttribute("role", "alert");
      root.replaceChildren(message);
    });

  function render(data, createArchitectureTree) {
    const findings = data.report.unexpectedDependencies.length > 0
      || data.report.boundaryBypasses.length > 0
      || data.report.unassignedFiles.length > 0
      || data.report.staleExceptions.length > 0;
    const reportStatus = element(
      "p",
      `arch-tree-report-status${findings ? " has-findings" : ""}`,
      findings ? "Boundary findings need review." : "No unexpected dependency or containment findings.",
    );
    const tree = createArchitectureTree(data);
    root.replaceChildren(reportStatus, tree.toolbar, tree.status, tree.viewport, renderLegend(data), renderExclusions(data));
  }

  function renderLegend(data) {
    const legend = element("div", "arch-tree-legend");
    const add = (className, text) => {
      const item = element("span", "arch-tree-legend-item");
      item.append(element("span", className), element("span", "", text));
      legend.append(item);
    };
    add("arch-tree-legend-line", "Solid: runtime import or published asset.");
    if (data.fileEdges.some((edge) => edge.count === 0 && edge.assetReferences.length === 0 && edge.typeCount > 0)) {
      add("arch-tree-legend-line arch-tree-legend-dotted", "Dotted: type-only imports.");
    }
    if (data.fileEdges.some((edge) => edge.count === 0 && edge.typeCount === 0 && edge.assetReferences.length === 0)) {
      add("arch-tree-legend-line arch-tree-legend-dashed", "Dashed: declared dependency without a detected import or asset.");
    }
    legend.append(element("span", "arch-tree-legend-note", "Arrows point to dependencies. A loop represents relationships within one collapsed node. Published assets originate at their owning package."));
    return legend;
  }

  function dependencyLabel(data, areaId, nodeId) {
    const area = data.areas.find((candidate) => candidate.id === areaId);
    if (!area) throw new Error(`Unknown architecture area: ${areaId}`);
    const module = area.modules.find((candidate) => candidate.id === nodeId);
    return module ? `${area.label} / ${module.label}` : area.label;
  }

  function dependencyUse(edge) {
    const imports = edge.imports.map(({ file, specifier, typeOnly }) =>
      `${specifier} in ${file}${typeOnly ? " (type-only)" : ""}`,
    );
    const assets = edge.assetReferences.map((asset) => `published asset ${asset}`);
    return [...imports, ...assets].join(", ") || "declared dependency";
  }

  function renderExclusions(data) {
    const excluded = data.areas.filter((area) => !area.inDiagram);
    const section = element("section", "arch-tree-report");
    section.append(element("h2", "", `Sections excluded from the dependency tree (${excluded.length})`));
    const list = element("ul");
    for (const area of excluded) {
      const item = element("li");
      item.append(element("strong", "", area.label), document.createTextNode(` (${area.fileCount} files): `));
      const link = element("a", "", area.path);
      link.href = area.href;
      item.append(link);
      if (area.description) item.append(document.createTextNode(` - ${area.description}`));
      item.append(document.createTextNode(area.diagramExclusion
        ? ` Excluded: ${area.diagramExclusion.reason}`
        : " No dependency arrows."));
      const outgoing = data.excludedDiagramEdges.filter((edge) => edge.fromArea === area.id);
      const incoming = data.excludedDiagramEdges.filter((edge) => edge.toArea === area.id && edge.fromArea !== area.id);
      if (outgoing.length) {
        const dependencies = outgoing.map((edge) => `${dependencyLabel(data, edge.toArea, edge.to)} (${dependencyUse(edge)})`);
        item.append(document.createTextNode(` Workspace dependencies: ${dependencies.join("; ")}.`));
      }
      if (incoming.length) {
        const users = incoming.map((edge) => `${dependencyLabel(data, edge.fromArea, edge.from)} (${dependencyUse(edge)})`);
        item.append(document.createTextNode(` Referenced by: ${users.join("; ")}.`));
      }
      if (area.root !== ".") {
        const paths = data.report.approvedExceptions
          .filter((entry) => entry.file.startsWith(`${area.root}/`))
          .map((entry) => `${entry.target} (${entry.symbol})`);
        if (paths.length) item.append(document.createTextNode(` Approved runtime paths (not imports): ${paths.join("; ")}.`));
      }
      list.append(item);
    }
    if (excluded.length) section.append(list);
    else section.append(element("p", "", "None."));
    return section;
  }
})();
