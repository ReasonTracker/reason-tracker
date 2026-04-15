// See 📌README.md in this folder for local coding standards before editing this file.

import { Fragment, createElement } from "react";
import { registerRoot } from "remotion";
import { EpisodeV2Composition } from "./episodeV2.tsx";

export const RemotionRoot = () => {
	return createElement(
		Fragment,
		null,
		createElement(EpisodeV2Composition),
	);
};

registerRoot(RemotionRoot);