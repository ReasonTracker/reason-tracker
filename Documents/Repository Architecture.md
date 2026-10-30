# Repository Architecture Map

This map shows the repository's folder containment and the Software packages' dependency directions. Area paths open their folders on this website; those pages list the contained files.

Arrows point from a package to a package it depends on. Solid arrows indicate a runtime source import or a published asset. Dotted arrows indicate that only types are imported. Dashed arrows indicate a `package.json` dependency with no detected source import or published asset.

Packages with more than one module show their modules as boxes inside the package card, with arrows between modules, including modules in the same package. A module is a direct child folder of the source root configured for its area. Source files directly inside that root are grouped as **Entry**. The architecture definition can explicitly group related child folders into one module; grouped modules link to each included folder. Select a package or module name to highlight its dependencies.

The boundary report checks Software package directions and lists unexpected imports, unassigned Software files, and documented runtime path exceptions. Module grouping is descriptive; dependency-direction checks remain at the package level. Use search to find an area or folder.

<div id="software-architecture-map" aria-live="polite">
  <p>Loading the software architecture map…</p>
</div>
