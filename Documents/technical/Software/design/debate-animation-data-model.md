# Debate Animation Data Model Design

## Overview

Defines the data models and orchestration for debate graph animation, supporting stepwise confidence propagation and visual transitions.

## Current Implementation Scope

- The first production planner scope covers `confidence/claim/add` and `relevance/claim/add`.
- The first production planner sequence currently stops after the first `wave` and its following `reorient` transition from the command target through its outgoing connectors.
- Input debates may contain cycles and repeated claims.
- Episode0004 is the canonical planner-driven implementation of this scope.

## Deferred Scope

- subsequent propagation-wave sequencing after the first outgoing-connector wave
- command types outside the current `confidence/claim/add` flow

## Command Contract Boundary

- Debate-core command contracts for add and connect flows are connector-backed.
- The current planner scope uses `confidence/claim/add` for confidence-attached claim creation.
- Debate-core exported command types remain a guarded boundary. Further command-contract changes should start from a concrete proposal and get approval before changing those exported types.
- Prefer the best long-term command architecture over a minimal compatibility patch.

## Math Boundary

- Math accepts DebateCore and resolves cycles as exact, bounded acyclic variants.
- Inclusion-minimal connector break sets are scored with the strict acyclic scorer, rescoring only claims that can reach a cycle. Connector contributions are read from the scorer's results. Claim fields are averaged over the full variant count. A cut connector does not exist in its variant, so connector contributions are averaged only over the variants that keep that connector.
- Cycle audit data remains separate from ordinary display state.
- Presentation independently expands DebateCore by path and terminates only after emitting a claim already present on that path.
- A reversible claim resolves a signed `originalValue`, a non-negative display `value`, and a signed `directedValue`. The fixed connector relationship applies to `directedValue`; it never changes because a claim reverses.
- Presentation resolves `originalSide`, `derivedSide`, and `displaySide` per occurrence. It also resolves optional `reversedContent` into `derivedContent` and `displayContent`; renderers consume display fields rather than inferring reversal from a numeric value.
- Cycle aggregation retains score and relevance roles independently and averages each variant scorer's finished claim fields (`value`, `directedValue`, `originalValue`); the claim is reversed when the averaged `directedValue` is negative.

## Scale Contract

- The planner authors the expected visual scale directly, and that scale represents the full pipe or claim size at `100%` score.
- The renderer must honor that authored scale without smoothing, protective floors, or clamping.
- Scale is uniform across the local visual structure. Claims, connectors, delivery aggregators, and attachment geometry should stay geometrically consistent with each other at the authored scale.
- Zooming into a scaled-down region should therefore match the geometry of a larger region viewed farther out.
- Current score controls fluid fill inside the pipe. It does not directly shrink an individual authored pipe diameter, and direct confidence-child sibling groups solve their shared base scale from current scored delivery demand.

## Group Scale Contract

- `sourcesScale` is a claim occurrence's base potential scale and the budget for its own children. A claim's box `scale` is its base scale multiplied by its continuous relevance multiplier.
- A target claim solves one sibling base scale for its direct confidence children. For contribution weights `childScore × relevanceMultiplier`, the base is `parentCapacity / max(1, sum(weights))`.
- A child's parent fluid share is `weight / max(1, sum(weights))`. The shares retain natural size below capacity and fill, but never exceed, the parent edge above capacity.
- Every direct confidence child claim and source-side confidence path in that sibling group uses that same shared child `sourcesScale`, so the sibling claims stay equal to each other while the whole sibling group grows or shrinks together.
- Relevance claims that affect a claim's delivery sit in that claim's child column and use the same shared child `sourcesScale` as its confidence children.
- Each direct confidence child's box, outgoing delivery scale, and the claim-side edge of its delivery aggregator use that same shared child `sourcesScale` multiplied by that child's continuous relevance multiplier.
- Relevance is applied after the sibling-base cap. A post-relevance delivery shell is not capped to parent capacity.

## Layout Contract

- `claimLaneAxisGap` is the edge-to-edge gap between sibling claim boxes along the lane axis, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry so zoom-equivalent structures keep the same proportions and shrink or grow with the source-side potential scale.
- The delivery-connector corridor on the cross-lane axis has a width of `(connectorCurveLaneWidth + connectorDiagonalLaneWidth + connectorCurveLaneWidth)` times the largest rendered scale among the target claim's confidence children and relevance claims in that column, times `CONNECTOR_COLUMN_WIDTH_MULTIPLIER` (1.5), plus the target claim's delivery-aggregator width. `connectorCurveLaneWidth` also caps the straight run at each connector end; `connectorDiagonalLaneWidth` reserves width for the slanted middle.
- A delivery aggregator is a trapezoid on a claim's children-facing side. Its claim-side edge matches the claim box height, its children-side edge is `claimHeight * sourcesScale`, and its top and bottom sides slant equally. Each slanted side is as long as the sum of the incoming relevance connector widths, each being `claimHeight` times that relevance claim's box `scale`, unless that would make it steeper than 45°; then it lengthens to run at 45°. A claim without attached relevance has no aggregator and zero aggregator width. Incoming delivery connectors continue through the aggregator to the claim, scaled by the ratio of its claim-side edge to its children-side edge.
- In the current orientation, claim boxes are left-justified within the claim-lane band rather than centered across that band.
- A claim's child column holds its direct confidence children followed by the relevance claims that affect that claim's delivery. Confidence children prefer the center of their matching delivery-stack port; the first relevance claim prefers to sit just below the delivery aggregator.
- Column entries retain that order and use constrained packing on the lane axis against horizontal contours of their rendered subtrees. Contours include claim boxes, delivery aggregators, and routed connectors, so only geometry sharing a horizontal range constrains the gap. A target-side stack interval is a preferred attachment center, not a container for a claim box.

## Flow

**Data Model**

- Defined in `debate-core.ts`.
- Claims, connectors, and their relationships.
- `DebateCore` is the authoritative current state.

**Command**

- User or system issues a command (e.g., add claim).

**Planner**

- Receives the pre-command `DebateCore` state and the command.
- Resolves the opening and command-applied occurrence graphs, aggregate math, explicit intermediate score snapshots, and deterministic layout for each snapshot.
- Produces one `DebateAnimationPlan` with an opening scalar frame and named `voila`, `sprout`, `firstFill`, `wave`, and `reorient` steps.
- Authors explicit tracks for position, structural scale, target-stack offset, shell reveal, and fluid reveal.
  - During Voila, new-claim growth overlaps surrounding claim repositioning, connector endpoint movement, target-stack offset changes, delivery-aggregator growth, and other structural changes needed to reach neutral command-applied staging. New connector shells remain hidden, and connector endpoints remain attached throughout.
  - During Sprout, only newly added connector shells reveal through the established staging layout. Relevance-shell reveal keeps its delayed start; scores and positions do not advance.
  - During First Fill, the new connector's fluid frontier advances with a same-length shell-profile handoff: direct-adjustment structural shell is behind the handoff and the temporary taper remains ahead. Both transitions use the same calculated spatial interval. During the contact portion, positions, scales, offsets, delivery-aggregator geometry, and related layout derived from the direct-adjustment snapshot may move while the fill finishes. Parent scores remain frozen.
  - Wave cannot overlap Voila, Sprout, or First Fill. It begins from the exact completed First Fill frame. The current single Wave simultaneously changes the first affected parent score and all geometry implied by that first-parent snapshot. Later parent propagation requires later waves and remains outside the current scope.
  - Reorient follows Wave. It changes display side and content at its first frame, then interpolates the vertical-stack repacking, attachment offsets, and connector geometry implied by derived sides. Score values remain settled throughout Reorient.

**Resolved frame**

- `resolveAnimationFrame` converts one named step and progress value into a scalar `DebateFrame`.
- The frame contains occurrence-keyed claims and connectors. It has no tween values and no cycle-variant presentation state.
- Shared geometry derives claim bounds, typed attachment ports, fixed route topology, connector bands, and delivery aggregators from that same frame.
- Connector endpoints and receiving boundaries consume the same port coordinates. The renderer paints resolved geometry and does not independently reconstruct attachment points.

## Connector Transition Direction

- Every connector fill transition is authored as an initial numeric value and a final numeric value. Episode code does not author intermediate fill values or frontier positions.
- The animation resolver calculates transition progress from the track timing, and shared geometry converts that progress into the visible moving frontier.
- Connector fill changes travel from the source toward the target. In the current layout, sources are on the right and targets are on the left, so every fill frontier moves right to left.
- Increasing fill leaves the final fill behind the moving frontier. Decreasing fill is explicitly smaller on the right and larger on the left across the moving transition: the final smaller value follows the frontier while the initial larger value remains ahead of it.
- A decreasing fill transition is a width transition between those two values, not a reversed-path disappearance extremity and not a uniform width change across the whole connector.
- A connector must retain its initial fill ahead of the frontier and its final fill behind the frontier until the transition reaches the target boundary.

## Shared Ordering

Sibling claim order and target-edge connector stack order use the same ordered list.

- The order must match so connector lines do not cross their sibling claims.
- Group siblings first by how they relate to the target: `proTarget` siblings first, then `conTarget` siblings.
- Within each target-relationship group, order is deterministic and source-position driven.
- When source positions tie, use a stable tie-breaker so repeated layouts keep the same order.
- The compact along-lane order of direct confidence children uses this ordered list. Relevance claims follow them in their own ordered list.
- The target-edge stack order for delivery connectors and relevance connectors uses this same ordered list.

## Connector Stacking

Connector stacking arranges connectors that land on the same target edge. The planner authors `targetSideOffset`, and the renderer applies that offset along the resolved target edge tangent.

- Resolve the target edge before stacking.
- A delivery connector stacks on the edge of its target delivery aggregator.
- A relevance connector lands on the bottom edge of the delivery aggregator it modifies. Relevance connectors on one aggregator are centered side by side along that edge, with the nearest relevance claim landing farthest from the claim.
- Stack membership is the set of connectors that land on the same target edge.
- Stack order comes from the shared ordering rule above rather than from a separate connector-only ordering rule.
- Delivery connectors walk ordered parent-fluid intervals centered as one combined fluid stack. Every child participates: zero fluid creates `[cursor, cursor]` and does not advance the cursor.
- Delivery shells do not contribute stack spacing and may overlap. For interval `[start, end]`, the normal shell center is `start + shellWidth / 2` for `conMain` and `end - shellWidth / 2` for `proMain`.
- During the staging and first-fill frames of a newly added confidence connection only, its target retains the normal parent-fluid stack cursor and fluid-side anchor. Its wall retains structural width at the source and narrows close to the target to its current delivered fluid width.
- Relevance connectors retain structural-shell stacking; their receiving-edge behavior is unchanged.
- Reveal controls how much of a connector is visible and never changes the settled attachment position.
- Delivery shell paths are painted first across all bands, followed by all fluid paths, so an overlapping wall cannot cover fluid.
- A delivery aggregator is visible only when relevance is attached to its claim's outgoing confidence connector.

**Planner config**

- `PlannerOptions` defines claim dimensions and layout corridors used by both app layout and shared geometry.
