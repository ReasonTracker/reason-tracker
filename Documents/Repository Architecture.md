# Repository Architecture Map

This map combines repository folder containment with Software package and module dependencies. Area paths open their folders on this website; those pages list the contained files.

The [repository architecture tree](./Repository%20Architecture%20Tree.md) presents the same data as an expandable file tree.

Arrows point to dependencies. Solid arrows indicate a runtime source import or a published asset. Dotted arrows indicate type-only imports. Dashed arrows indicate a `package.json` dependency with no detected source import or published asset. Paths in the diagram are relative to `Documents/technical/Software/`.

Packages with multiple connected modules show their first source folders and connected source-root files inside the package card. The architecture definition can group related folders into one module; grouped modules link to each included folder. Sections without diagram arrows and configured exclusions are listed below the map with their dependencies.

The overview combines each directed package pair into one arrow. Select an arrow to see its detailed relationships, or select a package, folder, or file name to show its direct relationships. Hovering over a box or focusing on its controls previews its relationships. Search shows matching nodes, direct neighbours, and their connecting arrows; **Direction** limits relationships to dependencies, users, or both.

Internal arrows are off initially. Enable **Internal arrows** to include relationships within a package. **Show all** displays all detailed relationships allowed by that setting, **Overview** returns to package arrows while preserving the setting, and **Reset** restores the initial state.

The boundary report checks Software package directions and lists unexpected imports, unassigned Software files, and documented runtime path exceptions. Module grouping is descriptive; dependency-direction checks remain at the package level.

<div id="software-architecture-map" aria-live="polite">
  <p>Loading the software architecture map…</p>
</div>
