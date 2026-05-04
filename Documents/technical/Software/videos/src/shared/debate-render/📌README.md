# 📌 Debate Render

This folder owns the debate snapshot render implementation used by video compositions.

## Owns

- the debate snapshot render types, HTML/SVG tree helpers, and stylesheet
- tween-aware rendering of one debate snapshot into the local HTML/SVG render tree
- Remotion `interpolate` usage for claim, connector, junction, and aggregator animation values
- scene sizing that preserves authored world coordinates without camera behavior

## Boundaries

- Keep debate snapshot rendering contained in this folder rather than splitting it across packages.
- Keep shared path geometry in `@reasontracker/components`.
- Keep episode timing, fixture authorship, and sequencing outside this folder.
- Keep styling changes in the shared renderer CSS rather than adding host-specific embellishments here.

---

<!-- autonav:start -->
<!-- autonav:end -->
