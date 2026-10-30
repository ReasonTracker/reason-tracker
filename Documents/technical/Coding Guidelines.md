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

- Do not create folder-level `index.ts` files; import directly.

## Folder Creation Threshold

- Avoid creating a new folder for only one or two files.
- Default threshold: create a folder when there are more than 3 closely related files expected in that group.
- Exceptions are allowed for clear domain boundaries (for example a package root or a top-level asset folder).

## Intent

- Keep concept count low.
- Reduce file tree clutter.
- Preserve clear and predictable structure while coding.

## File Size And Naming

- Keep implementation files at or below 300 lines when practical. Split larger files by responsibility; episode content and standalone AI references are exempt.
- Use PascalCase filenames for React components and domain contracts. Use camelCase filenames for function modules, named after their main export.
- Use `calculate` for math, `build` for construction, and `resolve` for deriving a value from existing state.

## Standalone AI References

- Write standalone reference files for an AI that has no repository or code access.
- Put the complete contract, instructions, and examples in one file that remains useful when uploaded without the repository.
- Prefer a TypeScript reference for TypeScript input formats. A compile-only import may verify compatibility with the runtime schema; authoring guidance must remain self-contained.
- Mark the file clearly as an uploadable standalone AI reference.

## Prototype Abstraction Pressure

- In prototype code, prefer one concrete class or one plain function over an interface plus a single implementation.
- Avoid `DefaultX` names, exported singleton instances, factories, or injection seams when there is only one real implementation.
- Do not add abstractions for hypothetical CLI, plugin, or test needs. Add them only when a second real caller, implementation, or lifecycle requirement actually appears.
- If a near-term entry surface such as a CLI is likely, a single concrete class is acceptable, but keep it concrete until another implementation is truly needed.

## Options And Type Contracts

- Prefer direct `options.x` usage at the point of use instead of creating one-off local aliases.
- Avoid destructuring or local variable extraction when a value is used only once.
- Keep internal implementation type contracts DRY: do not redefine equivalent option/type contracts repeatedly across internal functions.
- Define and reuse shared contracts at real boundaries (for example package/library boundaries), then thread those through internal call chains.

## Owned Feature Contracts

- When a lower-level package already owns a behavior contract, reuse that contract instead of adding a narrower surrogate API in a higher layer.
- Higher layers may compose values for the owned contract, but they should not recreate the same behavior with clipping, visibility windows, duplicated transition math, or parallel props that drift from the source contract.
- If the existing contract is insufficient, extend the owning layer or explicitly request a contract change there instead of working around it in the consumer.

## Tunable Constants Placement

- For files that use tunable numeric values (for example layout sizing or spacing), define named constants directly below imports.
- Keep those constants grouped in one block and reference them in the implementation instead of inline magic numbers.
- Add a short `AGENT NOTE` only when keeping the constants together prevents a regression.
- Do not add per-file `AGENT NOTE` comments that restate this grouping rule.
- Add a concise comment only when the constant's behavior or effect is not clear from its name.

## Type Patterns

- **Create/patch id types:** Use `CreateWithOptionalId<T>` when all create fields are required except an optional generated `id`. Use `PatchWithRequiredId<T>` when patch fields are optional but `id` is required.

- **Forbid fields in union variants:** When a union member must forbid a field, prefer `field?: never` (e.g. `id?: never` or `source?: never`) over `field?: undefined` so TypeScript surfaces a clear compile-time error if the field is provided. After changes, run a type-check to validate downstream consumers.

- **Id-present vs id-absent variants:** Represent caller-provided vs system-generated ids with two union members (e.g. `T & { id: ID }` vs `Omit<T, "id">`). Keep related connector types aligned so required fields (like `connector.source`) follow the claim variant.

## Local Type Ordering

- Within a file, group related types and interfaces by domain area or responsibility instead of by keyword alone.
- Prefer fewer total local types. If an object shape is used only once and does not need an independent name for construction or reuse, inline it at the point of use.
- This includes one-off local `type` aliases created only to feed another exported type; inline them unless they carry independent meaning or are reused.
- When a helper type exists only to support one interface or function and still deserves a name, place that helper immediately above the interface or function that uses it.
- Prefer `#region` markers over plain section comments when a file holds multiple major contract groups.
- If there is no stronger reason to order by dependency, prefer reading order by usage and responsibility.
