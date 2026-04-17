# V3 Proposal

## Status

This document captures an exploratory architecture summary from a separate AI discussion.

This is not adopted as current repository truth. Treat this page as proposal material for evaluation and integration discussion.

## How To Use This Document

Use this document only for unresolved architecture decisions and guidance that still needs evaluation.

Do not keep this document synchronized with the current implementation just for accuracy.
When a proposal section is accepted and implemented, remove that resolved guidance from this document instead of turning it into a running description of the codebase.

Persist settled guidance in durable docs.
Keep suggestions, follow-up ideas, and unresolved questions in the companion notes document.

## Core Model

### Entities (Canonical Graph)

#### Claim

Represents the idea or content.

- Has identity via `claimId`
- Contains no positional data
- Contains no score-specific data

#### Connector

Represents relationships between claims.

- Exists only in the canonical graph
- Source is a claim
- Target may be a claim or a connector

### Projected Model (Scoring Tree)

#### Score

`Score` represents a positional instance of a claim.

- Exists in a tree projection
- Appears once per path or location
- Combines a claim reference, incoming connection, and local scoring state

```ts
interface Score {
  id: ScoreId
  claimId: ClaimId
  claimSide: Side
  connectorSide: Side
  connectorId?: ConnectorId
  incomingScoreIds: ScoreId[]

  claimScore: {
    confidence: number
    reversibleConfidence: number
  }

  connectorScore: {
    confidence: number
    reversibleConfidence: number
  }

  relevance: number
  scaleOfSources: number
}
```

This object represents:

- A node plus its incoming edge
- Scoring context at a specific position
- A propagation unit

## Command System

### CommandTranslator

`CommandTranslator` expands `Command -> Operation[]`.

It encodes domain rules such as:

- Cascade behavior
- Scoring propagation
- Layout updates

Constraints:

- No state mutation
- Pure and deterministic

### Operations (Execution Units)

Operations represent discrete, composable state transformations.

Operations are:

- Internal, not user-facing
- Part of a larger execution plan
- Not time-based
- Not snapshots
- Not events

Examples:

- AddClaim
- InitializeClaimScores
- AddConnector
- RecomputeClaimScore
- PropagateScores
- UpdateClaimScale
- UpdateLayout

## Execution Model

`Command -> CommandTranslator -> Operation[] -> Reducer -> State`

The reducer applies operations one by one.

Each operation produces a new state.

This supports:

- Animation through operation-by-operation playback
- Atomic groups

## Temporal System

### Timeline

The timeline stores snapshots of state.

Each operation, or grouped operation, produces a new snapshot.

This enables:

- Seeking
- Playback
- Video rendering

### Keyframe Index

A sparse index over the timeline supports locating the nearest state before time `T`.

## Projection Strategy

### Dual-Layer Approach

#### Canonical State

Graph of Claims and Connectors.

- Source of truth

#### Projected State

Tree of `Score` values built for:

- Scoring
- Layout
- Rendering

### Projection Rules

Projection is:

- Derived from canonical state
- Optionally stored for performance or reproducibility

Hybrid approach:

- Store canonical state
- Optionally store visual or scoring state for playback fidelity

## Naming Decisions

### Accepted Terms

- `Command`: user intent
- `CommandTranslator`: expands commands
- `Operation`: execution unit
- `Reducer`: applies operations
- `Score`: projected scoring unit

### Rejected Terms

- `Action`: too ambiguous
- `Event`: wrong direction because it implies the past
- `Step`: ambiguous and sequence-focused
- `Create` or `Update` or `Delete` for operations: too CRUD-like

## Key Rules

- Commands express intent
- Operations perform state changes
- Reducer is the only place state mutates
- Entities are canonical and do not depend on commands
- Projection creates positional scoring structure
- `Score` holds local scoring state, not `Claim`
- Operations are composable, not time-based
- Timeline stores results, not logic

## Mental Model

- Graph = truth
- Score tree = interpretation
- Commands = what you want
- Operations = how it happens
- Timeline = what happened
- Renderer = what you see

## Open Exploration Areas

Possible follow-up work:

- Tighten the `Operation` type system
- Define reducer rules formally
- Formalize score propagation logic