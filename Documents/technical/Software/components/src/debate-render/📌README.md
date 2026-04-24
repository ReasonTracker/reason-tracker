# 📌 Debate Render

This folder owns the shared debate-graph renderer used to display `Debate` plus `DebateLayout` output across Remotion and future web-facing surfaces.

## Owns

- the shared `DebateRenderer` component
- connector band generation that turns layout connector routes plus `path-geometry` instructions into SVG shapes
- the `DebateConnector` boundary that accepts `PathGeometryInstruction`-driven connector geometry instead of renderer-local clipping or visibility-window APIs
- the default connector-layer geometry rules, including centered pipe bands and fluid bands anchored to the pipe's bottom boundary
- the renderer-local SVG helpers needed to map path-geometry commands into visible paths

## Boundaries

- Keep Remotion composition wiring and visualizer-only fixture setup out of this folder.
- Keep layout packing, connector routing, connector junction positioning, and debate-domain rules in `@reasontracker/engine`.
- Keep reusable path-geometry primitives in `../path-geometry`.
- Hosts that need ordered connector reveal or ordered width changes should pass `PathGeometryInstruction` values through this folder instead of recreating those behaviors with host-side clipping or percent-window props.
- Hosts should load `website/site/css/brand.css` or provide equivalent `--pro` and `--con` color tokens before rendering this component.

---

<!-- autonav:start -->
<!-- autonav:end -->
