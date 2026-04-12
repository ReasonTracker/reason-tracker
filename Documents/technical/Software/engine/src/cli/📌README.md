# 📌 CLI

This folder is a transport adapter for command-line usage of the engine.

## Boundary (Important)

The CLI layer must remain thin.

- Parse argv/stdin and map to a request shape.
- Call core engine APIs.
- Map results to stdout/stderr and exit codes.

The CLI layer must not contain domain logic.

- No score math.
- No cycle detection/remediation algorithms.
- No graph validation rules beyond command/input parsing.

All debate validation, cycle handling, and scoring behavior belongs in core scoring modules.

## Why

Non-CLI runtime code (renderer/video/etc.) also depends on engine behavior. Keeping domain logic in core APIs prevents drift and hidden bypass paths.
