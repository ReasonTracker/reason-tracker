# 📌 Engine

## Purpose

This package is the home for the Reason Tracker engine.
It currently mixes early scaffold surfaces with the protected core entity model.

## Owns

- the engine package boundary
- the semantic command boundary for engine mutations
- engine source layout
- the protected core entity contract under `src/00-entities`
- small engine-dependent code that does not yet justify its own package boundary

## Main Entrypoints

- `src/index.ts`
- `src/00-commands.ts`
- `src/00-entities/📌README.md`

## Change Here When

- you are shaping the engine package surface
- you need to add or refine mutation commands before internal engine behavior
- you need to add engine-oriented source files or folders
- you need to route new engine behavior toward commands, entities, or nearby engine-dependent code

## Do Not Change Here For

- website publishing behavior
- command center UI behavior
- video composition behavior
- routine edits to guarded entity contracts without explicit approval

## Status

Package status: `scaffold`

Mutation boundary status: `command-first scaffold`

Protected command contract status: `authoritative` in `src/00-commands.ts`

Protected domain contract status: `authoritative` in `src/00-entities`

## Command Boundary

Commands are the engine's external mutation boundary.
They should express semantic intent rather than mirroring internal entity or datastore shapes.

Prefer the most meaningful domain verb available.
Use `update` only when a partial object change does not have a stronger domain name.

Prefer commands such as `ConnectClaimToClaimCommand` and `ConnectClaimToConnectorCommand` over storage-shaped names such as `AddConnectorCommand`.
Keep special domain actions separate when they carry distinct validation or downstream behavior, for example `SetMainClaimCommand`.

Avoid one-command-per-property setter and clearer patterns by default.
When a command is making a routine partial change to one domain object, prefer one command with a command-specific patch payload.

## Contract Boundary

Engine-owned objects are private by default.
Do not treat engine entities as public contracts just because related data may later be sent to another system.

An engine contract becomes external only when the engine explicitly exposes it through a boundary such as commands coming in, exported state going out, or steps sent to another system.

Internal entity shapes may inform external contracts, but they should not become accidental public APIs.
If an exported shape currently resembles an internal engine shape, treat that as a deliberate exposure or a temporary alignment, not as proof that the internal type is itself public.

## Incubation Rule

Engine-dependent code may live here temporarily before it earns its own package.

Use that escape hatch only when the code is still small and clearly subordinate to the engine.
When a group of files starts to form its own responsibility, workflow, or public surface, move it toward its own folder instead of letting `engine` become a general dumping ground.

Do not create a dedicated incubation area until real engine-adjacent code needs one.

If temporary engine-adjacent code is added here, keep it in a clearly named subfolder or file group rather than mixing it into `00-entities`.

## Related Docs

- [Src](./src/📌README.md)
- [Software](../📌README.md)

<!-- autonav:start -->
<!-- autonav:end -->