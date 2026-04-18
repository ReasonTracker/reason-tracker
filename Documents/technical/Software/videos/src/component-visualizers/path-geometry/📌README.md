# 📌 Path Geometry Visualizer

This folder owns the Remotion preview composition for the shared path-geometry builder.

## Owns

- a concrete SVG scenario for visually inspecting `buildPathGeometry`
- local helpers that exist only to turn path-geometry output into a Remotion/SVG preview

## Boundaries

- Keep shared geometry logic in `@reasontracker/components`.
- Keep this folder focused on preview scenarios and SVG rendering helpers.
- Prefer hard-coded inspection scenarios here before adding more generalized visualizer controls.

---

<!-- autonav:start -->
<!-- autonav:end -->