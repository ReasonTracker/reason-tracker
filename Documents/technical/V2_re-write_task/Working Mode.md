# Working Mode

Use this document to start a fresh session for the V2 refactor.

## Refactor Strategy

- Work side by side, not in place.
- Do not break the existing path while building the new one.
- Use `EpisodeV2` as the isolated episode entry file for the new path.
- Do not create a `v2/` folder if that risks Studio issues.

## Current Design Decisions

- The semantic model is only `Intents -> ordered Changes`.
- Do not keep `Step` or `AnimationStep` in the intended end-state design.
- Engine-emitted `Changes` are canonically ordered.
- Downstream stages may group changes for presentation timing but must not reorder them.
- `claimConfidence` and `connectorConfidence` both live on `Score`.
- Use explicit score-field change kinds such as `ScoreClaimConfidenceChanged` and `ScoreConnectorConfidenceChanged`.
- Later stages may augment the same `Intent` and `Change` records with metadata needed by the next stage.
- That forward metadata must not introduce a new semantic container layer.
- If metadata depends on `Change.kind`, use explicit kind-specific metadata shapes.
- Default layout-to-renderer handoff should not duplicate `before` payloads.
- Seek/skip should prefer committed boundary snapshots per renderer change group.

## Working Style

- Long unsupervised runs are okay.
- Do not pause for frequent checkpoints unless there is a real blocker or testing is needed.
- Use [Questions.md](c:/GitHub/reasontracker/reason-tracker/Documents/technical/V2_re-write_task/Questions.md) for async questions, risks, and blockers.
- Update the questions doc only when there is a real ambiguity, risk, or blocker.

## Good Starting References

- [New Terminology.md](c:/GitHub/reasontracker/reason-tracker/Documents/technical/V2_re-write_task/New%20Terminology.md)
- [Questions.md](c:/GitHub/reasontracker/reason-tracker/Documents/technical/V2_re-write_task/Questions.md)
- [Known_Issues.md](c:/GitHub/reasontracker/reason-tracker/Documents/technical/V2_re-write_task/Known_Issues.md)

## Expected Next Phase

- Discuss or execute the implementation plan for the side-by-side refactor.
- Start from contracts and engine output, then layout augmentation, then GraphView, then `EpisodeV2`.
- Keep the old path usable until the new path works end to end.

## Session Start Prompt

Use this prompt in a fresh session:

Read this file first, then read [New Terminology.md](c:/GitHub/reasontracker/reason-tracker/Documents/technical/V2_re-write_task/New%20Terminology.md). Continue the side-by-side V2 refactor from there. Use [Questions.md](c:/GitHub/reasontracker/reason-tracker/Documents/technical/V2_re-write_task/Questions.md) only for real blockers or ambiguities. Do not do an in-place rewrite. Keep the existing path usable until the new path works through `EpisodeV2`.