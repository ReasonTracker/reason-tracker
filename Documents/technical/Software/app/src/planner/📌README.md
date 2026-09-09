# 📌 Planner

## Current Boundary

- The planner currently works from the pre-command `DebateCore` state plus the command payload.
- `planner` returns a named `DebateAnimationPlan` with an opening scalar frame and `voila`, `sprout`, `firstFill`, and `wave` steps.
- `resolveAnimationFrame` is the only interpolation boundary. Renderers consume resolved scalar frames and do not interpret planner tweens.
- `resolvePresentationMath` performs cycle-aware scoring once, builds the deterministic presentation graph, and maps aggregate scores, sides, and scales onto path occurrences.
- The presentation graph expands the original DebateCore by path. It emits a repeated ancestor claim once as an ordinary terminal occurrence, then stops only that branch.
- Claim and connector occurrence IDs are path-derived. Reusable domain IDs remain available for content and aggregate-value lookup.

## Command Contract Status

- The current debate-core command payloads are behind the current planner and connector architecture.
- Further planner implementation should start from a reviewed command-contract proposal instead of stretching the old payload shapes.
- A likely long-term direction is to replace the overloaded add-claim flow with distinct command contracts for confidence-attached claim creation and relevance-attached claim creation, but that shape is not approved yet.
- Because debate-core owns exported command contracts, make a concrete proposal and get approval before changing those payloads.
- Favor the best long-term architectural boundary here, not the smallest patch that gets one planner case moving.

## Current Scope

- current implementation target: one or more simultaneous `confidence/claim/add` commands
- current animation cutoff: the first propagation `wave` from the command target through its outgoing connectors
- subsequent propagation waves and final global rescaling remain outside the current plan

## Current Layout Decisions

- A claim frame state's `scale` is its rendered size. In a settled state it matches `sourcesScale`, and an animation track may temporarily diverge.
- `sourcesScale` is the owned source-side potential-scale budget for that claim occurrence as a target. Direct confidence-child sibling groups share one child `sourcesScale`; downstream layout uses that value.
- Current `score` changes fluid fill inside that authored scale. Current `score` does not directly shrink an individual pipe or claim diameter, and it also participates in solving the shared base scale for a direct confidence-child sibling group.
- Display Confidence Connectors, Relevance Connectors, delivery-aggregator edge length, and source-claim boxes use the claim's `sourcesScale` as their settled size basis. Delivery Connectors and the outgoing side of a junction use that same child `sourcesScale` multiplied by the relevant child's continuous relevance multiplier.
- `claimLaneAxisGap` is an edge-to-edge gap, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry.
- The delivery-connector corridor is expressed as `connectorCurveLaneWidth + connectorDiagonalLaneWidth + connectorCurveLaneWidth`, and adds `junctionLaneWidth` when the junction lane is occupied.
- Those cross-lane widths also resolve at the same local `sourcesScale` as the surrounding geometry.
- In the current orientation, claim boxes are left-justified within the claim-lane band.
- Sibling source claims form local clusters that stay mostly centered on their source claim when surrounding constraints permit it.
- Current planner-owned delivery corridor widths do not yet encode larger detours for route-around-line behavior or crossing avoidance. Those routing expansions are deferred rather than hidden in renderer-local stub lengths.
- The planner owns positions, scales, target-stack offsets, and reveal tracks. `@reasontracker/components` owns attachment ports, route geometry, junctions, aggregators, and SVG rendering from each resolved scalar frame.
- Delivery `targetSideOffset` comes from ordered parent-fluid intervals, including zero-width points. Full delivery shells are side-anchored around those intervals and may overlap.
- Wave resolution interpolates logical claim and delivery scores first, then rebuilds all dependent presentation scales and frame layout from the settled topology. Fluid-frontier transitions remain visual history rather than layout input.

<!-- autonav:start -->
<!-- autonav:end -->
