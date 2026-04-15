# Coding Guidelines

These are implementation guidelines for repository code structure and file organization.

## Tooling Workflow

- In `Documents/technical/Software`, prefer Vite Plus (`vp`) over `pnpm` when an equivalent command exists.
- Prefer direct `vp` commands over `pnpm run` or `pnpm exec vp` when equivalent.
- Prefer `vp run` for workspace and package script orchestration in the Software monorepo.
- Canonical docs: https://viteplus.dev/

## Barrel Files (`index.ts`)

- Do not create folder-level `index.ts` files unless they provide clear value.
- A folder-level `index.ts` is justified only when at least one of these is true:
  - It curates a stable public API from multiple implementation files.
  - It intentionally hides internal file layout from consumers.
  - It provides a compatibility layer during refactors or deprecations.
- If a folder contains only one implementation file, import that file directly and avoid an extra `index.ts`.

## Folder Creation Threshold

- Avoid creating a new folder for only one or two files.
- Default threshold: create a folder when there are more than 3 closely related files expected in that group.
- Exceptions are allowed for clear domain boundaries (for example a package root or a top-level asset folder).

## Intent

- Keep concept count low.
- Reduce file tree clutter.
- Preserve clear and predictable structure while coding.

## Options And Type Contracts

- Prefer direct `options.x` usage at the point of use instead of creating one-off local aliases.
- Avoid destructuring or local variable extraction when a value is used only once.
- Keep internal implementation type contracts DRY: do not redefine equivalent option/type contracts repeatedly across internal functions.
- Define and reuse shared contracts at real boundaries (for example package/library boundaries), then thread those through internal call chains.

## Tunable Constants Placement

- For files that use tunable numeric values (for example layout sizing or spacing), define named constants directly below imports.
- Keep those constants grouped in one block and reference them in the implementation instead of inline magic numbers.
- Add a short `AGENT NOTE` comment above the block when maintaining or introducing this pattern so future edits keep the constants in the same location.
