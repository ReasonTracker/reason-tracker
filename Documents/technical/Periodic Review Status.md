# Periodic Review Status

This file tracks when the next periodic repository reviews should be offered.
It is current-state scheduling, not a historical log. Git tracks history.

Reviews should be offered at a natural idle point, not during active implementation.
The AI may choose the review approach, but should keep findings concise, actionable, and non-duplicative.

## AI Architecture Review

- Next prompt after: 2026-04-17
- Cadence: 30 days
- Scope: Review whether the repository is organized so an AI agent can quickly find the right context, understand the system accurately, and avoid unnecessary broad exploration or excessive context use.
- Pay special attention to:
  - Duplicate, overly wordy, stale, or conflicting documentation.
  - Overlap between docs that makes ownership unclear.
  - Missing entry points, unclear architecture boundaries, or misleading file names.
  - Guidance that is too prescriptive, brittle, or likely to block useful AI judgment.
- Output:
  - High-impact findings.
  - Suggested simplifications.
  - Any unclear tradeoffs or questions for the developer team.
  - One suggestion to improve the review process itself.

## Repo Guideline Compliance Review

- Next prompt after: 2026-04-17
- Cadence: 30 days
- Scope: Review whether the repository follows its own documented rules, including prototype constraints, README patterns, and agent guidance.
- Pay special attention to:
  - Rules that are duplicated, inconsistent, obsolete, or hard to apply.
  - Docs that disagree with actual code structure or workflows.
  - Places where guidance is too verbose or scattered across multiple files.
  - Missing documentation for conventions that are clearly used in practice.
- Output:
  - Compliance gaps.
  - Suggested doc or code changes.
  - Any questions for the developer team.
  - One suggestion to improve the review process itself.

## Code Quality Analysis

- Next prompt after: 2026-04-17
- Cadence: 30 days
- Scope: Run automated code quality analysis and address safe, obvious issues.
- Command: `npx fallow --format json`
- If the output is unclear, consult `fallow.tools`.
- Fix safe issues when confidence is high.
- Consider: `fallow fix --yes --format json`
- Log unresolved questions for the developer team below.

## Developer Questions Log

- None currently.
