import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { normalizeEpisodeId, readCurrentEpisodeId, toEpisodeDisplayName } from "./episode-utils.mjs";

async function resolveEpisodeId(rawValue) {
  if (rawValue?.trim().toLowerCase() === "current") {
    return readCurrentEpisodeId();
  }

  const normalizedFromArg = rawValue ? normalizeEpisodeId(rawValue) : null;

  if (normalizedFromArg) {
    return normalizedFromArg;
  }

  const readline = createInterface({ input, output });

  try {
    const answer = await readline.question("What episode number should be rendered? ");
    return normalizeEpisodeId(answer);
  } finally {
    readline.close();
  }
}

const episodeId = await resolveEpisodeId(process.argv[2]);

if (!episodeId) {
  process.stderr.write("Usage: pnpm run render:episode -- 1\n");
  process.stderr.write("Also accepts Episode0001 when you want to be explicit.\n");
  process.exit(1);
}

const displayName = toEpisodeDisplayName(episodeId);
const outputPath = `out/${episodeId}.mp4`;

process.stdout.write(`Rendering ${displayName} to ${outputPath}\n`);

const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm", "exec", "remotion", "render", "src/index.ts", episodeId, outputPath]
    : ["exec", "remotion", "render", "src/index.ts", episodeId, outputPath];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);