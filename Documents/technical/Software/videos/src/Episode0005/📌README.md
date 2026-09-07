# Episode 0005

This folder owns the Sunshine Protection Act episode scenario, planner stages, and timing.

## Sources

- [Script - Flat - Sunshine Protection Act](./Script%20-%20Flat%20-%20Sunshine%20Protection%20Act.md) defines the episode order and featured claims.
- [Data - U.S. Daylight Saving Time](./Data%20-%20U.S.%20Daylight%20Saving%20Time.md) provides the underlying claim graph and claim wording.

## Boundaries

- Render the episode only through the shared `DebateAnimationSurface` and `DebateGraph` pipeline.
- Build ordinary claim additions with the existing planner and debate-core command contracts.
- Keep episode-specific scenario data and timeline sequencing in this folder.
- Represent unsupported structural regrouping as an authored graph-state cut rather than duplicating graph rendering or transition logic.

<!-- autonav:start -->

- [Data - U.S. Daylight Saving Time](./Data%20-%20U.S.%20Daylight%20Saving%20Time.md)
- [Script - Flat - Sunshine Protection Act](./Script%20-%20Flat%20-%20Sunshine%20Protection%20Act.md)
<!-- autonav:end -->
