# Animation

This folder owns command application and animation-plan construction.

## Main Entrypoints

- `planDebateAnimation.ts`
- `applyDebateCommand.ts`
- `DebateAnimationPlan.ts`

The planner accepts a pre-command `DebateCore` and confidence- or relevance-attached claim additions. It returns an opening frame and scalar animation steps: `voila`, `sprout`, `firstFill`, `wave`, and `reorient`.

The animation plan owns frame tracks and interpolation. Shared planner and frame contracts live in [`animationContracts.ts`](../animationContracts.ts). Scoring lives in [Scoring](../scoring/📌README.md), graph layout in [Layout](../layout/📌README.md), low-level primitives in [Geometry](../geometry/📌README.md), and resolved scene shapes in [Scene Geometry](../scene-geometry/📌README.md).

The geometry, scale, and timing contracts are documented in the [Debate Animation Data Model](../../../design/debate-animation-data-model.md).

<!-- autonav:start -->
<!-- autonav:end -->
