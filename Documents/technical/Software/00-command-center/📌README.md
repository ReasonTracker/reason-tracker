# 📌 00 Command Center

The command menu lives directly in `index.html`. Add or edit buttons there with `data-command` values, then add matching handlers in `server/core.ts`.

A server message with type `open-url` makes the page open that URL in a new tab instead of logging it.

Website buttons: Run regenerates the architecture map and starts the website dev server in a terminal, Open Map opens `/repository-architecture/`, and Stop ends the process listening on the website dev port.

The `00-` prefix keeps this folder first in the VS Code explorer.

<!-- autonav:start -->
<!-- autonav:end -->
