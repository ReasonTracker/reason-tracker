import { createTreeArrows, TREE_LABEL_WIDTH, TREE_ROW_HEIGHT } from "./architectureTreeArrows.js";
import { ArchitectureTreeModel } from "./architectureTreeModel.js";

const TREE_INDENT = 20;
const TREE_ROW_PADDING = 12;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createArchitectureTree(data) {
  if (!data.workspaceTree || !Array.isArray(data.fileEdges)) {
    throw new Error("The shared architecture data needs to be regenerated for the tree view.");
  }
  const model = new ArchitectureTreeModel(data);
  const state = {
    expanded: new Set([model.root.id]),
    searchCollapsed: new Set(),
    query: "",
    direction: "both",
    includeInternal: false,
    selection: null,
    hoveredId: null,
    focusedId: null,
    previewSource: null,
  };
  let rows = new Map();
  let snapshot;

  const toolbar = element("div", "arch-tree-toolbar");
  const search = element("input");
  search.type = "search";
  search.placeholder = "Search folders and files";
  search.setAttribute("aria-label", "Search the architecture tree");
  const directionLabel = element("label", "arch-tree-control", "Direction");
  const direction = element("select");
  direction.setAttribute("aria-label", "Dependency direction");
  for (const [value, label] of [["both", "Both"], ["outgoing", "Depends on"], ["incoming", "Used by"]]) {
    const option = element("option", "", label);
    option.value = value;
    direction.append(option);
  }
  direction.value = state.direction;
  directionLabel.append(direction);
  const internalLabel = element("label", "arch-tree-internal");
  const internal = element("input");
  internal.type = "checkbox";
  internalLabel.append(internal, element("span", "", "Internal arrows"));
  const overview = element("button", "", "Overview");
  const showAll = element("button", "", "Show all");
  const expandAll = element("button", "", "Expand folders");
  const collapseAll = element("button", "", "Collapse folders");
  const reset = element("button", "", "Reset");
  for (const button of [overview, showAll, expandAll, collapseAll, reset]) button.type = "button";
  overview.title = "Return to collapsed packages without changing arrow options";
  showAll.title = "Show all allowed relationships at the current tree depth";
  reset.title = "Restore the initial tree and arrow options";
  toolbar.append(search, directionLabel, internalLabel, overview, showAll, expandAll, collapseAll, reset);

  const status = element("p", "arch-tree-status");
  status.setAttribute("role", "status");
  const viewport = element("div", "arch-tree-scroll");
  const canvas = element("div", "arch-tree-canvas");
  const content = element("div", "arch-tree-content");
  content.style.width = `${TREE_LABEL_WIDTH}px`;
  canvas.append(content);
  viewport.append(canvas);

  function clearPreview() {
    state.hoveredId = null;
    state.focusedId = null;
    state.previewSource = null;
  }

  function bindPreview(row, id) {
    row.addEventListener("mouseenter", () => {
      state.hoveredId = id;
      state.previewSource = "hover";
      refresh();
    });
    row.addEventListener("mouseleave", () => {
      if (state.hoveredId === id) {
        state.hoveredId = null;
        refresh();
      }
    });
    row.addEventListener("focusin", () => {
      state.focusedId = id;
      state.previewSource = "focus";
      refresh();
    });
    row.addEventListener("focusout", (event) => {
      if (!row.contains(event.relatedTarget) && state.focusedId === id) {
        state.focusedId = null;
        refresh();
      }
    });
  }

  function toggleNode(id) {
    const open = snapshot.expanded.has(id);
    if (state.query) {
      if (open) state.searchCollapsed.add(id);
      else state.searchCollapsed.delete(id);
    } else if (open) {
      state.expanded.delete(id);
    } else {
      state.expanded.add(id);
    }
    clearPreview();
    renderLayout();
    rows.get(id)?.toggle?.focus({ preventScroll: true });
  }

  function renderRow(node, depth) {
    const item = element("li");
    const row = element("div", `arch-tree-row arch-tree-${node.kind}`);
    row.dataset.nodeId = node.id;
    row.style.paddingLeft = `${TREE_ROW_PADDING + depth * TREE_INDENT}px`;
    row.style.height = `${TREE_ROW_HEIGHT}px`;
    const entry = { row, button: null, toggle: null };
    if (node.kind !== "workspace") bindPreview(row, node.id);
    if (node.children?.length && node.kind !== "workspace") {
      const toggle = element("button", "arch-tree-toggle", snapshot.expanded.has(node.id) ? "-" : "+");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(snapshot.expanded.has(node.id)));
      toggle.setAttribute("aria-label", `${snapshot.expanded.has(node.id) ? "Collapse" : "Expand"} ${node.name}`);
      toggle.addEventListener("click", () => toggleNode(node.id));
      entry.toggle = toggle;
      row.append(toggle);
    } else {
      const spacer = element("span", "arch-tree-toggle-space");
      spacer.setAttribute("aria-hidden", "true");
      row.append(spacer);
    }

    if (node.kind === "workspace") {
      row.append(element("strong", "arch-tree-name", node.name));
    } else {
      const label = node.kind === "group" ? `${node.name} (grouped)` : node.name;
      const select = element("button", "arch-tree-select", label);
      select.type = "button";
      select.title = node.path ?? node.paths.join(", ");
      select.setAttribute("aria-label", `Show dependencies of ${label}: ${select.title}`);
      select.setAttribute("aria-pressed", "false");
      select.addEventListener("click", () => {
        state.selection = state.selection?.kind === "node" && state.selection.id === node.id
          ? null
          : { kind: "node", id: node.id };
        clearPreview();
        refresh();
      });
      entry.button = select;
      row.append(select);
    }
    if (node.kind !== "file") row.append(element("span", "arch-tree-count", `${node.fileCount} files`));
    const paths = node.paths ?? [node.path];
    const hrefs = node.hrefs ?? [node.href];
    for (const [index, href] of hrefs.entries()) {
      const linkText = hrefs.length === 1 ? "Open" : paths[index].split("/").pop();
      const link = element("a", "arch-tree-link", linkText);
      link.href = href;
      link.title = `Open ${paths[index]} on the website`;
      link.setAttribute("aria-label", link.title);
      row.append(link);
    }
    item.append(row);
    rows.set(node.id, entry);
    return item;
  }

  function describe() {
    let prefix = "";
    if (snapshot.focus?.kind === "node") {
      const node = model.nodes.get(snapshot.focus.id);
      prefix = `${snapshot.focus.preview ? "Preview" : "Selected"}: ${node.name}. `;
    } else if (snapshot.focus?.kind === "pair") {
      const from = model.nodes.get(snapshot.focus.from).name;
      const to = model.nodes.get(snapshot.focus.to).name;
      prefix = `Relationships from ${from} to ${to}. `;
    }
    if (state.query) prefix += `${snapshot.matchCount} matching ${snapshot.matchCount === 1 ? "node" : "nodes"}. `;
    return `${prefix}${snapshot.representedCount} of ${snapshot.totalCount} relationships represented by ${snapshot.groups.length} ${snapshot.groups.length === 1 ? "arrow" : "arrows"}. Internal arrows ${state.includeInternal ? "on" : "off"}.`;
  }

  function selectArrow(group) {
    state.selection = { kind: "pair", from: group.from, to: group.to };
    for (const id of [group.from, group.to]) {
      if (model.nodes.get(id).children?.length) {
        state.expanded.add(id);
        state.searchCollapsed.delete(id);
      }
    }
    clearPreview();
    renderLayout();
    overview.focus({ preventScroll: true });
  }

  function update() {
    const active = Boolean(state.query || snapshot.focus);
    canvas.classList.toggle("has-selection", active);
    for (const [id, entry] of rows) {
      const selected = state.selection?.kind === "node" && state.selection.id === id;
      entry.row.classList.toggle("is-related", snapshot.related.has(id));
      entry.row.classList.toggle("is-selected", selected);
      entry.button?.setAttribute("aria-pressed", String(selected));
    }
    direction.disabled = !snapshot.directionEnabled;
    status.textContent = describe();
    const { svg, width } = createTreeArrows(model, snapshot, selectArrow);
    svg.style.left = `${TREE_LABEL_WIDTH}px`;
    canvas.style.width = `${TREE_LABEL_WIDTH + width}px`;
    canvas.style.height = `${snapshot.rows.length * TREE_ROW_HEIGHT}px`;
    const oldArrows = canvas.querySelector(".arch-tree-arrows");
    if (oldArrows) oldArrows.replaceWith(svg);
    else canvas.append(svg);
  }

  function refresh() {
    snapshot = model.resolve(state);
    update();
  }

  function renderLayout() {
    snapshot = model.resolve(state);
    if (state.selection?.kind === "node" && !snapshot.rows.some(({ node }) => node.id === state.selection.id)) {
      state.selection = null;
      snapshot = model.resolve(state);
    }
    rows = new Map();
    const list = element("ul", "arch-tree-list");
    const childLists = new Map();
    for (const { node, depth } of snapshot.rows) {
      const item = renderRow(node, depth);
      const parent = node.parentId ? childLists.get(node.parentId) : list;
      if (!parent) throw new Error(`Missing visible parent for architecture tree node: ${node.id}`);
      parent.append(item);
      if (snapshot.expanded.has(node.id) && node.children?.length) {
        const children = element("ul");
        item.append(children);
        childLists.set(node.id, children);
      }
    }
    content.replaceChildren(list);
    update();
  }

  search.addEventListener("input", () => {
    state.query = search.value.trim().toLowerCase();
    state.selection = null;
    state.searchCollapsed.clear();
    clearPreview();
    renderLayout();
  });
  direction.addEventListener("change", () => {
    state.direction = direction.value;
    if (state.query) renderLayout();
    else refresh();
  });
  internal.addEventListener("change", () => {
    state.includeInternal = internal.checked;
    if (state.query) renderLayout();
    else refresh();
  });
  overview.addEventListener("click", () => {
    state.expanded = new Set([model.root.id]);
    state.searchCollapsed.clear();
    state.query = "";
    state.selection = null;
    search.value = "";
    clearPreview();
    renderLayout();
  });
  showAll.addEventListener("click", () => {
    state.expanded = new Set(snapshot.expanded);
    state.query = "";
    state.selection = null;
    state.searchCollapsed.clear();
    search.value = "";
    clearPreview();
    renderLayout();
  });
  expandAll.addEventListener("click", () => {
    state.expanded = new Set([...model.nodes.values()].filter((node) => node.children?.length).map((node) => node.id));
    state.searchCollapsed.clear();
    clearPreview();
    renderLayout();
  });
  collapseAll.addEventListener("click", () => {
    state.expanded = new Set([model.root.id]);
    state.searchCollapsed = new Set([...model.nodes.values()]
      .filter((node) => node.id !== model.root.id && node.children?.length)
      .map((node) => node.id));
    clearPreview();
    renderLayout();
  });
  reset.addEventListener("click", () => {
    state.expanded = new Set([model.root.id]);
    state.searchCollapsed.clear();
    state.query = "";
    state.direction = "both";
    state.includeInternal = false;
    state.selection = null;
    search.value = "";
    direction.value = "both";
    internal.checked = false;
    clearPreview();
    renderLayout();
  });

  renderLayout();
  return { toolbar, status, viewport };
}
