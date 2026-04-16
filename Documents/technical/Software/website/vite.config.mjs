import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { defineConfig } from "vite";

const WEBSITE_DIR = path.resolve(import.meta.dirname);
const REPO_DIR = resolveRepoDir();
const DIST_DIR = path.join(WEBSITE_DIR, "dist");
const PUBLISH_SCRIPT = path.join(WEBSITE_DIR, "scripts", "publish-website.mjs");

function resolveRepoDir() {
  let current = WEBSITE_DIR;

  while (true) {
    if (existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to locate repository root (.git directory not found in ancestor paths).");
    }

    current = parent;
  }
}

function publishWebsitePlugin() {
  let isPublishing = false;
  let publishQueued = false;
  let queuedReason = "change";
  let pendingReason = null;
  let debounceTimer = null;

  function schedulePublish(server, reason) {
    pendingReason = reason || pendingReason || "change";

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const nextReason = pendingReason || "change";
      pendingReason = null;
      void runPublish(server, nextReason);
    }, 120);
  }

  async function runPublish(server, reason) {
    if (isPublishing) {
      publishQueued = true;
      queuedReason = reason || queuedReason || "queued";
      return;
    }

    isPublishing = true;

    try {
      await runCommand("node", [PUBLISH_SCRIPT, "--no-report", "--preserve-dist"], WEBSITE_DIR);
      if (server) {
        server.ws.send({ type: "full-reload" });
      }
    } catch (error) {
      const message = error?.message || String(error);
      console.error(`[website] publish failed: ${message}`);
    } finally {
      isPublishing = false;
      if (publishQueued) {
        publishQueued = false;
        const nextReason = queuedReason || "queued";
        queuedReason = "queued";
        schedulePublish(server, nextReason);
      }
    }
  }

  return {
    name: "website-publish-on-change",
    configureServer(server) {
      void runPublish(server, "startup");

      server.watcher.add(REPO_DIR);

      const onFsEvent = (event, absolutePath) => {
        const normalized = toPosixPath(absolutePath);

        if (isIgnoredForPublishWatch(normalized)) {
          return;
        }

        schedulePublish(server, event);
      };

      server.watcher.on("add", (file) => onFsEvent("add", file));
      server.watcher.on("change", (file) => onFsEvent("change", file));
      server.watcher.on("unlink", (file) => onFsEvent("unlink", file));
      server.watcher.on("addDir", (file) => onFsEvent("addDir", file));
      server.watcher.on("unlinkDir", (file) => onFsEvent("unlinkDir", file));
    },
  };
}

function isIgnoredForPublishWatch(normalizedPath) {
  if (!normalizedPath) {
    return true;
  }

  if (normalizedPath.includes("/.git/") || normalizedPath.endsWith("/.git")) {
    return true;
  }

  if (normalizedPath.includes("/node_modules/") || normalizedPath.endsWith("/node_modules")) {
    return true;
  }

  if (normalizedPath.startsWith(toPosixPath(DIST_DIR) + "/")) {
    return true;
  }

  if (normalizedPath.includes("/website/.vite-preview/")) {
    return true;
  }

  return false;
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command failed: ${command} ${args.join(" ")}\n${Buffer.concat(stderr).toString("utf8") || Buffer.concat(stdout).toString("utf8")}`,
        ),
      );
    });
  });
}

function toPosixPath(value) {
  return String(value).replaceAll("\\", "/");
}

export default defineConfig({
  root: "dist",
  publicDir: false,
  appType: "mpa",
  plugins: [publishWebsitePlugin()],
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
  build: {
    outDir: "../.vite-preview",
    emptyOutDir: true,
  },
});
