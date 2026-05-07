# Debate Animation Data Model Design

## Overview

Defines the data models and orchestration for debate graph animation, supporting stepwise confidence propagation and visual transitions.

## Current Implementation Scope

- The first production planner scope assumes debates are acyclic.
- The first production planner scope currently covers `claim/add` when the new claim is connected with a confidence connection.
- The first production planner sequence currently stops at `firstFill`.
- The settled display state still needs to support debates that already contain relevance structures elsewhere in the graph.

## Deferred Scope

- add-relevance animation
- propagation-wave sequencing after `firstFill`
- command types outside the current `claim/add` confidence flow
- cycle handling and score-node duplication policy

## Command Contract Boundary

- The current debate-core command contracts are out of date relative to the planner boundary and the current connector model.
- Planner implementation should not keep extending those stale payloads ad hoc.
- The next command-contract pass should produce a concrete architectural proposal, then get approval before changing exported debate-core command types.
- A likely direction is to split the overloaded add-claim flow into separate confidence-attached and relevance-attached claim-creation commands, but that is still a proposal rather than an approved contract.
- Prefer the best long-term command architecture over a minimal compatibility patch.

## Scale Contract

- The planner authors the expected visual scale directly.
- The renderer must honor that authored scale without smoothing, protective floors, or clamping.
- Scale is uniform across the local visual structure. Claims, connectors, junctions, aggregators, and attachment geometry should stay geometrically consistent with each other at the authored scale.
- Zooming into a scaled-down region should therefore match the geometry of a larger region viewed farther out.
- `sourcesScale` is the owned scale value for a target claim's source side. It is stored on the target claim so every source of that target shares the same scale, and the planner propagates that value to the relevant source-side visuals.
- `sourcesScale` allocation is recursive. A claim's source-side budget becomes the budget its direct confidence children divide on the next outward step of the graph.
- Direct confidence children divide the target-owned `sourcesScale` budget, so their allocated widths add back up to the target's source-side width and the nesting stays exact.
- Direct relevance children do not mint a second scale budget. They inherit the affected target-side `sourcesScale` unchanged because they sit on the affected confidence connection's lane.
- Relevance still changes source-side share indirectly by reweighting how much of the target-owned `sourcesScale` budget the affected confidence child receives.
- When every direct confidence-child share weight resolves to zero, that target-owned `sourcesScale` budget falls back to an equal split across the direct confidence children.

## Flow

**Data Model**

- Defined in `debate-core.ts`.
- Claims, connectors, and their relationships.
- `DebateCore` is the authoritative current state.

**Command**

- User or system issues a command (e.g., add claim).

**Planner**

- Receives the current `DebateCore` state, the current snapshot, and the command.
- Produces a sequence of `GraphRenderState` snapshots and metadata.

**Snapshot**

- Each snapshot (from `graph-render-state.ts`) contains the authored positions, confidence values, and other properties needed for rendering and animation. Some display geometry, including aggregator footprints and connector endpoints, is derived from those snapshot values at render time.
- Connector end positions are derived from the connected claims, junctions, delivery aggregators, and relevance aggregators in the snapshot. Aggregator geometry is derived from its target plus aggregator state. Optional `targetSideOffset` on delivery and relevance connectors shifts the target attachment along the resolved target edge. When omitted, `targetSideOffset` is zero.
- The snapshot is the current display state, not the underlying DebateCore state.

## Shared Ordering

Sibling claim order and target-edge connector stack order use the same ordered list.

- The order must match so connector lines do not cross their sibling claims.
- Group siblings first by how they relate to the target: `proTarget` siblings first, then `conTarget` siblings.
- Within each target-relationship group, order is deterministic and source-position driven.
- When source positions tie, use a stable tie-breaker so repeated layouts keep the same order.
- The compact along-lane order of sibling claims in a claim lane uses this ordered list.
- The target-edge stack order for delivery connectors and relevance connectors uses this same ordered list.

## Connector Stacking

Connector stacking is the shared rule for arranging delivery connectors and relevance connectors when more than one connector lands on the same target edge. Delivery connectors and relevance connectors use the same stacking behavior after the target edge is resolved. The planner authors `targetSideOffset` for each connector in that stack, and the renderer applies that offset along the resolved target edge tangent.

- Resolve the target edge before stacking.
- A delivery connector stacks on the edge of its target delivery aggregator.
- A relevance connector first chooses the top or bottom edge of its target relevance aggregator based on which edge faces the source claim, then stacks on that edge.
- Stack membership is the set of connectors that land on the same target edge.
- Stack order comes from the shared ordering rule above rather than from a separate connector-only ordering rule.
- The thickness contribution of each stacked connector is its rendered fluid-band width, not the full pipe outline width.
- Carry the old delivery rule forward for both delivery connectors and relevance connectors: fluid-band width is the connector's full pipe width at its current scale multiplied by its clamped current score.
- The stack is therefore based on current scored fluid, not on a connector's full potential pipe width at that scale.
- During partial reveal states, stack thickness uses the revealed fluid-band width for that state rather than the fully revealed width.
- When stack positions are authored from transition endpoints, an unrevealed endpoint contributes zero stack thickness at that endpoint.
- Convert that fluid-band width into a target-edge attachment envelope by combining it with the connector's full pipe width and its band placement. Because those envelopes can differ, stacking is not regular spacing.
- That means neighboring connectors can still have overlapping pipe wall or pipe interior regions while the stacked scored-fluid bands remain separated.
- If band placement is not authored explicitly, resolve it from side the same way the old system did: `conMain` uses the upper-side placement and the other side uses the lower-side placement.
- The total stack thickness is the sum of those attachment-envelope heights, not the sum of raw center offsets.
- Center the combined envelopes on the midpoint of the resolved target edge. A single connector therefore remains centered on that edge.
- Author each connector's `targetSideOffset` from that centered arrangement. When siblings are added, removed, or reordered, restack the full set around the same edge center by changing those offsets.
- A target aggregator can remain collapsed or visually absent even when stacking still resolves a centered attachment position for the connectors that land on its edge.

**Planner config**

- a config file that defines how commands are translated into planner logic and snapshots.
