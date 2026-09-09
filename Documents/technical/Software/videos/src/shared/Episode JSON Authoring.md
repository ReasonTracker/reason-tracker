# Episode JSON authoring

This guide is the authoring contract for `episode.json` files. Use it to create or revise an episode script without writing TypeScript.

The executable source of truth is [episodeScriptSpec.ts](./episodeScriptSpec.ts), with scheduling and graph compilation in [compileEpisodeScript.ts](./compileEpisodeScript.ts). Update this guide in the same change whenever either file changes the JSON format, defaults, or action behavior.

## Script Shape

```json
{
  "schemaVersion": 2,
  "settings": {
    "composition": {
      "id": "Episode0006",
      "fps": 30,
      "width": 1920,
      "height": 1080
    },
    "defaults": {
      "graph.addClaim": { "durationSeconds": 4 },
      "camera.move": { "durationSeconds": 1.2 },
      "camera.follow": { "durationSeconds": 0.65 }
    }
  },
  "script": []
}
```

- `schemaVersion` must be `2`.
- `settings.composition` is required and defines the Remotion composition.
- `script` is a required ordered list of actions. Actions do not have IDs.
- A custom `label` is optional. It names the action in Remotion Studio and diagnostics only.
- JSON objects are strict: do not add unsupported fields.

## Keys And References

A `key` is an author-facing stable reference, not a generated domain ID. It must start with a letter and then use only letters, digits, `_`, or `-`.

- Graph component key: `argumentGraph`
- Claim key within that graph: `cost`
- Claim object reference: `argumentGraph.cost`

Use claim keys for references, never claim text. The compiler creates internal claim and connector IDs. Text can therefore change without changing references.

## Timing

Every action accepts these optional fields:

- `durationSeconds`: Decimal seconds. Each action type has a runtime default, and `settings.defaults` may override defaults for `graph.create`, `graph.addClaim`, `camera.move`, and `camera.follow`. `captions.show` always requires an explicit positive duration.
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

A typical overlapping camera move looks like this:

```json
{
    "type": "graph.addClaim",
    "graph": "argumentGraph",
    "key": "cost",
    "text": "The legislation would have a substantial cost.",
     "textReveal": true,
    "target": "main",
    "side": "con-main",
    "durationSeconds": 4
},
{
    "type": "camera.move",
    "target": {
        "objects": ["argumentGraph.cost", "argumentGraph.main"]
    },
    "offsetSeconds": -4,
    "durationSeconds": 1.2,
    "blocking": false
}
```

The camera move starts at the same cursor position as the preceding claim addition and does not delay the next action.

## Media Actions

### `media.show`

Display an image from an episode's `media` folder. Media rises from below the frame at the start of the action, remains visible, and exits downward as the action ends. Set `blocking` to `false` when it should overlap the following action, such as a caption.

```json
{
  "type": "media.show",
  "source": "Episode0005/media/example.png",
  "durationSeconds": 5,
  "blocking": false
}
```

## Balance Actions

### `balance.show`

Display a pivoting balance scale. `scorePercent` ranges from `-100` through `100`: a positive score lowers the purple left tray, while a negative score lowers the orange right tray. `startScorePercent` is optional and defaults to `0`; when supplied, the scale animates from that score to `scorePercent` over the action duration. At `0`, both blocks are one unit high. At either extreme, the heavier side is two units high and the other block has zero height. Optional `x` and `y` place the calculated visual center in composition pixels, following Remotion's top-left coordinate system. When omitted, the center is the composition center. Positive `scale` resizes the visual around its calculated center.

```json
{
  "type": "balance.show",
  "startScorePercent": -100,
  "scorePercent": 100,
  "x": 960,
  "y": 540,
  "scale": 1,
  "durationSeconds": 4,
  "blocking": false
}
```

## Graph Actions

### `graph.create`

Create a graph before any other action references it. The main claim is always `pro-main` and has no target.

```json
{
  "type": "graph.create",
  "key": "argumentGraph",
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

`claims` is optional. Each supplied claim must include `key`, `text`, `target`, and `side`. Set `showScore` to `false` on any claim to hide its score; omit it or set it to `true` to show the score.

A string `target` creates a confidence relationship to that claim. `{ "relevanceOf": "claimKey" }` creates a relevance relationship to the confidence relationship sourced by `claimKey`.

### `graph.addClaim`

Animate one new confidence-linked claim into an existing graph.

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
  "target": { "component": "argumentGraph" }
}
```

### `camera.move`

Smoothly move to a target.

```json
{
  "type": "camera.move",
  "target": {
    "objects": ["argumentGraph.cost", "argumentGraph.main"]
  },
  "durationSeconds": 1.2,
  "blocking": false
}
```

### `camera.follow`

Follow the confidence route from a claim introduced by a prior or same-time `graph.addClaim` action.

```json
{
  "type": "camera.follow",
  "routeFrom": "argumentGraph.cost",
  "durationSeconds": 0.65,
  "blocking": false
}
```

Camera targets are one of:

```json
{ "objects": ["argumentGraph.cost", "argumentGraph.main"] }
{ "component": "argumentGraph" }
{ "scene": true }
```

Object references within one graph are fitted as one view. A known but currently disconnected graph claim falls back to framing the containing graph. Unknown graph or object references are errors.

## Closed Captions

### `captions.show`

Display spoken text for the specified duration. Captions are fixed to the composition and remain in place while the scene camera moves. Use a nonblocking action with a negative offset to align a caption with a preceding graph animation without advancing the timeline.

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
4. Use decimal seconds. Omit timing fields unless overriding the default cursor behavior.
5. Add explicit camera actions only where the episode should move or focus.
6. Keep camera actions non-overlapping after offsets and durations resolve.
7. For simultaneous graph additions, use the same start and duration.
8. Validate with `vp run typecheck` from `Documents/technical/Software/videos`. Do not run Remotion unless the task calls for visual review.
