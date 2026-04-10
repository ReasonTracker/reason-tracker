# 📌 Src

Renderer package source.

## Modules

- `layout/` Layout Core and LayoutModel types
- `adapters/web/` Web output adapter (HTML + CSS)

## Sizing Overview

- Contributor-node sizing can be turned on or off as a renderer option.
- Confidence scaling defaults to on.
- Relevance scaling defaults to on and is independently switchable.
- Confidence stage computes a shared per-target multiplier and cascades it down contributor links.
- Relevance stage is sibling-normalized and shrink-only.
- Relevance can only shrink less relevant siblings; it does not enlarge nodes beyond parent-relative scale.
- Final scale is the product of the enabled stage multipliers.

## Current Decisions

- No fallback clamping strategy.
- Visual transform scaling is supported for web preview while layout geometry remains authoritative.
- Preview uses engine-calculated scores.
