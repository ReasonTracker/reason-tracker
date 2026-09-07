# 📌 Episode 0004

This folder owns the planner-driven Remotion timeline for the same debate scenario used by Episode0002.

## Boundaries

- Keep Episode0004-specific timings and planner command setup in this folder.
- Reuse Episode0002's debate scenario and apply one `confidence/claim/add` command through the app planner.
- Drive the timeline from the named `opening`, `voila`, `sprout`, `firstFill`, and `wave` plan states.
- Keep Remotion responsible only for frame timing. Shared React/SVG rendering and geometry live in `@reasontracker/components`.
