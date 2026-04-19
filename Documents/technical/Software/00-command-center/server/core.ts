import { spawn } from "node:child_process";
import { once, type EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import net from "node:net";
import { resolve } from "node:path";

const softwareDir = resolve(import.meta.dirname, "../..");
const videosDir = resolve(softwareDir, "videos");
const websiteDistDir = resolve(softwareDir, "website", "dist");
const studioPort = Number.parseInt(process.env.REMOTION_STUDIO_PORT ?? "3000", 10);
const studioUrl = `http://localhost:${studioPort}`;
const ansiEscapePattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

type CommandRunResult = {
  output: string;
  status: number;
};

type SpawnCommandOptions = {
  args?: string[];
  command: string;
  cwd?: string;
  detached?: boolean;
  launchInTerminal?: boolean;
  onOutput?: (chunk: string) => void;
  resolveOnSpawn?: boolean;
  shell?: boolean;
  stdio?: "ignore" | ["ignore", "pipe", "pipe"];
  windowsHide?: boolean;
};

type CommandReporter = {
  commandId: string;
  report: (message: string, type?: string) => void;
};

export async function runCommand(request: { command: string }, reporter: CommandReporter) {
  reporter.report(`Received command ${request.command}.`);

  if (request.command === "setup-software-machine") {
    return setupSoftwareMachine(reporter);
  }

  if (request.command === "typecheck-software") {
    return typecheckSoftware(reporter);
  }

  if (request.command === "build-website") {
    return buildWebsite(reporter);
  }

  if (request.command === "clean-website-dist") {
    return cleanWebsiteDist(reporter);
  }

  if (request.command === "open-remotion-studio") {
    return openRemotionStudio(reporter);
  }

  if (request.command === "stop-remotion-studio") {
    return stopRemotionStudio(reporter);
  }

  if (request.command === "check-remotion-studio") {
    return checkRemotionStudio(reporter);
  }

  if (request.command === "check-command-center-server") {
    return checkCommandCenterServer(reporter);
  }

  if (request.command === "stop-command-center-server") {
    return stopCommandCenterServer(reporter);
  }

  reporter.report(`Unknown command: ${request.command}`, "error");
}

async function setupSoftwareMachine(reporter: CommandReporter) {
  reporter.report(`Running Software install script from ${softwareDir}.`);
  const result = await spawnCommand({
    command: "vp run developer:setup-machine",
    cwd: softwareDir,
    onOutput: (chunk) => {
      reporter.report(chunk);
      process.stdout.write(chunk);
    },
  });
  reporter.report(`Software install script finished with status ${result.status}.`, "complete");
}

async function typecheckSoftware(reporter: CommandReporter) {
  reporter.report(`Running workspace typecheck from ${softwareDir}.`);
  const result = await spawnCommand({
    command: "vp run typecheck",
    cwd: softwareDir,
    onOutput: (chunk) => {
      reporter.report(chunk);
      process.stdout.write(chunk);
    },
  });
  reporter.report(`Workspace typecheck finished with status ${result.status}.`, "complete");
}

async function buildWebsite(reporter: CommandReporter) {
  reporter.report("Running website build.");
  const result = await spawnCommand({
    command: "vp run -F reason-tracker-repo-website build",
    onOutput: (chunk) => {
      reporter.report(chunk);
      process.stdout.write(chunk);
    },
  });
  reporter.report(`Build website finished with status ${result.status}.`, "complete");
}

async function cleanWebsiteDist(reporter: CommandReporter) {
  reporter.report(`Removing website build output at ${websiteDistDir}.`);
  await rm(websiteDistDir, { force: true, recursive: true });
  reporter.report("Website build output removed.", "complete");
}

async function openRemotionStudio(reporter: CommandReporter) {
  const studioAlreadyRunning = await isPortOpen(studioPort);

  if (studioAlreadyRunning) {
    reporter.report(`Remotion Studio is already running at ${studioUrl}.`, "complete");
    return;
  }

  reporter.report("Starting Remotion Studio.");

  await spawnCommand({
    args: ["run", "studio"],
    command: "npm",
    cwd: videosDir,
    launchInTerminal: true,
    resolveOnSpawn: true,
    stdio: "ignore",
    windowsHide: false,
  });

  reporter.report("Started Remotion Studio.", "complete");
}

async function stopRemotionStudio(reporter: CommandReporter) {
  const listenerPid = await getListeningProcessId(studioPort);

  if (listenerPid === null) {
    reporter.report("Remotion Studio is not running.", "complete");
    return;
  }

  reporter.report(`Stopping Remotion Studio process tree rooted at ${listenerPid}.`);
  await stopProcessTree(listenerPid);
  reporter.report("Stopped Remotion Studio.", "complete");
}

async function checkRemotionStudio(reporter: CommandReporter) {
  const studioRunning = await isPortOpen(studioPort);

  if (studioRunning) {
    reporter.report(`Remotion Studio is running at ${studioUrl}.`, "complete");
    return;
  }

  reporter.report("Remotion Studio is not running.", "complete");
}

async function stopCommandCenterServer(reporter: CommandReporter) {
  reporter.report("Stopping Command Center server.");
  reporter.report("Command Center server stop requested. This page will disconnect.", "complete");

  setTimeout(() => {
    process.exit(0);
  }, 100);
}

async function checkCommandCenterServer(reporter: CommandReporter) {
  reporter.report("Command Center server is running.", "complete");
}

function stripAnsiFormatting(value: string) {
  return value.replaceAll(ansiEscapePattern, "");
}

function spawnCommand(options: SpawnCommandOptions): Promise<CommandRunResult> {
  return new Promise((resolveCommand, reject) => {
    const usesShellCommandString = options.args === undefined;
    const spawnOptions = {
      cwd: options.cwd ?? softwareDir,
      detached: options.detached ?? false,
      env: process.env,
      shell: options.shell ?? usesShellCommandString,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      windowsHide: options.windowsHide ?? true,
    };

    const command = options.launchInTerminal && process.platform === "win32" ? "cmd.exe" : options.command;
    const args = options.launchInTerminal && process.platform === "win32"
      ? ["/d", "/c", "start", "", "cmd.exe", "/d", "/k", options.command, ...(options.args ?? [])]
      : (options.args ?? []);
    const child = spawn(command, args, {
      ...spawnOptions,
      detached: options.launchInTerminal && process.platform !== "win32" ? true : spawnOptions.detached,
    });

    if (options.resolveOnSpawn) {
      child.unref();
      resolveCommand({ output: "Started in background.", status: 0 });
      return;
    }

    let output = "";

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      options.onOutput?.(stripAnsiFormatting(text));
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      options.onOutput?.(stripAnsiFormatting(text));
    });

    const childEvents = child as unknown as EventEmitter;
    const closePromise = once(childEvents, "close") as Promise<[number | null]>;
    const errorPromise = once(childEvents, "error").then(([error]) => {
      throw error;
    });

    void Promise.race([closePromise, errorPromise])
      .then(([status]) => {
        resolveCommand({
          output: output.trim(),
          status: status ?? 1,
        });
      })
      .catch(reject);
  });
}

function isPortOpen(port: number) {
  return new Promise<boolean>((resolvePort) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.destroy();
      resolvePort(true);
    });

    socket.once("error", () => {
      resolvePort(false);
    });
  });
}

async function getListeningProcessId(port: number) {
  if (process.platform === "win32") {
    const result = await spawnCommand({
      command: `powershell -NoProfile -Command ${shellQuote(`$connection = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -ne $connection) { $connection.OwningProcess }`)}`,
    });

    const pid = Number.parseInt(result.output.trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  }

  const result = await spawnCommand({
    command: `lsof -ti tcp:${port} -sTCP:LISTEN | head -n 1`,
  });
  const pid = Number.parseInt(result.output.trim(), 10);
  return Number.isFinite(pid) ? pid : null;
}

async function stopProcessTree(pid: number) {
  if (process.platform === "win32") {
    await spawnCommand({
      command: `taskkill /PID ${pid} /T /F`,
    });
    return;
  }

  await spawnCommand({
    command: `kill -TERM ${pid}`,
  });
}

function shellQuote(value: string) {
  return JSON.stringify(value);
}

