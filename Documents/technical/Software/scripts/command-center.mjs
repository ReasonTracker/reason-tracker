import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import net from "node:net";
import { resolve } from "node:path";
import {
  getCommandCenterStateFilePath,
  normalizeEpisodeId,
  readCurrentEpisodeId,
  toEpisodeDisplayName,
  writeCurrentEpisodeId,
} from "./video-episode-state.mjs";

const softwareDir = resolve(import.meta.dirname, "..");
const docsVideosDir = resolve(softwareDir, "../../Videos");
const standaloneScriptsDir = resolve(softwareDir, "scripts");
const websiteDir = resolve(softwareDir, "website");
const websiteSiteDir = resolve(websiteDir, "site");
const websiteBrandCssPath = resolve(websiteSiteDir, "css", "brand.css");
const port = Number.parseInt(process.env.COMMAND_CENTER_PORT ?? "4780", 10);
const recentVideoLimit = Number.parseInt(process.env.COMMAND_CENTER_RECENT_VIDEOS ?? "6", 10);
const studioPort = Number.parseInt(process.env.REMOTION_STUDIO_PORT ?? "3000", 10);
const commandCenterUrl = `http://localhost:${port}`;
const studioUrl = `http://localhost:${studioPort}`;

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

const hiddenScriptKeys = new Set(["command-center:dev", "video:launcher", "launcher"]);

function getScriptSegments(scriptKey) {
  return scriptKey.split(":");
}

function hasScriptSegment(scriptKey, value) {
  return getScriptSegments(scriptKey).includes(value);
}

const packageDescriptions = new Map([
  ["Software", "Root workspace scripts and orchestration commands."],
  ["@reasontracker/video", "Remotion episodes, shared media, and episode-specific render and studio workflows."],
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

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}

function renderSharedBrandLink() {
  return '<link rel="stylesheet" href="/assets/website/brand.css" />';
}

function renderCommandCenterChrome({ title, pageClass = "", bodyClass = "", content }) {
  const htmlClass = pageClass ? ` class="${pageClass}"` : "";
  const bodyClassAttribute = bodyClass ? ` class="${bodyClass}"` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    ${renderSharedBrandLink()}
    <style>
      :root {
        --bg: #0f0f10;
        --panel: #171719;
        --panel-2: #1d1d21;
        --panel-3: #24242a;
        --text: #ffffff;
        --muted: #b8b8c0;
        --border: #2a2a2f;
        --code-bg: #222228;
        --surface-glow: color-mix(in srgb, var(--con) 18%, transparent);
        --surface-glow-2: color-mix(in srgb, var(--pro) 16%, transparent);
        --shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
        --sans: "Segoe UI", system-ui, sans-serif;
        --serif: Georgia, "Times New Roman", serif;
        --mono: Consolas, "Cascadia Mono", monospace;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        font-family: var(--sans);
        background:
          radial-gradient(circle at top left, var(--surface-glow), transparent 24%),
          radial-gradient(circle at top right, var(--surface-glow-2), transparent 28%),
          linear-gradient(180deg, #0c0c0d 0%, var(--bg) 100%);
      }
      main {
        width: min(1200px, calc(100vw - 32px));
        margin: 24px auto 40px;
        display: grid;
        gap: 18px;
      }
      .panel {
        position: relative;
        background: color-mix(in srgb, var(--panel) 92%, black);
        border: 2px solid transparent;
        border-image: linear-gradient(135deg, var(--pro), color-mix(in srgb, var(--text) 16%, transparent) 40%, var(--con)) 1;
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .panel::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 35%),
          radial-gradient(circle at top right, color-mix(in srgb, var(--con) 22%, transparent), transparent 30%),
          radial-gradient(circle at bottom left, color-mix(in srgb, var(--pro) 20%, transparent), transparent 28%);
        opacity: 0.95;
      }
      .panel-inner {
        position: relative;
        z-index: 1;
        padding: 24px;
      }
      .eyebrow, .section-topline, .card-topline, .label {
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 12px;
        color: var(--muted);
      }
      h1, h2, h3 {
        margin: 0;
        font-family: var(--serif);
        font-weight: 700;
        line-height: 0.98;
      }
      h1 {
        margin-top: 14px;
        font-size: clamp(40px, 6vw, 78px);
      }
      h2 {
        margin-top: 12px;
        font-size: 20px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-family: var(--sans);
      }
      h3 {
        margin-top: 10px;
        font-size: 28px;
      }
      p {
        margin: 12px 0 0;
        color: var(--muted);
        line-height: 1.6;
        font-size: 16px;
      }
      strong {
        color: var(--text);
      }
      code, pre {
        font-family: var(--mono);
      }
      code {
        display: block;
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--code-bg);
        border: 1px solid var(--border);
        color: color-mix(in srgb, white 88%, var(--muted));
        font-size: 13px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      pre {
        margin: 18px 0 0;
        padding: 18px;
        border-radius: 18px;
        background: var(--code-bg);
        border: 1px solid var(--border);
        color: color-mix(in srgb, white 88%, var(--muted));
        overflow-x: auto;
        white-space: pre-wrap;
      }
      .hero-grid, .episode-grid, .command-grid, .package-grid, .result-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }
      .hero-grid, .result-grid {
        margin-top: 22px;
      }
      .hero-spotlight, .hero-side, .spotlight, .episode-card, .command-card, .package-card, .result-card {
        min-height: 100%;
        padding: 20px;
        background: color-mix(in srgb, var(--panel-2) 88%, black);
        border: 1px solid var(--border);
      }
      .big-value, .current-value {
        margin-top: 12px;
        font-size: clamp(30px, 5vw, 54px);
        line-height: 1;
        color: var(--text);
        text-wrap: balance;
      }
      .big-value .brand-pro, .current-value .brand-pro, .brand-pro {
        color: var(--pro);
      }
      .big-value .brand-con, .current-value .brand-con, .brand-con {
        color: var(--con);
      }
      .muted {
        margin-top: 8px;
        color: var(--muted);
        font-size: 15px;
      }
      .video-list {
        list-style: none;
        margin: 18px 0 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      .video-list li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        background: color-mix(in srgb, var(--panel-3) 86%, black);
        border: 1px solid var(--border);
      }
      .meta-row, .actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      .meta-row span {
        padding: 6px 10px;
        background: color-mix(in srgb, var(--panel-3) 84%, black);
        border: 1px solid var(--border);
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
        text-decoration: none;
        color: var(--text);
        background: linear-gradient(135deg, var(--pro), color-mix(in srgb, var(--pro) 60%, white));
        border: 1px solid color-mix(in srgb, var(--pro) 40%, white 10%);
        font-weight: 600;
      }
      .button.alt {
        background: linear-gradient(135deg, var(--con), color-mix(in srgb, var(--con) 72%, white));
        border-color: color-mix(in srgb, var(--con) 50%, white 10%);
      }
      .button.ghost {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border);
      }
      .shell-copy {
        max-width: 64ch;
      }
      .page-result main {
        width: min(960px, calc(100vw - 32px));
      }
      .page-result .panel-inner {
        padding: 28px;
      }
      .page-result h1 {
        font-size: clamp(34px, 5vw, 54px);
      }
      @media (max-width: 720px) {
        main {
          width: min(100vw - 16px, 1200px);
          margin: 8px auto 20px;
        }
        .panel-inner {
          padding: 18px;
        }
      }
    </style>
  </head>
  <body${bodyClassAttribute}>
    ${content}
  </body>
</html>`;
}

function categorizeScript(scriptKey, command) {
  const segments = getScriptSegments(scriptKey);

  if (
    scriptKey.includes("video") ||
    hasScriptSegment(scriptKey, "render") ||
    hasScriptSegment(scriptKey, "studio") ||
    segments.at(-1) === "current"
  ) {
    return "video";
  }

  if (scriptKey.includes("test")) {
    return "test";
  }

  if (hasScriptSegment(scriptKey, "dev") || hasScriptSegment(scriptKey, "preview")) {
    return "preview";
  }

  if (scriptKey.includes("publish") || hasScriptSegment(scriptKey, "build")) {
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
    hasScriptSegment(scriptKey, "dev") ||
    hasScriptSegment(scriptKey, "preview") ||
    scriptKey.includes("studio") ||
    scriptKey.includes("launcher") ||
    command.includes("--watch") ||
    command.includes("vp dev") ||
    command.includes("remotion studio")
  );
}

function getDisplayName(scriptKey, packageName) {
  if (packageName === "Software" && scriptKey === "command-center:dev") {
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
    return `vp run ${scriptKey}`;
  }

  return `vp run -F ${packageName} ${scriptKey}`;
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function listWorkspacePackages() {
  const rootPackage = await readJson(resolve(softwareDir, "package.json"));
  const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
  const packageEntries = [
    {
      dir: softwareDir,
      displayName: "Software",
      filePath: resolve(softwareDir, "package.json"),
      packageName: "Software",
      scripts: rootPackage.scripts ?? {},
    },
  ];

  for (const workspace of workspaces) {
    const packageJsonPath = resolve(softwareDir, workspace, "package.json");
    const packageJson = await readJson(packageJsonPath);
    packageEntries.push({
      dir: resolve(softwareDir, workspace),
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
      packageDir: softwareDir,
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

function isPortOpen(portToCheck) {
  return new Promise((resolvePromise) => {
    const socket = net.connect({ host: "127.0.0.1", port: portToCheck }, () => {
      socket.end();
      resolvePromise(true);
    });

    socket.on("error", () => {
      resolvePromise(false);
    });
  });
}

function openUrl(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
      detached: true,
      shell: false,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  if (process.platform === "darwin") {
    const child = spawn("open", [url], {
      detached: true,
      shell: false,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  const child = spawn("xdg-open", [url], {
    detached: true,
    shell: false,
    stdio: "ignore",
  });
  child.unref();
}

function runShellCommand(commandText, isBackground) {
  const executable = process.platform === "win32" ? "cmd.exe" : commandText.split(" ")[0];
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", commandText]
      : commandText.split(" ").slice(1);

  const child = spawn(executable, args, {
    cwd: softwareDir,
    detached: isBackground && process.platform !== "win32",
    shell: false,
    stdio: isBackground ? "ignore" : "pipe",
  });

  if (isBackground) {
    child.unref();

    return Promise.resolve({
      mode: "background",
      output: `Started ${commandText}.`,
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

function runCommand(command) {
  const commandText = command.triggerCommand;
  const executable = process.platform === "win32" ? "cmd.exe" : commandText.split(" ")[0];
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", commandText]
      : commandText.split(" ").slice(1);

  const child = spawn(executable, args, {
    cwd: softwareDir,
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
    <div class="panel-inner">
      <div class="eyebrow">Software Command Center</div>
      <h1><span class="brand-pro">Reason</span> <span class="brand-con">Tracker</span> Operations</h1>
      <p class="shell-copy">The workspace home for dev servers, tests, publishing, and video workflows, restyled to share the website brand system instead of carrying a separate palette.</p>
      <div class="hero-grid">
        <div class="hero-spotlight">
          <div class="label">Current Video</div>
          <div class="big-value">${escapeHtml(currentEpisodeLabel)}</div>
          <div class="muted">${escapeHtml(currentEpisodeId)}</div>
          <div class="muted">Stored in ${escapeHtml(getCommandCenterStateFilePath())}</div>
          <div class="actions-row">
            <a class="button" href="/video/render-current">Render Current</a>
            <a class="button alt" href="/video/open-studio">Open Studio</a>
            <a class="button ghost" href="/video">Open Video Page</a>
          </div>
        </div>
        <div class="hero-side">
          <div class="label">Recent Videos</div>
          <ul class="video-list">${recentItems}</ul>
        </div>
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
        <div class="actions-row">
          <a class="button ghost" href="/video/set-current/${encodeURIComponent(video.episodeId)}">Make Current</a>
          <a class="button" href="/video/render/${encodeURIComponent(video.episodeId)}">Render</a>
        </div>
      </article>`,
    )
    .join("");
  const commandCards = videoCommands.map(renderCommandCard).join("");

  return renderCommandCenterChrome({
    title: "Reason Tracker Video",
    pageClass: "page-video",
    content: `<main>
      <section class="panel hero">
        <div class="panel-inner">
          <div class="eyebrow">Video Workspace</div>
          <h1><span class="brand-pro">${escapeHtml(currentEpisodeLabel)}</span></h1>
          <p class="shell-copy">This is the focused video page inside the Software command center. It now uses the same brand color system as the website instead of a separate green theme.</p>
          <div class="hero-grid">
            <div class="spotlight">
              <h2>Current Episode</h2>
              <div class="current-value">${escapeHtml(currentEpisodeLabel)}</div>
              <p>${escapeHtml(currentEpisodeId)}</p>
              <p>The current-video record lives in the command center, not the Video package.</p>
              <div class="actions-row">
                <a class="button" href="/video/render-current">Render Current</a>
                <a class="button alt" href="/video/open-studio">Open Studio</a>
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
        </div>
      </section>
      <section class="panel">
        <div class="panel-inner">
          <div class="section-topline">Recent Videos</div>
          <div class="episode-grid">${recentItems}</div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-inner">
          <div class="section-topline">Video Commands</div>
          <div class="command-grid">${commandCards}</div>
        </div>
      </section>
    </main>`,
  });
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
    <div class="panel-inner">
      <div class="section-topline">Packages</div>
      <div class="package-grid">${items}</div>
    </div>
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
        <div class="panel-inner">
          <div class="section-topline">${escapeHtml(titles.get(key) ?? key)}</div>
          <div class="command-grid">${cards}</div>
        </div>
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

  return renderCommandCenterChrome({
    title: "Reason Tracker Command Center",
    pageClass: "page-home",
    content: `<main>
      ${renderVideoPanel(currentEpisodeId, recentVideos)}
      ${renderPackagePanel(commands)}
      ${renderCommandGroups(commands)}
    </main>`,
  });
}

function renderRunResult(command, result) {
  const output = result.output.length > 0 ? escapeHtml(result.output) : "No output.";
  const title = escapeHtml(command.displayName);
  const packageName = escapeHtml(command.packageName);

  return renderCommandCenterChrome({
    title,
    pageClass: "page-result",
    content: `<main>
      <section class="panel">
        <div class="panel-inner">
          <div class="eyebrow">${packageName}</div>
          <h1>${title}</h1>
          <div class="result-grid">
            <div class="result-card">
              <div class="label">Execution</div>
              <p>Status: ${result.status}</p>
              <p>Mode: ${result.mode}</p>
            </div>
            <div class="result-card">
              <div class="label">Navigation</div>
              <p>Return to the command center to launch another workflow.</p>
              <div class="actions-row">
                <a class="button alt" href="/">Back To Command Center</a>
              </div>
            </div>
          </div>
          <pre>${output}</pre>
        </div>
      </section>
    </main>`,
  });
}

function renderVideoActionResult({ body, title }) {
  return renderCommandCenterChrome({
    title: escapeHtml(title),
    pageClass: "page-result",
    content: `<main>
      <section class="panel">
        <div class="panel-inner">
          <div class="eyebrow">Video Command Center</div>
          <h1>${escapeHtml(title)}</h1>
          ${body}
          <div class="actions-row">
            <a class="button alt" href="/video">Back To Video Page</a>
            <a class="button ghost" href="/">Back To Command Center</a>
          </div>
        </div>
      </section>
    </main>`,
  });
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://localhost:${port}`);

    if (requestUrl.pathname === "/assets/website/brand.css") {
      const css = await readFile(websiteBrandCssPath, "utf8");
      response.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      response.end(css);
      return;
    }

    const commands = await discoverCommands();

    if (requestUrl.pathname.startsWith("/video/set-current/")) {
      const rawEpisodeId = decodeURIComponent(requestUrl.pathname.slice("/video/set-current/".length));
      const episodeId = normalizeEpisodeId(rawEpisodeId);

      if (!episodeId) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid episode id.");
        return;
      }

      await writeCurrentEpisodeId(episodeId);
      response.writeHead(302, { Location: "/video" });
      response.end();
      return;
    }

    if (requestUrl.pathname === "/video/render-current") {
      const episodeId = await readCurrentEpisodeId();
      const result = await runShellCommand(`vp run -F @reasontracker/video render:episode -- ${shellQuote(episodeId)}`, false);
      const html = renderRunResult(
        {
          displayName: `Render ${toEpisodeDisplayName(episodeId)}`,
          packageName: "Software",
        },
        result,
      );
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    if (requestUrl.pathname.startsWith("/video/render/")) {
      const rawEpisodeId = decodeURIComponent(requestUrl.pathname.slice("/video/render/".length));
      const episodeId = normalizeEpisodeId(rawEpisodeId);

      if (!episodeId) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid episode id.");
        return;
      }

      const result = await runShellCommand(`vp run -F @reasontracker/video render:episode -- ${shellQuote(episodeId)}`, false);
      const html = renderRunResult(
        {
          displayName: `Render ${toEpisodeDisplayName(episodeId)}`,
          packageName: "Software",
        },
        result,
      );
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    if (requestUrl.pathname === "/video/open-studio") {
      const episodeId = await readCurrentEpisodeId();
      const studioAlreadyRunning = await isPortOpen(studioPort);

      if (studioAlreadyRunning) {
        openUrl(studioUrl);
      } else {
        await runShellCommand("vp run -F @reasontracker/video studio", true);
      }

      const html = renderVideoActionResult({
        title: `Studio Opened For ${toEpisodeDisplayName(episodeId)}`,
        body: `<p>The command center owns the current video state, and the current video is ${escapeHtml(toEpisodeDisplayName(episodeId))} (${escapeHtml(episodeId)}).</p>
<p>Remotion Studio itself still opens as a general workspace and does not accept a composition-selection flag, so select ${escapeHtml(episodeId)} inside Studio after it opens.</p>
<p>${studioAlreadyRunning ? `Reused the existing Studio server at ${escapeHtml(studioUrl)}.` : `Started Studio in the background at ${escapeHtml(studioUrl)}.`}</p>`,
      });
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

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

const commandCenterAlreadyRunning = await isPortOpen(port);

if (commandCenterAlreadyRunning) {
  openUrl(commandCenterUrl);
  process.stdout.write(`Command center already running at ${commandCenterUrl}\n`);
  process.stdout.write("Opened the existing command center instance in your browser.\n");
} else {
  server.listen(port, () => {
    process.stdout.write(`Command center ready at ${commandCenterUrl}\n`);
    process.stdout.write(`Focused video page at ${commandCenterUrl}/video\n`);
    process.stdout.write("Open this URL in a browser or VS Code Simple Browser.\n");
    openUrl(commandCenterUrl);
  });
}