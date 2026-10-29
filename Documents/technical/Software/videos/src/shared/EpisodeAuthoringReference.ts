/*
# Episode Authoring Contract

This file is the complete reference for creating one `episode.ts`. It is written for an AI harness that may not have this repository or source code. The import and type check at the end keep the example aligned with the runtime schema.

## File Shape

Create `episode.ts` in the episode directory. Use this wrapper:

```ts
import type { EpisodeScriptSpecInput } from "../shared/episodeScriptSpec.ts";

const episode = {
  schemaVersion: 4,
  settings: {
    composition: {
      id: "Episode0007",
      fps: 30,
      width: 1920,
      height: 1080,
    },
  },
  script: [
    {
      type: "defaults.update",
      defaults: {
        "camera.move": { duration: 1.2 },
        "graph.addClaim": { duration: "text" },
      },
    },
    { type: "wait", duration: 1 },
  ],
} satisfies EpisodeScriptSpecInput;

export default episode;
```

- `schemaVersion` is `4`.
- `settings.composition` is required. Its `id` must be unique; `fps`, `width`, and `height` must be positive integers.
- `script` is a nonempty ordered array.
- Do not add unsupported fields. Runtime validation is strict.
- Do not include generated `__mediaAspectRatios` metadata.
- Keep episode data deterministic. Do not use functions, promises, environment-dependent values, or nondeterministic values.

## Keys and References

An author key starts with a letter and then contains only letters, digits, `_`, or `-`.

- Graph key: `argumentGraph`
- Claim key within a graph: `cost`
- Claim scene target: `argumentGraph/cost`
- Media or balance key: `background`

Graph, media, and balance keys share a top-level scene-target namespace. Add each retained visual once, then use its key in later updates. Use keys, not displayed text, for references.

## Timing

Actions may accept `duration`, `offsetSeconds`, `blocking`, and `label`.

- `duration` is a finite nonnegative number of seconds or `"text"`. A text duration is the count of non-whitespace characters divided by 1,500 characters per minute. Actions with stricter duration rules are described below.
- `offsetSeconds` is a signed finite number relative to the timeline cursor; the default is `0`.
- `blocking` defaults to `true`. A blocking action advances the cursor to the later of its current position or the action end. A nonblocking action leaves the cursor unchanged.
- `label` is an optional nonempty name shown in Studio and diagnostics.

Scheduling uses:

```text
start = cursor + offsetSeconds
end = start + duration
```

The episode duration is the latest action end, including nonblocking actions. An action cannot resolve before frame zero.

Runtime duration defaults:

- `camera.move`: `1.2`
- `captions.show`, `graph.create`, and `graph.addClaim`: `"text"`
- `camera.cut`, `graph.set`, `graph.patch`, `media.add`, `media.update`, `balance.add`, `balance.update`, and `scoreboard.create`: `0`
- `wait`: requires an explicit or inherited positive numeric duration

`graph.set` and `graph.patch` that provide claim text use `"text"` when no duration is supplied.

### `defaults.update`

This immediate operation changes defaults for later actions in source order. It does not consume timeline time. Explicit action fields override defaults.

```ts
{
  type: "defaults.update",
  defaults: {
    "camera.move": { duration: 2, blocking: false },
    "graph.addClaim": { duration: "text" },
    "media.update": { duration: 0.75, blocking: false },
    "balance.update": { duration: 0.75, blocking: false },
    "captions.show": { duration: "text" },
    wait: { duration: 1 },
  },
}
```

The supported defaults keys are `balance.add`, `balance.update`, `camera.cut`, `camera.move`, `captions.show`, `graph.addClaim`, `graph.create`, `graph.patch`, `graph.set`, `media.add`, `media.update`, `scoreboard.create`, and `wait`. Every operation accepts default `blocking` and `offsetSeconds`. Operations with animatable durations accept a `duration` default. Immediate operations (`balance.add`, `camera.cut`, `media.add`, and `scoreboard.create`) do not. `graph.addClaim` may inherit a complete `presentation` object.

## Anchors, Layout, and Style

Visuals are anchored to the movable `canvas` or fixed `camera` viewport.

| Action or object | Default anchor | Coordinate space |
|---|---|---|
| `graph.create` | `canvas` | Planner world coordinates |
| `media.add` | `canvas` | Canvas CSS pixels |
| `balance.add` | `canvas` | Canvas CSS pixels |
| `captions.show` | `camera` | Composition CSS pixels |
| `scoreboard.create` | `camera` | Composition CSS pixels |

At frame zero, canvas coordinates match the composition rectangle. Canvas objects move and zoom with camera actions; camera objects remain fixed. Updates cannot change an object's anchor.

Visual `style` values are finite numbers or strings. Use `layout` for geometry; do not put `bottom`, `height`, `left`, `right`, `rotate`, `rotation`, `scale`, `top`, `transformOrigin`, or `width` in `style`. Compatible numeric style values interpolate during positive-duration updates. Other style values apply on the update's first frame.

## Graph Actions

### `graph.create`

Creates a graph before another action references it. `layout` supplies the main claim's center coordinates `x` and `y`. `mainClaim` needs `key` and nonempty `text`; `showScore` and `textReveal` are optional. `claims` is optional, and `hideScores: true` hides all graph scores.

```ts
{
  type: "graph.create",
  key: "argumentGraph",
  layout: { x: 960, y: 540 },
  hideScores: true,
  mainClaim: {
    key: "main",
    text: "Permanent daylight saving time would have a net benefit.",
    showScore: false,
  },
  claims: [
    {
      key: "daylight",
      text: "More useful evening daylight would improve daily schedules.",
      target: "main",
      side: "pro",
    },
    {
      key: "costEvidence",
      text: "Cost estimates weaken the claimed benefit.",
      target: { relevanceOf: "daylight" },
      side: "con",
    },
  ],
}
```

Each initial claim requires `key`, `text`, `target`, and `side`. A string target creates a confidence relationship. `{ relevanceOf: "claimKey" }` creates a relevance relationship to the confidence connector sourced by that claim. Authored sides are `pro` or `con`.

### `graph.addClaim`

Adds one confidence-linked or relevance-linked claim to an existing graph. It requires `graph`, `key`, `text`, `target`, and `side`. `showScore` and `textReveal` are optional.

```ts
{
  type: "graph.addClaim",
  graph: "argumentGraph",
  key: "cost",
  text: "The legislation would have a substantial cost.",
  target: "main",
  side: "con",
  textReveal: true,
}
```

A relevance claim uses an object target:

```ts
{
  type: "graph.addClaim",
  graph: "argumentGraph",
  key: "costEvidence",
  text: "Cost estimates weaken the claimed benefit.",
  target: { relevanceOf: "daylight" },
  side: "con",
}
```

The referenced claim must already exist and must have a string target. Add it before the relevance action. `side: "pro"` supports the main claim overall; `side: "con"` opposes it.

Additions to one graph with the same resolved start frame form one batch and require the same duration. Graph mutations with different start frames cannot overlap.

Use `presentation.mode: "screen-fill"` for an entrance that first fills most of the camera viewport, then settles into the graph:

```ts
{
  type: "graph.addClaim",
  graph: "argumentGraph",
  key: "healthEvidence",
  text: "The transition causes an immediate health risk.",
  target: "healthSafety",
  side: "pro",
  textReveal: true,
  presentation: {
    mode: "screen-fill",
    timing: {
      reveal: "text",
      hold: 1.5,
      settle: 0.75,
      graph: { sprout: 0.4, firstFill: 0.35, wave: 0.3, reorient: 0.25 },
    },
  },
}
```

`reveal` writes text when `textReveal` is true; otherwise it must be `0`. `hold` begins after text is fully visible. `settle` moves the claim to its completed entrance position and size. The graph timings run after settling. Screen-fill actions do not use top-level `duration`, cannot share an add-claim batch, and cannot overlap another graph mutation.

### `graph.set`

Replaces the rendered graph without animation. Include the main claim. An existing claim may use only `key`; each new claim requires `key`, `text`, `target`, and `side`.

```ts
{
  type: "graph.set",
  graph: "argumentGraph",
  claims: [
    { key: "main" },
    { key: "cost", text: "The change has a cost.", target: "main", side: "con" },
  ],
}
```

### `graph.patch`

Patches claims and removes named outgoing connections without animation. Both `claims` and `removeConnectionsFrom` are required; `claims` may be empty. An existing claim may patch `text`, `target`, `side`, `textReveal`, or `showScore`. A new claim must be complete.

```ts
{
  type: "graph.patch",
  graph: "argumentGraph",
  removeConnectionsFrom: ["cost"],
  claims: [
    {
      key: "economicWeakness",
      text: "Evidence for a large economic benefit is weak.",
      target: "main",
      side: "con",
    },
  ],
}
```

## Media Actions

Media sources use paths under the adjacent `media/` directory, cannot contain a `..` path segment, and support AVIF, GIF, JPEG, PNG, and WebP.

### `media.add`

Adds a retained image with zero or omitted duration. Provide `x`, `y`, and exactly one of `width` or `height`; intrinsic aspect ratio supplies the other dimension. `scale` defaults to `1`, `rotation` to `0`, and transform origin to the resolved center.

```ts
{
  type: "media.add",
  key: "bill",
  source: "media/bill.png",
  anchor: "canvas",
  layout: { x: 1020, y: 460, width: 100, rotation: 0 },
  style: { opacity: 1, zIndex: -1 },
  blocking: false,
}
```

### `media.update`

Updates an existing key. Supply a `source`, a nonempty `layout` patch, or a nonempty `style` patch. Layout supports `x`, `y`, `width`, `height`, `scale`, `rotation`, `originX`, and `originY`; do not provide both `width` and `height`.

```ts
{
  type: "media.update",
  key: "bill",
  layout: { y: 370, scale: 1.2 },
  style: { opacity: 0 },
  duration: 0.75,
  blocking: false,
}
```

Updates to different keys may overlap. Updates to the same key may not overlap.

## Balance and Scoreboard

### `balance.add` and `balance.update`

`balance.add` adds a retained balance. Its layout requires finite `x`, `y`, positive `width` and `height`; `scale` is positive, `rotation`, `originX`, and `originY` are finite. `scorePercent` is between `-100` and `100`. Add duration is zero or omitted.

`balance.update` requires an existing key and at least one of `scorePercent`, a nonempty layout patch, or a nonempty style patch.

```ts
{
  type: "balance.add",
  key: "argumentBalance",
  scorePercent: -100,
  layout: { x: 480, y: 80, width: 1920, height: 1080, scale: 0.5 },
}
```

### `scoreboard.create`

Creates a graph scoreboard with duration zero or omitted. Layout requires finite `x` and `y`, positive `height`, `thermometerWidth`, and `numberWidth`. Anchor defaults to `camera`.

```ts
{
  type: "scoreboard.create",
  graph: "argumentGraph",
  layout: {
    x: 48,
    y: 48,
    height: 400,
    thermometerWidth: 165,
    numberWidth: 220,
  },
}
```

## Camera Actions

Camera actions may overlap graph animations but not other camera actions. Targets frame scene objects or specify an explicit rectangle. Target `offsetSeconds` defaults to `0` and selects the timeline position used to resolve target geometry; it does not change action start time.

### `camera.cut` and `camera.move`

`camera.cut` immediately frames a target and defaults to zero duration. `camera.move` smoothly moves to a target and defaults to `1.2` seconds.

```ts
{
  type: "camera.move",
  target: {
    offsetSeconds: 2,
    objects: ["argumentGraph/cost", "argumentGraph/main"],
    "x%": -12,
    "y%": 8,
    "zoom%": 180,
  },
  duration: 1.2,
  blocking: false,
}
```

Object targets require a nonempty `objects` array. `zoom%` is positive and defaults to `100`; larger values zoom in. `x%` and `y%` pan by percentages of the final viewport. Object IDs must resolve to visible canvas-anchored targets at the target frame.

An explicit layout target requires finite `x`, `y` and positive `width`, `height`:

```ts
target: { layout: { x: 0, y: 0, width: 1920, height: 1080 } }
```

## Captions and Wait

### `captions.show`

Shows nonempty text; duration defaults to `"text"`. Anchor defaults to `camera`. Optional `position: "center"` centers the caption.

```ts
{
  type: "captions.show",
  text: "The legislation would have a substantial cost.",
  position: "center",
  duration: "text",
  offsetSeconds: -4,
  blocking: false,
}
```

### `wait`

Advances the timeline without rendering. It requires an explicit or inherited positive numeric duration and blocks by default.

```ts
{ type: "wait", duration: 2 }
```

## Generation Checklist

1. Produce one complete `episode.ts` with the import, `satisfies EpisodeScriptSpecInput`, and default export.
2. Use schema version `4`, a unique composition ID, and a nonempty script.
3. Use `pro` and `con` for claim sides.
4. Create each graph before referencing it. Add each retained visual before updating it.
5. Use stable keys and `graphKey/claimKey` targets rather than displayed text.
6. Put images in the adjacent `media/` directory and reference them with `media/file.ext`.
7. Use layout fields for geometry and style fields for appearance.
8. Avoid overlapping camera actions, updates to the same media or balance key, and incompatible graph mutations.
9. Use finite numbers, positive dimensions, valid score ranges, and explicit positive durations where required.
10. Keep the script deterministic and use only supported fields.
*/

import type { EpisodeScriptSpecInput } from "./episodeScriptSpec.ts";

type AuthoringReferenceExample = {
	schemaVersion: 4
	settings: {
		composition: {
			id: "EpisodeAuthoringReference"
			fps: 30
			width: 1920
			height: 1080
		}
	}
	script: [
		{
			type: "graph.create"
			key: "argumentGraph"
			layout: { x: 960; y: 540 }
			mainClaim: {
				key: "main"
				text: "The example claim."
			}
		},
	]
};

type Assert<T extends true> = T;
export type EpisodeAuthoringReferenceMatchesSchema = Assert<
	AuthoringReferenceExample extends EpisodeScriptSpecInput ? true : false
>;
