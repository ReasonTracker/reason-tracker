# 📌 Software

## Organization Pattern

Software assets are organized as one asset per top-level folder.
New assets should be created as direct children of this folder (for example, `videos/`).

## System Map

| Asset | Purpose | Main entrypoints | Status |
| --- | --- | --- | --- |
| `00-command-center` | Local launcher and command-discovery surface for software workflows. | `00-command-center/index.html`, `00-command-center/src/main.ts`, `00-command-center/server/core.ts` | `active` |
| `engine` | Core TypeScript engine package, protected domain model contracts, protected command contract, and temporary home for small engine-dependent code. | `engine/src/index.ts`, `engine/src/00-commands.ts`, `engine/src/00-entities/📌README.md` | `scaffold` package with `authoritative` command and entity contracts |
| `videos` | Remotion-based video compositions and shared video assets. | `videos/src/index.ts` | `active` |
| `website` | Repository website builder and static publishing workflow. | `website/scripts/publish-website.mts`, `website/site/site-config.json`, `website/📌README.md` | `active` |
| `scripts` | Shared repo-level technical maintenance scripts. | `scripts/maintain-markdown.mjs`, `scripts/check-tooling.mts` | `active` |

Use this table for fast routing. Read the linked package `📌README.md` files when the change needs local ownership or deeper workflow detail.

## Local Command Center

Run `vp run -F @reasontracker/00-command-center 00:CommandCenter:open` from this folder to open the local Software command center. It is the default launcher for workspace operations, including the focused Video page and command discovery across package scripts.

Prefer Vite Plus (`vp`) over `pnpm` in this folder when an equivalent command exists. Docs: https://viteplus.dev/

The root `tsconfig.json` in this folder is the shared TypeScript compiler-policy file for the Software monorepo. Package tsconfig files should extend it and only keep package-specific overrides.

## Fresh Machine Tooling

This repo expects `rg` (ripgrep) to be available in the local developer shell by default for fast code search.

On a fresh Windows machine, run this once from the `Documents/technical/Software` folder:

- `vp run developer:setup-machine`

Then verify the shell tooling from the same folder:

- `vp run developer:doctor`
- `vp exec node ./scripts/check-tooling.mts`

If Vite Plus is not available yet in the current shell, the direct fallback commands are:

- `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-machine.ps1`
- `node --experimental-strip-types ./scripts/check-tooling.mts`

The bootstrap script installs `rg` and `fd` with the first supported Windows package manager it finds: `winget`, Chocolatey, or Scoop.
These tools are for local development ergonomics and are not a CI requirement.

<!-- autonav:start -->
- [Website](./website/📌README.md)
- [Scripts](./scripts/📌README.md)
- [00 Command Center](./00-command-center/📌README.md)
- [Videos](./videos/📌README.md)
- [Engine](./engine/📌README.md)
<!-- autonav:end -->
