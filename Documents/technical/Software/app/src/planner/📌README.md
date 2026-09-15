# 📌 Planner

## Current Boundary

- The planner currently works from the pre-command `DebateCore` state plus the command payload.
- `planner` returns a named `DebateAnimationPlan` with an opening scalar frame and sequential `voila`, `sprout`, `firstFill`, and `wave` steps for confidence and relevance claim additions.
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

- current implementation target: one or more simultaneous `confidence/claim/add` or `relevance/claim/add` commands
- current animation cutoff: the first propagation `wave` from the command target through its outgoing connectors
- subsequent propagation waves and final global rescaling remain outside the current plan

## Current Layout Decisions

- A claim frame state's `scale` is its rendered size. In a settled state it matches `sourcesScale`, and an animation track may temporarily diverge.
- `sourcesScale` is the owned source-side potential-scale budget for that claim occurrence as a target. Direct confidence-child sibling groups share one child `sourcesScale`; downstream layout uses that value.
- Current `score` changes fluid fill inside that authored scale. Current `score` does not directly shrink an individual pipe or claim diameter, and it also participates in solving the shared base scale for a direct confidence-child sibling group.
- Display Confidence Connectors, Relevance Connectors, delivery-aggregator edge length, and source-claim boxes use the claim's `sourcesScale` as their settled size basis. Delivery Connectors and the outgoing side of a junction use that same child `sourcesScale` multiplied by the relevant child's continuous relevance multiplier.
- `claimLaneAxisGap` is an edge-to-edge gap, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry.
- The delivery-connector corridor has a base width of `(connectorCurveLaneWidth + connectorDiagonalLaneWidth + connectorCurveLaneWidth) * sourcesScale` plus the physical width of the widest junction among the target claim's incoming confidence connectors. A junction width is `claimHeight * junctionSpan`, and `junctionSpan` is the sum of that connector's attached relevance claims' source scales. No attached relevance claims contribute zero junction width.
- In the current orientation, claim boxes are left-justified within the claim-lane band.
- Each direct confidence connector owns one source-claim cluster consisting of its confidence claim and attached relevance claims. The confidence claim prefers the center of its matching delivery-stack port; relevance claims remain adjacent to that confidence claim.
- Source-claim clusters follow delivery-stack order and use constrained vertical packing. When preferred centers are too close for their claim boxes, clusters shift only as far as needed to preserve their scaled gaps and avoid overlap.
- Current planner-owned delivery corridor widths do not yet encode larger detours for route-around-line behavior or crossing avoidance. Those routing expansions are deferred rather than hidden in renderer-local stub lengths.
- The planner owns positions, scales, target-stack offsets, reveal tracks, and each confidence connection's junction span. `@reasontracker/components` owns attachment ports, route geometry, junction polygons, aggregators, and SVG rendering from each resolved scalar frame.
  - During `voila`, new-claim growth overlaps existing-claim repositioning, connector endpoint movement, target-stack offset changes, junction expansion, and the other structural changes needed to reach the command-applied neutral staging layout. New connector shells remain hidden. During `sprout`, each new connector reveals through that fixed staging layout; relevance-shell reveal retains its delayed start, and neither scores nor positions advance. During `firstFill`, the new fluid frontier and matching shell-profile handoff move together. Direct-adjustment positions, scales, offsets, and junction geometry begin moving during the contact portion of the still-running fill, while every parent claim score remains frozen. Only after all First Fill tracks finish does the single `wave` begin. That Wave changes the first affected parent score and all geometry implied by that score snapshot together.
- Delivery `targetSideOffset` side-anchors the full delivery shell around its ordered parent-fluid interval. A newly added confidence connection retains that stack cursor and fluid-side anchor while its staging and first-fill delivery wall narrows near the aggregator to its current delivered fluid width.
- Sprout changes only the reveal of newly added connectors; staging positions, scales, target offsets, junction spans, and existing connection geometry remain fixed. A temporarily tapered delivery reveals an already-authored full-route taper, so previously revealed wall geometry retains its width. During First Fill, direct-adjustment shell geometry follows behind a moving handoff while the original taper remains ahead. That handoff shares the fluid cap's calculated start, end, length, and easing, so the target opens only as the cap crosses it. During the final portion of First Fill, geometry derived from the direct-adjustment score snapshot transitions on one shared clock while connector endpoints remain attached. Wave starts from the exact completed First Fill frame, then applies only the first parent-propagation score snapshot and its resulting movement. Fluid-frontier transitions otherwise remain visual history rather than layout input.

<!-- autonav:start -->
<!-- autonav:end -->
