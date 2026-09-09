# Debate Animation Data Model Design

## Overview

Defines the data models and orchestration for debate graph animation, supporting stepwise confidence propagation and visual transitions.

## Current Implementation Scope

- The first production planner scope currently covers `confidence/claim/add`.
- The first production planner sequence currently stops after the first `wave` from the command target through its outgoing connectors.
- Input debates may contain cycles and repeated claims.
- Episode0004 is the canonical planner-driven implementation of this scope.

## Deferred Scope

- add-relevance animation
- subsequent propagation-wave sequencing after the first outgoing-connector wave
- command types outside the current `confidence/claim/add` flow
- reversible score and relevance behavior after the math and debate-core contracts are explicitly redesigned for it

## Command Contract Boundary

- Debate-core command contracts for add and connect flows are connector-backed.
- The current planner scope uses `confidence/claim/add` for confidence-attached claim creation.
- Debate-core exported command types remain a guarded boundary. Further command-contract changes should start from a concrete proposal and get approval before changing those exported types.
- Prefer the best long-term command architecture over a minimal compatibility patch.

## Math Boundary

- Math accepts DebateCore and resolves cycles as exact, bounded acyclic variants.
- Inclusion-minimal connector break sets are scored with the strict acyclic scorer, then claim fields and connector contributions are averaged over the full variant count.
- Cycle audit data remains separate from ordinary display state.
- Presentation independently expands DebateCore by path and terminates only after emitting a claim already present on that path.

## Scale Contract

- The planner authors the expected visual scale directly, and that scale represents the full pipe or claim size at `100%` score.
- The renderer must honor that authored scale without smoothing, protective floors, or clamping.
- Scale is uniform across the local visual structure. Claims, connectors, junctions, aggregators, and attachment geometry should stay geometrically consistent with each other at the authored scale.
- Zooming into a scaled-down region should therefore match the geometry of a larger region viewed farther out.
- Current score controls fluid fill inside the pipe. It does not directly shrink an individual authored pipe diameter, and direct confidence-child sibling groups solve their shared base scale from current scored delivery demand.

## Group Scale Contract

- `sourcesScale` is the owned potential scale budget for a claim's own source side.
- A target claim solves one sibling base scale for its direct confidence children. For contribution weights `childScore × relevanceMultiplier`, the base is `parentCapacity / max(1, sum(weights))`.
- A child's parent fluid share is `weight / max(1, sum(weights))`. The shares retain natural size below capacity and fill, but never exceed, the parent edge above capacity.
- Every direct confidence child claim and source-side confidence path in that sibling group uses that same shared child `sourcesScale`, so the sibling claims stay equal to each other while the whole sibling group grows or shrinks together.
- Direct relevance children stay on the affected confidence connection's source side and inherit that same shared child `sourcesScale`.
- Each direct confidence child's outgoing delivery scale and the outgoing side of its junction use that same shared child `sourcesScale` multiplied by that child's continuous relevance multiplier.
- Relevance is applied after the sibling-base cap. A post-relevance delivery shell is not capped to parent capacity.

## Layout Contract

- `claimLaneAxisGap` is the edge-to-edge gap between sibling claim boxes along the lane axis, not a center-to-center distance.
- That gap resolves at the same local `sourcesScale` as the surrounding geometry so zoom-equivalent structures keep the same proportions and shrink or grow with the source-side potential scale.
- The delivery-connector corridor on the cross-lane axis is expressed directly as `connectorCurveLaneWidth + connectorDiagonalLaneWidth + connectorCurveLaneWidth`, and adds `junctionLaneWidth` when the junction lane is occupied.
- Those cross-lane widths also resolve at local `sourcesScale`.
- In the current orientation, claim boxes are left-justified within the claim-lane band rather than centered across that band.
- Sibling source claims form local clusters that stay mostly centered on their source claim when the surrounding layout constraints permit it.

## Flow

**Data Model**

- Defined in `debate-core.ts`.
- Claims, connectors, and their relationships.
- `DebateCore` is the authoritative current state.

**Command**

- User or system issues a command (e.g., add claim).

**Planner**

- Receives the pre-command `DebateCore` state and the command.
- Resolves opening and post-command occurrence graphs, aggregate math, and deterministic settled layout.
- Produces one `DebateAnimationPlan` with an opening scalar frame and named `voila`, `sprout`, `firstFill`, and `wave` steps.
- Authors explicit tracks for position, structural scale, target-stack offset, shell reveal, and fluid reveal.
- During Wave, interpolates logical claim and authoritative delivery scores first, then derives scales, positions, and target offsets from that one logical state. The moving fluid frontier remains separate visual history.

**Resolved frame**

- `resolveAnimationFrame` converts one named step and progress value into a scalar `DebateFrame`.
- The frame contains occurrence-keyed claims and connectors. It has no tween values and no cycle-variant presentation state.
- Shared geometry derives claim bounds, typed attachment ports, fixed route topology, connector bands, aggregators, and junctions from that same frame.
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
- The compact along-lane order of sibling claims in a claim lane uses this ordered list.
- The target-edge stack order for delivery connectors and relevance connectors uses this same ordered list.

## Connector Stacking

Connector stacking arranges connectors that land on the same target edge. The planner authors `targetSideOffset`, and the renderer applies that offset along the resolved target edge tangent.

- Resolve the target edge before stacking.
- A delivery connector stacks on the edge of its target delivery aggregator.
- A relevance connector first chooses the top or bottom edge of its target relevance aggregator based on which edge faces the source claim, then stacks on that edge.
- Stack membership is the set of connectors that land on the same target edge.
- Stack order comes from the shared ordering rule above rather than from a separate connector-only ordering rule.
- Delivery connectors walk ordered parent-fluid intervals centered as one combined fluid stack. Every child participates: zero fluid creates `[cursor, cursor]` and does not advance the cursor.
- Delivery shells do not contribute stack spacing and may overlap. For interval `[start, end]`, the shell center is `start + shellWidth / 2` for `conMain` and `end - shellWidth / 2` for `proMain`.
- Relevance connectors retain structural-shell stacking; their receiving-edge behavior is unchanged.
- Reveal controls how much of a connector is visible and never changes the settled attachment position.
- Delivery shell paths are painted first across all bands, followed by all fluid paths, so an overlapping wall cannot cover fluid.
- A delivery aggregator is visible whenever at least one confidence connector lands on it. A relevance aggregator may remain collapsed when its display does not need a separate landing surface.

**Planner config**

- `PlannerOptions` defines claim dimensions and layout corridors used by both app layout and shared geometry.
