// See 📌README.md in this folder for local coding standards before editing this file.

import { Fragment, createElement } from "react";
import { registerRoot } from "remotion";
import { Episode001Composition } from "./episode001.tsx";
import { EpisodeV2Composition } from "./episodeV2.tsx";

export const RemotionRoot = () => {
	return createElement(
		Fragment,
		null,
		createElement(Episode001Composition),
		createElement(EpisodeV2Composition),
	);
};

registerRoot(RemotionRoot);