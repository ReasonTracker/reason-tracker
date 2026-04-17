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

Example: `Software/videos` for `@reasontracker/video`.

<!-- autonav:start -->
- [Software](./Software/📌README.md)
- [Technical Agent Addendum](./AGENTS.md)
- [AI Repo Organization Guidelines](./AI%20Repo%20Organization%20Guidelines.md)
- [Periodic Review Status](./Periodic%20Review%20Status.md)
- [Coding Guidelines](./Coding%20Guidelines.md)
- [Renderer Algorithm Rationale](./Renderer%20Algorithm%20Rationale.md)
- [V3 Proposal](./V3%20Proposal.md)
- [V3 Suggestions And Open Questions](./V3%20Suggestions%20And%20Open%20Questions.md)
- [Ideas for Future Technical Goals](./Ideas%20for%20Future%20Technical%20Goals.md)
<!-- autonav:end -->
