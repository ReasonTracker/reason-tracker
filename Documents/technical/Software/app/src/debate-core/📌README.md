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

## Current Command-Contract Note

- The command payloads are currently behind the active planner and connector architecture and need a dedicated review/update pass.
- When that pass happens, prepare a specific recommendation and get approval before changing exported command contracts.
- The preferred direction is the best long-term architectural fix, not a narrow payload patch.
- One plausible direction is to split add-claim behavior into separate confidence and relevance command contracts instead of overloading one shape, but that remains unapproved until reviewed.

## Related Docs

- [Src](../📌README.md)
- [App](../../📌README.md)
- [Software](../../../📌README.md)
