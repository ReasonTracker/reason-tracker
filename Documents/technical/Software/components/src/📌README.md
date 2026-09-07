# 📌 Src

This folder owns the shared source entrypoints for the components package.

## Boundaries

- Keep Remotion-only hooks, playback helpers, and composition wiring out of this folder.
- Prefer component-level boundaries that can render in both Remotion and web environments.
- Add a local README for each subfolder that becomes its own responsibility boundary.
- `debate-graph` owns shared claim, attachment-port, connector-band, aggregator, and junction geometry plus the React/SVG renderer.

---

<!-- autonav:start -->

- [Claim Connector](./claim-connector/📌README.md)
- [Path Geometry](./path-geometry/📌README.md)
<!-- autonav:end -->
