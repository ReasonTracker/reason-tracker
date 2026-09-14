import type { ComponentType } from "react";

import { createDeclarativeEpisode } from "./shared/DeclarativeEpisode";
import type { EpisodeMediaAsset } from "./shared/compileEpisodeScript";

const episodeFiles = require.context("./", true, /\/episode\.(json|ts)$/);
const mediaFiles = require.context("./", true, /\/media\/[^/]+\.(avif|gif|jpe?g|png|webp)$/i);
const episodePaths = episodeFiles.keys();
const episodeDirectories = new Set<string>();

for (const episodePath of episodePaths) {
	const episodeDirectory = episodePath.replace(/\/episode\.(json|ts)$/, "");
	if (episodeDirectories.has(episodeDirectory)) {
		throw new Error(`Episode directory must contain exactly one episode.json or episode.ts: ${episodeDirectory}`);
	}
	episodeDirectories.add(episodeDirectory);
}

export const episodes = episodePaths.map((specPath) => {
	const episodeDirectory = specPath.replace(/\/episode\.(json|ts)$/, "");
	const episodeModule = episodeFiles(specPath) as {
		__mediaAspectRatios: Readonly<Record<string, number>>
		default: unknown
	};
	const mediaAssets = Object.fromEntries(
		mediaFiles
			.keys()
			.filter((mediaPath) => mediaPath.startsWith(`${episodeDirectory}/media/`))
			.map((mediaPath) => [
				mediaPath.slice(episodeDirectory.length + 1),
				{
					aspectRatio: episodeModule.__mediaAspectRatios[mediaPath.slice(episodeDirectory.length + 1)],
					src: mediaFiles(mediaPath) as string,
				},
			]),
	) as Record<string, EpisodeMediaAsset>;
	let episode: ReturnType<typeof createDeclarativeEpisode>;
	try {
		episode = createDeclarativeEpisode(episodeModule.default, mediaAssets);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to load episode specification ${specPath}\n${message}`, { cause: error });
	}

	return {
		component: episode.component as ComponentType<Record<string, unknown>>,
		episode: episode.episode,
	};
});