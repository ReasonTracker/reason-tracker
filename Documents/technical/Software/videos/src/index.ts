// See 📌README.md in this folder for local coding standards before editing this file.

import "../../website/site/css/brand.css";
import "../../website/site/css/brand-sequence.css";
import { Fragment, createElement } from "react";
import { registerRoot } from "remotion";
import { Episode001Composition } from "./episode0001/episode0001.tsx";
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