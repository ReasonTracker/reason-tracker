# 📌 Software

## Organization Pattern

Software assets are organized as one asset per top-level folder.
New assets should be created as direct children of this folder (for example, `engine/`).

## Local Command Center

Run `vp run command-center:dev` from this folder to open the local Software command center. It is the default launcher for workspace operations, including the focused Video page and command discovery across package scripts.

Prefer Vite Plus (`vp`) over `pnpm` in this folder when an equivalent command exists. Docs: https://viteplus.dev/

The root `tsconfig.json` in this folder is the shared TypeScript compiler-policy file for the Software monorepo. Package tsconfig files should extend it and only keep package-specific overrides.

## Fresh Machine Tooling

This repo expects `rg` (ripgrep) to be available in the local developer shell by default for fast code search.

On a fresh Windows machine, run this once from the `Documents/technical/Software` folder:

- `vp run developer:setup-machine`

Then verify the shell tooling from the same folder:

- `vp run developer:doctor`

If Vite Plus is not available yet in the current shell, the direct fallback commands are:

- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-machine.ps1`
- `node ./scripts/check-tooling.mjs`

The bootstrap script installs `rg` and `fd` with the first supported Windows package manager it finds: `winget`, Chocolatey, or Scoop.
These tools are for local development ergonomics and are not a CI requirement.

<!-- autonav:start -->
- [Engine](./engine/📌README.md)
- [Renderer](./renderer/📌README.md)
- [Video](./Video/📌README.md)
- [.Vscode](.vscode/📌README.md)
- [Website](./website/📌README.md)
- [Scripts](./scripts/📌README.md)
- [Engine Tests](./engine-tests/📌README.md)
<!-- autonav:end -->
