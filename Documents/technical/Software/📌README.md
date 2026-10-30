# 📌 Software

## Organization Pattern

Software assets are organized as one asset per top-level folder.
New assets should be created as direct children of this folder (for example, `videos/`).

## System Map

| Asset | Purpose | Main entrypoints | Status |
| ----- | ------- | ---------------- | ------ |
| Engine | Debate contracts, scoring, graph geometry, layout, and animation | `engine/src/debate-core/`, `scoring/`, `geometry/`, `layout/`, `animation/` | Active |
| Components | Shared React/SVG rendering | `components/src/index.ts` | Active |
| Website | Static site generation and website assets | `website/scripts/publish-website.mts` | Active |
| Videos | Remotion compositions and episode scripts | `videos/src/Root.tsx` | Active |
| 00 Command Center | Local workspace command launcher | `00-command-center/index.html` | Active |

Use this table for fast routing. Read the linked package `📌README.md` files when the change needs local ownership or deeper workflow detail.

The [repository architecture map](../../Repository%20Architecture.md) shows the repository folder structure and nests the Software package dependency map inside `Documents/technical/Software`. Area and module paths link to their published folder pages; packages show their modules as nested boxes, and selecting a package or module highlights its dependencies. Its Software containment and allowed dependency rules live in `design/repository-architecture.json`. From this folder, run `vp run architecture:map` to refresh the published map data or `vp run architecture:check` to report boundary findings without changing files. `vp run website:build:with-map` refreshes the map before publishing the website.

## Local Command Center

Run `vp run -F @reasontracker/00-command-center 00:CommandCenter:open` from this folder to open the local Software command center. It is the default launcher for workspace operations through the current fixed command menu and focused Video page.

The root `tsconfig.json` in this folder is the shared TypeScript compiler-policy file for the Software monorepo. Package tsconfig files should extend it and only keep package-specific overrides.

## Fresh Machine Tooling

This repo expects `rg` (ripgrep) to be available in the local developer shell by default for fast code search.

On a fresh Windows machine, run this once from the `Documents/technical/Software` folder:

- `vp install`
- `vp run developer:setup-machine`

If Vite Plus is not available yet in the current shell, the direct fallback command is:

- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-machine.ps1`

The bootstrap script installs `rg` and `fd` with the first supported Windows package manager it finds: `winget`, Chocolatey, or Scoop.
It then runs `vp install` when Vite Plus is available in the current shell.
It also tries to install the VS Code extensions recommended in `/.vscode/extensions.json`, preferring `code.cmd` on Windows so extension installs use the CLI wrapper instead of opening the GUI executable when that wrapper is available, then falls back to terminal install commands and Marketplace links when automatic install is unavailable.
These tools are for local development ergonomics and are not a CI requirement.

The setup script is intended to be idempotent: rerun it whenever you want the local machine tools, workspace dependencies, and recommended VS Code extensions brought back to the expected state.

<!-- autonav:start -->
- [Website](./website/📌README.md)
- [Scripts](./scripts/📌README.md)
- [Components](./components/📌README.md)
- [Engine](./engine/📌README.md)
- [00 Command Center](./00-command-center/📌README.md)
- [Videos](./videos/📌README.md)
- [Design](./design/📌README.md)
<!-- autonav:end -->
