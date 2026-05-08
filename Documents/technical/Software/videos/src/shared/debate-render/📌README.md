# 📌 Debate Render

This folder owns the debate snapshot render implementation used by video compositions.

## Owns

- the debate snapshot render types, HTML/SVG tree helpers, and stylesheet
- tween-aware rendering of one debate snapshot into the local HTML/SVG render tree
- Remotion `interpolate` usage for claim, connector, junction, and aggregator animation values
- connector route resolution from already-authored endpoint geometry when rendering a snapshot
- scene sizing that preserves authored world coordinates without camera behavior

## Boundaries

- Keep debate snapshot rendering contained in this folder rather than splitting it across packages.
- Keep shared path geometry in `@reasontracker/components`.
- Keep episode timing, fixture authorship, and sequencing outside this folder.
- Keep styling changes in the shared renderer CSS rather than adding host-specific embellishments here.
- Do not invent fixed connector stub segments in the renderer. Connector routes should come from endpoint geometry or planner-owned route data.
- When route geometry cannot be resolved, surface diagnostics instead of substituting a hidden alternate route.
- Keep larger connector detours, route-around-line behavior, and crossing-avoidance routing out of the current renderer implementation until those requirements are explicitly owned and specified.

---

<!-- autonav:start -->
<!-- autonav:end -->
