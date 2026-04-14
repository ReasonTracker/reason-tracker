This folder contains the side-by-side V2 engine pipeline.

## Boundary

- Keep this folder isolated from the legacy step-based engine files.
- The V2 engine owns canonical intent meaning and ordered change emission.
- Reuse of implementation ideas from the legacy engine is fine, but do not import legacy step-based pipeline contracts here.
- Downstream stages may add derived metadata, but this folder should not add a second semantic container above intents and changes.
