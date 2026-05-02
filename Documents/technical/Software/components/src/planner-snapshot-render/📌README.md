# 📌 Planner Snapshot Render

This folder owns the framework-free renderer that turns planner snapshots and score-wave frames into a portable HTML and SVG render tree.

## Owns

- the non-React render-tree contract used by planner snapshot rendering
- snapshot-to-scene rendering helpers for claims, connectors, junctions, and aggregators
- score-wave snapshot entrypoints grouped with the owning render surfaces
- HTML serialization helpers for the render tree

## Boundaries

- Keep Remotion hooks, composition wiring, and frame scheduling out of this folder.
- Keep planner snapshot production in `@reasontracker/app`.
- Render code in this folder is interpolation-only. It may resolve snapshot-owned tween values to their current values, but it must not compute any other value from percent, reveal progress, or other render-local inputs.
- If a render needs any value other than the current value of a snapshot-owned tween, add that value to snapshot construction in `@reasontracker/app` instead of adding logic here.
- Keep reusable connector path band geometry in `../path-geometry`.
- Follow the existing visual HTML and inline CSS structure unless the user explicitly asks for design changes.
- Keep aggregators visually minimal until their design is defined.

---

<!-- autonav:start -->
<!-- autonav:end -->
