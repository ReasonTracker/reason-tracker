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

- Each snapshot (from `graph-render-state.ts`) contains all node/edge positions, confidence values, and properties needed for rendering and animation.
- Connector end positions are derived from the connected claims, junctions, and relevance aggregators in the snapshot. Optional `targetSideOffset` on delivery and relevance connectors shifts the target attachment along the resolved target side. When omitted, `targetSideOffset` is zero.
- The snapshot is the current display state, not the underlying DebateCore state.

**Planner config**

- a config file that defines how commands are translated into planner logic and snapshots.
