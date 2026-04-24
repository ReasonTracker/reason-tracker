# 📌 Src

This folder owns the Remotion root, episode definitions, and Remotion-only shared helpers for video output.

## Boundaries

- Use engine commands, reducer output, and layout as the source of truth for animated graph state.
- Keep episode-specific fixture data, story beats, and timing in episode files until a broader episode catalog exists.
- Keep shared Remotion helpers in [`shared`](./shared/📌README.md).
- Keep reusable non-Remotion render primitives in `@reasontracker/components`.
- If this folder gains a subfolder, add a local README that explains that sub-boundary before adding more files there.

---

<!-- autonav:start -->
- [Component Visualizers](./component-visualizers/📌README.md)
- [Shared](./shared/📌README.md)
<!-- autonav:end -->
