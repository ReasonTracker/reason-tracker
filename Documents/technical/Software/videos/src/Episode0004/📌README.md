# 📌 Episode 0004

This folder owns the declarative Episode0004 specification.

## Boundaries

- Keep Episode0004-specific content, targets, sides, actions, and relative timing in `episode.json`.
- Keep the specification self-contained rather than importing another episode's internal scenario.
- Let the shared episode compiler derive debate-core relationships and planner phases from the ordered actions.
- Keep shared React/SVG rendering and geometry in `@reasontracker/components`.
