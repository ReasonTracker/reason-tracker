# Layout

This folder owns presentation-graph expansion, scoring projection, and debate-frame layout.

## Main Entrypoints

- `buildPresentationGraphFromDebateCore.ts`
- `resolvePresentationMath.ts`
- `buildDebateFrame.ts`

Layout consumes debate state and scoring results and returns occurrence-keyed scalar frames for the animation planner. It uses low-level [Geometry](../geometry/📌README.md) primitives; renderer-independent scene shapes are resolved by [Scene Geometry](../scene-geometry/📌README.md).

The scale, lane, and delivery-aggregator rules are defined in the [Debate Animation Data Model](../../../design/debate-animation-data-model.md).

<!-- autonav:start -->
<!-- autonav:end -->
