# Coding Guidelines

These are implementation guidelines for repository code structure and file organization.

## Tooling Workflow

- In `Documents/technical/Software`, prefer Vite Plus (`vp`) over `pnpm` when an equivalent command exists.
- Prefer direct `vp` commands over `pnpm run` or `pnpm exec vp` when equivalent.
- Prefer `vp run` for workspace and package script orchestration in the Software monorepo.
- Canonical docs: https://viteplus.dev/

## TypeScript Configuration

- In `Documents/technical/Software`, keep shared TypeScript compiler policy in the root `tsconfig.json`.
- Package tsconfig files should extend the root `Documents/technical/Software/tsconfig.json` and only keep package-specific overrides.
- Do not duplicate root compiler options inside package tsconfig files.

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

## Local Type Ordering

- Within a file, group related types and interfaces by domain area or responsibility instead of by keyword alone.
- Prefer fewer total local types. If an object shape is used only once and does not need an independent name for construction or reuse, inline it at the point of use.
- When a helper type exists only to support one interface or function and still deserves a name, place that helper immediately above the interface or function that uses it.
- Prefer `#region` markers over plain section comments when a file holds multiple major contract groups.
- If there is no stronger reason to order by dependency, prefer reading order by usage and responsibility.

## Human Review Notes

- When documentation in a technical area refers to review status, explicitly state the level of human review instead of using an unqualified word such as `reviewed`.
- Prefer concrete phrases such as `API types reviewed by a human`, `implementation not yet reviewed by a human`, or `draft AI-generated implementation`.
- Do not imply that code or behavior has human approval unless that approval is explicitly known.
- When contract review and implementation review are at different levels, note both rather than collapsing them into one status.

## Tunable Constants Placement

- For files that use tunable numeric values (for example layout sizing or spacing), define named constants directly below imports.
- Keep those constants grouped in one block and reference them in the implementation instead of inline magic numbers.
- Add a short `AGENT NOTE` comment above the block when maintaining or introducing this pattern so future edits keep the constants in the same location.
- Add symbol-level TSDoc or JSDoc comments to each tunable constant when the meaning is not obvious from the name alone.
- Do not assume the reader knows specialized domain terms. If a constant uses a term such as `epsilon`, explain the practical meaning in plain language at the symbol itself.
- Prefer comments that explain what changing the constant does to behavior, tolerances, or visual output.
