# 📌 Technical

## Software Asset Folder Pattern

Each software asset should live in its own top-level folder inside `Software Assets`.

Prefer single-source documentation for shared rules.

## README Naming Pattern

Use `📌README.md` for documentation folders under Technical.
Keep plain `README.md` only at the repository root.

- Use: `Software Assets/<asset-name>/`
- Avoid category folders like `packages/` and `apps/` for new assets
- Keep each asset self-contained with its own `package.json` and `📌README.md`
- Avoid duplicating shared organizational guidance in individual asset docs; link back to this technical document instead

Example: `Software Assets/engine` for `@reasontracker/engine`.

<!-- autonav:start -->
- [Software Assets](./Software%20Assets/📌README.md)
- [Agent Steering](./AGENTS.md)
- [Coding Guidelines](./Coding%20Guidelines.md)
<!-- autonav:end -->
