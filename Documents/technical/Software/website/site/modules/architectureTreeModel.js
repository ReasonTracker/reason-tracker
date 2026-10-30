export class ArchitectureTreeModel {
  constructor(data) {
    this.root = data.workspaceTree;
    this.edges = data.fileEdges;
    this.nodes = new Map();
    this.indexNode(this.root, null, []);
    for (const edge of this.edges) {
      if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) {
        throw new Error(`Unknown tree dependency: ${edge.from} to ${edge.to}`);
      }
    }
  }

  indexNode(node, parentId, ancestors) {
    if (this.nodes.has(node.id)) throw new Error(`Duplicate architecture tree node: ${node.id}`);
    const parents = [...ancestors, node.id];
    this.nodes.set(node.id, {
      ...node,
      parentId,
      ancestors: new Set(parents),
      searchText: `${node.name} ${node.path ?? ""} ${(node.paths ?? []).join(" ")}`.toLowerCase(),
    });
    for (const child of node.children ?? []) this.indexNode(child, node.id, parents);
  }

  contains(nodeId, endpointId) {
    const endpoint = this.nodes.get(endpointId);
    if (!endpoint || !this.nodes.has(nodeId)) throw new Error(`Unknown architecture tree node: ${nodeId} or ${endpointId}`);
    return endpoint.ancestors.has(nodeId);
  }

  matchesDirection(edge, nodeId, direction) {
    const outgoing = this.contains(nodeId, edge.from);
    const incoming = this.contains(nodeId, edge.to);
    return (direction !== "incoming" && outgoing) || (direction !== "outgoing" && incoming);
  }

  addAncestors(ids, nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown architecture tree node: ${nodeId}`);
    for (const ancestor of node.ancestors) ids.add(ancestor);
  }

  visibleAncestor(nodeId, visible) {
    let node = this.nodes.get(nodeId);
    while (node && !visible.has(node.id)) node = this.nodes.get(node.parentId);
    if (!node) throw new Error(`No visible ancestor for architecture tree node: ${nodeId}`);
    return node.id;
  }

  filterFocus(edges, focus, direction) {
    if (focus.kind === "pair") {
      return edges.filter((edge) => this.contains(focus.from, edge.from) && this.contains(focus.to, edge.to));
    }
    return edges.filter((edge) => this.matchesDirection(edge, focus.id, direction));
  }

  groupEdges(edges, visible) {
    const groups = new Map();
    for (const edge of edges) {
      const from = this.visibleAncestor(edge.from, visible);
      const to = this.visibleAncestor(edge.to, visible);
      const key = JSON.stringify([from, to]);
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          from,
          to,
          edges: [],
          runtime: new Set(),
          types: new Set(),
          assets: new Set(),
        });
      }
      const group = groups.get(key);
      group.edges.push(edge);
      for (const reference of edge.imports) {
        const referenceKey = JSON.stringify([reference.file, reference.specifier]);
        if (reference.typeOnly) group.types.add(referenceKey);
        else group.runtime.add(referenceKey);
      }
      for (const asset of edge.assetReferences) group.assets.add(asset);
    }
    return [...groups.values()].map(({ runtime, types, assets, ...group }) => ({
      ...group,
      count: runtime.size,
      typeCount: [...types].filter((reference) => !runtime.has(reference)).length,
      assetReferences: [...assets].sort(),
    }));
  }

  resolve(state) {
    const eligible = state.includeInternal
      ? this.edges
      : this.edges.filter((edge) => edge.fromArea !== edge.toArea);
    const matches = new Set();
    let searchEdges = eligible;
    let included = null;
    const expanded = new Set(state.expanded);

    if (state.query) {
      for (const node of this.nodes.values()) {
        if (node.searchText.includes(state.query)) matches.add(node.id);
      }
      searchEdges = eligible.filter((edge) =>
        [...matches].some((id) => this.matchesDirection(edge, id, state.direction)),
      );
      included = new Set([this.root.id]);
      for (const id of matches) this.addAncestors(included, id);
      for (const edge of searchEdges) {
        this.addAncestors(included, edge.from);
        this.addAncestors(included, edge.to);
      }
      for (const id of included) {
        const parentId = this.nodes.get(id).parentId;
        if (parentId) expanded.add(parentId);
      }
      for (const id of state.searchCollapsed) expanded.delete(id);
    }
    expanded.add(this.root.id);

    const rows = [];
    const visible = new Set();
    const visit = (node, depth) => {
      if (included && !included.has(node.id)) return;
      rows.push({ node: this.nodes.get(node.id), depth });
      visible.add(node.id);
      if (expanded.has(node.id)) {
        for (const child of node.children ?? []) visit(child, depth + 1);
      }
    };
    visit(this.root, 0);

    let previewId = state.previewSource === "focus"
      ? state.focusedId ?? state.hoveredId
      : state.hoveredId ?? state.focusedId;
    if (previewId && !visible.has(previewId)) previewId = null;
    if (state.selection?.kind === "node" && state.selection.id === previewId) previewId = null;
    let focus = previewId ? { kind: "node", id: previewId, preview: true } : state.selection;
    if (focus?.kind === "node" && !visible.has(focus.id)) focus = null;
    const edges = focus ? this.filterFocus(searchEdges, focus, state.direction) : searchEdges;
    const groups = this.groupEdges(edges, visible);
    const related = new Set();
    if (state.query) for (const id of matches) this.addAncestors(related, id);
    if (focus?.kind === "node") this.addAncestors(related, focus.id);
    if (focus?.kind === "pair") {
      this.addAncestors(related, focus.from);
      this.addAncestors(related, focus.to);
    }
    if (state.query || focus) {
      for (const group of groups) {
        this.addAncestors(related, group.from);
        this.addAncestors(related, group.to);
      }
    }

    return {
      rows,
      expanded,
      groups,
      related,
      focus,
      matchCount: matches.size,
      representedCount: edges.length,
      totalCount: this.edges.length,
      directionEnabled: Boolean(state.query || focus?.kind === "node"),
    };
  }
}
