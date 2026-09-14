import type { ComponentType } from "react";

import { createDeclarativeEpisode } from "./shared/DeclarativeEpisode";
import type { EpisodeMediaAsset } from "./shared/compileEpisodeScript";

const episodeFiles = require.context("./", true, /\/episode\.json$/);
const mediaFiles = require.context("./", true, /\/media\/[^/]+\.(avif|gif|jpe?g|png|webp)$/i);

export const episodes = episodeFiles.keys().map((specPath) => {
	const episodeDirectory = specPath.slice(0, -"/episode.json".length);
	const episodeModule = episodeFiles(specPath) as {
		default: { __mediaAspectRatios: Readonly<Record<string, number>> }
	};
	const { __mediaAspectRatios: mediaAspectRatios, ...episodeSpec } = episodeModule.default;
	const mediaAssets = Object.fromEntries(
		mediaFiles
			.keys()
			.filter((mediaPath) => mediaPath.startsWith(`${episodeDirectory}/media/`))
			.map((mediaPath) => [
				mediaPath.slice(episodeDirectory.length + 1),
				{
					aspectRatio: mediaAspectRatios[mediaPath.slice(episodeDirectory.length + 1)],
					src: mediaFiles(mediaPath) as string,
				},
			]),
	) as Record<string, EpisodeMediaAsset>;
	let episode: ReturnType<typeof createDeclarativeEpisode>;
	try {
		episode = createDeclarativeEpisode(episodeSpec, mediaAssets);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to load episode specification ${specPath}\n${message}`, { cause: error });
	}

	return {
		component: episode.component as ComponentType<Record<string, unknown>>,
		episode: episode.episode,
	};
});