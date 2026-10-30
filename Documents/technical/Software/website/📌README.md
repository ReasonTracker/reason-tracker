# 📌 Repository Website Builder

This folder contains a Git-based static website builder for the repository.

## Behavior

- Uses Git source files from tracked and untracked non-ignored entries (`git ls-files --cached --others --exclude-standard`)
- Excludes ignored/untracked-ignored files by honoring standard Git ignore rules
- Requires Git metadata (no fallback mode)
- Writes generated output to `dist/`
- Uses URL-safe normalized routes (kebab-case)
- Fails the build on normalized route conflicts

## Workspace Usage

From `Documents/technical/Software`:

```bash
vp run website:dev
vp run website:build
vp run maintain:markdown
```

From this folder (`website`):

```bash
vp run dev
vp run build
vp run preview
```

`dev` uses `vp dev` with a Vite plugin hook that regenerates `dist/` on source changes. The dev server uses port 5174 (override with `WEBSITE_DEV_PORT`) and fails if that port is busy, because the command center locates it by that port.

## Route Rules

- No synthetic `tree` or `blob` folders are generated.
- Routes are path-based and URL/file-safe.
- Single exception: paths under `Documents` are collapsed to root-level routes in the generated site.
- Shared route normalization is defined in `../scripts/markdown-index-rules.mts`.
- Index precedence for directory default pages is `README.md`, then `index.md`.
- Matching for index filenames ignores case and extra spaces, including spaces before `.md`.
- The winning index candidate is treated as index; lower-precedence candidates remain regular pages.
- Conflicts after collapsing/normalization fail the build with a clear error.

## Page Augmentations

- Augmentation files live in `site/` and are matched by virtual source path (after `Documents/` collapse) and basename.
- Current supported augmentation types: `.css` and `.js`.
- A matching `site/<same-path>/<same-name>.css` is injected into the generated page `<head>` as an inline `<style>` block.
- A matching `site/<same-path>/<same-name>.js` is injected at the end of the generated page `<body>` as an inline `<script>` block.
- Example: source `README.md` is augmented by `site/README.css`.
- Example: source `README.md` is augmented by `site/README.js`.
- The repository architecture page uses `site/Repository Architecture.css` and `site/Repository Architecture.js`; the latter reads `site/modules/software-architecture.json` and loads the diagram controls, arrow renderer, and visibility model from `site/modules/architectureDiagram.js`, `site/modules/architectureArrows.js`, and `site/modules/architectureVisibility.js`.
- Nested paths are supported. Example: source `Documents/technical/notes/Plan.md` maps to `site/technical/notes/Plan.css`.
- Static folders `site/css/`, `site/icons/`, and `site/modules/`, and `site/site-config.json` remain reserved and are not treated as augmentations.
- Files owned by other packages are published at fixed URLs from `../scripts/published-package-assets.mts`: `dist/css/brand.css`, `dist/css/brand-sequence.css`, and `dist/modules/brand-sequence-motion.js` (TypeScript types stripped), all from `@reasontracker/components`.
- Augmentation collisions that normalize to the same key fail the build with a clear error.
- The output route stays source-driven; augmentation files never change page URLs.

## Notes

- The publisher excludes source entries under this folder's `dist/` path from generation input.
- Publish diagnostics are written to `scripts/publish-website-report.md` only when `--write-report` is passed.
- `dev` runs publish with `--no-report` to avoid watcher loops from report-file writes.
- Set the displayed site name in `site/site-config.json` via `siteName`.
- The collapsed root folder and index precedence are defined in `../scripts/markdown-index-rules.mts`, which this publisher and markdown maintenance share.
- `vp run architecture:map` generates the architecture data copied from `site/modules/`; `vp run website:build:with-map` runs generation before publishing.
- `site/index.html` is not required and is intentionally omitted.
- Markdown maintenance validates source markdown links (not generated HTML), updates files in place, and only auto-adds autonav links on index-style pages.

---

<!-- autonav:start -->
- [Site](./site/📌README.md)
- [Scripts](./scripts/📌README.md)
<!-- autonav:end -->
