# Debate Graph Renderer

This folder renders engine-provided debate frames and scene geometry as React and SVG. It imports only types from the engine; callers resolve scene geometry and pass it in.

## Ownership

- `DebateGraph.tsx` composes render layers and claim content from a supplied `DebateSceneGeometry`.
- `Pipe.tsx` and `DeliveryAggregator.tsx` render engine geometry.
- `pathGeometrySvg.ts` converts engine path-geometry commands into SVG path data.
- `visualConstants.ts` owns graph rendering colors.

The engine owns scoring, layout, attachment ports, routed bands, outline widths, and aggregator geometry. This folder does not calculate those values.

<!-- autonav:start -->
<!-- autonav:end -->
