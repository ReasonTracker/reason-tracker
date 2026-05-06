# Debate Animation Data Model Design

## Overview

Defines the data models and orchestration for debate graph animation, supporting stepwise confidence propagation and visual transitions.

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

## Connector Stacking

Connector stacking is the shared rule for arranging delivery connectors and relevance connectors when more than one connector lands on the same target edge. Delivery connectors and relevance connectors use the same stacking behavior after the target edge is resolved. The planner authors `targetSideOffset` for each connector in that stack, and the renderer applies that offset along the resolved target edge tangent.

- Resolve the target edge before stacking.
- A delivery connector stacks on the edge of its target delivery aggregator.
- A relevance connector first chooses the top or bottom edge of its target relevance aggregator based on which edge faces the source claim, then stacks on that edge.
- Stack membership is the set of connectors that land on the same target edge.
- Stack order is deterministic and source-position driven. When source positions tie, use a stable tie-breaker so repeated layouts keep the same order.
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
