# Episode 0005

This folder owns the declarative Sunshine Protection Act episode specification and its source material.

## Sources

- [Script - Flat - Sunshine Protection Act](./Script%20-%20Flat%20-%20Sunshine%20Protection%20Act.md) defines the episode order and featured claims.
- [Data - U.S. Daylight Saving Time](./Data%20-%20U.S.%20Daylight%20Saving%20Time.md) provides the underlying claim graph and claim wording.

## Boundaries

- Keep claim content, targets, sides, graph changes, relative timing, and explicit camera actions in `episode.json`.
- Render the episode only through the shared `DebateAnimationSurface` and `DebateGraph` pipeline.
- Let the shared episode compiler derive planner commands, graph states, frame timing, and camera movement from the ordered actions.
- Represent structural regrouping with the bounded declarative graph operations rather than duplicating graph rendering or transition logic.

<!-- autonav:start -->

- [Data - U.S. Daylight Saving Time](./Data%20-%20U.S.%20Daylight%20Saving%20Time.md)
- [Script - Flat - Sunshine Protection Act](./Script%20-%20Flat%20-%20Sunshine%20Protection%20Act.md)
<!-- autonav:end -->
