# 📌 Debate Render

This folder owns the shared debate-graph renderer used to display `Debate` plus `DebateLayout` output across Remotion and future web-facing surfaces.

## Owns

- the shared `DebateRenderer` component
- connector band generation that turns layout-node relationships into `path-geometry` SVG shapes
- the renderer-local SVG helpers needed to map path-geometry commands into visible paths

## Boundaries

- Keep Remotion composition wiring and visualizer-only fixture setup out of this folder.
- Keep layout packing and debate-domain rules in `@reasontracker/engine`.
- Keep reusable path-geometry primitives in `../path-geometry`.
- Hosts should load `website/site/css/brand.css` or provide equivalent `--pro` and `--con` color tokens before rendering this component.

---

<!-- autonav:start -->
<!-- autonav:end -->
