# 📌 Technical

## Software Asset Folder Pattern

Each software asset should live in its own top-level folder inside `Software`.

Prefer single-source documentation for shared rules.

## README Naming Pattern

Use `📌README.md` for documentation folders under Technical.
Keep plain `README.md` only at the repository root.

- Use: `Software/<asset-name>/`
- Avoid category folders like `packages/` and `apps/` for new assets
- Keep each asset self-contained with its own `package.json` and `📌README.md`
- Avoid duplicating shared organizational guidance in individual asset docs; link back to this technical document instead

Example: `Software/engine` for `@reasontracker/engine`.

<!-- autonav:start -->
- [Software](./Software/📌README.md)
- [Technical Agent Addendum](./AGENTS.md)
- [Coding Guidelines](./Coding%20Guidelines.md)
- [Renderer Algorithm Rationale](./Renderer%20Algorithm%20Rationale.md)
- [V2 Re Write Task](./V2_re-write_task/📌README.md)
- [Ideas for Future Technical Goals](./Ideas%20for%20Future%20Technical%20Goals.md)
<!-- autonav:end -->
