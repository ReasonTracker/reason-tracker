# 📌 Scripts

## Current Scripts

- `setup-machine.ps1` is the local bootstrap entrypoint for shell tools, workspace dependency install via `vp install`, and recommended VS Code extension setup.
- `maintain-markdown.mjs` rebuilds markdown indexes and writes the maintenance report.
- `markdown-index-rules.mts` defines markdown routing: the collapsed `Documents` root and directory index precedence. The website publisher imports it; this folder must not import from the website.

Prefer Vite Plus (`vp`) over `pnpm` when an equivalent command exists. Docs: https://viteplus.dev/

<!-- autonav:start -->
- Markdown Maintenance Report: `markdown-maintenance-report.md`
- Maintain Markdown Business Requirements: `maintain-markdown.mjs.md`
- [Maintain Markdown Business Requirements](./maintain-markdown.mjs.md)
<!-- autonav:end -->
