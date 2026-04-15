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
} from "../../scripts/video-episode-state.mjs";

export type CommandCategory = "preview" | "video" | "test" | "build" | "utilities";

export type CommandRecord = {
  category: CommandCategory;
  description: string;
  displayName: string;
  isBackground: boolean;
  packageName: string;
  scriptKey: string;
  slug: string;
  source: string;
  triggerCommand: string;
};

export type VideoRecord = {
  episodeId: string;
  episodeNumber: number;
  label: string;
  relativePath: string;
};

export type HomePayload = {
  commands: CommandRecord[];
  currentEpisodeId: string;
  currentEpisodeLabel: string;
  packageSummaries: Array<{ commandCount: number; packageName: string; summary: string }>;
  recentVideos: VideoRecord[];
  stateFilePath: string;
};

export type VideoPayload = {
  commands: CommandRecord[];
  currentEpisodeId: string;
  currentEpisodeLabel: string;
  recentVideos: VideoRecord[];
};

export type ActionPayload = {
  body?: string;
  mode?: string;
  output?: string;
  status?: number;
  title: string;
};

type WorkspacePackage = {
  dir: string;
  displayName: string;
  packageName: string;
  scripts: Record<string, string>;
};

type RunnableCommand = CommandRecord & {
  command: string;
  name: string;
  packageDir: string;
};

type CommandRunResult = {
  mode: string;
  output: string;
  status: number;
};

const softwareDir = resolve(import.meta.dirname, "../..");
const docsVideosDir = resolve(softwareDir, "../../Videos");
const standaloneScriptsDir = resolve(softwareDir, "scripts");
const recentVideoLimit = Number.parseInt(process.env.COMMAND_CENTER_RECENT_VIDEOS ?? "6", 10);
const studioPort = Number.parseInt(process.env.REMOTION_STUDIO_PORT ?? "3000", 10);
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
] as const;

const hiddenScriptKeys = new Set(["command-center:dev", "video:launcher", "launcher"]);

function getScriptSegments(scriptKey: string) {
  return scriptKey.split(":");
}

function hasScriptSegment(scriptKey: string, value: string) {
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
  ["@reasontracker/command-center", "Command center frontend and local API server."],
]);

export async function getHomePayload(): Promise<HomePayload> {
  const [commands, recentVideos, currentEpisodeId] = await Promise.all([
    discoverCommands(),
    discoverRecentVideos(),
    readCurrentEpisodeId(),
  ]);

  return {
    commands,
    currentEpisodeId,
    currentEpisodeLabel: toEpisodeDisplayName(currentEpisodeId),
    packageSummaries: summarizePackages(commands),
    recentVideos,
    stateFilePath: getCommandCenterStateFilePath(),
  };
}

export async function getVideoPayload(): Promise<VideoPayload> {
  const [commands, recentVideos, currentEpisodeId] = await Promise.all([
    discoverCommands(),
    discoverRecentVideos(),
    readCurrentEpisodeId(),
  ]);

  return {
    commands: commands.filter((command: CommandRecord) => command.category === "video"),
    currentEpisodeId,
    currentEpisodeLabel: toEpisodeDisplayName(currentEpisodeId),
    recentVideos,
  };
}

export async function setCurrentEpisode(episodeId: string) {
  const normalized = normalizeEpisodeId(episodeId);
  if (!normalized) {
    throw new Error("Invalid episode id.");
  }

  await writeCurrentEpisodeId(normalized);
  return { ok: true as const };
}

export async function runCurrentEpisodeRender(): Promise<ActionPayload> {
  const episodeId = await readCurrentEpisodeId();
  const result = await runShellCommand(`vp run -F @reasontracker/video render:episode -- ${shellQuote(episodeId)}`, false);
  return {
    title: `Render ${toEpisodeDisplayName(episodeId)}`,
    mode: result.mode,
    output: result.output.length > 0 ? result.output : "No output.",
    status: result.status,
  };
}

export async function runEpisodeRender(episodeId: string): Promise<ActionPayload> {
  const normalized = normalizeEpisodeId(episodeId);
  if (!normalized) {
    throw new Error("Invalid episode id.");
  }

  const result = await runShellCommand(`vp run -F @reasontracker/video render:episode -- ${shellQuote(normalized)}`, false);
  return {
    title: `Render ${toEpisodeDisplayName(normalized)}`,
    mode: result.mode,
    output: result.output.length > 0 ? result.output : "No output.",
    status: result.status,
  };
}

export async function openStudio(): Promise<ActionPayload> {
  const episodeId = await readCurrentEpisodeId();
  const studioAlreadyRunning = await isPortOpen(studioPort);
  const targetStudioUrl = `${studioUrl}/${encodeURIComponent(episodeId)}`;

  if (studioAlreadyRunning) {
    openUrl(targetStudioUrl);
  } else {
    await runShellCommand("vp run -F @reasontracker/video studio -- --no-open", true);
    await waitForPort(studioPort, 15000);
    openUrl(targetStudioUrl);
  }

  return {
    title: `Studio Opened For ${toEpisodeDisplayName(episodeId)}`,
    body: `<p>The command center owns the current video state, and the current video is ${escapeHtml(toEpisodeDisplayName(episodeId))} (${escapeHtml(episodeId)}).</p>
<p>The command center now opens Studio on the ${escapeHtml(episodeId)} route so the focused composition matches the current episode.</p>
<p>${studioAlreadyRunning ? `Reused the existing Studio server at ${escapeHtml(targetStudioUrl)}.` : `Started Studio in the background at ${escapeHtml(targetStudioUrl)}.`}</p>`,
  };
}

export async function runNamedCommand(slug: string): Promise<ActionPayload> {
  const commands = await discoverCommands();
  const command = getCommandBySlug(commands, slug);
  if (!command) {
    throw new Error("Command not found.");
  }

  const result = await runCommand(command);
  return {
    title: command.displayName,
    mode: result.mode,
    output: result.output.length > 0 ? result.output : "No output.",
    status: result.status,
  };
}

async function discoverCommands(): Promise<CommandRecord[]> {
  const packageEntries = await listWorkspacePackages();
  const commands: RunnableCommand[] = [];

  for (const entry of packageEntries) {
    for (const [scriptKey, command] of Object.entries(entry.scripts)) {
      if (hiddenScriptKeys.has(scriptKey) || looksLikePlaceholder(command)) {
        continue;
      }

      const triggerCommand = buildScriptCommand(entry.packageName, scriptKey);
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
        slug: commandSlug(entry.packageName, scriptKey, "package"),
        source: "package",
        triggerCommand,
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
      category: standalone.category,
      displayName: getDisplayName(standalone.scriptKey, standalone.packageName),
      packageDir: softwareDir,
      slug: commandSlug(standalone.packageName, standalone.scriptKey, standalone.source),
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

  return commands.map(({ command, name, packageDir, ...rest }) => rest);
}

async function discoverRecentVideos(): Promise<VideoRecord[]> {
  const entries = await readdir(docsVideosDir, { withFileTypes: true });
  return entries
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
    .filter((value): value is VideoRecord => value !== null)
    .sort((left, right) => right.episodeNumber - left.episodeNumber)
    .slice(0, recentVideoLimit);
}

async function listWorkspacePackages(): Promise<WorkspacePackage[]> {
  const rootPackage = await readJson(resolve(softwareDir, "package.json"));
  const workspaces = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
  const packageEntries: WorkspacePackage[] = [
    {
      dir: softwareDir,
      displayName: "Software",
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
      packageName: packageJson.name ?? workspace,
      scripts: packageJson.scripts ?? {},
    });
  }

  return packageEntries;
}

async function readJson(filePath: string) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as { name?: string; scripts?: Record<string, string>; workspaces?: string[] };
}

function summarizePackages(commands: CommandRecord[]) {
  const packageMap = new Map<string, number>();

  for (const command of commands) {
    packageMap.set(command.packageName, (packageMap.get(command.packageName) ?? 0) + 1);
  }

  return [...packageMap.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([packageName, commandCount]: [string, number]) => ({
      commandCount,
      packageName,
      summary: packageDescriptions.get(packageName) ?? "Workspace package commands.",
    }));
}

function looksLikePlaceholder(command: string) {
  return command.includes("Build script pending");
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}

function categorizeScript(scriptKey: string, command: string): CommandCategory {
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

function isBackgroundCommand(scriptKey: string, command: string) {
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

function getDisplayName(scriptKey: string, packageName: string) {
  if (packageName === "Software" && scriptKey === "command-center:dev") {
    return "Open Command Center";
  }

  return scriptKey
    .split(":")
    .map((part) => part.replaceAll("-", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function getDescription(scriptKey: string, command: string, packageName: string) {
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

function buildScriptCommand(packageName: string, scriptKey: string) {
  if (packageName === "Software") {
    return `vp run ${scriptKey}`;
  }

  return `vp run -F ${packageName} ${scriptKey}`;
}

function commandSlug(packageName: string, scriptKey: string, source: string) {
  return encodeURIComponent(`${source}:${packageName}:${scriptKey}`);
}

function getCommandBySlug(commands: CommandRecord[], slug: string) {
  return commands.find((command) => command.slug === slug) ?? null;
}

async function runCommand(command: CommandRecord) {
  const commandText = command.triggerCommand;
  const executable = process.platform === "win32" ? "cmd.exe" : commandText.split(" ")[0];
  const args = process.platform === "win32" ? ["/d", "/s", "/c", commandText] : commandText.split(" ").slice(1);

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

  return new Promise<CommandRunResult>((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
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

function runShellCommand(commandText: string, isBackground: boolean) {
  const executable = process.platform === "win32" ? "cmd.exe" : commandText.split(" ")[0];
  const args = process.platform === "win32" ? ["/d", "/s", "/c", commandText] : commandText.split(" ").slice(1);

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

  return new Promise<CommandRunResult>((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
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

function isPortOpen(portToCheck: number) {
  return new Promise<boolean>((resolvePromise) => {
    const socket = net.connect({ host: "127.0.0.1", port: portToCheck }, () => {
      socket.end();
      resolvePromise(true);
    });

    socket.on("error", () => {
      resolvePromise(false);
    });
  });
}

async function waitForPort(portToCheck: number, timeoutMs: number) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await isPortOpen(portToCheck)) {
      return;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 150);
    });
  }

  throw new Error(`Timed out waiting for port ${portToCheck}.`);
}

function openUrl(url: string) {
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
