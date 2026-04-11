# 📌 Video

Package name: @reasontracker/video

This software asset hosts Remotion episodes, shared video helpers, and shared media for repository videos.

## Scope

- Remotion Studio entry and CLI rendering
- Episode composition code
- Shared intros, overlays, helpers, and reusable media
- Shared music and sound effects stored in-repo for the first pass

## Content Split

- Episode scripts, research, and most raw assets live under `Documents/Videos/`.
- Remotion code and shared assets live in this package.
- Episode folders and files use the naming pattern `Episode0001`, `Episode0002`, and so on.
- User-facing labels should display episode names with zero padding removed.

## Usage

From `Documents/technical/Software`:

```bash
pnpm run command-center
pnpm run video:studio
pnpm run video:studio:current
pnpm run video:current
pnpm run video:render
pnpm run video:render:current
pnpm run video:render:1
pnpm run video:render:2
```

From this folder:

```bash
pnpm run studio
pnpm run studio:current
pnpm run current
pnpm run render
pnpm run render:current
pnpm run render:1
pnpm run render:2
```

## Notes

- The first two concrete test episodes are `Episode0001` and `Episode0002`.
- User-facing displays should render those as `Episode 1` and `Episode 2`.
- Do not introduce a shared composition contract until repeated patterns have actually emerged.
- The current episode source of truth lives in `current-episode.json` at the package root.
- The default launcher now lives at the Software root through `pnpm run command-center`.
- The focused video page is available inside the command center at `/video`.
- `pnpm run current` prints the configured current episode and the source file path.
- `pnpm run render:current` renders the episode listed in `current-episode.json`.
- `pnpm run studio:current` launches Studio and prints which episode is currently configured.
- `pnpm run render` prompts for an episode number and accepts inputs like `1`, `2`, or `Episode0001`.
- The generic command `pnpm run render:episode -- 1` also works when you want to pass the target inline.