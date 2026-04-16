import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const softwareDir = resolve(import.meta.dirname, "..");
const stateFilePath = resolve(softwareDir, "command-center-state.json");

type CommandCenterState = {
  currentEpisodeId: string;
};

export function normalizeEpisodeId(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();

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

export function toEpisodeDisplayName(value: string | null | undefined): string {
  const matched = /^Episode(\d+)$/i.exec(String(value ?? ""));

  if (!matched) {
    return String(value ?? "");
  }

  return `Episode ${Number.parseInt(matched[1], 10)}`;
}

export async function readCommandCenterState(): Promise<CommandCenterState> {
  const fileText = await readFile(stateFilePath, "utf8");
  return JSON.parse(fileText) as CommandCenterState;
}

export async function readCurrentEpisodeId(): Promise<string> {
  const state = await readCommandCenterState();
  const normalized = normalizeEpisodeId(state.currentEpisodeId);

  if (!normalized) {
    throw new Error(`Invalid current episode id in ${stateFilePath}`);
  }

  return normalized;
}

export async function writeCurrentEpisodeId(episodeId: string): Promise<CommandCenterState> {
  const normalized = normalizeEpisodeId(episodeId);

  if (!normalized) {
    throw new Error(`Invalid episode id: ${episodeId}`);
  }

  const nextState: CommandCenterState = {
    currentEpisodeId: normalized,
  };

  await writeFile(stateFilePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  return nextState;
}

export function getCommandCenterStateFilePath(): string {
  return stateFilePath;
}