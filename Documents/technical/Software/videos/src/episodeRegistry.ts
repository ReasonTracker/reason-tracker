import type { ComponentType } from "react";

import { createDeclarativeEpisode } from "./shared/DeclarativeEpisode";

const episodeFiles = require.context("./", true, /\/episode\.json$/);
const mediaFiles = require.context("./", true, /\/media\/[^/]+\.(avif|gif|jpe?g|png|webp)$/i);

export const episodes = episodeFiles.keys().map((specPath) => {
	const episodeDirectory = specPath.slice(0, -"/episode.json".length);
	const mediaSources = Object.fromEntries(
		mediaFiles
			.keys()
			.filter((mediaPath) => mediaPath.startsWith(`${episodeDirectory}/media/`))
			.map((mediaPath) => [
				mediaPath.slice(episodeDirectory.length + 1),
				mediaFiles(mediaPath) as string,
			]),
	);
	const episodeModule = episodeFiles(specPath) as { default: unknown };
	let episode: ReturnType<typeof createDeclarativeEpisode>;
	try {
		episode = createDeclarativeEpisode(episodeModule.default, mediaSources);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to load episode specification ${specPath}\n${message}`, { cause: error });
	}

	return {
		component: episode.component as ComponentType<Record<string, unknown>>,
		episode: episode.episode,
	};
});