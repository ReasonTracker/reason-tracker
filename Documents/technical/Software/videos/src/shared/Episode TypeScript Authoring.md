# Episode TypeScript authoring

This guide is the complete authoring contract for `episode.ts` files. It is intended to be usable on its own by a human or external AI without a repository checkout, editor, typechecker, or JSON authoring guide.

The executable source of truth is `shared/episodeScriptSpec.ts`. Every generated file is still validated by the same Zod schema when Remotion loads it; TypeScript checking supplements runtime validation rather than replacing it.

## Complete File Shape

Create one `episode.ts` in the episode directory. Use this exact wrapper, including the relative type-only import and default export:

```ts
import type { EpisodeScriptSpecInput } from "../shared/episodeScriptSpec";

const episode = {
  schemaVersion: 3,
  settings: {
    composition: {
      id: "Episode0007",
      fps: 30,
      width: 1920,
      height: 1080,
    },
    defaults: {
      "graph.addClaim": { durationSeconds: 4 },
      "camera.move": { durationSeconds: 1.2 },
    },
  },
  script: [{ type: "wait", durationSeconds: 1 }],
} satisfies EpisodeScriptSpecInput;

export default episode;
```

- `schemaVersion` must be `3`.
- `settings.composition` and a nonempty `script` are required.
- Use a unique nonempty Remotion composition `id`.
- Do not add imports other than the type import unless the episode intentionally needs executable TypeScript behavior.
- Do not use functions, promises, environment-dependent values, or nondeterministic values in the episode object.
- Do not include `__mediaAspectRatios`; the build supplies that metadata.
- A directory must contain exactly one definition: `episode.ts` or `episode.json`, never both.

## Keys And References

An author key must start with a letter and then contain only letters, digits, `_`, or `-`.

- Graph key: `argumentGraph`
- Claim key within that graph: `cost`
- Claim scene target: `argumentGraph/cost`
- Media or balance key: `background`

Graph, media, and balance keys share one top-level scene-target namespace. Add each retained visual once and use the same key in later updates. Use keys rather than displayed text for all references.

## Timing

Every action accepts these optional timing fields:

```ts
{
	type: "camera.move",
	target: { objects: ["argumentGraph/main"] },
	durationSeconds: 1.2,
	offsetSeconds: -1.2,
	blocking: false,
	label: "Frame the main claim",
}
```

- `durationSeconds` is a finite, nonnegative number. Actions with stricter rules are listed below.
- `offsetSeconds` is a signed finite number relative to the current timeline cursor and defaults to `0`.
- `blocking` defaults to `true`. A blocking action advances the cursor to the later of the current cursor or the action end. A nonblocking action leaves the cursor unchanged.
- `label` is an optional nonempty name used in Remotion Studio and diagnostics.
- An action may not resolve before frame zero.

The schedule is:

$$
start = cursor + offsetSeconds
$$

$$
end = start + durationSeconds
$$

The episode duration is the latest action end, including nonblocking actions.

Runtime duration defaults are `camera.move: 1.2`, `graph.addClaim: 4`, and `0` for `camera.cut`, `graph.create`, `graph.set`, `graph.patch`, `media.add`, `media.update`, `balance.add`, and `balance.update`. `captions.show` and `wait` require an explicit positive duration. `settings.defaults` may override only `camera.move`, `graph.addClaim`, and `graph.create`:

```ts
defaults: {
	"camera.move": { durationSeconds: 2 },
	"graph.addClaim": { durationSeconds: 5 },
	"graph.create": { durationSeconds: 6 },
},
```

## Anchors And Layout

Every visual is anchored to either the movable `canvas` or fixed `camera` viewport.

| Object                    | Default anchor | Coordinates               |
| ------------------------- | -------------- | ------------------------- |
| `graph.create`            | `canvas`       | Planner world coordinates |
| `media.add`               | `canvas`       | Canvas CSS pixels         |
| `balance.add`             | `canvas`       | Canvas CSS pixels         |
| `captions.show`           | `camera`       | Composition CSS pixels    |
| `graph.create.scoreboard` | `camera`       | Composition CSS pixels    |

At frame zero, canvas coordinates match the composition rectangle. Canvas objects move and zoom with camera actions; camera objects stay fixed. Updates cannot change an object's anchor.

Visual `style` values may be finite numbers or strings. Do not put `bottom`, `height`, `left`, `right`, `rotate`, `rotation`, `scale`, `top`, `transformOrigin`, or `width` in `style`; use `layout` for geometry. Numeric style values and matching numeric strings with the same unit interpolate during positive-duration updates. Other values apply on the update's first frame.

## Media Actions

Media `source` must begin with `media/`, must name a file beneath the adjacent `media` directory, and cannot contain a `..` segment. Supported image formats are AVIF, GIF, JPEG, PNG, and WebP.

### `media.add`

Adds a retained image. It must have zero or omitted duration. Supply `x`, `y`, and exactly one of `width` or `height`; intrinsic aspect ratio supplies the other dimension. `scale` defaults to `1`, `rotation` to `0`, and transform origins to the resolved center.

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

Updates an existing media key. Supply at least one of `source`, a nonempty `layout` patch, or a nonempty `style` patch. A layout patch may contain `x`, `y`, `width`, `height`, `scale`, `rotation`, `originX`, and `originY`, but cannot contain both `width` and `height`.

```ts
{
	type: "media.update",
	key: "bill",
	layout: { y: 370, scale: 1.2 },
	style: { opacity: 0 },
	durationSeconds: 0.75,
	blocking: false,
}
```

Updates to different keys may overlap. Updates to the same key may not overlap.

## Balance Actions

### `balance.add`

Adds a retained balance visualization. `layout` requires finite `x`, `y`, positive `width` and `height`, with optional positive `scale`, finite `rotation`, `originX`, and `originY`. `scorePercent` must be from `-100` through `100`. Duration must be zero or omitted.

```ts
{
	type: "balance.add",
	key: "argumentBalance",
	scorePercent: -100,
	layout: { x: 480, y: 80, width: 1920, height: 1080, scale: 0.5 },
}
```

### `balance.update`

Updates an existing balance key. Supply at least one of `scorePercent`, a nonempty `layout` patch, or a nonempty `style` patch.

```ts
{
	type: "balance.update",
	key: "argumentBalance",
	scorePercent: 100,
	durationSeconds: 4,
	blocking: false,
}
```

## Graph Actions

### `graph.create`

Creates a graph before any action references it. `layout.x` and `layout.y` position the main claim's center. The main claim requires `key` and nonempty `text`; `showScore` and `textReveal` are optional. `claims` is optional. `hideScores: true` hides every claim score in the graph.

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

Each initial claim requires `key`, `text`, `target`, and `side`. A string target creates a confidence relationship to that claim. `{ relevanceOf: "claimKey" }` creates a relevance relationship to the confidence relationship sourced by that claim.

An optional scoreboard has required finite `x` and `y`, positive `height`, `thermometerWidth`, and `numberWidth`, plus optional `anchor: "canvas" | "camera"`:

```ts
scoreboard: {
	anchor: "camera",
	x: 48,
	y: 48,
	height: 400,
	thermometerWidth: 165,
	numberWidth: 220,
},
```

### `graph.addClaim`

Animates one confidence-linked or relevance-linked claim into an existing graph. All shown fields are required. `side` is `pro` when the claim supports the main claim overall and `con` when it opposes the main claim overall. Do not author internal side names such as `pro-main` or `con-main`.

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

Use an object target to add a relevance-linked claim:

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

`showScore` and `textReveal` are optional. Text reveal requires a positive resolved duration. Additions in the same graph that resolve to the same start frame form one animation batch and must have the same duration. Overlapping graph mutations with different start frames are invalid.

A string target creates a confidence relationship to an existing claim. `{ relevanceOf: "claimKey" }` creates a relevance relationship to the confidence relationship sourced by `claimKey`. The referenced claim must already exist and must itself have a string target, so add it before the relevance-linked action.

### `graph.set`

Replaces the rendered graph state without animation. Include the main claim. Existing claims may provide only `key`; new claims require complete `key`, `text`, `target`, and `side` values.

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

Patches claim definitions and removes named outgoing connections without animation. Both arrays are required; `claims` may be empty. Existing claims may patch `text`, `target`, `side`, `textReveal`, and `showScore`; new claims must be complete.

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

## Camera Actions

Camera actions may overlap graph animation but may not overlap another camera action. A target may frame scene objects or use an explicit layout. Target `offsetSeconds` defaults to `0` and changes the frame used to resolve geometry, not the action's scheduled start.

### `camera.cut`

Immediately frames a target and defaults to zero duration.

```ts
{
	type: "camera.cut",
	target: { objects: ["argumentGraph/main"] },
}
```

### `camera.move`

Smoothly moves to a target and defaults to `1.2` seconds unless overridden in settings.

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
	durationSeconds: 1.2,
	blocking: false,
}
```

Object targets require a nonempty `objects` array. `zoom%` must be positive and defaults to `100`; larger values zoom in. `x%` and `y%` pan by percentages of the final viewport. Object IDs must resolve to visible canvas-anchored targets at the target frame.

Use a layout target for an exact canvas rectangle. All four fields are required, and width and height must be positive:

```ts
target: {
	offsetSeconds: 0,
	layout: { x: 0, y: 0, width: 1920, height: 1080 },
},
```

## Captions And Waiting

### `captions.show`

Shows nonempty text for an explicit positive duration. Captions default to `anchor: "camera"`; optional `position: "center"` centers the caption.

```ts
{
	type: "captions.show",
	text: "The legislation would have a substantial cost.",
	position: "center",
	durationSeconds: 4,
	offsetSeconds: -4,
	blocking: false,
}
```

### `wait`

Advances the timeline without rendering anything. It requires an explicit positive duration and blocks by default.

```ts
{ type: "wait", durationSeconds: 2 }
```

## Generation Checklist

1. Output one complete `episode.ts` file using the exact import, `satisfies EpisodeScriptSpecInput`, and default-export wrapper.
2. Use schema version `3`, a required composition, and a nonempty script.
3. Use `pro` and `con` for authored claim sides.
4. Create each graph before referencing it and add each retained visual before updating it.
5. Use stable keys and valid `graphKey/claimKey` scene targets rather than displayed text.
6. Put images in the adjacent `media` directory and reference them as `media/file.ext`.
7. Use layout fields for geometry and style fields only for appearance.
8. Keep camera actions, same-key visual updates, and incompatible graph mutations from overlapping.
9. Use finite numbers, positive dimensions, valid score ranges, and explicit positive durations where required.
10. Do not add unsupported fields. Runtime validation is strict even if no typechecker was available during generation.
