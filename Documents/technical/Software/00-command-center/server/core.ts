import { spawn } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const softwareDir = resolve(import.meta.dirname, "../..");
const studioPort = Number.parseInt(process.env.REMOTION_STUDIO_PORT ?? "3000", 10);
const studioUrl = `http://localhost:${studioPort}`;

type CommandRunResult = {
  output: string;
  status: number;
};

type CommandReporter = {
  commandId: string;
  report: (message: string, type?: string) => void;
};

export async function runCommand(request: { command: string }, reporter: CommandReporter) {
  reporter.report(`Received command ${request.command}.`);

  if (request.command === "build-website") {
    return buildWebsite(reporter);
  }

  if (request.command === "open-remotion-studio") {
    return openRemotionStudio(reporter);
  }

  if (request.command === "stop-remotion-studio") {
    return stopRemotionStudio(reporter);
  }

  if (request.command === "stop-command-center-server") {
    return stopCommandCenterServer(reporter);
  }

  reporter.report(`Unknown command: ${request.command}`, "error");
}

async function buildWebsite(reporter: CommandReporter) {
  reporter.report("Running website build.");
  const result = await runShellCommand("vp run -F reason-tracker-repo-website build", false);
  const output = result.output.length > 0 ? result.output : "No output.";
  reporter.report(`Build website finished with status ${result.status}.\n\n${output}`, "complete");
}

async function openRemotionStudio(reporter: CommandReporter) {
  const studioAlreadyRunning = await isPortOpen(studioPort);

  if (studioAlreadyRunning) {
    reporter.report(`Remotion Studio is already running at ${studioUrl}.`, "complete");
    return;
  }

  reporter.report("Starting Remotion Studio.");
  await runShellCommand("vp run -F @reasontracker/video studio", true);
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

async function stopCommandCenterServer(reporter: CommandReporter) {
  reporter.report("Stopping Command Center server.");
  reporter.report("Command Center server stop requested. This page will disconnect.", "complete");

  setTimeout(() => {
    process.exit(0);
  }, 100);
}

function runShellCommand(command: string, isBackground: boolean): Promise<CommandRunResult> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, {
      cwd: softwareDir,
      env: process.env,
      shell: true,
      stdio: isBackground ? "ignore" : ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    if (isBackground) {
      child.unref();
      resolveCommand({ output: "Started in background.", status: 0 });
      return;
    }

    let output = "";

    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (status) => {
      resolveCommand({
        output: output.trim(),
        status: status ?? 1,
      });
    });
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
    const result = await runShellCommand(
      `powershell -NoProfile -Command ${shellQuote(`$connection = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($null -ne $connection) { $connection.OwningProcess }`)}`,
      false,
    );

    const pid = Number.parseInt(result.output.trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  }

  const result = await runShellCommand(`lsof -ti tcp:${port} -sTCP:LISTEN | head -n 1`, false);
  const pid = Number.parseInt(result.output.trim(), 10);
  return Number.isFinite(pid) ? pid : null;
}

async function stopProcessTree(pid: number) {
  if (process.platform === "win32") {
    await runShellCommand(`taskkill /PID ${pid} /T /F`, false);
    return;
  }

  await runShellCommand(`kill -TERM ${pid}`, false);
}

function shellQuote(value: string) {
  return JSON.stringify(value);
}

function waitForPort(port: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  return new Promise<void>((resolvePortWait, reject) => {
    const attemptConnection = () => {
      void isPortOpen(port).then((open) => {
        if (open) {
          resolvePortWait();
          return;
        }

        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for port ${port}.`));
          return;
        }

        setTimeout(attemptConnection, 250);
      }, reject);
    };

    attemptConnection();
  });
}

