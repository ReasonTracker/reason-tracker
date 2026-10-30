# 📌 Scripts

## Current Scripts

- `setup-machine.ps1` is the local bootstrap entrypoint for shell tools, workspace dependency install via `vp install`, and recommended VS Code extension setup.
- `maintain-markdown.mjs` rebuilds markdown indexes and writes the maintenance report.
- `markdown-index-rules.mts` defines markdown and website routes: the collapsed `Documents` root, directory index precedence, normalized directory URLs, and file URLs. The website publisher and architecture-map generator import it; this folder must not import from the website.
- `published-package-assets.mts` lists workspace package assets copied into the website; the publisher consumes the list and the architecture map reports these as dependencies.
- `generate-architecture-map.mjs` checks workspace imports, including type-only imports, against `design/repository-architecture.json` and generates the website's unified architecture map data. It groups source files into modules using each area's configured `moduleRoot`, with optional `moduleGroups` to combine related folders. Areas with fewer than two modules show no module boxes. ELK lays out packages and their modules as one nested graph.

Prefer Vite Plus (`vp`) over `pnpm` when an equivalent command exists. Docs: https://viteplus.dev/

<!-- autonav:start -->
- Markdown Maintenance Report: `markdown-maintenance-report.md`
- Maintain Markdown Business Requirements: `maintain-markdown.mjs.md`
- [Maintain Markdown Business Requirements](./maintain-markdown.mjs.md)
<!-- autonav:end -->
