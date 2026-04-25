# Debate Animation Data Model Design

## Overview

Defines the data models and orchestration for debate graph animation, supporting stepwise score propagation and visual transitions.

## Flow

**Data Model**

- Defined in `debate-core.ts`.
- Claims, connectors, and their relationships.

**Command**

- User or system issues a command (e.g., add claim).

**Planner**

- Receives the current state and the command.
- Produces a sequence of `GraphRenderState` snapshots and metadata.

**Snapshot**

- Each snapshot (from `graph-render-state.ts`) contains all node/edge positions, scores, and properties needed for rendering and animation.

**Planner config**

- a config file that defines how commands are translated into planner logic and snapshots.

**Animation**

- Animation is driven by comparing consecutive snapshots.
- Score propagation and other transitions are animated stepwise by updating snapshots.
