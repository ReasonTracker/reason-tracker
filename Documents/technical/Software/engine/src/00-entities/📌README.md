# 📌 00 Entities

## Purpose

This folder holds the core engine entity contracts.
These contracts are engine-owned and private by default unless the engine explicitly exposes related data through another boundary.

## Owns

- base entity shapes for claims, connectors, debates, and scores
- branded identifier types for the engine domain model

## Boundary Note

The contracts in this folder are not public APIs by default.
Commands, exported state payloads, and step payloads are separate boundaries even when they carry overlapping data.

`Score` is treated as a projection contract.
It is sent through exported states and steps, but that outbound use does not make every entity in this folder a general external contract.

Source claims may now connect either to claims or to connectors in the graph model.
How the connect commands should express or default connector-side intent remains an open decision.

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
