# 📌 Engine

## Purpose

This package is the home for the Reason Tracker engine.
It currently mixes early scaffold surfaces with the protected core entity model.

## Owns

- the engine package boundary
- engine source layout
- the protected core entity contract under `src/00-entities`
- small engine-dependent code that does not yet justify its own package boundary

## Main Entrypoints

- `src/index.ts`
- `src/01-commands.ts`
- `src/00-entities/📌README.md`

## Change Here When

- you are shaping the engine package surface
- you need to add engine-oriented source files or folders
- you need to route new engine behavior toward commands, entities, or nearby engine-dependent code

## Do Not Change Here For

- website publishing behavior
- command center UI behavior
- video composition behavior
- routine edits to guarded entity contracts without explicit approval

## Status

Package status: `scaffold`

Protected domain contract status: `authoritative` in `src/00-entities`

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