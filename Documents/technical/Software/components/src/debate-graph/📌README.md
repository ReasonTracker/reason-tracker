# Debate Graph Renderer

This folder renders engine-provided debate frames and scene geometry as React and SVG.

## Ownership

- `DebateGraph.tsx` composes render layers and claim content.
- `Pipe.tsx` and `DeliveryAggregator.tsx` render engine geometry.
- `visualConstants.ts` owns graph rendering colors.

The engine owns scoring, layout, attachment ports, routed bands, and aggregator geometry. This folder does not calculate those values.

<!-- autonav:start -->
<!-- autonav:end -->
