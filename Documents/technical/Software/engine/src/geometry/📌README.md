# Geometry Primitives

This folder owns low-level, renderer-independent geometry primitives.

## Main Entrypoints

- `Point.ts` defines the shared point contract.
- `calculateConnectorCorridor.ts` resolves connector corridor dimensions.
- `path-geometry/` builds and measures paths around routed centerlines.

These primitives do not depend on layout, animation, React, SVG rendering, or Remotion. Higher-level scene geometry is owned by [Scene Geometry](../scene-geometry/📌README.md); [Components](../../../components/📌README.md) render its results.

<!-- autonav:start -->
- [Path Geometry](./path-geometry/📌README.md)
<!-- autonav:end -->
