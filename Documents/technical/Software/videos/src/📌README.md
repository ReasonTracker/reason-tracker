# 📌 Src

This folder owns the Remotion root, episode definitions, episode-script compilation, and Remotion playback.

## Boundaries

- Use `@reasontracker/engine` debate commands, scoring, and layout as the source of truth for animated graph state.
- Keep episode-specific fixture data, story beats, and timing in declarative episode specifications when the shared episode vocabulary supports them.
- Keep episode schema and compilation in [Episode Script](./episode-script/📌README.md).
- Keep Remotion scene and animation playback in [Playback](./playback/📌README.md).
- Keep reusable non-Remotion render primitives in `@reasontracker/components`.
- If this folder gains a subfolder, add a local README that explains that sub-boundary before adding more files there.

---

<!-- autonav:start -->
- [Component Visualizers](./component-visualizers/📌README.md)
- [Episode0001](./Episode0001/📌README.md)
- [RelevanceTrapezoidExamples](./RelevanceTrapezoidExamples/📌README.md)
<!-- autonav:end -->
