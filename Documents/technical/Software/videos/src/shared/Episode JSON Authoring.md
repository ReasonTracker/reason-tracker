# Episode JSON authoring

This guide is the authoring contract for `episode.json` files. Use it to create or revise an episode script without writing TypeScript.

The executable source of truth is [episodeScriptSpec.ts](./episodeScriptSpec.ts), with scheduling and graph compilation in [compileEpisodeScript.ts](./compileEpisodeScript.ts). Update this guide in the same change whenever either file changes the JSON format, defaults, or action behavior.

## Script Shape

```json
{
  "schemaVersion": 3,
  "settings": {
    "composition": {
      "id": "Episode0006",
      "fps": 30,
      "width": 1920,
      "height": 1080
    },
    "defaults": {
      "graph.addClaim": { "durationSeconds": 4 },
      "camera.move": { "durationSeconds": 1.2 }
    }
  },
  "script": []
}
```

- `schemaVersion` must be `3`.
- `settings.composition` is required and defines the Remotion composition.
- `script` is a required ordered list of actions. Actions do not have IDs.
- A custom `label` is optional. It names the action in Remotion Studio and diagnostics only.
- JSON objects are strict: do not add unsupported fields.
- Validation errors name the action index, action type, and field. For example: `script[1] (media.add).layout.x: is required.`

## Keys And References

A `key` is an author-facing stable reference, not a generated domain ID. It must start with a letter and then use only letters, digits, `_`, or `-`.

- Graph component key: `argumentGraph`
- Claim key within that graph: `cost`
- Claim scene target ID: `argumentGraph/cost`
- Media key: `sunshineProtectionAct`

Use claim keys for references, never claim text. The compiler creates internal claim and connector IDs. Text can therefore change without changing references.

Graph, media, and balance keys share one top-level scene target namespace. Add each visual once, then use that same key in its later `.update` actions. A graph's claim targets use the graph key as their parent path, such as `argumentGraph/cost`.

## Timing

Every action accepts these optional fields:

- `durationSeconds`: Decimal seconds. Each action type has a runtime default, and `settings.defaults` may override defaults for `graph.create`, `graph.addClaim`, and `camera.move`. `wait` requires an explicit positive duration. Visual `.add` actions are immediate and allow only zero duration. Visual `.update` actions default to zero duration, which is a cut; use a positive duration to transition compatible numeric values.
- `offsetSeconds`: Signed decimal-second offset from the current timeline cursor. Omitted means `0`.
- `blocking`: Omitted means `true`. A blocking action advances the cursor to the later of its current position or that action's end. A nonblocking action leaves the cursor where it is.

The compiler schedules an action as:

$$
start = cursor + offsetSeconds
$$

$$
end = start + durationSeconds
$$

The episode duration is the latest action end, including nonblocking actions. An action may not start before frame zero after conversion to frames.

Camera targets accept `offsetSeconds`, which defaults to `0` and shifts only the timeline position used to resolve the target's geometry. It does not affect the camera action's scheduled start time.

Use it with the action's `offsetSeconds` to preframe a claim before it becomes visible:

```json
{
    "type": "camera.move",
    "target": {
        "offsetSeconds": 2,
		"objects": ["argumentGraph/cost", "argumentGraph/main"]
    },
    "offsetSeconds": -2,
    "durationSeconds": 2,
    "blocking": false
},
{
  "type": "graph.addClaim",
  "graph": "argumentGraph",
  "key": "cost",
  "text": "The legislation would have a substantial cost.",
  "target": "main",
  "side": "con-main",
  "durationSeconds": 4
}
```

The camera move starts two seconds before the current cursor and resolves the target at the cursor. Because it is nonblocking, the following claim addition starts at the cursor without delay.

## Anchors

Every rendered object is anchored either to the movable `canvas` or the fixed `camera` viewport. The canvas is transparent and has no authored size or background color. It accepts world-positioned children beyond the composition bounds; the composition viewport clips the final view.

| Object                    | Default anchor | Coordinates               |
| ------------------------- | -------------- | ------------------------- |
| `graph.create`            | `canvas`       | Planner world coordinates |
| `media.add`               | `canvas`       | Canvas CSS pixels         |
| `balance.add`             | `canvas`       | Canvas CSS pixels         |
| `captions.show`           | `camera`       | Composition CSS pixels    |
| `graph.create.scoreboard` | `camera`       | Composition CSS pixels    |

Set `anchor` to `"canvas"` or `"camera"` only when the default is not suitable. Canvas-anchored content pans and zooms with camera actions. Camera-anchored content stays fixed to the composition while the camera moves.

At frame zero, the canvas world matches the composition rectangle: its visible bounds are `x: 0` through `1920` and `y: 0` through `1080` for a `1920x1080` composition. A graph's `layout.x` and `layout.y` place its main claim in that same direct coordinate system as a canvas object's numeric layout. The camera does not translate or scale the world until a camera action changes its viewport.

```json
{
  "type": "media.add",
  "key": "cornerLogo",
  "anchor": "camera",
  "source": "media/logo.png",
  "layout": { "x": 1692, "y": 48, "width": 180 }
}
```

`media.update` and `balance.update` retain the anchor selected when their object was added; updates cannot move an object between anchors. A canvas-anchored media item can provide a background when its CSS stacking order places it below the graph.

## Positioned Visuals

Media and balances are retained visuals. Add a visual once; it stays in the scene until the episode ends or an update makes it invisible or moves it out of view. Use the same key in a later update to change only the values that differ.

Each media add action requires numeric `layout.x`, `layout.y`, and exactly one display dimension: `layout.width` or `layout.height`. The renderer preserves the source image's intrinsic aspect ratio and derives the other dimension for rendering and camera geometry. Media updates may change either one dimension, never both. A balance layout requires both `width` and `height`.

`scale` defaults to `1`, `rotation` defaults to `0` degrees, and `originX` and `originY` default to the resolved object's center. Updates may patch any layout field. Layout values interpolate during positive-duration updates, and the renderer derives its positioning and transforms from the resolved layout.

Each visual action may also include a `style` object for appearance-only CSS such as `opacity` and `zIndex`. Position, size, scale, rotation, and transform-origin CSS properties are rejected because `layout` is authoritative for both rendering and camera geometry.

Within either anchor layer, retained visuals render before the graph, whose stacking order is `zIndex: 0`. Use CSS `zIndex` to control overlaps; for example, `zIndex: -1` places canvas media behind the graph without assigning a background color to the scene.

When an update has a positive `durationSeconds`, numeric layout values and matching numeric style values interpolate. Numeric CSS strings with the same unit also interpolate. Other CSS values apply at the update's first frame. Do not use CSS `transition`: episode timing already defines the frame-accurate transition.

Patches for different keys may overlap. Updates for one key may not overlap, and each update must name an already-added key of the same visual kind. An update must change at least one supported value.

### `media.add` And `media.update`

`source` is relative to the folder containing the episode JSON file. A `media.add` action requires `source`; a `media.update` action may replace it. Media contains no implicit entrance or exit motion.

This image enters while leaning around its bottom-right pivot, holds in place, and then exits with the opposite lean. The numeric layout drives both the rendered transform and the axis-aligned bounds exposed to the scene camera.

```json
{
  "type": "media.add",
  "key": "sunshineProtectionAct",
  "source": "media/sunshine-protection-act.png",
  "offsetSeconds": 3,
  "layout": {
  "x": 2700,
  "y": 1000,
  "width": 600,
  "rotation": 50
  }
},
{
  "type": "media.update",
  "key": "sunshineProtectionAct",
  "offsetSeconds": 3,
  "durationSeconds": 0.75,
  "blocking": false,
  "layout": {
  "x": 960,
  "y": 650,
  "rotation": 0
  }
},
{
  "type": "media.update",
  "key": "sunshineProtectionAct",
  "offsetSeconds": 5.25,
  "durationSeconds": 0.75,
  "blocking": false,
  "layout": {
  "x": 2700,
  "y": 1000,
  "rotation": -50
  }
}
```

### `balance.add` And `balance.update`

`scorePercent` ranges from `-100` through `100`: a positive score lowers the purple left tray, and a negative score lowers the orange right tray. Supply it when adding a balance and optionally update it later. It interpolates over a positive update duration.

```json
{
  "type": "balance.add",
  "key": "argumentBalance",
  "scorePercent": -100,
	"layout": { "x": 480, "y": 80, "width": 1920, "height": 1080, "scale": 0.5 }
},
{
  "type": "balance.update",
  "key": "argumentBalance",
  "scorePercent": 100,
  "durationSeconds": 4,
  "blocking": false
}
```

## Wait Action

### `wait`

Advance the timeline without rendering anything. `durationSeconds` is required and must be positive. It blocks by default, so use it to create a gap before the following action.

```json
{
  "type": "wait",
  "durationSeconds": 2
}
```

## Graph Actions

### `graph.create`

Create a graph before any other action references it. The main claim is always `pro-main` and has no target. `layout` is required and positions the main claim's center in the shared canvas coordinate system. Later graph cards retain this origin, so their emitted scene target bounds align directly with media and balance layouts.

```json
{
  "type": "graph.create",
  "key": "argumentGraph",
  "layout": { "x": 960, "y": 540 },
  "hideScores": true,
  "mainClaim": {
    "key": "main",
    "text": "Permanent daylight saving time would have a net benefit.",
    "showScore": false
  },
  "claims": [
    {
      "key": "daylight",
      "text": "More useful evening daylight would improve daily schedules.",
      "target": "main",
      "side": "pro-main"
    },
    {
      "key": "costEvidence",
      "text": "Cost estimates weaken the claimed benefit.",
      "target": { "relevanceOf": "daylight" },
      "side": "con-main"
    }
  ]
}
```

`claims` is optional. Each supplied claim must include `key`, `text`, `target`, and `side`. Set `hideScores` to `true` on `graph.create` to hide scores for every claim in that graph, leaving the full claim card for text at twice its normal size. Otherwise, main-claim scores are hidden by default; set the main claim's `showScore` to `true` to show one. Other claim scores are shown by default; set `showScore` to `false` on any claim to hide its score.

Set `scoreboard` on `graph.create` to show a live main-claim balance for that graph. The display shares the same planner frame as the graph, so it updates during each graph animation. It converts the signed raw claim balance from `-1` through `1` into complementary orange/con and purple/pro shares: `-1` renders `01 / 99`, `0` renders `50 / 50`, and `1` renders `99 / 01`. This does not change the graph claim-card display. A scoreboard is camera-anchored by default, so `x` and `y` are top-left composition pixels. Set its `anchor` to `"canvas"` when it should use canvas CSS pixels and move with the graph; `height`, `thermometerWidth`, and `numberWidth` are pixels.

```json
"scoreboard": {
  "anchor": "camera",
  "x": 48,
  "y": 48,
  "height": 400,
  "thermometerWidth": 165,
  "numberWidth": 220
}
```

A string `target` creates a confidence relationship to that claim. `{ "relevanceOf": "claimKey" }` creates a relevance relationship to the confidence relationship sourced by `claimKey`.

### `graph.addClaim`

Animate one new confidence-linked claim into an existing graph.

The visual transition begins on the action's first frame. Its duration is divided among the `voila`, `sprout`, `firstFill`, and `wave` phases; no static opening interval is reserved.

```json
{
  "type": "graph.addClaim",
  "graph": "argumentGraph",
  "key": "cost",
  "text": "The legislation would have a substantial cost.",
  "target": "main",
  "side": "con-main"
}
```

All fields shown above are required. The target must be an existing claim key. This action currently supports only a string confidence target; use `graph.set` or `graph.patch` to introduce relevance-linked graph state.

`showScore` is optional and defaults to `true`.

Set `textReveal` to `true` to reveal a claim's text character by character over that action's duration. The claim's full text participates in layout from the first frame, so line wrapping remains fixed while characters are revealed. A text-reveal action requires a positive duration; use a nonblocking action when the typing should overlap the following action.

`side` is relative to the main claim:

- `pro-main`: supports the main claim overall.
- `con-main`: opposes the main claim overall.

The compiler derives the internal target-relative relationship. A source and target on the same side support each other; opposite sides oppose each other.

To animate multiple additions together, schedule them at the exact same resolved start time. The easiest form is sequential nonblocking actions after a common cursor position. All additions in the same graph batch must use the same resolved duration. Graph mutations with different overlapping start times are rejected.

### `graph.set`

Replace the rendered graph state with the listed claims. The main claim must be included. This action has no animation by itself.

```json
{
  "type": "graph.set",
  "graph": "argumentGraph",
  "claims": [
    { "key": "main" },
    {
      "key": "cost",
      "text": "The legislation would have a substantial cost.",
      "target": "main",
      "side": "con-main"
    }
  ]
}
```

A known claim may use `{ "key": "claimKey" }` to keep its existing text, target, and side. A newly introduced claim must include `key`, `text`, `target`, and `side`.

### `graph.patch`

Keep the current graph and alter only named claim definitions or connections. This action has no animation by itself.

```json
{
  "type": "graph.patch",
  "graph": "argumentGraph",
  "removeConnectionsFrom": ["cost"],
  "claims": [
    {
      "key": "economicWeakness",
      "text": "Evidence for a large economic benefit is weak.",
      "target": "main",
      "side": "con-main"
    }
  ]
}
```

`removeConnectionsFrom` removes outgoing connections from the named claims but does not remove the claims themselves. `claims` may be empty. Existing claims can update any subset of `text`, `target`, `side`, `textReveal`, and `showScore`; new claims must be complete.

## Camera Actions

Camera actions are separate from graph actions. They may overlap graph animation but may not overlap another camera action.

### `camera.cut`

Immediately frame a target. Its default duration is zero.

```json
{
  "type": "camera.cut",
  "target": { "objects": ["argumentGraph"] }
}
```

### `camera.move`

Smoothly move to a target.

```json
{
  "type": "camera.move",
  "target": {
    "objects": ["argumentGraph/cost", "argumentGraph/main"]
  },
  "durationSeconds": 1.2,
  "blocking": false
}
```

Both camera actions use the same target shape:

```json
{ "objects": ["argumentGraph/cost", "argumentGraph/main"] }
```

Add percentage controls directly to an object target to adjust the automatic fit:

```json
{
  "objects": ["argumentGraph/main"],
  "x%": -12,
  "y%": 8,
  "zoom%": 180
}
```

`zoom%` defaults to `100`; larger values zoom in and smaller positive values zoom out. `x%` and `y%` default to `0`; they pan the final camera viewport right and down respectively by that percentage of its final width and height. Negative values pan left and up. These controls may appear only with `objects`.

Use an explicit viewport layout when an action should not target scene objects:

```json
{
  "layout": { "x": 0, "y": 0, "width": 1920, "height": 1080 }
}
```

An object target resolves each ID at the target frame, requires visible canvas-anchored scene targets, combines their rectangles, adds padding, and fits the composition aspect ratio. A graph contributes its graph key and one child target per rendered claim key; media and balance objects contribute their keys. Missing targets and camera-anchored targets are errors. A layout target uses its authored rectangle directly, without target padding or aspect-ratio fitting.

To follow a graph route, author successive `camera.move` actions whose object lists name each desired pair or card along that route. The graph exposes every rendered claim as a target, so route motion uses the same camera contract as every other scene object.

## Closed Captions

### `captions.show`

Display spoken text for the specified duration. Captions are camera-anchored by default, so they remain in place while the scene camera moves. Set `anchor` to `"canvas"` only when caption text should move with the world. Use a nonblocking action with a negative offset to align a caption with a preceding graph animation without advancing the timeline.

```json
{
  "type": "captions.show",
  "text": "The legislation would have a substantial cost.",
  "durationSeconds": 4,
  "offsetSeconds": -4,
  "blocking": false
}
```

## Authoring Checklist

1. Start with one `graph.create` per graph component.
2. Add or modify claim content near the action that introduces or changes it.
3. Use `pro-main` and `con-main`; do not author internal `proTarget` or `conTarget` values.
4. Add each positioned visual once, then use its matching `.update` action with the same key for later partial visual changes.
5. Use decimal seconds. Omit timing fields unless overriding the default cursor behavior; give each animated object patch a positive duration.
6. Add explicit camera actions only where the episode should move or focus.
7. Keep camera actions and same-key object patches non-overlapping after offsets and durations resolve.
8. For simultaneous graph additions, use the same start and duration.
9. Validate with `vp run typecheck` from `Documents/technical/Software/videos`. Do not run Remotion unless the task calls for visual review.
