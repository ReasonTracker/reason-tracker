# 📌 Renderer

Package name: @reasontracker/renderer

This software asset hosts render-focused logic for Reason Tracker.

## Scope

- Layout Core (technology-neutral layout model)
- Cycle handling policies for display (`cycleMode`)
- Output adapters (HTML/CSS now, other targets later)

## Contributor Node Sizing Policy

- Contributor-node sizing composes two optional scaling stages.
- Confidence scaling is enabled by default.
- Relevance scaling is enabled by default and can be disabled independently.
- Confidence scaling assigns all contributors to the same target one shared confidence-group multiplier.
- The confidence-group multiplier is derived from cumulative contributor confidence mass with a shrink-only policy.
- Zero-confidence contributors are ignored when computing confidence mass.
- Confidence scale cascades down the graph: a contributor starts from its target's current scale, then applies that target-group multiplier.
- Relevance adjustment is sibling-relative and shrink-only.
- In each sibling contributor group, the most relevant node keeps full relative size for that group and less relevant siblings shrink proportionally.
- Child nodes are not allowed to exceed parent-relative size due to relevance.
- Final scale is the combined result after confidence and relevance stages.

## Render Modes

- Layout geometry uses computed node dimensions so placement and connector routing stay consistent.
- Web output supports literal CSS transform scaling for preview/zoom-friendly rendering.
- Transform scaling is visual; layout sizing remains authoritative for positions and edge anchoring.
- Preview data is engine-calculated before rendering (not score-overridden sample output).
- Confidence is displayed as a percentage value.

## Preview Workflow

- Run `pnpm --filter @reasontracker/renderer preview` for a one-off preview render.
- Run `pnpm --filter @reasontracker/renderer preview:watch` to re-render preview output on visual changes in renderer sources and website brand CSS using Node's built-in watch mode.

## Decisions

- No fallback clamping strategy is used to hide algorithm issues.
- Behaviors such as single `0.5` contributor staying full size are expected outcomes of the sizing definition and are covered by tests.
- HTML output remains geometry-driven from layout dimensions; sizing is part of layout inputs.
- Cascading scale inheritance is intentional product behavior, not a temporary workaround.

---

<!-- autonav:start -->
- [Src](./src/📌README.md)
<!-- autonav:end -->
