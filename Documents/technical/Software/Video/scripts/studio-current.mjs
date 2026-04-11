import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { readCurrentEpisodeId, toEpisodeDisplayName } from "./episode-utils.mjs";

const studioPort = Number.parseInt(process.env.REMOTION_STUDIO_PORT ?? "3000", 10);
const studioUrl = `http://localhost:${studioPort}`;

function isStudioRunning(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });

    socket.on("error", () => {
      resolve(false);
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

const currentEpisodeId = await readCurrentEpisodeId();

process.stdout.write(`Opening Remotion Studio for ${toEpisodeDisplayName(currentEpisodeId)} (${currentEpisodeId})\n`);
process.stdout.write("The current episode is shown for reference. Remotion Studio does not support preselecting that composition by CLI flag.\n");

if (await isStudioRunning(studioPort)) {
  process.stdout.write(`Reusing the existing Studio server at ${studioUrl}\n`);
  openUrl(studioUrl);
  process.exit(0);
}

const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm", "exec", "remotion", "studio", "src/index.ts"]
    : ["exec", "remotion", "studio", "src/index.ts"];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);