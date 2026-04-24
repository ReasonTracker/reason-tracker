# Shared

This folder owns Remotion-only helpers that are reused by episode compositions.

## Owns

- timeline segment construction for Remotion frame timing
- fade wrappers that expose visible Remotion `Sequence` ranges
- graph animation orchestration through `GraphView`, `GraphEvents`, and `CameraMove`
- episode frame, template, and brand sequence wrappers

## Boundaries

- Keep reusable non-Remotion render primitives in `@reasontracker/components`.
- Keep domain state changes and layout calculation in `@reasontracker/engine`.
- Keep episode-specific timing and authored graph events in episode files.
- Do not invent alternate layout, scale, or graph-bound decisions in this folder; Remotion helpers should only animate engine-produced graph snapshots.
- Do not recreate lower-level path-geometry behavior in this folder; ordered connector reveal and connector-width sweeps must be expressed through `@reasontracker/components` path-geometry instructions rather than host-side clipping or visibility-window props.
- If this folder previews a later result from the same command, limit that preview to later scale-derived geometry. Do not pull later score propagation, confidence values, or connector fill state into an earlier phase.

---

<!-- autonav:start -->
<!-- autonav:end -->
