# Shared

This folder owns Remotion-only helpers that are reused by episode compositions.

## Owns

- relative cursor scheduling for blocking and nonblocking episode actions
- validation and compilation of declarative episode action scripts
- the [Episode JSON authoring](./Episode%20JSON%20Authoring.md) guide for human and AI script authors
- generic Remotion playback for planner-backed declarative episodes
- fade wrappers that expose visible Remotion `Sequence` ranges
- graph animation orchestration through `GraphView`, `GraphEvents`, and `CameraMove`
- explicit scene-camera actions that frame components or stable scene-object keys
- planner-frame playback through the shared `DebateGraph` React/SVG renderer
- episode frame, template, and brand sequence wrappers

## Boundaries

- Keep reusable non-Remotion render primitives in `@reasontracker/components`.
- Keep domain state changes and layout calculation in app debate-core.
- Keep episode-specific content, timing, graph events, and camera actions in episode scripts.
- Update [Episode JSON authoring](./Episode%20JSON%20Authoring.md) whenever the script schema, supported options, defaults, or compiler behavior changes.
- Keep executable special behavior in an explicit typed extension rather than encoding code in JSON.
- Do not invent alternate layout, scale, or graph-bound decisions in this folder; Remotion helpers should only select planner-produced frames.
- Do not pre-apply later operation results to earlier frames. Camera helpers may frame a future graph state, but graph rendering helpers must keep operation-derived frames pure.
- Do not recreate lower-level path-geometry behavior in this folder; ordered connector reveal and connector-width sweeps must be expressed through `@reasontracker/components` path-geometry instructions rather than host-side clipping or visibility-window props.

---

<!-- autonav:start -->
<!-- autonav:end -->
