# Scene Geometry

This folder derives renderer-independent debate scene geometry from layout frames and planner contracts.

## Main Entrypoints

- `resolveDebateSceneGeometry.ts` builds claim bounds, attachment ports, routed bands, and connector shells and fluids.
- `resolveDeliveryAggregatorGeometry.ts` builds delivery-aggregator polygons and through-flow bands.

Scene geometry depends on the lower-level geometry primitives, layout, and shared animation contracts. It has no React, SVG, or Remotion dependency; [Components](../../../components/📌README.md) render the resulting geometry.

<!-- autonav:start -->
<!-- autonav:end -->
