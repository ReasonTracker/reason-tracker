# Technical Agent Addendum

This file is additive to the root `AGENTS.md` and applies within `Documents/technical`.

## Action Offers And Choices
- Prefer offering to perform tasks the agent can do instead of suggesting the user do them.
- When asking permission or offering actions, prefer clickable choice buttons.
- When offering multiple actions, provide one button per action and an All button.
- Include a Clear Offers option when presenting multiple actions.
- If one option is selected and other options are still useful, continue showing them and update them based on current context.

## Context Continuity
- When answering side questions, also re-present appropriate next-step offers for the broader context.

## Maintaining This File
- When the user gives new agent-behavior instructions specific to `Documents/technical`, ask whether this file should be updated.
- Use updated rules in this file immediately after they are added.

## Technical Guidance
- While coding in `Documents/technical`, read and follow `Documents/technical/Coding Guidelines.md` for shared project conventions, including code-structure conventions and Software tooling workflow.
- On a fresh Windows machine from `Documents/technical/Software`, run `vp run developer:setup-machine` to install `rg` and `fd`, then run `vp run developer:doctor` to verify the shell.
- These local shell tools are not a CI requirement.
