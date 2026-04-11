import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { readCurrentEpisodeId, toEpisodeDisplayName } from "../Video/scripts/episode-utils.mjs";

const rootDir = process.cwd();
const docsVideosDir = resolve(rootDir, "../../Videos");
const standaloneScriptsDir = resolve(rootDir, "scripts");
const port = Number.parseInt(process.env.COMMAND_CENTER_PORT ?? "4780", 10);
const recentVideoLimit = Number.parseInt(process.env.COMMAND_CENTER_RECENT_VIDEOS ?? "6", 10);

const curatedStandaloneScripts = [
  {
    category: "utilities",
    command: "node ./scripts/preview-live.mjs",
    description: "Starts the local live preview environment.",
    isBackground: true,
    name: "preview-live.mjs",
    packageName: "Software",
    scriptKey: "preview-live",
    source: "standalone",
  },
  {
    category: "utilities",
    command: "node ./scripts/maintain-markdown.mjs --write-report",
    description: "Rebuilds markdown indexes and writes the maintenance report.",
    isBackground: false,
    name: "maintain-markdown.mjs",
    packageName: "Software",
    scriptKey: "maintain-markdown",
    source: "standalone",
  },
];

const hiddenScriptKeys = new Set(["command-center", "video:launcher", "launcher"]);

const packageDescriptions = new Map([
  ["Software", "Root workspace scripts and orchestration commands."],
  ["@reasontracker/video", "Remotion episodes, shared media, and current-episode workflows."],
  ["@reasontracker/renderer", "Layout preview and rendering tools."],
  ["reason-tracker-repo-website", "Local website dev, preview, and publish flows."],
  ["@reasontracker/engine", "Core engine commands and tests."],
  ["@reasontracker/engine-tests", "Portable engine contract tests."],
  ["@reasontracker/contracts", "Shared contracts and validation scripts."],
]);

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function looksLikePlaceholder(command) {
  return command.includes("Build script pending");
}

function categorizeScript(scriptKey, command) {
  if (scriptKey.includes("video") || scriptKey.startsWith("render") || scriptKey.startsWith("studio") || scriptKey === "current") {
    return "video";
  }

  if (scriptKey.includes("test")) {
    return "test";
  }

  if (scriptKey.startsWith("dev") || scriptKey.startsWith("preview")) {
    return "preview";
  }

  if (scriptKey.includes("publish") || scriptKey.startsWith("build")) {
    return "build";
  }

  if (scriptKey.includes("maintain")) {
    return "utilities";
  }

  if (command.includes("--watch") || command.includes(" studio ")) {
    return "preview";
  }

  return "utilities";
}

function isBackgroundCommand(scriptKey, command) {
  return (
    scriptKey.includes("watch") ||
    scriptKey.startsWith("dev") ||
    scriptKey === "preview" ||
    scriptKey.includes("studio") ||
    scriptKey.includes("launcher") ||
    command.includes("--watch") ||
    command.includes("vp dev") ||
    command.includes("remotion studio")
  );
}

function getDisplayName(scriptKey, packageName) {
  if (packageName === "Software" && scriptKey === "command-center") {
    return "Open Command Center";
  }

  return scriptKey
    .split(":")
    .map((part) => part.replaceAll("-", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function getDescription(scriptKey, command, packageName) {
  if (packageName === "Software" && scriptKey === "preview") {
    return "Starts the renderer preview watcher and local live server.";
  }

  if (packageName === "Software" && scriptKey === "video:render:current") {
    return "Renders the episode configured as current in the Video package.";
  }

  if (packageName === "Software" && scriptKey === "video:studio:current") {
    return "Opens or reuses Remotion Studio for the current episode context without forcing composition selection.";
  }

  if (packageName === "Software" && scriptKey === "maintain:markdown") {
    return "Refreshes markdown indexes and updates the maintenance report.";
  }

  if (scriptKey === "cli") {
    return "Runs the engine CLI entry point.";
  }

  if (command.includes("vp test")) {
    return "Runs the package test suite.";
  }

  if (command.includes("vp dev")) {
    return "Starts a local development server.";
  }

  if (command.includes("remotion")) {
    return "Runs a Remotion workflow for the Video package.";
  }

  return `Runs ${scriptKey} from ${packageName}.`;
}

function buildScriptCommand(packageDir, packageName, scriptKey) {
  if (packageName === "Software") {
    return `pnpm run ${scriptKey}`;
  }

  return `pnpm run -F ${packageName} ${scriptKey}`;
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function listWorkspacePackages() {
  const rootPackage = await readJson(resolve(rootDir, "package.json"));
  const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
  const packageEntries = [
    {
      dir: rootDir,
      displayName: "Software",
      filePath: resolve(rootDir, "package.json"),
      packageName: "Software",
      scripts: rootPackage.scripts ?? {},
    },
  ];

  for (const workspace of workspaces) {
    const packageJsonPath = resolve(rootDir, workspace, "package.json");
    const packageJson = await readJson(packageJsonPath);
    packageEntries.push({
      dir: resolve(rootDir, workspace),
      displayName: workspace,
      filePath: packageJsonPath,
      packageName: packageJson.name ?? workspace,
      scripts: packageJson.scripts ?? {},
    });
  }

  return packageEntries;
}

async function discoverCommands() {
  const packageEntries = await listWorkspacePackages();
  const commands = [];

  for (const entry of packageEntries) {
    for (const [scriptKey, command] of Object.entries(entry.scripts)) {
      if (hiddenScriptKeys.has(scriptKey) || looksLikePlaceholder(command)) {
        continue;
      }

      commands.push({
        category: categorizeScript(scriptKey, command),
        command,
        description: getDescription(scriptKey, command, entry.packageName),
        displayName: getDisplayName(scriptKey, entry.packageName),
        isBackground: isBackgroundCommand(scriptKey, command),
        name: entry.displayName,
        packageDir: entry.dir,
        packageName: entry.packageName,
        scriptKey,
        source: "package",
        triggerCommand: buildScriptCommand(entry.dir, entry.packageName, scriptKey),
      });
    }
  }

  const standaloneEntries = await readdir(standaloneScriptsDir, { withFileTypes: true });
  const existingStandalone = new Set(
    standaloneEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );

  for (const standalone of curatedStandaloneScripts) {
    if (!existingStandalone.has(standalone.name)) {
      continue;
    }

    commands.push({
      ...standalone,
      displayName: getDisplayName(standalone.scriptKey, standalone.packageName),
      packageDir: rootDir,
      triggerCommand: standalone.command,
    });
  }

  commands.sort((left, right) => {
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }

    if (left.packageName !== right.packageName) {
      return left.packageName.localeCompare(right.packageName);
    }

    return left.scriptKey.localeCompare(right.scriptKey);
  });

  return commands;
}

async function discoverRecentVideos() {
  const entries = await readdir(docsVideosDir, { withFileTypes: true });
  const videos = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = /^Episode(\d+)$/.exec(entry.name);

      if (!match) {
        return null;
      }

      return {
        episodeId: entry.name,
        episodeNumber: Number.parseInt(match[1], 10),
        label: toEpisodeDisplayName(entry.name),
        relativePath: `Documents/Videos/${entry.name}`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.episodeNumber - left.episodeNumber)
    .slice(0, recentVideoLimit);

  return videos;
}

function groupCommands(commands) {
  const grouped = new Map();

  for (const command of commands) {
    const key = command.category;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(command);
  }

  return grouped;
}

function commandSlug(packageName, scriptKey, source) {
  return encodeURIComponent(`${source}:${packageName}:${scriptKey}`);
}

function getCommandBySlug(commands, slug) {
  return commands.find((command) => commandSlug(command.packageName, command.scriptKey, command.source) === slug) ?? null;
}

function runCommand(command) {
  const commandText = command.triggerCommand;
  const executable = process.platform === "win32" ? "cmd.exe" : commandText.split(" ")[0];
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", commandText]
      : commandText.split(" ").slice(1);

  const child = spawn(executable, args, {
    cwd: rootDir,
    detached: command.isBackground && process.platform !== "win32",
    shell: false,
    stdio: command.isBackground ? "ignore" : "pipe",
  });

  if (command.isBackground) {
    child.unref();

    return Promise.resolve({
      mode: "background",
      output: `Started ${command.displayName}.`,
      status: 0,
    });
  }

  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      rejectPromise(error);
    });

    child.on("close", (status) => {
      resolvePromise({
        mode: "oneshot",
        output: `${stdout}${stderr}`.trim(),
        status: status ?? 0,
      });
    });
  });
}

function renderCommandCard(command) {
  const slug = commandSlug(command.packageName, command.scriptKey, command.source);
  const description = escapeHtml(command.description);
  const displayName = escapeHtml(command.displayName);
  const packageName = escapeHtml(command.packageName);
  const runLabel = command.isBackground ? "Start" : "Run";
  const modeLabel = command.isBackground ? "Background" : "One-shot";

  return `<article class="command-card">
    <div class="card-topline">${packageName}</div>
    <h3>${displayName}</h3>
    <p>${description}</p>
    <code>${escapeHtml(command.triggerCommand)}</code>
    <div class="meta-row">
      <span>${modeLabel}</span>
      <span>${escapeHtml(command.source)}</span>
    </div>
    <div class="actions-row">
      <a class="button" href="/run/${slug}">${runLabel}</a>
    </div>
  </article>`;
}

function renderVideoPanel(currentEpisodeId, recentVideos) {
  const currentEpisodeLabel = toEpisodeDisplayName(currentEpisodeId);
  const recentItems = recentVideos
    .map(
      (video) => `<li><strong>${escapeHtml(video.label)}</strong><span>${escapeHtml(video.episodeId)}</span></li>`,
    )
    .join("");

  return `<section class="panel hero-panel">
    <div class="eyebrow">Software Command Center</div>
    <h1>Reason Tracker Operations</h1>
    <p>The workspace home for dev servers, tests, publishing, and video workflows. Open this in a browser or VS Code Simple Browser.</p>
    <div class="hero-grid">
      <div class="hero-spotlight">
        <div class="label">Current Video</div>
        <div class="big-value">${escapeHtml(currentEpisodeLabel)}</div>
        <div class="muted">${escapeHtml(currentEpisodeId)}</div>
        <div class="actions-row">
          <a class="button" href="/run/${encodeURIComponent("package:Software:video:render:current")}">Render Current</a>
          <a class="button alt" href="/run/${encodeURIComponent("package:Software:video:studio:current")}">Open Studio</a>
          <a class="button ghost" href="/video">Open Video Page</a>
        </div>
      </div>
      <div class="hero-side">
        <div class="label">Recent Videos</div>
        <ul class="video-list">${recentItems}</ul>
      </div>
    </div>
  </section>`;
}

function renderVideoPage(currentEpisodeId, recentVideos, commands) {
  const currentEpisodeLabel = toEpisodeDisplayName(currentEpisodeId);
  const videoCommands = commands.filter((command) => command.category === "video");
  const recentItems = recentVideos
    .map(
      (video) => `<article class="episode-card">
        <div class="card-topline">Episode</div>
        <h3>${escapeHtml(video.label)}</h3>
        <p>${escapeHtml(video.episodeId)} lives in ${escapeHtml(video.relativePath)}.</p>
        <div class="meta-row"><span>${video.episodeNumber}</span></div>
      </article>`,
    )
    .join("");
  const commandCards = videoCommands.map(renderCommandCard).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reason Tracker Video</title>
    <style>
      :root {
        --bg: #eef4ee;
        --panel: rgba(255, 255, 255, 0.9);
        --ink: #17202a;
        --muted: #52606d;
        --accent: #14532d;
        --accent-2: #0f766e;
        --line: rgba(23, 32, 42, 0.1);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Segoe UI", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(20, 83, 45, 0.16), transparent 26%),
          radial-gradient(circle at right, rgba(15, 118, 110, 0.12), transparent 30%),
          linear-gradient(180deg, #f7fbf7 0%, var(--bg) 100%);
      }
      main {
        width: min(1200px, calc(100vw - 40px));
        margin: 32px auto 48px;
        display: grid;
        gap: 20px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 24px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
      .hero {
        padding: 28px;
      }
      .eyebrow, .card-topline, .section-topline {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 12px;
        color: var(--muted);
      }
      h1 {
        margin: 12px 0 0;
        font-size: clamp(38px, 6vw, 76px);
        color: var(--accent);
        line-height: 0.95;
      }
      h2 {
        margin: 0;
        font-size: 18px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }
      h3 {
        margin: 12px 0 0;
        font-size: 28px;
        line-height: 1.05;
      }
      p {
        margin: 12px 0 0;
        color: var(--muted);
        line-height: 1.55;
        font-size: 17px;
      }
      code {
        display: block;
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(23, 32, 42, 0.05);
        font-family: Consolas, monospace;
        overflow-wrap: anywhere;
      }
      .hero-grid, .episode-grid, .command-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }
      .hero-grid { margin-top: 22px; }
      .spotlight, .episode-card, .command-card {
        border-radius: 22px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(23, 32, 42, 0.08);
      }
      .current-value {
        margin-top: 10px;
        font-size: clamp(30px, 5vw, 54px);
        color: var(--accent-2);
        line-height: 1;
      }
      .meta-row, .actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .meta-row span {
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(23, 32, 42, 0.06);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        text-decoration: none;
        font-weight: 600;
      }
      .button.alt { background: var(--accent-2); }
      .button.ghost {
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--line);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel hero">
        <div class="eyebrow">Video Workspace</div>
        <h1>${escapeHtml(currentEpisodeLabel)}</h1>
        <p>This is the focused video page inside the new Software command center. The old dedicated video launcher has been absorbed here.</p>
        <div class="hero-grid">
          <div class="spotlight">
            <h2>Current Episode</h2>
            <div class="current-value">${escapeHtml(currentEpisodeLabel)}</div>
            <p>${escapeHtml(currentEpisodeId)}</p>
            <div class="actions-row">
              <a class="button" href="/run/${encodeURIComponent("package:Software:video:render:current")}">Render Current</a>
              <a class="button alt" href="/run/${encodeURIComponent("package:Software:video:studio:current")}">Open Studio</a>
            </div>
          </div>
          <div class="spotlight">
            <h2>Navigation</h2>
            <p>Use the root page for the whole workspace, or stay here when you only care about the current episode and video commands.</p>
            <div class="actions-row">
              <a class="button ghost" href="/">Back To Command Center</a>
            </div>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="section-topline">Recent Videos</div>
        <div class="episode-grid">${recentItems}</div>
      </section>
      <section class="panel">
        <div class="section-topline">Video Commands</div>
        <div class="command-grid">${commandCards}</div>
      </section>
    </main>
  </body>
</html>`;
}

function renderPackagePanel(commands) {
  const packageMap = new Map();

  for (const command of commands) {
    if (!packageMap.has(command.packageName)) {
      packageMap.set(command.packageName, []);
    }

    packageMap.get(command.packageName).push(command);
  }

  const items = [...packageMap.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([packageName, packageCommands]) => {
      const summary = packageDescriptions.get(packageName) ?? "Workspace package commands.";
      return `<article class="package-card">
        <div class="card-topline">Package</div>
        <h3>${escapeHtml(packageName)}</h3>
        <p>${escapeHtml(summary)}</p>
        <div class="meta-row">
          <span>${packageCommands.length} commands</span>
        </div>
      </article>`;
    })
    .join("");

  return `<section class="panel">
    <div class="section-topline">Packages</div>
    <div class="package-grid">${items}</div>
  </section>`;
}

function renderCommandGroups(commands) {
  const groups = groupCommands(commands);
  const groupOrder = ["preview", "video", "test", "build", "utilities"];
  const titles = new Map([
    ["preview", "Preview And Dev"],
    ["video", "Video"],
    ["test", "Testing"],
    ["build", "Build And Publish"],
    ["utilities", "Utilities"],
  ]);

  return groupOrder
    .filter((key) => groups.has(key))
    .map((key) => {
      const cards = groups.get(key).map(renderCommandCard).join("");
      return `<section class="panel">
        <div class="section-topline">${escapeHtml(titles.get(key) ?? key)}</div>
        <div class="command-grid">${cards}</div>
      </section>`;
    })
    .join("");
}

async function renderHomePage() {
  const [commands, recentVideos, currentEpisodeId] = await Promise.all([
    discoverCommands(),
    discoverRecentVideos(),
    readCurrentEpisodeId(),
  ]);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reason Tracker Command Center</title>
    <style>
      :root {
        --bg: #f4efe5;
        --panel: rgba(255, 251, 245, 0.9);
        --ink: #17202a;
        --muted: #5c6773;
        --accent: #9a3412;
        --accent-2: #14532d;
        --line: rgba(23, 32, 42, 0.12);
        --shadow: 0 24px 60px rgba(17, 24, 39, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Segoe UI", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(154, 52, 18, 0.15), transparent 28%),
          radial-gradient(circle at top right, rgba(20, 83, 45, 0.14), transparent 34%),
          linear-gradient(180deg, #f8f2e7 0%, #f4efe5 100%);
      }
      main {
        width: min(1280px, calc(100vw - 40px));
        margin: 32px auto 48px;
        display: grid;
        gap: 20px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        padding: 24px;
      }
      .hero-panel {
        padding: 28px;
      }
      .eyebrow, .section-topline, .card-topline, .label {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 12px;
        color: var(--muted);
      }
      h1 {
        margin: 12px 0 0;
        font-size: clamp(42px, 6vw, 82px);
        line-height: 0.95;
        color: var(--accent);
      }
      h3 {
        margin: 10px 0 0;
        font-size: 28px;
        line-height: 1.05;
      }
      p {
        margin: 12px 0 0;
        font-size: 17px;
        line-height: 1.55;
        color: var(--muted);
      }
      code {
        display: block;
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(23, 32, 42, 0.05);
        font-family: Consolas, monospace;
        font-size: 13px;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }
      .hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
        gap: 20px;
        margin-top: 22px;
      }
      .hero-spotlight, .hero-side {
        border-radius: 24px;
        padding: 22px;
        background: rgba(255, 255, 255, 0.58);
        border: 1px solid rgba(23, 32, 42, 0.08);
      }
      .big-value {
        margin-top: 10px;
        font-size: clamp(30px, 4vw, 52px);
        line-height: 1;
        color: var(--accent-2);
      }
      .muted {
        margin-top: 8px;
        color: var(--muted);
        font-size: 16px;
      }
      .video-list {
        list-style: none;
        margin: 18px 0 0;
        padding: 0;
        display: grid;
        gap: 12px;
      }
      .video-list li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(23, 32, 42, 0.04);
        font-size: 15px;
      }
      .command-grid, .package-grid {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 16px;
      }
      .command-card, .package-card {
        border-radius: 22px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.65);
        border: 1px solid rgba(23, 32, 42, 0.08);
      }
      .meta-row, .actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .meta-row span {
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(23, 32, 42, 0.06);
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        text-decoration: none;
        color: white;
        background: var(--accent);
        font-weight: 600;
      }
      .button.alt {
        background: var(--accent-2);
      }
      .button.ghost {
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--line);
      }
      @media (max-width: 900px) {
        .hero-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      ${renderVideoPanel(currentEpisodeId, recentVideos)}
      ${renderPackagePanel(commands)}
      ${renderCommandGroups(commands)}
    </main>
  </body>
</html>`;
}

function renderRunResult(command, result) {
  const output = result.output.length > 0 ? escapeHtml(result.output) : "No output.";
  const title = escapeHtml(command.displayName);
  const packageName = escapeHtml(command.packageName);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        background: #f6f1e7;
        color: #17202a;
        font-family: Georgia, "Segoe UI", serif;
      }
      main {
        width: min(860px, calc(100vw - 32px));
        margin: 40px auto;
        padding: 24px;
        border-radius: 28px;
        background: rgba(255, 251, 245, 0.94);
        border: 1px solid rgba(23, 32, 42, 0.12);
      }
      h1 { margin: 12px 0 0; font-size: 42px; color: #9a3412; }
      p { color: #5c6773; line-height: 1.55; }
      pre {
        padding: 18px;
        border-radius: 18px;
        background: #1b2430;
        color: #f8fafc;
        overflow-x: auto;
        white-space: pre-wrap;
      }
      .eyebrow { text-transform: uppercase; letter-spacing: 0.18em; font-size: 12px; color: #5c6773; }
      .actions { display: flex; gap: 12px; margin-top: 18px; }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        background: #14532d;
        color: white;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">${packageName}</div>
      <h1>${title}</h1>
      <p>Status: ${result.status} | Mode: ${result.mode}</p>
      <pre>${output}</pre>
      <div class="actions">
        <a href="/">Back To Command Center</a>
      </div>
    </main>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://localhost:${port}`);
    const commands = await discoverCommands();

    if (requestUrl.pathname === "/video") {
      const [recentVideos, currentEpisodeId] = await Promise.all([
        discoverRecentVideos(),
        readCurrentEpisodeId(),
      ]);
      const html = renderVideoPage(currentEpisodeId, recentVideos, commands);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    if (requestUrl.pathname.startsWith("/run/")) {
      const slug = requestUrl.pathname.slice("/run/".length);
      const command = getCommandBySlug(commands, slug);

      if (!command) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Command not found.");
        return;
      }

      const result = await runCommand(command);
      const html = renderRunResult(command, result);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    const html = await renderHomePage();
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.stack ?? error.message : String(error));
  }
});

server.listen(port, () => {
  process.stdout.write(`Command center ready at http://localhost:${port}\n`);
  process.stdout.write(`Focused video page at http://localhost:${port}/video\n`);
  process.stdout.write("Open this URL in a browser or VS Code Simple Browser.\n");
});