# Debate Graph

This folder owns host-independent debate scene geometry and the shared React/SVG renderer.

## Boundaries

- Consume resolved scalar `DebateFrame` values from the app planner.
- Derive claim bounds and every connector endpoint from shared typed attachment ports.
- Build shell and fluid bands from one routed centerline and one route topology per frame.
- `Pipe` renders one connector pipe from its shell and fluid side boundaries, one layer at a time. Its optional `fluidBorder`, enabled for graph connectors, draws a thin black line along only the fluid's two long sides, never its start or end edges, so fluid reads as continuous where connectors meet. Flows inside delivery aggregators have no fluid border.
- Scene geometry returns pipe side boundaries, not SVG strings; `Pipe` and `DeliveryAggregator` own SVG output.
- Draw in passes: every pipe shell (connector shells, then delivery aggregator backgrounds and flow shells), then every pipe fluid (connector fluids, then aggregator flow fluids), then aggregator borders, then claims. No connector bypasses these passes, so no pipe shell covers another pipe's fluid.
- Draw foreground claims after regular claims.
- Show a trapezoid delivery aggregator on a claim's children-facing side only when relevance is attached to that claim's outgoing confidence connector. Confidence connectors land on its children-side edge and relevance connectors land on its bottom edge. Each landed confidence connector's shell and fluid continue through the trapezoid to the claim, scaled by the ratio of the claim-side edge to the children-side edge.
- `resolveDeliveryAggregatorGeometry` owns the trapezoid and through-flow geometry, and `DeliveryAggregator` renders it.
- Resolve every outline from one shared base width and the local structure's scale. Delivery aggregators use the largest of the claim scale, base scale, and attached relevance scales.
- Keep Remotion timing and composition APIs outside this folder.
