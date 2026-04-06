# Repository Website Builder

This folder contains a Git-tracked static website builder for the repository.

## Behavior

- Uses Git tracked files as source-of-truth (`git ls-files`)
- Includes tracked files even if they would match ignore patterns
- Requires Git metadata (no fallback mode)
- Writes generated output to `dist/`
- Uses URL-safe normalized routes (kebab-case)
- Fails the build on normalized route conflicts

## Workspace Usage

From `Documents/technical/Software Assets`:

```bash
npm run dev:website
npm run build:website
npm run preview:website
npm run maintain:markdown-nav
```

From this folder (`website`):

```bash
npm run dev
npm run build
npm run preview
```

`dev` uses `vp dev` with a Vite plugin hook that regenerates `dist/` on source changes.

## Route Rules

- No synthetic `tree` or `blob` folders are generated.
- Routes are path-based and URL/file-safe.
- Single exception: paths under `Documents/` are collapsed to root-level routes in the generated site.
- Index precedence for directory default pages: `_Start Here .md`, then `README.md`, then `index.md`.
- Matching for index filenames ignores case and extra spaces, including spaces before `.md`.
- The winning index candidate is treated as index; lower-precedence candidates remain regular pages.
- Conflicts after collapsing/normalization fail the build with a clear error.

## Notes

- The publisher excludes tracked entries under this folder's `dist/` path from generation input.
- Set the displayed site name in `site/site-config.json` via `siteName`.
- `site/index.html` is not required and is intentionally omitted.
- Markdown maintenance validates source markdown links (not generated HTML), updates files in place, and only auto-adds autonav links on index-style pages.
