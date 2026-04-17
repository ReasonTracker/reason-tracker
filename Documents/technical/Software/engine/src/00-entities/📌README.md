# 📌 00 Entities

## Purpose

This folder holds the core engine entity contracts.

## Owns

- base entity shapes for claims, connectors, debates, and scores
- branded identifier types for the engine domain model

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

## Change Guard

All entity files in this folder are `CHANGE-GUARD` areas.
Changes require explicit approval before editing because these files define protected engine contracts.

<!-- autonav:start -->
<!-- autonav:end -->
