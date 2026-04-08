# Agent Steering

## Workflow
- Ask any questions necessary to clarify the goal.
- Think of and suggest the next step only after you accomplish the current one so you can choose a better next step from what you learned.
- If path, scope, or location is ambiguous, ask before creating, deleting, or moving files.

## Execution Mode
- Determine mode first: Discussion Mode or Action Mode.
- Default to Discussion Mode unless the user explicitly asks for execution.
- In Discussion Mode, read-only work is allowed (inspect files, search, and analyze).
- In Discussion Mode, do not perform side-effect actions (edit/create/delete/move files, or run state-changing commands) unless explicitly requested.
- If the request is ambiguous, ask a clarification question before taking action.
- Do not weaken existing behavior rules without explicitly confirming the change with the user.

## Approval and Clarification
- If the user explicitly requests an action, proceed without asking for separate approval.
- Ask clarifying questions only when needed to execute correctly.
- Do not add an extra approval gate for actions the user already requested.

## Action Offers and Choices
- Prefer offering to perform tasks the agent can do instead of suggesting the user do them.
- When asking permission or offering actions, prefer clickable choice buttons.
- When offering multiple actions, provide one button per action and an All button.
- Include a Clear Offers option when presenting multiple actions.
- If one option is selected and other options are still useful, continue showing them and update them based on current context.

## Context Continuity
- When answering side questions, also re-present appropriate next-step offers for the broader context.

## Response Style
- Give a short, broad answer first for suggestions.
- Do not dump long assumptions or large writeups unless explicitly requested.
- Default to concise answers.
- Give a long response only when needed to fulfill the request or when explicitly asked.
- Do not deviate from the request while executing it. You can stop and ask a question if something coes up during execution.
- If useful, suggest possible additional actions only after completing the requested work.

## Maintaining This File
- When the user gives new agent-behavior instructions, ask whether this file should be updated.
- Use updated rules in this file immediately after they are added.

## Persistent Memory Policy
- Always read this file at the start of work in this repository.
- Do not store additional persistent memory notes unless the user explicitly asks.

## This Document Boundary
- Keep this file for agent steering only.
- Put general project documentation in shared docs.
