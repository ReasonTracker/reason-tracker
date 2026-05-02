# Voila Planner Contract

## Purpose

This document defines the exact planner-owned contract and business requirements for the `voila` step in the score-wave timeline.

This document is intended to be sufficient to reimplement Voila without reading renderer code.

## Scope

- Applies only to the `voila` step.
- Covers planner inputs, outputs, trigger rules, field-level snapshot requirements, and planner versus renderer ownership.
- Treats `sprout`, `firstFill`, propagation-wave steps, `scale`, and `order` as adjacent steps whose behavior must remain unchanged.
- Uses the current planner timeline types and animation descriptions as the authoritative behavior source.

## User-visible outcome

Voila is the structural reveal step that makes room for a command result before any connector reveal or score propagation animation begins.

- A newly added claim scales from zero to its final size in its final position.
- Existing claims and claim-adjacent structures move out of the way during the same step.
- The layout already reserves the final footprint of the new claim from the first frame of Voila.
- Voila preserves pre-command scores for the full step. Voila is a structural transition, not a score-change transition.
- Connector tracing does not begin during Voila. Connector tracing belongs to `sprout` and fluid fill belongs to `firstFill`.
- A newly required junction or junction aggregator may exist structurally during Voila, but it must remain latent until `sprout` reveals it.

## Planner public boundary

The planner boundary for command playback is a per-command timeline.

- Input: one `CommandScoreChange<TCommand>` from the score-change run.
- Input fields required by Voila:
  - `graphBefore`
  - `graphAfter`
  - `scoresBefore`
  - `scoresAfter`
  - `changedScoreNodeIds`
  - `propagation`
- Output: a `CommandScoreWaveTimeline<TCommand>`.
- Output timeline shape:
  - `initialSnapshot`
  - `steps`
  - `finalSnapshot`
- Voila output shape:

```ts
type VoilaStep = {
  type: "voila";
  snapshot: Snapshot;
  scoreNodeIds: ScoreNodeId[];
};
```

- `scoreNodeIds` for Voila must be the command's full `changedScoreNodeIds` set.
- If Voila is emitted, it must appear before `sprout`, before `firstFill`, and before any propagation-driven adjust step.

## Emission rules

Voila is emitted when the command changes the structural layout that must be visible before connector reveal starts.

Emit a Voila step if any of the following are true between the before snapshot and the after snapshot:

- A claim was added or removed.
- A claim aggregator was added or removed.
- A junction was added or removed.
- A junction aggregator was added or removed.
- A claim position changed.
- A claim aggregator position changed.
- A junction position changed.
- A junction left height changed.
- A junction right height changed.
- A junction width changed.
- A junction aggregator position changed.

Emit Voila only for structural layout change. Connector-only membership changes, reveal-progress changes, score-only changes, and later `scale` or `order` concerns are outside the step.

## Timeline placement and sequencing

Voila belongs to the planner's pre-wave phase.

- The planner first projects the post-command graph and post-command scores into snapshot space.
- The planner prepares a merged snapshot that already contains the final membership and references needed by the later steps.
- The planner derives the Voila snapshot from that prepared snapshot.
- The planner settles the last pre-wave snapshot before handing it to the propagation-wave builder.

The sequence for one command is:

1. Build the current command's projected after snapshot.
2. Build the current command's pre-scale projected after snapshot.
3. Build the prepared snapshot that merges before and after membership.
4. Emit `voila` if the structural trigger conditions are met.
5. Emit `sprout` if connector and latent junction membership changes require reveal work.
6. Emit `firstFill` for direct-added propagation when present.
7. Emit propagation-wave adjust steps.
8. Emit `scale` and `order` when enabled.

## Planner preparation requirements

Voila depends on three planner-owned snapshots.

### Before snapshot

- The before snapshot is the settled snapshot from the prior timeline state.
- It is the source of all pre-command positions, scales, visibilities, scores, and reveal progress.

### After snapshot

- The after snapshot is a planner projection of the post-command score graph and post-command scores.
- The after snapshot defines the final structure, final references, final layout, final target positions, and final target geometry.

### Prepared snapshot

- The prepared snapshot must preserve the final membership of the post-command state.
- The prepared snapshot must preserve the stable ids and references needed by later steps.
- The prepared snapshot must preserve pre-command scores where Voila must remain structural only.
- The prepared snapshot must preserve latent membership for structures that must be revealed later by `sprout`.
- The prepared snapshot is the base object that Voila mutates by replacing selected fields with Voila-specific tweens.

## Source-scale requirements for pre-scale projection

Voila uses the pre-scale projected after snapshot rather than the fully rescaled final snapshot.

- Existing score nodes keep their previous claim scale as the source scale for the pre-wave phase.
- A newly added root score node starts with source scale `1`.
- A newly added score-affecting descendant inherits its source scale from the nearest applicable confidence branch.
- If a new confidence child is added where a sibling confidence child already existed previously, the new child inherits the previous confidence child scale rather than immediately shrinking to the final redistributed scale.
- The purpose of this rule is to prevent the pre-wave steps from jumping directly to final global scale changes before the explicit `scale` step.

## Exact field-level Voila requirements

Voila is built from the prepared snapshot and only changes the structural maps that are supposed to move during the Voila phase.

### Claims

Claims are the primary visible subject of Voila.

- Existing claim that remains after the command:
  - `position` must tween from before position to after position.
  - `scale` must tween from before scale to after scale.
  - `score` must remain at the before score for the full Voila step.
  - `id`, `claimId`, `scoreNodeId`, `claim`, and `side` must stay stable.
- Newly added claim:
  - `position` must already be the final calculated position from the first Voila frame.
  - `scale` must tween from `0` to the final after scale.
  - `score` must be `0` during Voila.
  - The claim must occupy its final layout footprint immediately even while visually scaling in.
- Removed claim:
  - `position` must stay fixed at the before position.
  - `scale` must tween from the before scale to `0`.
  - `score` must remain at the before score.

### Claim aggregators

Claim aggregators follow the same structural rules as claims, but they remain uniform rather than progressive.

- Existing claim aggregator that remains after the command:
  - `position` must tween from before position to after position.
  - `scale` must tween from before scale to after scale.
  - `score` must remain at the before score.
  - `animationType` must be `uniform`.
- Newly added claim aggregator:
  - `position` must already be the final calculated position from the first Voila frame.
  - `scale` must tween from `0` to the final after scale.
  - `score` must be `0` during Voila.
  - `animationType` must be `uniform`.
- Removed claim aggregator:
  - `position` must stay fixed at the before position.
  - `scale` must tween from the before scale to `0`.
  - `score` must remain at the before score.
  - `animationType` must be `uniform`.

### Junctions

Junctions participate in Voila only as structural geometry carriers. Visibility reveal remains a later concern.

- Existing junction that remains after the command:
  - `position` must tween from before position to after position.
  - `leftHeight` must tween from before left height to after left height.
  - `rightHeight` must tween from before right height to after right height.
  - `width` must tween from before width to after width.
  - `animationType` must be `uniform`.
  - `scale` must remain whatever the prepared snapshot chose.
  - `visible` must remain whatever the prepared snapshot chose.
- Newly added junction:
  - `position`, `leftHeight`, `rightHeight`, and `width` must already be the final structural values from the first Voila frame.
  - `scale` must remain `0` during Voila.
  - `visible` must remain `false` during Voila.
  - `animationType` must be `uniform`.
  - The junction may affect layout and connector routing immediately and remains latent until `sprout`.
- Removed junction:
  - `position`, `leftHeight`, `rightHeight`, and `width` must remain at the before values for Voila.
  - `scale` and `visible` must remain whatever the prepared snapshot carried forward from the before state.
  - `animationType` must be `uniform`.

### Junction aggregators

Junction aggregators participate in Voila as structural anchor points only.

- Existing junction aggregator that remains after the command:
  - `position` must tween from before position to after position.
  - `score` must remain at the before score.
  - `animationType` must be `uniform`.
  - `scale` and `visible` must remain whatever the prepared snapshot chose.
- Newly added junction aggregator:
  - `position` must already be the final calculated position from the first Voila frame.
  - `score` must be `0` during Voila.
  - `scale` must remain `0` during Voila.
  - `visible` must remain `false` during Voila.
  - `animationType` must be `uniform`.
- Removed junction aggregator:
  - `position` must remain at the before position for Voila.
  - `score` must remain at the before score.
  - `scale` and `visible` must remain whatever the prepared snapshot carried forward from the before state.
  - `animationType` must be `uniform`.

### Connectors during Voila

Voila carries connector state through from the prepared snapshot.

- The confidence connector, delivery connector, and relevance connector maps come from the prepared snapshot unchanged.
- Connector reveal state, connector score state, connector scale state, and connector visibility state stay on the prepared-snapshot contract.
- Any visible connector motion during Voila comes from planner-owned geometric interpolation caused by moving claims, aggregators, or junctions.

## Invariants that protect the later steps

Voila must preserve the assumptions of `sprout`, `firstFill`, and the propagation-wave steps.

- `sprout` must still be the first step that reveals new connector pipes.
- `sprout` must still be the first step that reveals a new junction or junction aggregator.
- `firstFill` must still be the first step that reveals new connector fluid.
- Propagation-wave steps must still start from the settled result of the last pre-wave step.
- `scale` and `order` must still be the only steps that perform explicit global rescale and global reorder behavior.
- The ids and cross-references used by later steps must already exist and remain stable through Voila.

## Renderer boundary for Voila

Voila is the step most affected by the planner-versus-renderer ownership bug.

The renderer is interpolation-only for Voila.

- Read planner-owned scene data.
- Interpolate planner-owned tween endpoints to the current percent.
- Choose HTML and SVG primitives and apply visual styles.
- Apply planner-owned reveal progress.

Every value that affects what is drawn or where it is drawn must already be present as planner-owned scene data.

## Required planner-owned scene contract for a Voila rewrite

The existing `Snapshot` entity maps are necessary but not sufficient for a renderer that is interpolation-only.

To rewrite Voila correctly, the planner must provide renderer-ready scene data for every renderable element used by Voila. This scene data can live inside `snapshot`, beside `snapshot`, or on the `voila` step object. The storage location is an implementation detail. The ownership is not.

The minimum planner-owned scene data for Voila is:

```ts
type TweenScalar = number | { type: "tween/number"; from: number; to: number };

type TweenPoint2D = {
  x: TweenScalar;
  y: TweenScalar;
};

type TweenBounds = {
  minX: TweenScalar;
  minY: TweenScalar;
  maxX: TweenScalar;
  maxY: TweenScalar;
};

type VoilaClaimScene = {
  bounds: TweenBounds;
  center: TweenPoint2D;
  width: TweenScalar;
  height: TweenScalar;
  opacity: TweenScalar;
};

type VoilaAggregatorScene = {
  bounds: TweenBounds;
  center: TweenPoint2D;
  size: TweenScalar;
  opacity: TweenScalar;
};

type VoilaJunctionScene = {
  bounds: TweenBounds;
  center: TweenPoint2D;
  width: TweenScalar;
  leftHeight: TweenScalar;
  rightHeight: TweenScalar;
  opacity: TweenScalar;
};

type VoilaConnectorScene = {
  bounds: TweenBounds;
  bandPlacement: ConnectorBandPlacement;
  source: TweenPoint2D;
  target: TweenPoint2D;
  centerlinePoints: ReadonlyArray<{
    x: TweenScalar;
    y: TweenScalar;
    radius?: TweenScalar;
  }>;
  pipeWidth: TweenScalar;
  fluidWidth: TweenScalar;
  opacity: TweenScalar;
  pipeRevealProgress: TweenScalar;
  fluidRevealProgress: TweenScalar;
};

type VoilaScene = {
  bounds: TweenBounds;
  claimsById: Record<ClaimVizId, VoilaClaimScene>;
  claimAggregatorsById: Record<ClaimAggregatorVizId, VoilaAggregatorScene>;
  junctionsById: Record<JunctionVizId, VoilaJunctionScene>;
  junctionAggregatorsById: Record<JunctionAggregatorVizId, VoilaAggregatorScene>;
  connectorsById: Record<string, VoilaConnectorScene>;
};
```

The requirements on that scene contract are:

- Every value that affects what is drawn or where it is drawn must already be present as a fixed value or a tween endpoint.
- The renderer must be able to render an arbitrary Voila frame without calling planner geometry helpers.
- The renderer must be able to render an arbitrary Voila frame without reading planner layout policy.
- The renderer must be able to render an arbitrary Voila frame without recomputing connector routing.
- If a connector path changes during Voila because claims or junctions move, the planner must provide the changing connector geometry as tweened scene data.
- If a viewport target or scene bounds change during Voila, the planner must provide those bounds.

## Recommended containment strategy

The requirement is that planner owns the Voila scene data. The least risky implementation path is:

- Keep the outer score-wave timeline contract unchanged.
- Introduce a Voila-specific planner-owned scene payload consumed only by the Voila render path.
- Leave `sprout`, `firstFill`, and the wave steps on their current contracts until each step is migrated deliberately.
- Keep later step semantics unchanged.

This keeps the bug fix local to Voila while preserving the behavior of the other steps.

## Acceptance criteria

The Voila implementation is correct when all of the following are true:

- Adding a new confidence claim causes the new claim to scale in at its final location while existing claims move immediately to make room.
- Adding a new relevance claim that requires a new junction causes the new claim to scale in during Voila, while the new junction and junction aggregator remain latent until Sprout.
- No connector pipe is revealed during Voila.
- No connector fluid is revealed during Voila.
- No claim score text changes during Voila.
- If a command changes only scores and not structure, no Voila step is emitted.
- If a command removes a claim, the claim scales out during Voila rather than disappearing instantly.
- The first frame after Voila hands off a settled snapshot that `sprout` and later steps can use without reinterpreting ids or rebuilding membership.
- The Voila renderer can be implemented without calling planner layout helpers or connector geometry helpers at render time.
