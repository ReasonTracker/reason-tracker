# Repository Architecture Tree

This tree combines the Software workspace's folder and file containment with its dependency directions. It uses the same generated data as the [repository architecture map](./Repository%20Architecture.md). Connected areas can be expanded into their actual folders and files; the configured Videos episode folders remain grouped. Excluded areas and their dependencies are listed below the tree.

Arrows point to dependencies. Solid arrows indicate a runtime source import or published asset, dotted arrows indicate type-only imports, and dashed arrows indicate a declared dependency without a detected source import or asset. Published assets begin at the owning package. Paths are relative to `Documents/technical/Software/`.

Collapsed nodes combine relationships into curved arrows. Expand a folder or select an arrow to reveal more detail; select a name to show its direct relationships. Hovering over a row or focusing on its controls previews those relationships. Search shows matching nodes, direct neighbours, and their connecting arrows. **Direction** limits relationships to dependencies, users, or both.

Internal arrows are off initially. Enable **Internal arrows** to include relationships within a package; a loop represents relationships inside a collapsed node. **Show all** clears the current selection and search while preserving the tree depth, **Overview** returns to collapsed packages while preserving arrow options, and **Reset** restores the initial state.

<div id="software-architecture-tree">
  <p>Loading the software architecture tree…</p>
</div>
