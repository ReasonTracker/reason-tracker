# Shared Episode Runtime

This folder owns episode schema, scheduling, compilation, and Remotion playback helpers.

## Owns

- episode action schema and compilation
- relative cursor scheduling for blocking and nonblocking actions
- playback of planner-backed debate animations
- Remotion scene camera and scene-object transitions
- fade, caption, frame, template, and brand-sequence helpers
- the [standalone episode-authoring reference](./EpisodeAuthoringReference.ts)

## Boundaries

- Keep reusable non-Remotion render primitives in `@reasontracker/components`.
- Keep debate domain changes, scoring, layout, and geometry in `@reasontracker/engine`.
- Keep episode content, timing, graph actions, and camera actions in episode scripts.
- Keep the standalone authoring reference synchronized with the schema and runtime behavior. Its type example must satisfy `EpisodeScriptSpecInput`.
- Let the engine produce planner frames; playback selects and renders those frames.
- Keep path geometry in the engine and SVG rendering in `@reasontracker/components`.

<!-- autonav:start -->
<!-- autonav:end -->
