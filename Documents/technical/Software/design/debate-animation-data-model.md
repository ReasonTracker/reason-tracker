# Debate Animation Data Model Design

## Overview

Defines the data models and orchestration for debate graph animation, supporting stepwise confidence propagation and visual transitions.

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

- Each snapshot (from `graph-render-state.ts`) contains all node/edge positions, confidence values, and properties needed for rendering and animation.

**Planner config**

- a config file that defines how commands are translated into planner logic and snapshots.
