import { spawn } from "node:child_process";
import { resolve } from "node:path";

const LIVE_PORT = 4173;
const PREVIEW_PATH = "/renderer/preview/layout-preview.html";

const softwareDir = resolve(import.meta.dirname, "..");
const children = [];
let shuttingDown = false;

function start(label, command) {
  const child = spawn(command, {
    cwd: softwareDir,
    shell: true,
    stdio: "inherit",
  });

  children.push({ label, child });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const exitLabel = signal ? `${label} exited via signal ${signal}` : `${label} exited with code ${code ?? 0}`;
    process.stderr.write(`${exitLabel}\n`);
    shutdown(code ?? 1);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const { child } of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const { child } of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(code);
  }, 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("preview watcher", "vp run -F @reasontracker/renderer preview:watch");

start(
  "live server",
  `vp dev --port ${LIVE_PORT} --strictPort --open ${PREVIEW_PATH}`,
);
