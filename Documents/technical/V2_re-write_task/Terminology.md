> Read [V2 Re Write Task](./%F0%9F%93%8CREADME.md) in this folder for rewrite-task context before editing this document.

# Old Terminology

## Purpose

This file is a quick reference for the names of the current containers and the names of the kinds they contain.
It is now kept as an old snapshot of the in-progress terminology so it can be compared against the new proposal.

## Current Containers

| Layer | Current container name | Holds | Current file |
| --- | --- | --- | --- |
| Domain input | `IntentSequence` | one `intent` plus ordered `steps` | `contracts/src/IntentSequence.ts` |
| Domain semantic stage | `Step` | one semantic stage such as add, remove, or recalculation wave | `contracts/src/IntentSequence.ts` |
| Domain propagation stage | `RecalculationWaveStep` | ordered `changes` | `contracts/src/IntentSequence.ts` |
| Domain propagation record | `Change` | one semantic delta for one reached score | `contracts/src/IntentSequence.ts` |
| Renderer-agnostic visual substep | `AnimationStep` | one presentational subphase derived from a step or change | `contracts/src/IntentSequence.ts` |
| Scheduled visible segment | `AnimationTransitionUnit` | one scheduled timeline segment with one or more `animationSteps` | `engine/src/transition-schedule.ts` |
| Timeline result | `PreparedAnimationSchedule` | ordered `transitionUnits` | `engine/src/transition-schedule.ts` |
| Remotion segment state | `GraphTransitionSegment` | one rendered segment built from snapshots plus animation steps | `videos/src/shared/GraphView.tsx` |

## Current Kinds Inside Containers

### `Intent`

- `ReceivedAddLeafClaimIntent`
- `ReceivedAddConnectionIntent`
- `ReceivedChangeClaimIntent`
- `ReceivedChangeConnectionIntent`
- `ReceivedMoveClaimIntent`
- `ReceivedRemoveConnectionIntent`
- `ReceivedRemoveClaimIntent`

### `Step`

- `AppliedAddLeafClaimStep`
- `AppliedAddConnectionStep`
- `AppliedChangeClaimStep`
- `AppliedRemoveConnectionStep`
- `AppliedRemoveClaimStep`
- `RecalculationWaveStep`
- `IncomingSourcesResortedStep`

### `Change`

- `ScoreCoreValuesChanged`
- `ScaleOfSourcesChanged`

### `AnimationStep`

- `ScoreAnimationStep`
- `ConnectorAnimationStep`

### `AnimationStepPhase`

- score phases currently used: `enter`, `display`, `scale`, `exit`
- connector phases currently used: `grow`, `update`, `shrink`, `reroute`, `enter`, `exit`
- `layout` exists in the current type union but should be treated as under review because it has recently been acting as a no-op or a confusing extra scheduled slot rather than a stable semantic phase

## Current Meaning Of Each Layer

- `IntentSequence`: what happened semantically.
- `Step`: the big semantic stage.
- `Change`: one score-level propagation record inside a wave.
- `AnimationStep`: one renderer-agnostic visible subphase derived from a step or change.
- `AnimationTransitionUnit`: the thing that actually consumes frames on the timeline.
- `GraphTransitionSegment`: GraphView's local rendered version of one scheduled unit.

## Current Confusions

### 1. `AnimationTransitionUnit` is too abstract a name

It is currently the thing the user experiences as a visible timeline segment.
Recommended rename for discussion: `AnimationBundle` or `TimelineBundle`.

Preferred current recommendation: `AnimationBundle`.

Reason:
- `unit` does not communicate that it is a scheduled visible chunk
- `bundle` better communicates that one reached node may want multiple ordered subphases grouped together

### 2. `Change` and `AnimationStep` are being over-fragmented

The current engine scheduling has been turning emitted `AnimationStep` records into too many separate visible segments.
That is a scheduling policy problem, not necessarily a contract problem.

Recommended boundary:
- `Change` remains semantic
- `AnimationStep` remains renderer-agnostic visible subphase
- scheduling should bundle related steps for one reached node into one visible bundle instead of always one segment per emitted step

### 3. `confidence` is currently overloaded in interpretation

Right now `Score.confidence` is used both as:
- the displayed claim confidence
- the connector width driver in layout/render math

This is the main model ambiguity now under review.

Potential resolution under discussion:
- `claimConfidence`: displayed confidence for the claim card
- `connectorConfidence` or `connectorStrength`: the value used to drive connector width propagation

This does not need to be decided in this document, but the ambiguity should be named explicitly.

### 4. `scaleOfSources` now means propagated rendered node scale

Latest direction:
- `scaleOfSources` should be the propagated rendered node-scale field, not just an intermediate contributor metric

This means it is no longer best described as merely "the scale of the sources" in casual conversation.
It is becoming the stored propagated node-size value.

## Recommended Working Terms For Discussion

Use these terms in planning conversations unless or until the contract is renamed:

- `IntentSequence`: semantic log
- `Step`: semantic stage
- `Wave`: a `RecalculationWaveStep`
- `Change`: one propagated semantic delta in a wave
- `AnimationStep`: renderer-agnostic visual subphase
- `AnimationBundle`: one scheduled visible group of subphases for one reached node or one add/remove action
- `Segment`: the actual rendered timeline slot in GraphView/Remotion

## Recommended Bundle Shape For The Current Problem

For one reached node in a propagation wave, the desired bundle is:

1. claim confidence display change
2. node scale change
3. connector width change
4. optional layout settle

This should be one `AnimationBundle` in scheduling terms, even if it contains multiple `AnimationStep` kinds internally.

## File Pointers

- `contracts/src/IntentSequence.ts`: current semantic and animation-step type vocabulary
- `engine/src/transition-schedule.ts`: current scheduled visible segment container
- `videos/src/shared/GraphView.tsx`: current rendered segment container and snapshot shaping
- `V2_re-write_task/Scenario.md`: higher-level scenario wording and intended flow