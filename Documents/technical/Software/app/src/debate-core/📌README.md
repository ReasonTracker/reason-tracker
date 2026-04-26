# 📌 Debate Core

## Purpose

This folder holds the app package's debate domain contracts and command payloads.

## Owns

- claim, connector, and debate types
- semantic command payload contracts for debate mutations
- branded identifier types for debate-core data

## Main Entrypoints

- `01-Commands.ts`
- `Claim.ts`
- `Connector.ts`
- `Debate.ts`

## Change Here When

- you are shaping debate domain entity contracts
- you need to add or refine mutation command payloads
- app-level code needs a shared debate-core type

## Do Not Change Here For

- shared render components
- Remotion composition wiring
- website publishing behavior

## Status

Active prototype domain contracts. Ask before changing exported command or entity shapes when the change affects package consumers.

## Related Docs

- [Src](../📌README.md)
- [App](../../📌README.md)
- [Software](../../../📌README.md)
