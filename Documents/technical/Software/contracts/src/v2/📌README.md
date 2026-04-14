This folder contains the side-by-side V2 contract surface.

## Boundary

- Keep this folder isolated from the legacy step-based contract files.
- Model the V2 semantic pipeline as intents with ordered changes.
- If a later stage needs derived metadata, prefer extending the same intent or change records rather than adding a new semantic container.
- Keep names explicit about the domain field being changed.
