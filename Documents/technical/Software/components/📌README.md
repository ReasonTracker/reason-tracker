# 📌 Components

## Purpose

This package is the home for shared components and nearby rendering helpers that are intended to be reused across Remotion and web surfaces.

## Owns

- the shared component package boundary
- reusable component exports that should work across both Remotion and web-facing environments
- nearby helper code that directly serves those shared components
- local source layout for the package

## Main Entrypoints

- `src/index.ts`
- `src/path-geometry/📌README.md`

## Change Here When

- you are adding or refining shared components
- you need rendering helpers that should be reused by both `videos` and future web-facing code
- you need a neutral package boundary for component-level code that should not be Remotion-specific

## Do Not Change Here For

- Remotion composition wiring or Studio-only preview setup
- website publishing behavior
- engine domain contracts or command behavior

## Related Docs

- [Src](./src/📌README.md)
- [Software](../📌README.md)

<!-- autonav:start -->
<!-- autonav:end -->