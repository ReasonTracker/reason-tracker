import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentScriptDir = dirname(fileURLToPath(import.meta.url));
const CURRENT_EPISODE_FILE = resolve(currentScriptDir, "../current-episode.json");

export function normalizeEpisodeId(value) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const directMatch = /^Episode(\d+)$/i.exec(trimmed);

  if (directMatch) {
    return `Episode${directMatch[1].padStart(4, "0")}`;
  }

  const numericMatch = /^(\d+)$/.exec(trimmed);

  if (numericMatch) {
    return `Episode${numericMatch[1].padStart(4, "0")}`;
  }

  return null;
}

export function toEpisodeDisplayName(value) {
  const matched = /^Episode(\d+)$/.exec(value);

  if (!matched) {
    return value;
  }

  return `Episode ${Number.parseInt(matched[1], 10)}`;
}

export async function readCurrentEpisodeId() {
  const fileText = await readFile(CURRENT_EPISODE_FILE, "utf8");
  const parsed = JSON.parse(fileText);
  const normalized = normalizeEpisodeId(String(parsed.episodeId ?? ""));

  if (!normalized) {
    throw new Error(`Invalid current episode id in ${CURRENT_EPISODE_FILE}`);
  }

  return normalized;
}

export function getCurrentEpisodeFilePath() {
  return CURRENT_EPISODE_FILE;
}