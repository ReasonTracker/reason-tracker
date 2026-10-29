# Geometry

This folder owns renderer-independent debate scene and path geometry.

## Main Entrypoints

- `resolveDebateSceneGeometry.ts` derives claim bounds, attachment ports, routed bands, and connector shells and fluids from layout frames.
- `resolveDeliveryAggregatorGeometry.ts` derives delivery-aggregator polygons and through-flow bands.
- `path-geometry/` builds and measures paths around routed centerlines.
- `Point.ts` defines the shared point contract.

The layout layer owns positions and scales. This layer derives geometry from that state without React, SVG rendering, or Remotion dependencies. [Components](../../../components/📌README.md) render the resulting geometry.

<!-- autonav:start -->
- [Path Geometry](./path-geometry/📌README.md)
<!-- autonav:end -->
