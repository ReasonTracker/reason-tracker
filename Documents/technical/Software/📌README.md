# 📌 Software

Prototype status: this repository is currently a prototype. Do not build or add tests until this rule is explicitly changed in the documentation and agent guidance

## Organization Pattern

Software assets are organized as one asset per top-level folder.
New assets should be created as direct children of this folder (for example, `videos/`).

## System Map

| Asset | Purpose | Main entrypoints | Status |
| ----- | ------- | ---------------- | ------ |

Use this table for fast routing. Read the linked package `📌README.md` files when the change needs local ownership or deeper workflow detail.

## Local Command Center

Run `vp run -F @reasontracker/00-command-center 00:CommandCenter:open` from this folder to open the local Software command center. It is the default launcher for workspace operations through the current fixed command menu and focused Video page.

Prefer Vite Plus (`vp`) over `pnpm` in this folder when an equivalent command exists. Docs: https://viteplus.dev/

The root `tsconfig.json` in this folder is the shared TypeScript compiler-policy file for the Software monorepo. Package tsconfig files should extend it and only keep package-specific overrides.

## Fresh Machine Tooling

This repo expects `rg` (ripgrep) to be available in the local developer shell by default for fast code search.

On a fresh Windows machine, run this once from the `Documents/technical/Software` folder:

- `vp install`
- `vp run developer:install`
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
- [App](./app/📌README.md)
- [00 Command Center](./00-command-center/📌README.md)
- [Videos](./videos/📌README.md)
- [Engine](./engine/📌README.md)
<!-- autonav:end -->
