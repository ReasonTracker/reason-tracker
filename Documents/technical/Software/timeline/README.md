# Timeline

Standalone type contracts for building declarative video timelines that can later be resolved into Remotion-style object existence and state spans.

This library does not import any external libraries or any other Reason Tracker workspace libraries.

Current scope:

- input types for what is sent into a future timeline builder function
- output types for the resolved timeline data that comes back out
- no internal resolution or implementation-only types yet

The input model supports events that are scheduled relative to the timeline start or relative to earlier events. The output model groups each object into existence windows and state segments so consumers can see when an object exists and which props it has during each span.

---

<!-- autonav:start -->
- [Src](./src/📌README.md)
<!-- autonav:end -->
