# 📌 00 Entities

## Purpose

This folder holds the core engine entity contracts.

## Owns

- base entity shapes for claims, connectors, debates, and scores
- branded identifier types for the engine domain model

## Boundary Note

These entity types are public APIs when they are exported and are intended to be reused throughout the project.
Do not duplicate an exported engine type locally.
Do not change these contracts without explicit approval.

`Score` is a projection of the claim and connector entities.
It is expected to be the primary graph-consumption shape through much of the project, except where data remains on claims or connectors and is not represented on `Score`, such as `content`.
`Score.scaleOfSources` is the source span scale for the claim occurrence and the source side of its confidence connector.
`Score.deliveryScaleOfSources` is the delivery span scale for the target side of its confidence connector after relevance is applied.

## Connector Model

`Connector` is a discriminated union with two semantic connector families:

- `ConfidenceConnector` values are primary connectors and may be targeted by `RelevanceConnector`
- `RelevanceConnector` values are secondary connectors and may only target `ConfidenceConnector`

## Main Entrypoints

- `Claim.ts`
- `Connector.ts`
- `Debate.ts`
- `Score.ts`

## Change Here When

- you are intentionally changing the engine domain model
- you need to add or rename a core entity field
- you need to adjust branded ids or core entity relationships

## Do Not Change Here For

- command parsing or package entry behavior
- renderer or website behavior
- routine experimentation without explicit approval

## Status

`authoritative`

<!-- autonav:start -->
<!-- autonav:end -->
