# 📌 Shared

This folder owns the shared Remotion helpers for V2 video episodes.

## Boundaries

- Keep episode orchestration helpers here when more than one episode can reuse them.
- Prefer Remotion `Sequence`, `interpolate`, and frame-driven motion instead of CSS animation.
- `GraphView` owns camera movement and event-driven graph state interpolation for video episodes.
- Episode files should compose these helpers rather than rebuilding timeline math inline.