# Debate Graph

This folder owns host-independent debate scene geometry and the shared React/SVG renderer.

## Boundaries

- Consume resolved scalar `DebateFrame` values from the app planner.
- Derive claim bounds and every connector endpoint from shared typed attachment ports.
- Build shell and fluid bands from one routed centerline and one route topology per frame.
- Draw connectors before junctions, aggregators, and claims so shared boundaries overlap cleanly.
- Show a delivery aggregator for every claim with at least one incoming confidence connector.
- Resolve every outline from one shared base width and the local structure's scale. Junctions and aggregators use their attached pipe scales rather than the target claim scale.
- Keep Remotion timing and composition APIs outside this folder.
