# Agent Steering

## Workflow
- Ask any questions necessary to clarify the goal.
- Think of and suggest the next step only after you accomplish the current one so you can choose a better next step from what you learned.
- If path, scope, or location is ambiguous, ask before creating, deleting, or moving files.

## Refactor Cleanup
- When replacing, moving, flattening, or renaming code, explicitly check whether the superseded files, folders, re-export shims, and doc references should be removed.
- Before finishing a refactor, verify that old files and empty folders introduced by the old structure are cleaned up unless the user asked to keep a compatibility layer.
- If a temporary compatibility layer is kept, name it as temporary in code or docs and remove it in the same task when practical.

## Execution Mode
- Determine mode first: Discussion Mode or Action Mode.
- Default to Discussion Mode unless the user explicitly asks for execution.
- In Discussion Mode, read-only work is allowed (inspect files, search, and analyze).
- In Discussion Mode, do not perform side-effect actions (edit/create/delete/move files, or run state-changing commands) unless explicitly requested.
- If the request is ambiguous, ask a clarification question before taking action.
- Do not weaken existing behavior rules without explicitly confirming the change with the user.

## Prototype Rule
- Treat this repository as a prototype until the documentation says otherwise.
- Do not create, add, expand, or propose new automated tests while this prototype rule is in effect.
- Avoid routine change-log style documentation during prototype iteration.
- Update documentation during prototype work only when standing truth changes, such as structure, ownership, entrypoints, glossary terms, protected areas, or stable workflow rules.
- If a task would normally include tests or extensive change documentation, stop at implementation and only update the durable docs that need to stay accurate unless the user explicitly says the prototype rule has changed.

## Change Guard Rule
- `CHANGE-GUARD` marks code or documentation that requires explicit approval before changing.
- If an agent encounters a `CHANGE-GUARD` marker on a file or region relevant to the requested task, stop and obtain explicit approval before editing that guarded area.
- Do not work around a `CHANGE-GUARD` marker by changing adjacent code, configuration, or documentation to achieve the same guarded effect indirectly.
- Treat `CHANGE-GUARD` as a sparse, high-signal boundary for intentional changes, not as a generic comment pattern.

## Approval and Clarification
- If the user explicitly requests an action, proceed without asking for separate approval.
- Ask clarifying questions only when needed to execute correctly.
- Do not add an extra approval gate for actions the user already requested.

## Response Style
- Give a short, broad answer first for suggestions.
- Do not dump long assumptions or large writeups unless explicitly requested.
- Default to concise answers.
- Give a long response only when needed to fulfill the request or when explicitly asked.
- Do not deviate from the request while executing it. You can stop and ask a question if something comes up during execution.
- If useful, suggest possible additional actions only after completing the requested work.
- Prefer explicit nouns over pronouns when multiple nouns are in scope.

## Persistent Memory Policy
- Always read this file at the start of work in this repository.
- Do not store additional persistent memory notes unless the user explicitly asks.

## Root Cleanliness
- Keep the repository root clean.
- Files or folders needed by agents should live below the root unless the root is the only place they can function.
- If you notice a root-level item other than the allowed exceptions below, notify the user before adding more root clutter.
- Allowed root-level exceptions are: `.git/`, `.vscode/`, `AGENTS.md`, `Documents/`, and `README.md`.

## This Document Boundary
- Keep this file for agent steering only.
- Put general project documentation in shared docs.

## Shared Guidance
- When working in a specific subtree, check for a closer `AGENTS.md` in that folder or its nearest ancestor below the repo root and apply it as additive guidance for that scope.
- Do not scan unrelated folders for nested `AGENTS.md` files; only load subtree-specific steering when the task is actually related to that subtree.
- Read and follow `Documents/technical/Coding Guidelines.md` for shared project conventions.
- For `Documents/technical/Software`, enforce the `vp` preference documented in `Documents/technical/Coding Guidelines.md` even when a package-manager command would also work.
- AI agents may have a default bias toward `pnpm` commands; correct for that here.
- This repo expects `rg` to be available in the local developer shell for code search.
- When command choice or workflow semantics are unclear, read the Vite Plus docs before falling back to package-manager conventions: https://viteplus.dev/