# 📌 Src

## Purpose

This folder holds the current engine package source.
Use the parent engine README for package-level ownership, status, and incubation rules.
This page is only a local routing note for where to go next inside `src`.

## Start Here When

- you are looking for the engine package entry surface in `index.ts`
- you are shaping command payload definitions in `01-Commands.ts`
- you are defining command-to-operation translator contracts in `command-translator/`
- you are implementing operation replay in `04-Reducer.ts`
- you are implementing score-occurrence layout in `05-Layout.ts`
- you need the shared domain contracts in `00-entities/`

## Local Boundary

- commands define semantic mutation input first
- the command contract in `01-Commands.ts` is authoritative and changes require explicit approval
- translator contracts and translator-local files belong in `command-translator/`
- reducer behavior that applies `Operation` values to `Debate` state belongs in `04-Reducer.ts`
- deterministic box layout for reduced debate state belongs in `05-Layout.ts`
- general engine source may evolve here
- shared entity contracts are defined in `00-entities/` and changes require explicit approval
- package-level ownership decisions belong in the parent engine README

## Command Contract Rule

In `01-Commands.ts`, keep commands shaped around domain intent.
Do not model commands as raw entity patches or one-command-per-field setters unless a field change is itself a meaningful domain action.

Prefer fewer local helper types in command definitions.
If a patch shape is used only once and does not need its own name, inline it at the point of use.

## Related Docs

- [Layout Engine](../Layout%20Engine.md)
- [00 Entities](./00-entities/📌README.md)
- [Command Translator](./command-translator/📌README.md)
- [Engine](../📌README.md)

<!-- autonav:start -->
- [📌 Planner](./02-Planner.md)
<!-- autonav:end -->
