# 📌 Src

This folder owns the Remotion root, episode definitions, and composition wiring for V2 video output.

## Boundaries

- Use engine intents, step application, and layout as the source of truth for episode state.
- Use renderer HTML output for graph scene markup instead of rebuilding graph geometry in this package.
- Keep episode-specific fixture data and timing local to this folder until a broader episode catalog exists.
- If this folder gains a subfolder, add a local README that explains that sub-boundary before adding more files there.