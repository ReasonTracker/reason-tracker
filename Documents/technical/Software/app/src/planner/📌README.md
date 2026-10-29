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

- A claim frame state's `scale` is its rendered box size. In a settled state it equals that claim's base scale multiplied by its continuous relevance multiplier, and an animation track may temporarily diverge.
- `sourcesScale` is the claim occurrence's base scale. Direct confidence children and relevance claims that modify the same claim's delivery share one base scale, and that base scale is also the budget for the claim's own children.
- Current `score` changes fluid fill inside that authored scale. Current `score` does not directly shrink an individual pipe or claim diameter, and it also participates in solving the shared base scale for a direct confidence-child sibling group.
- Delivery Connectors use the source claim's box `scale`. Relevance Connectors use the relevance claim's box `scale`. Delivery-stack ports on a target use the target's `sourcesScale`.
- A claim with relevance attached to its outgoing confidence connector shows a trapezoid delivery aggregator on its children-facing side. The aggregator's claim-side edge matches the claim box height, its children-side edge is `claimHeight * sourcesScale`, and its top and bottom sides slant equally. Each slanted side is as long as the sum of the incoming relevance connector widths, unless that would make it steeper than 45°; then it lengthens to run at 45°. Positive net relevance flares the trapezoid toward the claim; negative net relevance flares it toward the children. A claim without relevance shows no aggregator.
- Confidence children land on the trapezoid's children-side edge, and their shells and fluid continue through it to the claim, growing or shrinking by the ratio of the claim-side edge to the children-side edge. Relevance connectors land on the trapezoid's bottom edge, with the nearest relevance claim landing farthest from the claim.
- `claimLaneAxisGap` is an edge-to-edge gap, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry.
- The delivery-connector corridor width is `(connectorCurveLaneWidth + connectorDiagonalLaneWidth + connectorCurveLaneWidth)` times the largest rendered scale among the target claim's confidence children and relevance claims in that child column, times `CONNECTOR_COLUMN_WIDTH_MULTIPLIER` (1.5), plus the target claim's delivery-aggregator width.
- In the current orientation, claim boxes are left-justified within the claim-lane band.
- A claim's column holds its confidence children, then the relevance claims that modify that claim's delivery stacked below them. Confidence children prefer the center of their matching delivery-stack port; the first relevance claim prefers to sit just below the delivery aggregator.
- Column entries use constrained vertical packing against horizontal contours of their rendered subtrees. Contours include claim boxes, delivery aggregators, and routed connectors, so deep geometry only constrains spacing where horizontal ranges overlap.
- Current planner-owned delivery corridor widths do not yet encode larger detours for route-around-line behavior or crossing avoidance. Those routing expansions are deferred rather than hidden in renderer-local stub lengths.
- The planner owns positions, scales, target-stack offsets, relevance landing offsets, and reveal tracks. `@reasontracker/components` owns attachment ports, route geometry, delivery-aggregator polygons, and SVG rendering from each resolved scalar frame.
  - During `voila`, new-claim growth overlaps existing-claim repositioning, connector endpoint movement, target-stack offset changes, delivery-aggregator growth, and the other structural changes needed to reach the command-applied neutral staging layout. New connector shells remain hidden. During `sprout`, each new connector reveals through that fixed staging layout; relevance-shell reveal retains its delayed start, and neither scores nor positions advance. During `firstFill`, the new fluid frontier and matching shell-profile handoff move together. Direct-adjustment positions, scales, offsets, and delivery-aggregator geometry begin moving during the contact portion of the still-running fill, while every parent claim score remains frozen. Only after all First Fill tracks finish does the single `wave` begin. That Wave changes the first affected parent score and all geometry implied by that score snapshot together.
- Delivery `targetSideOffset` side-anchors the full delivery shell around its ordered parent-fluid interval. A newly added confidence connection retains that stack cursor and fluid-side anchor while its staging and first-fill delivery wall narrows near the aggregator to its current delivered fluid width.
- Sprout changes only the reveal of newly added connectors; staging positions, scales, target offsets, and existing connection geometry remain fixed. A temporarily tapered delivery reveals an already-authored full-route taper, so previously revealed wall geometry retains its width. During First Fill, direct-adjustment shell geometry follows behind a moving handoff while the original taper remains ahead. That handoff shares the fluid cap's calculated start, end, length, and easing, so the target opens only as the cap crosses it. During the final portion of First Fill, geometry derived from the direct-adjustment score snapshot transitions on one shared clock while connector endpoints remain attached. Wave starts from the exact completed First Fill frame, then applies only the first parent-propagation score snapshot and its resulting movement. Fluid-frontier transitions otherwise remain visual history rather than layout input.

<!-- autonav:start -->
<!-- autonav:end -->
