import { getCurrentEpisodeFilePath, readCurrentEpisodeId, toEpisodeDisplayName } from "./episode-utils.mjs";

const currentEpisodeId = await readCurrentEpisodeId();

process.stdout.write(`${toEpisodeDisplayName(currentEpisodeId)} (${currentEpisodeId})\n`);
process.stdout.write(`Source: ${getCurrentEpisodeFilePath()}\n`);