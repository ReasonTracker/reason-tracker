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
- Keep reusable connector path band geometry in `../path-geometry`.
- Follow the existing visual HTML and inline CSS structure unless the user explicitly asks for design changes.
- Keep aggregators visually minimal until their design is defined.

---

<!-- autonav:start -->
<!-- autonav:end -->
