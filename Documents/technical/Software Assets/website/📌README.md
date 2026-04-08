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

From `Documents/technical/Software Assets`:

```bash
npm run dev:website
npm run build:website
npm run publish-website
npm run preview:website
npm run maintain:markdown
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
- Single exception: paths under the configured root folder (`collapsedSourceRootName` in `site/site-config.json`, default `Documents`) are collapsed to root-level routes in the generated site.
- Index precedence for directory default pages comes from `indexFileNames` in `site/site-config.json` (default: `README.md`, then `index.md`).
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
- Nested paths are supported. Example: source `Documents/technical/notes/Plan.md` maps to `site/technical/notes/Plan.css`.
- Static folders `site/css/` and `site/icons/`, and `site/site-config.json` remain reserved and are not treated as augmentations.
- Augmentation collisions that normalize to the same key fail the build with a clear error.
- The output route stays source-driven; augmentation files never change page URLs.

## Notes

- The publisher excludes source entries under this folder's `dist/` path from generation input.
- Publish diagnostics are written to `scripts/publish-website-report.md` only when `--write-report` is passed.
- `dev` runs publish with `--no-report` to avoid watcher loops from report-file writes.
- Set the displayed site name in `site/site-config.json` via `siteName`.
- Configure collapsed root folder name in `site/site-config.json` via `collapsedSourceRootName` (case-insensitive).
- Configure directory index candidates in `site/site-config.json` via `indexFileNames`.
- Invalid values for `collapsedSourceRootName` or `indexFileNames` fail publish/maintenance with a clear config error.
- `site/index.html` is not required and is intentionally omitted.
- Markdown maintenance validates source markdown links (not generated HTML), updates files in place, and only auto-adds autonav links on index-style pages.

---

<!-- autonav:start -->
- [Site](./site/📌README.md)
- [Scripts](./scripts/📌README.md)
<!-- autonav:end -->
