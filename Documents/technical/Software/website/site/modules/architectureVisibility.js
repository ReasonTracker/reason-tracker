export class ArchitectureVisibility {
  constructor(data, workspacePath) {
    this.edges = data.diagramEdges;
    this.nodes = new Map();
    this.summaries = [];

    for (const area of data.areas.filter((candidate) => candidate.inDiagram)) {
      const path = area.path === "." ? workspacePath : `${workspacePath}/${area.path}`;
      this.nodes.set(area.id, {
        id: area.id,
        areaId: area.id,
        label: area.label,
        isArea: true,
        box: area,
        searchText: `${area.label} ${area.path} ${path} ${area.description}`.toLowerCase(),
      });
      for (const module of area.modules.filter((candidate) => candidate.inDiagram)) {
        this.nodes.set(module.id, {
          id: module.id,
          areaId: area.id,
          label: module.label,
          isArea: false,
          box: module,
          searchText: module.searchText.toLowerCase(),
        });
      }
    }

    const pairs = new Map();
    for (const edge of this.edges) {
      if (edge.fromArea === edge.toArea) continue;
      const key = JSON.stringify([edge.fromArea, edge.toArea]);
      if (!pairs.has(key)) {
        const summary = {
          fromArea: edge.fromArea,
          toArea: edge.toArea,
          edges: [],
          count: 0,
          typeCount: 0,
          assetReferences: [],
        };
        pairs.set(key, summary);
        this.summaries.push(summary);
      }
      const summary = pairs.get(key);
      summary.edges.push(edge);
      summary.count += edge.count;
      summary.typeCount += edge.typeCount;
      for (const asset of edge.assetReferences) {
        if (!summary.assetReferences.includes(asset)) summary.assetReferences.push(asset);
      }
    }
  }

  matchesDirection(edge, nodeId, direction) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown architecture node: ${nodeId}`);
    const outgoing = node.isArea ? edge.fromArea === nodeId : edge.from === nodeId;
    const incoming = node.isArea ? edge.toArea === nodeId : edge.to === nodeId;
    return (direction !== "incoming" && outgoing) || (direction !== "outgoing" && incoming);
  }

  addNode(ids, nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown architecture node: ${nodeId}`);
    ids.add(nodeId);
    ids.add(node.areaId);
  }

  addEdgeNodes(ids, edge) {
    this.addNode(ids, edge.from);
    this.addNode(ids, edge.to);
  }

  filterFocus(edges, focus, direction) {
    if (focus.kind === "pair") {
      return edges.filter((edge) => edge.fromArea === focus.fromArea && edge.toArea === focus.toArea);
    }
    return edges.filter((edge) => this.matchesDirection(edge, focus.id, direction));
  }

  resolve(state) {
    const eligible = state.includeInternal
      ? this.edges
      : this.edges.filter((edge) => edge.fromArea !== edge.toArea);
    const matches = new Set();
    let searchEdges = eligible;
    let searchNodes = null;

    if (state.query) {
      for (const node of this.nodes.values()) {
        if (node.searchText.includes(state.query)) matches.add(node.id);
      }
      searchEdges = eligible.filter((edge) =>
        [...matches].some((id) => this.matchesDirection(edge, id, state.direction)),
      );
      searchNodes = new Set();
      for (const id of matches) this.addNode(searchNodes, id);
      for (const edge of searchEdges) this.addEdgeNodes(searchNodes, edge);
    }

    let previewId = state.previewSource === "focus"
      ? state.focusedId ?? state.hoveredId
      : state.hoveredId ?? state.focusedId;
    if (searchNodes && previewId && !searchNodes.has(previewId)) previewId = null;
    if (state.selection?.kind === "node" && state.selection.id === previewId) previewId = null;
    let focus = previewId ? { kind: "node", id: previewId, preview: true } : state.selection;
    if (searchNodes && focus?.kind === "node" && !searchNodes.has(focus.id)) focus = null;

    let mode;
    let edges;
    let summaries = [];
    if (state.query) {
      mode = "search";
      edges = focus ? this.filterFocus(searchEdges, focus, state.direction) : searchEdges;
    } else if (focus) {
      mode = "focus";
      edges = this.filterFocus(eligible, focus, state.direction);
    } else if (state.showAll) {
      mode = "all";
      edges = eligible;
    } else {
      mode = "overview";
      summaries = this.summaries;
      edges = eligible.filter((edge) => edge.fromArea === edge.toArea);
    }

    const related = new Set();
    if (state.query) {
      for (const id of matches) this.addNode(related, id);
    }
    if (focus?.kind === "node") this.addNode(related, focus.id);
    if (focus?.kind === "pair") {
      this.addNode(related, focus.fromArea);
      this.addNode(related, focus.toArea);
    }
    if (state.query || focus) {
      for (const edge of edges) this.addEdgeNodes(related, edge);
    }

    return {
      mode,
      focus,
      edges,
      summaries,
      searchNodes,
      matchCount: matches.size,
      related,
      directionEnabled: Boolean(state.query || focus?.kind === "node"),
      representedCount: edges.length + summaries.reduce((count, summary) => count + summary.edges.length, 0),
      totalCount: this.edges.length,
    };
  }
}
