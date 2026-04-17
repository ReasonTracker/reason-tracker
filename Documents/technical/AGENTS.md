# Technical Agent Addendum

This file is additive to the root `AGENTS.md` and applies within `Documents/technical`.

## Action Offers And Choices
- Prefer offering to perform tasks the agent can do instead of suggesting the user do them.
- When asking permission or offering actions, prefer clickable choice buttons.
- When the user should choose one path, present a single-select set of clickable choices so the user can answer with one click.
- Prefer clickable choices over asking the user to reply with a typed number or short text when the available options are already known.
- Omit a custom or freeform option unless it is actually needed for the decision.
- Include a direct recommended option when one path is clearly best.
- Prefer one question at a time over batching multiple questions together.
- After each user response, reconsider the next question based on the updated context instead of asking follow-up questions that may have become outdated.
- When offering multiple actions, provide one button per action and an All button.
- Include a Clear Offers option when presenting multiple actions.
- If one option is selected and other options are still useful, continue showing them and update them based on current context.

## Context Continuity
- When answering side questions, also re-present appropriate next-step offers for the broader context.
- When the conversation reaches a natural idle point after meaningful progress, proactively offer the most relevant next step or a small set of relevant next steps.
- Do not wait silently when there is a clear continuation that would help the user keep momentum.
- Keep idle next-step offers brief and relevant to the current context rather than listing every possible future task.
- At natural idle points, read `Documents/technical/Periodic Review Status.md` and check whether any review is due.
- If today's date is later than a review's `Next prompt after` date, briefly offer to run that review.
- Do not interrupt active implementation work for a periodic review reminder.
- If the user declines or defers a due review in the current conversation, do not keep re-offering it in the same conversation unless context materially changes.

## Validation And Progress Reporting
- Do not run documentation validation after every small edit by default.
- When a validation step is still needed but not yet worth running, add it to the active todo list and batch it with nearby edits.
- Prefer running validation at meaningful checkpoints, such as after finishing a coherent doc slice, before handing work back, or when a risky change needs confirmation.
- Small steering-doc edits should not trigger immediate validation unless they change validation behavior, touch validation tooling, or introduce a specific risk that validation would resolve.
- If validation has already been agreed to or is already visible from current context, do not restate it unless status changed.

## Summaries
- Do not repeatedly summarize completed work when the information was already agreed to earlier in the conversation.
- Summaries should focus on new information, changed status, new risks, or anything the user likely has not already absorbed.
- If nothing materially changed beyond executing the agreed step, keep the close-out minimal.

## Maintaining This File
- When the user gives new agent-behavior instructions specific to `Documents/technical`, ask whether this file should be updated.
- Use updated rules in this file immediately after they are added.

## Technical Guidance
- While coding in `Documents/technical`, read and follow `Documents/technical/Coding Guidelines.md` for shared project conventions, including code-structure conventions and Software tooling workflow.
- On a fresh Windows machine from `Documents/technical/Software`, run `vp run developer:setup-machine` to install `rg` and `fd`, then run `vp run developer:doctor` to verify the shell.
- These local shell tools are not a CI requirement.
