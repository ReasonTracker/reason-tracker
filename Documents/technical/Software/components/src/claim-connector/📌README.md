# 📌 Claim Connector

This folder is the planned home for the shared claim-connector component and nearby helpers.

## Current Status

- Prototype boundary only.
- Use this folder to shape the connector proposal before locking the implementation surface.
- Keep the first pass biased toward one conceptual component, even if the rendered output eventually uses multiple ordered SVG layers.

## Intended Direction

- Build shared connector logic here so both videos and future web-facing surfaces can consume it.
- Reuse `path-geometry` where it reduces connector-shape complexity.
- Keep Remotion-only scene wiring and visual inspection out of this folder.

## Likely Responsibilities

- confidence and relevance connector inputs and shared contracts
- layered connector output suitable for ordered SVG rendering
- helper logic that decides connector body and overlap layers

## Out Of Scope

- Remotion composition wiring
- video-only preview fixtures
- tree layout or routing rules that belong at a higher level

## Working Notes

- The proposal draft for this folder lives in `Proposal.md`.
- If the implementation later grows beyond a clean single boundary, split internal helpers before splitting the public concept.

---

<!-- autonav:start -->
- [Reason Tracker](./Proposal.md)
<!-- autonav:end -->
