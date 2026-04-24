# Video Animation

## Purpose

The video package turns authored debate commands into Remotion compositions that animate over frame time.
Episode files own authored timing and story beats.
The engine owns command planning, reduction, scoring, and layout.
The shared video helpers own Remotion sequencing, fades, graph-state interpolation, and camera motion.

## Remotion Flow

1. An episode declares a frame rate and a timeline with `buildTimelineTimes`.
2. The episode renders `GraphView` with an initial `Debate`.
3. The episode places `GraphEvents` children inside `GraphView`.
4. Each `GraphEvents` entry carries one or more `{ id, command }` action entries.
5. `GraphView` runs those commands through `Planner`, applies emitted operations through `Reducer`, and creates operation-derived layout snapshots with `layoutDebate`.
6. During render, `GraphView` uses `useCurrentFrame` to resolve the active segment and interpolates from one snapshot to the next.
7. `CameraMove` children are resolved against the active graph frame so camera movement is also frame-driven.

## Timeline Semantics

`buildTimelineTimes(entries, fps)` converts second-based authoring into Remotion frame segments.

- `["segmentId", seconds]` creates a segment at the current cursor and then advances the cursor by that segment duration.
- `["segmentId", seconds, adjustSeconds]` creates a segment at `cursor + adjustSeconds` and does not advance the cursor.
- `[wait, seconds]` advances the cursor without creating a named segment.
- Segment ids are trimmed before storage.
- `fps` is coerced to at least `1`.
- Segment duration is rounded to frames and clamped to at least `1`.
- Wait duration is rounded to frames and clamped to at least `0`.
- Negative adjusted starts are clamped to frame `0`.
- `totalDurationInFrames` tracks the cursor after advancing entries, so overlay segments with an adjustment do not extend the total unless later cursor movement reaches them.

## Fade

`Fade` wraps children in a Remotion `Sequence`.
Opacity is calculated from the sequence-local frame.

- Fade-in uses `interpolate(frame, [0, fadeInFrames], [0, 1])`.
- Fade-out requires `durationInFrames` and starts at `durationInFrames - fadeOutFrames`.
- When both fade-in and fade-out are present, the final opacity is the product of the two opacity curves.
- Hidden marker sequences are emitted only for the actual fade-in and fade-out ranges.
- The content sequence still spans the whole visible lifetime, but Remotion Studio fade markers are named `${name} In` and `${name} Out` and cover only the frames where opacity changes.

## Graph Events

`GraphEvents` is a declarative child of `GraphView`.
It renders nothing directly; it tells `GraphView` when and how to change the debate graph.
Graph events are sorted by `from` and must not overlap because each event builds on the reduced state left by the prior event.

Each graph action entry has:

- `id`: stable authoring id for timeline labels
- `command`: an engine `EngineCommand`

`applyMode` controls how actions inside one `GraphEvents` block are scheduled.

- `per-action` splits the event duration across actions and animates each action's operation groups in order.
- `all-at-once` plans all actions together, then animates the emitted operation groups in planner order across the full event duration.

For `per-action`, operation groups are built so every rendered snapshot is layout-safe.
Structural membership operations are grouped through `incomingScoresChanged`; score propagation, incoming-score sorting, and source-scale updates become later visual phases.

Every non-structural animation segment receives exactly one engine operation.
The structural membership envelope is the only multi-operation segment because layout cannot safely render partially connected graph membership.
Connector value changes therefore advance one planner operation at a time, so a propagation step cannot visually include the next propagation step.

## Operation-Driven Animation

Graph animation follows the planner operation order described by the engine.

- Structural add, update, and delete operations establish graph membership.
- `incomingScoresChanged` finishes the structural membership phase so layout can safely include new score occurrences and connectors.
- Each `ScoreUpdated` operation becomes its own propagation phase.
- `incomingScoresSorted` becomes an ordering phase after propagation settles.
- `scaleOfSources` becomes a whole-graph size and connector-width phase.

This preserves the planner distinction between a command and the operation wave emitted for that command.
The renderer does not calculate new score values; it interpolates between the reduced states produced by applying each operation group.
The renderer also does not pull values, layout, connector widths, graph bounds, or junction geometry from later operations into earlier operation snapshots.
If an operation changes engine state without changing the rendered graph above the visual tolerance, `GraphView` advances to that state without allocating visible timeline time for the no-op segment.

## Add Claim Animation

An add-claim command emits multiple engine operations, including `ClaimAdded`, `ConnectorAdded`, `ScoreAdded`, `incomingScoresChanged`, zero or more `ScoreUpdated` operations, optional `incomingScoresSorted`, and `scaleOfSources`.
The video layer keeps those operations in order.
The newly added score occurrence uses the source scale carried by its `ScoreAdded` operation; `GraphView` does not replace that scale with a future scale operation.

For a confidence add, the structural add group expands into three visual phases:

1. Layout and claim phase
   The new layout is calculated from the reduced state after the structural operations.
   Existing score occurrences interpolate from their old layout positions to their new layout positions.
   The new claim occurrence is present at its final layout position, scales from `0` to full size, fades from `0` to `1`, and its displayed confidence scales from `0` to the reduced score value.
   The new connector spans and new connector junctions are omitted from the render order during this phase, so no connector layer can appear before the claim has entered.
   The structural add snapshot is layout-valid on its own.
   If the same command later emits `scaleOfSources`, that scale change appears only during the later `scaleOfSources` phase.
   The video renderer does not invent layout floors, synthetic scales, or expanded graph bounds to compensate for planner state.

2. Empty pipe phase
   The new connector's pipe walls and pipe interior reveal from source claim to target with an open moving end.
   The connector fluid remains hidden.
   This represents the confidence potential before the actual confidence fill travels through it.

3. Confidence fluid phase
   The pipe remains fully visible.
   The connector fluid reveals from source claim to target and stays anchored to the pipe's bottom boundary as it grows.
   After this phase, the graph is at the reduced structural state and later operation phases can propagate score effects.

For a relevance add, the structural add group expands into five visual phases:

1. Layout and claim phase
   The new relevance source claim enters at the source scale carried by the `ScoreAdded` operation.
   Existing score occurrences interpolate only to the reduced structural snapshot.
   The new relevance connector and any new target-confidence junction are omitted from the render order.

2. Relevance pipe and temporary junction phase
   The relevance pipe reveals from source claim to the target confidence connector.
   The target confidence connector uses a temporary line junction that matches the current target confidence connector thickness, angle, and junction center.
   The relevance connector endpoint is calculated from the same temporary junction visual that renders the junction box.
   The target-side confidence delivery span remains at its current geometry.

3. Relevance fluid phase
   The relevance pipe remains fully visible.
   The relevance fluid reveals from source claim to the same temporary junction endpoint.

4. Junction shape phase
   The target confidence connector junction changes from the temporary line junction to the reduced structural junction shape.
   The relevance connector endpoint is recalculated from the active junction visual during the same frame, so the relevance connector angle and junction shape cannot drift into different phases.
   Destination-span width does not animate during this phase.

5. Confidence delivery phase
   The target confidence connector delivery span animates from the junction toward the target claim when the reduced structural snapshot changes delivery geometry.
   The target-side connector pivot and relevance endpoint follow the active junction visual during this phase.
   Junction shape changes do not animate during this phase.

Connector reveal uses path-relative percentages, so it follows the routed layout geometry rather than a straight screen-space tween.
Those add phases are expressed through path-geometry extremity instructions, not through SVG clipping or renderer-owned visibility windows.

## Graph Rendering

The animation unit is the score occurrence, not the claim id.
A claim that appears through more than one score occurrence can animate in more than one place.

For every snapshot, `GraphView` stores:

- graph width and height
- one visual node per layout node
- one connector span visual per layout connector span
- one connector junction visual per layout connector junction

Those snapshots stay engine-derived.
Animation state can change presentation values such as opacity, insert scale, and connector reveal progress, but it does not invent alternate layout sizes, graph bounds, or connector widths outside the engine-produced snapshots.
Every transition starts from the snapshot left by the prior operation group and ends at the snapshot produced by applying the current operation group.

During a transition:

- shared score occurrences interpolate position, size, confidence, relevance, and content-side display state
- entering score occurrences start with opacity `0`, insert scale `0`, and confidence `0`
- exiting score occurrences fade and shrink to opacity `0`, insert scale `0`, and confidence `0`
- shared connector spans can interpolate routed geometry when the semantic connector value is unchanged
- connector value changes such as confidence or potential updates sweep the new geometry from one end of the path to the other by composing path-geometry transition instructions instead of animating width across the whole connector at once, unless a later rule below explicitly requires whole-span interpolation
- entering connector spans reveal from source to target
- exiting connector spans hide from source to target or target to source according to the directive
- relevance connectors also update the target confidence connector so split spans and connector junctions animate together

When an existing confidence connector already has a junction and a later `ScoreUpdated` operation changes that connector, `GraphView` uses two ordered phases.

1. Source and junction phase
   Shared graph layout, source-span geometry, and the junction box all interpolate toward the reduced target snapshot together.
   The confidence delivery span keeps its previous geometry and widths for this whole phase.
   Any relevance connector targeting that junction derives its centerline from the active junction visual on every frame of this phase.
   The source span must interpolate width and movement together across the whole span during this phase. `GraphView` must not use a path-relative width sweep or moving transition front inside this phase.

2. Junction-to-target delivery phase
   The junction box stays at the state reached in phase 1.
   The confidence delivery span then animates from the junction toward the target claim.
   Any targeting relevance connector still derives its centerline from the active junction visual on every frame of this phase, so the relevance endpoint remains locked to the rendered junction box while the delivery span catches up.
   The delivery span must interpolate width and movement together across the whole span during this phase. `GraphView` must not use a path-relative width sweep or moving transition front inside this phase.

This two-phase rule applies to later `ScoreUpdated` transitions on an already-present junctioned confidence connector.
`scaleOfSources` does not use this split path: source span, delivery span, junction box, and targeting relevance endpoints all update together during the single whole-graph source-scale phase.
It is separate from the five-phase structural relevance-add animation described above.

Connector reveal and removal use path-geometry extremity instructions measured along the routed path.
Pipe reveal uses open extremities at the moving end so potential confidence never tapers into the centerline.
Fluid reveal and removal fronts use curved extremities whose collapse offset is anchored to the pipe's bottom boundary rather than the centerline.
Target-to-source removal keeps the same distinction: the pipe end stays open while the fluid frontier remains bottom-anchored and curved.

Score changes and connector changes follow the same operation groups that the planner emits.
When a `ScoreUpdated` operation changes one step of confidence or relevance propagation, the affected score occurrence text value and the affected connector span animate during that step only.
Existing connector confidence and potential changes render as one path-geometry instruction sequence: open extremities define the visible path, a curved transition carries the sweep from old offsets to new offsets, and fluid offsets stay anchored to the pipe's bottom boundary throughout.
The next `ScoreUpdated` operation starts from that newly reduced state, which makes propagation move visually through the graph one planner step at a time.

## Camera Move

`CameraMove` is a declarative child of `GraphView`.
It renders no visible DOM.
It contributes a timed camera target to the active graph frame.

A camera target can be:

- `claimId`: one claim id or a list of claim ids; the target bounds include all matching score occurrences
- `target`: explicit graph coordinates plus optional width and height
- `reset`: the whole active graph bounds

If a target cannot be measured, the camera falls back to the active graph center.
If a target has width and height, the focused scale is:

```text
availableWidth = frameWidth - padding * 2
availableHeight = frameHeight - padding * 2
scale = min(availableWidth / targetWidth, availableHeight / targetHeight)
```

If a target has no width or height, the camera uses the move's fallback `scale`.

The pan and zoom formula is:

```text
progress = bezier(0.42, 0, 0.2, 1)(
  clamp((frame - startFrame) / durationInFrames, 0, 1)
)

scale = lerp(startScale, endScale, progress)
screenX = lerp(startScreenX, endScreenX, progress)
screenY = lerp(startScreenY, endScreenY, progress)

translateX = screenX - targetX * scale
translateY = screenY - targetY * scale
```

`startScreenX` and `startScreenY` are calculated from the current camera state using the next target:

```text
startScreenX = currentTranslateX + targetX * currentScale
startScreenY = currentTranslateY + targetY * currentScale
```

That pairing is the important invariant.
The camera interpolates the screen position of the next target and the zoom scale together, then solves translation from the target point and current scale.
This keeps the target's path smooth while zoom and pan happen at the same time.

## Episode0001

`Episode0001` uses the shared animation model directly.
It starts from a one-claim debate, schedules each Elm Street claim addition with `GraphEvents`, keeps the whole graph in view, runs the brand sequence, and fades the graph out.

## Current Limits

- Episode data is authored in TypeScript rather than loaded from an external episode data file.
- There is no narration or audio beat alignment layer yet.
- There is no automated render QA pass for representative frames.
- Graph event durations are author-provided; there is no content-aware timing planner yet.
