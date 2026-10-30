# 📌 Engine

## Purpose

The engine package owns debate domain contracts, scoring, layout, geometry, and animation planning. It has no React or Remotion dependency.

## Source Areas

- `src/debate-core/`: debate entities and command contracts
- `src/scoring/`: score calculation and cycle resolution
- `src/geometry/`: low-level renderer-independent point, path, and connector primitives
- `src/layout/`: presentation graph and frame layout
- `src/animation/`: command application and animation plans
- `src/scene-geometry/`: scene geometry resolved from layout frames and animation contracts
- `src/animationContracts.ts`: shared planner and frame contracts that keep module dependencies one-way

## Related

- [Src](./src/📌README.md)
- [Debate Animation Data Model](../design/debate-animation-data-model.md)
- [Software](../📌README.md)

<!-- autonav:start -->
- [Docs](./docs/📌README.md)
<!-- autonav:end -->
